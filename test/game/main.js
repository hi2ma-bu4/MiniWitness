import { CellType, EdgeType, NodeType, PuzzleSerializer, WitnessCore, WitnessUI } from "../../dist/MiniWitness.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const clonePuzzle = (puzzle) => {
	if (typeof structuredClone === "function") return structuredClone(puzzle);
	return JSON.parse(JSON.stringify(puzzle));
};

function drawRoundedRect(ctx, x, y, width, height, radius) {
	ctx.beginPath();
	ctx.moveTo(x + radius, y);
	ctx.lineTo(x + width - radius, y);
	ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
	ctx.lineTo(x + width, y + height - radius);
	ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
	ctx.lineTo(x + radius, y + height);
	ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
	ctx.lineTo(x, y + radius);
	ctx.quadraticCurveTo(x, y, x + radius, y);
	ctx.closePath();
}

class WitnessGamePage {
	constructor() {
		this.core = new WitnessCore();

		this.app = document.getElementById("app");
		this.boardViewport = document.getElementById("board-viewport");
		this.boardShell = document.getElementById("board-shell");
		this.gameCanvas = document.getElementById("game-canvas");

		this.routeToggleBtn = document.getElementById("route-toggle");
		this.menuToggleBtn = document.getElementById("menu-toggle");
		this.menuCloseBtn = document.getElementById("menu-close");

		this.menuOverlay = document.getElementById("menu-overlay");
		this.menuViewport = document.getElementById("menu-viewport");
		this.menuShell = document.getElementById("menu-shell");
		this.menuCanvas = document.getElementById("menu-canvas");

		this.pauseOverlay = document.getElementById("pause-overlay");
		this.statusPill = document.getElementById("status-pill");
		this.sceneBanner = document.getElementById("scene-banner");
		this.flashLayer = document.getElementById("flash-layer");

		this.mainRender = {
			pixelRatio: 1,
			cellSize: 80,
			gridPadding: 60,
			exitLength: 25,
		};
		this.menuRender = {
			pixelRatio: 1,
			cellSize: 44,
			gridPadding: 24,
			exitLength: 16,
		};

		this.ui = new WitnessUI(this.gameCanvas, undefined, {
			pixelRatio: this.mainRender.pixelRatio,
			blinkMarksOnError: true,
			stayPathOnError: true,
		});

		this.menuUI = new WitnessUI(this.menuCanvas, undefined, {
			pixelRatio: this.menuRender.pixelRatio,
			cellSize: this.menuRender.cellSize,
			gridPadding: this.menuRender.gridPadding,
			nodeRadius: 4,
			startNodeRadius: 12,
			pathWidth: 10,
			exitLength: this.menuRender.exitLength,
			blinkMarksOnError: false,
			stayPathOnError: true,
			colors: {
				grid: "#4b6375",
				node: "#d7e7f4",
				path: "#ffdd75",
				error: "#ff7587",
				success: "#a6ffbf",
				interrupted: "#ffdd75",
			},
		});

		this.scene = "map";
		this.packIndex = 0;
		this.stageIndex = null;
		this.stagePacks = [];
		this.currentMapInfo = null;
		this.currentStagePuzzle = null;
		this.menuPuzzle = null;

		this.inputLocked = false;
		this.paused = false;
		this.menuOpen = false;
		this.pendingLayout = 0;
		this.statusTimer = 0;
		this.clearedStageIds = new Set();
	}

	async init() {
		this.bindEvents();
		this.setStatus("...", "neutral", 300);

		try {
			await this.prepareStagePacks();
			this.menuPuzzle = this.createMenuPuzzle();
			this.menuUI.setPuzzle(clonePuzzle(this.menuPuzzle));
			await this.openMapScene("", false);
		} catch (error) {
			console.error(error);
			this.setStatus("INIT ERROR", "bad", 2400);
		}
	}

	bindEvents() {
		this.ui.on("path:complete", (event) => {
			void this.handleMainPathComplete(event);
		});
		this.menuUI.on("path:complete", (event) => {
			void this.handleMenuPathComplete(event);
		});

		this.ui.on("render:after", ({ ctx }) => {
			this.onMainRenderAfter(ctx);
		});
		this.menuUI.on("render:after", ({ ctx }) => {
			this.onMenuRenderAfter(ctx);
		});

		this.menuToggleBtn.addEventListener("click", () => {
			this.setMenuOpen(!this.menuOpen);
		});
		this.menuCloseBtn.addEventListener("click", () => {
			this.setMenuOpen(false);
		});

		this.menuOverlay.addEventListener("click", (event) => {
			if (event.target === this.menuOverlay) this.setMenuOpen(false);
		});

		this.routeToggleBtn.addEventListener("click", () => {
			void this.cyclePack(1);
		});

		const requestLayout = () => this.requestLayout();
		window.addEventListener("resize", requestLayout, { passive: true });
		window.addEventListener("orientationchange", requestLayout, { passive: true });
		window.visualViewport?.addEventListener("resize", requestLayout, { passive: true });

		if (typeof ResizeObserver !== "undefined") {
			const observer = new ResizeObserver(() => this.requestLayout());
			observer.observe(this.boardViewport);
			observer.observe(this.menuViewport);
		}
	}

	async prepareStagePacks() {
		const blueprints = this.createStagePackBlueprints();
		const packs = [];

		for (const pack of blueprints) {
			const stages = [];
			for (const stage of pack.stages) {
				let puzzle;
				try {
					puzzle = this.core.createPuzzle(stage.rows, stage.cols, { ...stage.options });
				} catch (error) {
					console.warn("Stage generation failed, using fallback:", stage.id, error);
					puzzle = this.core.createPuzzle(stage.rows, stage.cols, this.defaultStageOptions(stage.seed));
				}

				const code = await PuzzleSerializer.serialize({ puzzle });
				stages.push({ ...stage, code });
			}

			packs.push({
				id: pack.id,
				name: pack.name,
				stages,
				map: this.createMapPuzzle(stages.length),
			});
		}

		this.stagePacks = packs;
	}

	createStagePackBlueprints() {
		return [
			{
				id: "linear",
				name: "Route A",
				stages: [
					{ id: "L1", label: "L1", goalType: "line", seed: "a101", rows: 2, cols: 2, options: this.defaultStageOptions("a101", { pathLength: 0.2, difficulty: 0.2, useHexagons: false }) },
					{ id: "L2", label: "L2", goalType: "hex", seed: "a102", rows: 3, cols: 3, options: this.defaultStageOptions("a102", { useHexagons: true, pathLength: 0.35, difficulty: 0.35 }) },
					{ id: "L3", label: "L3", goalType: "broken", seed: "a103", rows: 3, cols: 3, options: this.defaultStageOptions("a103", { useBrokenEdges: true, complexity: 0.5, difficulty: 0.4 }) },
					{ id: "L4", label: "L4", goalType: "triangle", seed: "a104", rows: 4, cols: 4, options: this.defaultStageOptions("a104", { useTriangles: true, complexity: 0.55, difficulty: 0.45 }) },
					{ id: "L5", label: "L5", goalType: "mix", seed: "a105", rows: 4, cols: 4, options: this.defaultStageOptions("a105", { useSquares: true, useStars: true, complexity: 0.6, difficulty: 0.55 }) },
				],
			},
			{
				id: "symbol",
				name: "Route B",
				stages: [
					{ id: "S1", label: "S1", goalType: "star", seed: "b201", rows: 3, cols: 3, options: this.defaultStageOptions("b201", { useSquares: true, useStars: true, difficulty: 0.4, complexity: 0.45 }) },
					{ id: "S2", label: "S2", goalType: "sym", seed: "b202", rows: 4, cols: 4, options: this.defaultStageOptions("b202", { symmetry: 1, useHexagons: true, difficulty: 0.45, pathLength: 0.45 }) },
					{ id: "S3", label: "S3", goalType: "tetris", seed: "b203", rows: 4, cols: 4, options: this.defaultStageOptions("b203", { useTetris: true, complexity: 0.55, difficulty: 0.55, pathLength: 0.5 }) },
					{
						id: "S4",
						label: "S4",
						goalType: "neg",
						seed: "b204",
						rows: 5,
						cols: 4,
						options: this.defaultStageOptions("b204", {
							useTetris: true,
							useTetrisNegative: true,
							useTriangles: true,
							complexity: 0.65,
							difficulty: 0.65,
							pathLength: 0.55,
						}),
					},
				],
			},
		];
	}

	defaultStageOptions(seed, overrides = {}) {
		return {
			seed,
			useHexagons: true,
			useSquares: false,
			useStars: false,
			useTetris: false,
			useTetrisNegative: false,
			useEraser: false,
			useTriangles: false,
			useBrokenEdges: false,
			complexity: 0.4,
			difficulty: 0.4,
			pathLength: 0.45,
			...overrides,
		};
	}

	createEmptyPuzzle(rows, cols) {
		return {
			rows,
			cols,
			cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ type: CellType.None, color: 0 }))),
			hEdges: Array.from({ length: rows + 1 }, () => Array.from({ length: cols }, () => ({ type: EdgeType.Normal }))),
			vEdges: Array.from({ length: rows }, () => Array.from({ length: cols + 1 }, () => ({ type: EdgeType.Normal }))),
			nodes: Array.from({ length: rows + 1 }, () => Array.from({ length: cols + 1 }, () => ({ type: NodeType.Normal }))),
			symmetry: 0,
		};
	}

	createMapPuzzle(stageCount) {
		const rows = Math.max(1, stageCount);
		const cols = 0;
		const puzzle = this.createEmptyPuzzle(rows, cols);

		puzzle.nodes[rows][0].type = NodeType.Start;

		const stageByNode = new Map();
		for (let index = 0; index < stageCount; index++) {
			const y = rows - 1 - index;
			puzzle.nodes[y][0].type = NodeType.End;
			stageByNode.set(`0,${y}`, index);
		}
		return { puzzle, stageByNode };
	}

	createMenuPuzzle() {
		const puzzle = this.createEmptyPuzzle(1, 2);
		puzzle.nodes[1][0].type = NodeType.Start;
		puzzle.nodes[0][0].type = NodeType.End;
		puzzle.nodes[0][1].type = NodeType.End;
		puzzle.nodes[0][2].type = NodeType.End;
		return puzzle;
	}

	getMainSceneOptions(targetScene) {
		const highContrastColorMap = {
			0: "#ffd35f",
			1: "#6ff2ff",
			2: "#f4f8ff",
			3: "#ff81ac",
			4: "#7ca9ff",
		};

		if (targetScene === "map") {
			return {
				pixelRatio: this.mainRender.pixelRatio,
				inputMode: "drag",
				colors: {
					grid: "#60768a",
					node: "#d6e6f6",
					path: "#7bdfff",
					error: "#ff7086",
					success: "#9bffbf",
					interrupted: "#7bdfff",
					hexagon: "#ffdf8f",
					hexagonMain: "#7befff",
					hexagonSymmetry: "#ff9bcf",
					colorMap: highContrastColorMap,
				},
			};
		}

		return {
			pixelRatio: this.mainRender.pixelRatio,
			inputMode: "drag",
			colors: {
				grid: "#5f6573",
				node: "#d9d7e8",
				path: "#ffdd72",
				error: "#ff6e81",
				success: "#9dffb0",
				interrupted: "#ffdd72",
				hexagon: "#ffe19a",
				hexagonMain: "#7ef2ff",
				hexagonSymmetry: "#ff9fd2",
				colorMap: highContrastColorMap,
			},
		};
	}

	gridPointToCanvas(x, y, metrics) {
		return {
			x: metrics.gridPadding + x * metrics.cellSize,
			y: metrics.gridPadding + y * metrics.cellSize,
		};
	}

	getExitDirection(puzzle, x, y) {
		const isLeft = x === 0;
		const isRight = x === puzzle.cols;
		const isTop = y === 0;
		const isBottom = y === puzzle.rows;
		if (!isLeft && !isRight && !isTop && !isBottom) return null;

		const isCorner = (isLeft || isRight) && (isTop || isBottom);
		if (isCorner) {
			if (puzzle.cols >= puzzle.rows) return isLeft ? { x: -1, y: 0 } : { x: 1, y: 0 };
			return isTop ? { x: 0, y: -1 } : { x: 0, y: 1 };
		}

		if (isLeft) return { x: -1, y: 0 };
		if (isRight) return { x: 1, y: 0 };
		if (isTop) return { x: 0, y: -1 };
		if (isBottom) return { x: 0, y: 1 };
		return null;
	}

	drawGoalTag(ctx, x, y, text, accent = "#dfefff") {
		ctx.save();
		ctx.font = "700 12px 'Segoe UI', sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";

		const width = Math.ceil(ctx.measureText(text).width) + 10;
		const height = 20;

		drawRoundedRect(ctx, x - width / 2, y - height / 2, width, height, 8);
		ctx.fillStyle = "rgba(8, 14, 21, 0.82)";
		ctx.fill();
		ctx.strokeStyle = "rgba(180, 215, 238, 0.45)";
		ctx.lineWidth = 1;
		ctx.stroke();

		ctx.lineWidth = 3;
		ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
		ctx.strokeText(text, x, y + 0.5);
		ctx.fillStyle = accent;
		ctx.fillText(text, x, y + 0.5);
		ctx.restore();
	}

	onMainRenderAfter(ctx) {
		if (this.scene !== "map" || !this.currentMapInfo) return;

		const puzzle = this.currentMapInfo.puzzle;
		for (const [key, stageIndex] of this.currentMapInfo.stageByNode.entries()) {
			const [sx, sy] = key.split(",").map(Number);
			const dir = this.getExitDirection(puzzle, sx, sy);
			if (!dir) continue;
			const nodePos = this.gridPointToCanvas(sx, sy, this.mainRender);
			const labelX = nodePos.x + dir.x * (this.mainRender.exitLength + 24);
			const labelY = nodePos.y + dir.y * (this.mainRender.exitLength + 24);
			this.drawGoalTag(ctx, labelX, labelY, String(stageIndex + 1), "#8df1ff");
		}
	}

	getMenuActions() {
		if (this.scene === "stage") {
			return [
				{ index: 0, label: this.paused ? "PLAY" : "PAUSE", accent: "#8fffd0" },
				{ index: 1, label: "RETRY", accent: "#ffe081" },
				{ index: 2, label: "MAP", accent: "#95c5ff" },
			];
		}
		return [
			{ index: 0, label: "ROUTE-", accent: "#ffcf8d" },
			{ index: 1, label: "ROUTE+", accent: "#9ce1ff" },
			{ index: 2, label: "CLOSE", accent: "#d5dfff" },
		];
	}

	onMenuRenderAfter(ctx) {
		if (!this.menuOpen || !this.menuPuzzle) return;

		const actions = this.getMenuActions();
		for (const action of actions) {
			const x = action.index;
			const y = 0;
			const dir = this.getExitDirection(this.menuPuzzle, x, y);
			if (!dir) continue;
			const nodePos = this.gridPointToCanvas(x, y, this.menuRender);
			const labelX = nodePos.x + dir.x * (this.menuRender.exitLength + 32);
			const labelY = nodePos.y + dir.y * (this.menuRender.exitLength + 22);
			this.drawGoalTag(ctx, labelX, labelY, action.label, action.accent);
		}
	}

	async changeScene(targetScene, bannerText, loadTask, animated) {
		if (animated) {
			this.inputLocked = true;
			this.setMainInputEnabled();
			this.showBanner(bannerText);
			this.app.classList.add("scene-exit");
			await wait(200);
		}

		try {
			await loadTask();
			this.scene = targetScene;
			this.updateSceneState();
			this.requestLayout();
		} catch (error) {
			console.error(error);
			this.setStatus("SCENE ERROR", "bad", 1800);
		} finally {
			if (animated) {
				this.app.classList.remove("scene-exit");
				this.app.classList.add("scene-enter");
				await wait(220);
				this.app.classList.remove("scene-enter");
				this.hideBanner();
				this.inputLocked = false;
				this.setMainInputEnabled();
			}
		}
	}

	async openMapScene(status = "", animated = true) {
		await this.changeScene(
			"map",
			"MAP",
			async () => {
				this.stageIndex = null;
				this.currentStagePuzzle = null;
				this.paused = false;
				this.currentMapInfo = this.stagePacks[this.packIndex].map;
				this.ui.setOptions(this.getMainSceneOptions("map"));
				this.ui.setPuzzle(clonePuzzle(this.currentMapInfo.puzzle));
				if (status) this.setStatus(status, "good", 1200);
			},
			animated,
		);
	}

	async openStageScene(stageIndex, status = "", animated = true) {
		const pack = this.stagePacks[this.packIndex];
		const stage = pack.stages[stageIndex];

		await this.changeScene(
			"stage",
			`STAGE ${stageIndex + 1}`,
			async () => {
				this.paused = false;
				this.stageIndex = stageIndex;
				const data = await PuzzleSerializer.deserialize(stage.code);
				if (!data.puzzle) throw new Error(`Stage decode failed: ${stage.id}`);
				this.currentStagePuzzle = data.puzzle;
				this.ui.setOptions(this.getMainSceneOptions("stage"));
				this.ui.setPuzzle(clonePuzzle(this.currentStagePuzzle));
				if (status) this.setStatus(status, "good", 1200);
			},
			animated,
		);
	}

	async cyclePack(delta) {
		if (this.inputLocked) return;
		if (this.scene !== "map") return;
		const count = this.stagePacks.length;
		this.packIndex = (this.packIndex + delta + count) % count;
		await this.openMapScene(`ROUTE ${this.packIndex + 1}`, true);
	}

	async handleMainPathComplete(event) {
		if (this.inputLocked) return;
		if (this.scene === "stage" && this.paused) return;

		const puzzle = this.scene === "map" ? this.currentMapInfo?.puzzle : this.currentStagePuzzle;
		if (!puzzle) return;

		const result = this.core.validateSolution(puzzle, { points: event.path });
		this.ui.setValidationResult(result.isValid, result.invalidatedCells, result.invalidatedEdges, result.errorCells, result.errorEdges, result.invalidatedNodes, result.errorNodes);

		if (!result.isValid) {
			this.setStatus("MISS", "bad", 900);
			return;
		}

		if (this.scene === "map") {
			await this.onMapSolved(event.endNode);
			return;
		}
		await this.onStageSolved();
	}

	async onMapSolved(endNode) {
		if (!endNode || !this.currentMapInfo) return;
		const stageIndex = this.currentMapInfo.stageByNode.get(`${endNode.x},${endNode.y}`);
		if (stageIndex == null) return;
		await this.openStageScene(stageIndex, "", true);
	}

	async onStageSolved() {
		if (this.stageIndex == null) return;

		const pack = this.stagePacks[this.packIndex];
		const stage = pack.stages[this.stageIndex];
		this.clearedStageIds.add(`${pack.id}:${stage.id}`);

		this.playClearFlash();
		this.setStatus("CLEAR", "good", 900);

		const nextIndex = this.stageIndex + 1;
		if (nextIndex < pack.stages.length) {
			await wait(900);
			await this.openStageScene(nextIndex, "NEXT", true);
			return;
		}

		await wait(900);
		await this.openMapScene("MAP END", true);
	}

	async handleMenuPathComplete(event) {
		if (!this.menuOpen || !this.menuPuzzle || this.inputLocked) return;

		const result = this.core.validateSolution(this.menuPuzzle, { points: event.path });
		this.menuUI.setValidationResult(result.isValid, result.invalidatedCells, result.invalidatedEdges, result.errorCells, result.errorEdges, result.invalidatedNodes, result.errorNodes);
		if (!result.isValid) return;

		const actionIndex = event.endNode?.index ?? -1;

		if (this.scene === "stage") {
			if (actionIndex === 0) {
				this.togglePause();
				this.setMenuOpen(false);
			} else if (actionIndex === 1) {
				this.setMenuOpen(false);
				await this.restartStage();
			} else if (actionIndex === 2) {
				this.setMenuOpen(false);
				await this.openMapScene("", true);
			}
		} else {
			if (actionIndex === 0) {
				this.setMenuOpen(false);
				await this.cyclePack(-1);
			} else if (actionIndex === 1) {
				this.setMenuOpen(false);
				await this.cyclePack(1);
			} else if (actionIndex === 2) {
				this.setMenuOpen(false);
			}
		}

		setTimeout(() => {
			if (this.menuPuzzle) this.menuUI.setPuzzle(clonePuzzle(this.menuPuzzle));
		}, 20);
	}

	togglePause(forceState = null) {
		if (this.scene !== "stage") return;
		this.paused = forceState == null ? !this.paused : !!forceState;
		this.pauseOverlay.classList.toggle("hidden", !this.paused);
		this.setMainInputEnabled();
	}

	async restartStage() {
		if (this.scene !== "stage" || this.stageIndex == null) return;
		await this.openStageScene(this.stageIndex, "RETRY", true);
	}

	setMenuOpen(open) {
		this.menuOpen = !!open;
		this.menuOverlay.classList.toggle("hidden", !this.menuOpen);
		this.menuOverlay.setAttribute("aria-hidden", this.menuOpen ? "false" : "true");

		if (this.menuOpen && this.menuPuzzle) {
			this.menuUI.setPuzzle(clonePuzzle(this.menuPuzzle));
			this.requestLayout();
		}
		this.setMainInputEnabled();
	}

	setStatus(text, tone = "neutral", ttl = 1300) {
		if (!text) {
			this.statusPill.classList.add("hidden");
			return;
		}

		this.statusPill.textContent = text;
		this.statusPill.classList.remove("hidden", "tone-neutral", "tone-good", "tone-bad");
		this.statusPill.classList.add(`tone-${tone}`);

		if (this.statusTimer) clearTimeout(this.statusTimer);
		this.statusTimer = setTimeout(() => {
			this.statusPill.classList.add("hidden");
		}, ttl);
	}

	showBanner(text) {
		this.sceneBanner.textContent = text;
		this.sceneBanner.classList.remove("hidden");
	}

	hideBanner() {
		this.sceneBanner.classList.add("hidden");
	}

	playClearFlash() {
		this.flashLayer.classList.remove("run");
		void this.flashLayer.offsetWidth;
		this.flashLayer.classList.add("run");
	}

	updateSceneState() {
		this.app.classList.toggle("scene-map", this.scene === "map");
		this.app.classList.toggle("scene-stage", this.scene === "stage");
		this.app.classList.toggle("menu-open", this.menuOpen);
		this.pauseOverlay.classList.toggle("hidden", !(this.scene === "stage" && this.paused));

		this.routeToggleBtn.classList.toggle("hidden-ui", this.scene !== "map");
		this.routeToggleBtn.textContent = `⟲ ${this.packIndex + 1}`;
		this.setMainInputEnabled();
	}

	setMainInputEnabled() {
		const mainEnabled = !this.inputLocked && !this.menuOpen && !(this.scene === "stage" && this.paused);
		this.gameCanvas.style.pointerEvents = mainEnabled ? "auto" : "none";

		const menuEnabled = !this.inputLocked && this.menuOpen;
		this.menuCanvas.style.pointerEvents = menuEnabled ? "auto" : "none";
		this.menuViewport.classList.toggle("disabled", !menuEnabled);

		this.menuToggleBtn.disabled = this.inputLocked;
		this.routeToggleBtn.disabled = this.inputLocked || this.scene !== "map";
	}

	requestLayout() {
		if (this.pendingLayout) return;
		this.pendingLayout = requestAnimationFrame(() => {
			this.pendingLayout = 0;
			this.layoutCanvases();
		});
	}

	layoutCanvases() {
		this.layoutSingleCanvas(this.boardShell, this.gameCanvas, this.boardViewport, this.mainRender.pixelRatio, 6);
		this.layoutSingleCanvas(this.menuShell, this.menuCanvas, this.menuViewport, this.menuRender.pixelRatio, 12);
	}

	layoutSingleCanvas(shell, canvas, viewport, pixelRatio, margin) {
		if (!shell || !canvas || !viewport) return;
		if (!canvas.width || !canvas.height) return;

		const baseW = Math.max(1, Math.round(canvas.width / pixelRatio));
		const baseH = Math.max(1, Math.round(canvas.height / pixelRatio));
		const availW = Math.max(1, viewport.clientWidth - margin * 2);
		const availH = Math.max(1, viewport.clientHeight - margin * 2);
		let scale = Math.min(availW / baseW, availH / baseH);
		if (!Number.isFinite(scale) || scale <= 0) scale = 1;

		shell.style.width = `${baseW}px`;
		shell.style.height = `${baseH}px`;
		shell.style.transform = `scale(${scale})`;

		canvas.style.width = `${baseW}px`;
		canvas.style.height = `${baseH}px`;
	}
}

if (typeof window !== "undefined") {
	window.addEventListener("DOMContentLoaded", () => {
		const game = new WitnessGamePage();
		window.witnessGamePage = game;
		void game.init();
	});
}
