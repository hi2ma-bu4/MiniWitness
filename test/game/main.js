import { CellType, EdgeType, NodeType, PuzzleSerializer, WitnessCore, WitnessUI } from "../../dist/MiniWitness.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MAP_STAGE_CAPACITY = 20;
const FILTER_RGB_COLORS = ["#ff5f66", "#67ef86", "#64a7ff"];

const clonePuzzle = (puzzle) => {
	if (typeof structuredClone === "function") return structuredClone(puzzle);
	return JSON.parse(JSON.stringify(puzzle));
};

const STAGE_PACK_BLUEPRINTS = [
	{
		id: "linear",
		name: "Route A",
		bossFeatures: {
			useHexagons: true,
			useSquares: true,
			useStars: true,
			useTetris: false,
			useTetrisNegative: false,
			useEraser: false,
			useTriangles: true,
			useBrokenEdges: true,
		},
		stages: [
			{ id: "L1", label: "L1", goalType: "line", kind: "fixed", rows: 2, cols: 2, code: "AAGCAAAAAAAAAAAAAAAEIACn" },
			{ id: "L2", label: "L2", goalType: "hex", kind: "fixed", rows: 3, cols: 3, code: "AAHDAAAAAAAAAAAAAACwAQAAAAMAAAAAQAAAAAEAMQ" },
			{ id: "L3", label: "L3", goalType: "broken", kind: "fixed", rows: 3, cols: 3, code: "AAHDAAAAAAAAAAAAAAAAAAAADBgGAAAEQAAAAAEAlQ" },
			{ id: "L4", label: "L4", goalType: "triangle", kind: "fixed", rows: 4, cols: 4, code: "AR-LCAAAAAAAAApjZGFkgAABJgYGBicGOGBDMBlYwCQTAwCpU9EwLgAAAL4" },
			{
				id: "LB",
				label: "BOSS",
				goalType: "boss",
				kind: "boss",
				boss: {
					rounds: 3,
					rows: 5,
					cols: 5,
					baseComplexity: 0.66,
					baseDifficulty: 0.64,
					basePathLength: 0.58,
					symmetryModes: [0],
				},
			},
		],
	},
	{
		id: "symbol",
		name: "Route B",
		bossFeatures: {
			useHexagons: true,
			useSquares: true,
			useStars: true,
			useTetris: true,
			useTetrisNegative: true,
			useEraser: false,
			useTriangles: true,
			useBrokenEdges: false,
		},
		stages: [
			{ id: "S1", label: "S1", goalType: "star", kind: "fixed", rows: 3, cols: 3, code: "AAHDAAAQJIgQIQAiRIgAAAAAAAAwAAAAQAAAAAEA0A" },
			{ id: "S2", label: "S2", goalType: "sym", kind: "fixed", rows: 4, cols: 4, code: "AR-LCAAAAAAAAApjZBFkwAJEGBgEICxtEIsRxGpg4AAAYubwyy4AAAAz" },
			{ id: "S3", label: "S3", goalType: "tetris", kind: "fixed", rows: 4, cols: 4, code: "AR-LCAAAAAAAAApjZHHs4GBgaGhkYGBgYGZkQAY8SGwOMMnCwAAA0dx8KDEAAABI" },
			{ id: "SF", label: "FILTER", goalType: "filter", kind: "filter", rows: 3, cols: 3, code: "AAHDAAAQJIgQIQAiRIgAAAAAAAAwAAAAQAAAAAEA0A" },
			{
				id: "SB",
				label: "BOSS",
				goalType: "boss",
				kind: "boss",
				boss: {
					rounds: 3,
					rows: 5,
					cols: 5,
					baseComplexity: 0.7,
					baseDifficulty: 0.68,
					basePathLength: 0.6,
					symmetryModes: [0, 1],
				},
			},
		],
	},
];

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

		this.menuToggleBtn = document.getElementById("menu-toggle");
		this.menuCloseBtn = document.getElementById("menu-close");

		this.menuOverlay = document.getElementById("menu-overlay");
		this.menuViewport = document.getElementById("menu-viewport");
		this.menuShell = document.getElementById("menu-shell");
		this.menuCanvas = document.getElementById("menu-canvas");

		this.statusPill = document.getElementById("status-pill");
		this.sceneBanner = document.getElementById("scene-banner");
		this.flashLayer = document.getElementById("flash-layer");
		this.hudTitle = document.getElementById("hud-title");
		this.hudDetail = document.getElementById("hud-detail");
		this.hudProgress = document.getElementById("hud-progress");
		this.hudProgressText = document.getElementById("hud-progress-text");
		this.filterPanel = document.getElementById("filter-panel");
		this.filterInfo = document.getElementById("filter-info");
		this.filterButtons = Array.from(document.querySelectorAll("[data-filter-index]"));

		this.mainRender = {
			pixelRatio: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
			cellSize: 80,
			gridPadding: 60,
			exitLength: 25,
			nodeRadius: 5,
			startNodeRadius: 22,
			pathWidth: 18,
		};
		const mapScale = 1.3;
		this.mapRender = {
			pixelRatio: this.mainRender.pixelRatio,
			cellSize: this.mainRender.cellSize / mapScale,
			gridPadding: this.mainRender.gridPadding / mapScale,
			nodeRadius: this.mainRender.nodeRadius / mapScale,
			startNodeRadius: this.mainRender.startNodeRadius / mapScale,
			pathWidth: this.mainRender.pathWidth / mapScale,
			exitLength: this.mainRender.exitLength / mapScale,
		};
		const menuScale = 1.1;
		this.menuRender = {
			pixelRatio: this.mainRender.pixelRatio,
			cellSize: this.mainRender.cellSize / menuScale,
			gridPadding: this.mainRender.gridPadding / menuScale,
			nodeRadius: this.mainRender.nodeRadius / menuScale,
			startNodeRadius: this.mainRender.startNodeRadius / menuScale,
			pathWidth: this.mainRender.pathWidth / menuScale,
			exitLength: this.mainRender.exitLength / menuScale,
		};

		this.ui = new WitnessUI(this.gameCanvas, undefined, {
			pixelRatio: this.mainRender.pixelRatio,
			cellSize: this.mainRender.cellSize,
			gridPadding: this.mainRender.gridPadding,
			nodeRadius: this.mainRender.nodeRadius,
			startNodeRadius: this.mainRender.startNodeRadius,
			pathWidth: this.mainRender.pathWidth,
			exitLength: this.mainRender.exitLength,
			blinkMarksOnError: true,
			stayPathOnError: true,
		});

		this.menuUI = new WitnessUI(this.menuCanvas, undefined, {
			pixelRatio: this.menuRender.pixelRatio,
			cellSize: this.menuRender.cellSize,
			gridPadding: this.menuRender.gridPadding,
			nodeRadius: this.menuRender.nodeRadius,
			startNodeRadius: this.menuRender.startNodeRadius,
			pathWidth: this.menuRender.pathWidth,
			exitLength: this.menuRender.exitLength,
			blinkMarksOnError: false,
			stayPathOnError: true,
			layout: {
				margin: { top: 20, right: 78, bottom: 22, left: 78 },
				padding: { top: 8, right: 14, bottom: 8, left: 14 },
				offsetY: 2,
			},
			colors: {
				grid: "#4b6375",
				node: "#4b6375",
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
		this.menuActions = [];
		this.menuActionByIndex = new Map();
		this.bossRun = null;
		this.filterChallenge = null;

		this.inputLocked = false;
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
			this.refreshMenuPuzzle();
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
		this.filterButtons.forEach((button) => {
			button.addEventListener("click", () => {
				const index = Number(button.dataset.filterIndex);
				this.setFilterIndex(index);
			});
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
		this.stagePacks = this.createStagePackBlueprints().map((pack) => ({
			...pack,
			stages: pack.stages.map((stage) => ({ ...stage })),
			map: this.createMapPuzzle(pack.id, pack.stages.length),
		}));
	}

	createStagePackBlueprints() {
		return STAGE_PACK_BLUEPRINTS.map((pack) => ({
			...pack,
			bossFeatures: { ...pack.bossFeatures },
			stages: pack.stages.map((stage) => ({
				...stage,
				boss: stage.boss ? { ...stage.boss, symmetryModes: [...(stage.boss.symmetryModes ?? [0])] } : undefined,
			})),
		}));
	}

	defaultStageOptions(overrides = {}) {
		return {
			seed: this.createRandomSeed(),
			useBrokenEdges: false,
			symmetry: 0,
			complexity: 0.4,
			difficulty: 0.4,
			pathLength: 0.45,
			...overrides,
		};
	}

	createRandomSeed() {
		const a = Math.floor(Math.random() * 0xffffffff)
			.toString(16)
			.padStart(8, "0");
		const b = Math.floor(Math.random() * 0xffffffff)
			.toString(16)
			.padStart(8, "0");
		return `${a}${b}`;
	}

	jitter(base, delta, min = 0.1, max = 0.95) {
		const value = base + (Math.random() * 2 - 1) * delta;
		return Math.max(min, Math.min(max, value));
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

	createMapPuzzle(packId, stageCount) {
		const usableCount = Math.min(stageCount, MAP_STAGE_CAPACITY);
		const rows = 1;
		const cols = Math.max(1, Math.ceil(usableCount / 2) + 1);
		const puzzle = this.createEmptyPuzzle(rows, cols);

		for (let r = 0; r <= rows; r++) {
			for (let c = 0; c < cols; c++) puzzle.hEdges[r][c].type = EdgeType.Absent;
		}
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c <= cols; c++) puzzle.vEdges[r][c].type = EdgeType.Absent;
		}

		for (let c = 0; c < cols; c++) {
			puzzle.hEdges[0][c].type = EdgeType.Normal;
			puzzle.hEdges[rows][c].type = EdgeType.Normal;
		}
		for (let r = 0; r < rows; r++) {
			puzzle.vEdges[r][0].type = EdgeType.Normal;
			puzzle.vEdges[r][cols].type = EdgeType.Normal;
		}

		const startNode = { x: 0, y: rows };
		const routePrevNode = { x: 0, y: 0 };
		const routeNextNode = { x: cols, y: 0 };
		const routeExtraNode = { x: cols, y: rows };
		puzzle.nodes[startNode.y][startNode.x].type = NodeType.Start;

		const routeByNode = new Map();
		puzzle.nodes[routeNextNode.y][routeNextNode.x].type = NodeType.End;
		routeByNode.set(`${routeNextNode.x},${routeNextNode.y}`, 1);
		puzzle.nodes[routePrevNode.y][routePrevNode.x].type = NodeType.End;
		routeByNode.set(`${routePrevNode.x},${routePrevNode.y}`, -1);

		const stageByNode = new Map();
		for (let index = 0; index < usableCount; index++) {
			let node;
			const colIndex = Math.floor(index / 2) + 1;
			if (index % 2 === 0) {
				node = { x: colIndex, y: rows };
			} else {
				node = { x: colIndex, y: 0 };
			}
			if (node.x < cols || (node.x === cols && node.y !== 0 && node.y !== rows)) {
				puzzle.nodes[node.y][node.x].type = NodeType.End;
				stageByNode.set(`${node.x},${node.y}`, index);
			}
		}

		return { packId, puzzle, stageByNode, routeByNode };
	}

	getPerimeterNodes(rows, cols) {
		const nodes = [];
		for (let x = 0; x <= cols; x++) nodes.push({ x, y: 0 });
		for (let y = 1; y <= rows; y++) nodes.push({ x: cols, y });
		for (let x = cols - 1; x >= 0; x--) nodes.push({ x, y: rows });
		for (let y = rows - 1; y >= 1; y--) nodes.push({ x: 0, y });
		return nodes;
	}

	createMenuPuzzle() {
		const rows = 0;
		const cols = 2;
		const puzzle = this.createEmptyPuzzle(rows, cols);
		puzzle.nodes[0][1].type = NodeType.Start;
		puzzle.nodes[0][0].type = NodeType.End;
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
				pixelRatio: this.mapRender.pixelRatio,
				cellSize: this.mapRender.cellSize,
				gridPadding: this.mapRender.gridPadding,
				exitLength: this.mapRender.exitLength,
				pathWidth: this.mapRender.pathWidth,
				nodeRadius: this.mapRender.nodeRadius,
				startNodeRadius: this.mapRender.startNodeRadius,
				inputMode: "drag",
				layout: {
					margin: { top: 48, right: 56, bottom: 48, left: 56 },
					padding: { top: 6, right: 8, bottom: 6, left: 8 },
					offsetX: 0,
					offsetY: 0,
				},
				colors: {
					grid: "#60768a",
					node: "#60768a",
					path: "#7bdfff",
					error: "#ff7086",
					success: "#9bffbf",
					interrupted: "#7bdfff",
					hexagon: "#ffdf8f",
					hexagonMain: "#7befff",
					hexagonSymmetry: "#ff9bcf",
					colorMap: highContrastColorMap,
				},
				filter: { enabled: false },
			};
		}

		return {
			pixelRatio: this.mainRender.pixelRatio,
			cellSize: this.mainRender.cellSize,
			gridPadding: this.mainRender.gridPadding,
			exitLength: this.mainRender.exitLength,
			pathWidth: this.mainRender.pathWidth,
			nodeRadius: this.mainRender.nodeRadius,
			startNodeRadius: this.mainRender.startNodeRadius,
			inputMode: "drag",
			layout: {
				margin: 0,
				padding: 0,
				offsetX: 0,
				offsetY: 0,
			},
			colors: {
				grid: "#5f6573",
				node: "#5f6573",
				path: "#ffdd72",
				error: "#ff6e81",
				success: "#9dffb0",
				interrupted: "#ffdd72",
				hexagon: "#ffe19a",
				hexagonMain: "#7ef2ff",
				hexagonSymmetry: "#ff9fd2",
				colorMap: highContrastColorMap,
			},
			filter: { enabled: false },
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

	drawGoalTag(ctx, x, y, text, accent = "#dfefff", fill = "rgba(8, 14, 21, 0.82)", border = "rgba(180, 215, 238, 0.45)") {
		ctx.save();
		ctx.font = "700 12px 'Segoe UI', sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";

		const width = Math.ceil(ctx.measureText(text).width) + 10;
		const height = 20;

		drawRoundedRect(ctx, x - width / 2, y - height / 2, width, height, 8);
		ctx.fillStyle = fill;
		ctx.fill();
		ctx.strokeStyle = border;
		ctx.lineWidth = 1;
		ctx.stroke();

		ctx.lineWidth = 3;
		ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
		ctx.strokeText(text, x, y + 0.5);
		ctx.fillStyle = accent;
		ctx.fillText(text, x, y + 0.5);
		ctx.restore();
	}

	clampLabelPosition(x, y, canvas, pixelRatio, padding = 16) {
		const width = Math.max(1, Math.round(canvas.width / pixelRatio));
		const height = Math.max(1, Math.round(canvas.height / pixelRatio));
		return {
			x: Math.max(padding, Math.min(width - padding, x)),
			y: Math.max(padding, Math.min(height - padding, y)),
		};
	}

	getMapPackForRender() {
		if (this.currentMapInfo?.packId) {
			const byId = this.stagePacks.find((pack) => pack.id === this.currentMapInfo.packId);
			if (byId) return byId;
		}
		return this.stagePacks[this.packIndex] ?? null;
	}

	getStageClearKey(pack, stage) {
		if (!pack || !stage) return null;
		return `${pack.id}:${stage.id}`;
	}

	isStageCleared(pack, stage) {
		const key = this.getStageClearKey(pack, stage);
		if (!key) return false;
		return this.clearedStageIds.has(key);
	}

	getPackClearedCount(pack) {
		let count = 0;
		for (const stage of pack.stages) {
			if (this.isStageCleared(pack, stage)) count++;
		}
		return count;
	}

	getHighestClearedStageIndex(pack) {
		let highest = -1;
		for (let index = 0; index < pack.stages.length; index++) {
			if (this.isStageCleared(pack, pack.stages[index])) highest = index;
		}
		return highest;
	}

	getUnlockedStageMaxIndex(pack) {
		return Math.min(pack.stages.length - 1, this.getHighestClearedStageIndex(pack) + 2);
	}

	isStageUnlocked(pack, stageIndex) {
		if (stageIndex < 0 || stageIndex >= pack.stages.length) return false;
		if (stageIndex <= this.getUnlockedStageMaxIndex(pack)) return true;
		return this.isStageCleared(pack, pack.stages[stageIndex]);
	}

	getStageBadgeInfo(stage, stageIndex, unlocked, cleared) {
		if (stage.kind === "boss") {
			if (!unlocked) return { text: "B", accent: "#9aa4b2", fill: "rgba(48, 53, 63, 0.92)" };
			if (cleared) return { text: "B", accent: "#92ffd0", fill: "rgba(21, 56, 44, 0.92)" };
			return { text: "B", accent: "#ffe59b", fill: "rgba(69, 57, 26, 0.92)" };
		}
		const base = String(stageIndex + 1);
		if (!unlocked) return { text: base, accent: "#8f9aa8", fill: "rgba(47, 52, 62, 0.92)" };
		if (cleared) return { text: base, accent: "#90ffc8", fill: "rgba(20, 58, 44, 0.92)" };
		return { text: base, accent: "#8deeff", fill: "rgba(16, 38, 52, 0.92)" };
	}

	isBackRouteEnabled() {
		return this.packIndex > 0;
	}

	onMainRenderAfter(ctx) {
		if (this.scene !== "map" || !this.currentMapInfo) return;

		const pack = this.getMapPackForRender();
		if (!pack) return;

		const puzzle = this.currentMapInfo.puzzle;
		const clamp = (x, y) => this.clampLabelPosition(x, y, this.gameCanvas, this.mapRender.pixelRatio, 16);

		for (const [key, stageIndex] of this.currentMapInfo.stageByNode.entries()) {
			const [sx, sy] = key.split(",").map(Number);
			const dir = this.getExitDirection(puzzle, sx, sy);
			if (!dir) continue;

			const stage = pack.stages[stageIndex];
			if (!stage) continue;
			const unlocked = this.isStageUnlocked(pack, stageIndex);
			const cleared = this.isStageCleared(pack, stage);
			const nodePos = this.ui.getGridCanvasCoords(sx, sy);
			const rawX = nodePos.x + dir.x * (this.mapRender.exitLength + 30);
			const rawY = nodePos.y + dir.y * (this.mapRender.exitLength + 24);
			const pos = clamp(rawX, rawY);
			const badge = this.getStageBadgeInfo(stage, stageIndex, unlocked, cleared);
			this.drawGoalTag(ctx, pos.x, pos.y, badge.text, badge.accent, badge.fill);
		}

		for (const [key, routeDelta] of this.currentMapInfo.routeByNode.entries()) {
			const [sx, sy] = key.split(",").map(Number);
			const dir = this.getExitDirection(puzzle, sx, sy);
			if (!dir) continue;
			const nodePos = this.ui.getGridCanvasCoords(sx, sy);
			const rawX = nodePos.x + dir.x * (this.mapRender.exitLength + 24);
			const rawY = nodePos.y + dir.y * (this.mapRender.exitLength + 14);
			const pos = clamp(rawX, rawY);
			const backEnabled = routeDelta > 0 || this.isBackRouteEnabled();
			const text = routeDelta > 0 ? ">" : backEnabled ? "<" : "X";
			const accent = routeDelta > 0 ? "#9ce1ff" : backEnabled ? "#ffcf8d" : "#9ca8b5";
			const fill = routeDelta > 0 ? "rgba(18, 40, 56, 0.92)" : backEnabled ? "rgba(64, 44, 24, 0.92)" : "rgba(45, 50, 60, 0.92)";
			this.drawGoalTag(ctx, pos.x, pos.y, text, accent, fill);
		}
	}

	getMenuActions() {
		if (this.scene === "stage") {
			return [
				{ id: "map", label: "MAP", accent: "#95c5ff", nodeX: 0 },
				{ id: "close", label: "CLOSE", accent: "#d5dfff", nodeX: 2 },
			];
		}

		return [
			{ id: "noop", label: "", accent: "#8898ac", nodeX: 0 },
			{ id: "close", label: "CLOSE", accent: "#d5dfff", nodeX: 2 },
		];
	}

	refreshMenuPuzzle() {
		const actions = this.getMenuActions();
		this.menuActions = actions.map((action, index) => ({ ...action, index }));
		this.menuActionByIndex = new Map(this.menuActions.map((action) => [action.index, action]));
		this.menuPuzzle = this.createMenuPuzzle();
		this.menuUI.setPuzzle(clonePuzzle(this.menuPuzzle));
	}

	onMenuRenderAfter(ctx) {
		if (!this.menuOpen || !this.menuPuzzle) return;
		const clamp = (x, y) => this.clampLabelPosition(x, y, this.menuCanvas, this.menuRender.pixelRatio, 14);

		for (const action of this.menuActions) {
			if (!action.label) continue;
			const x = action.nodeX;
			const y = 0;
			const dir = this.getExitDirection(this.menuPuzzle, x, y);
			if (!dir) continue;
			const nodePos = this.menuUI.getGridCanvasCoords(x, y);
			const rawX = nodePos.x + dir.x * (this.menuRender.exitLength + 40);
			const rawY = nodePos.y + dir.y * (this.menuRender.exitLength + 22);
			const pos = clamp(rawX, rawY);
			this.drawGoalTag(ctx, pos.x, pos.y, action.label, action.accent);
		}
	}

	async changeScene(targetScene, bannerText, loadTask, animated) {
		if (animated) {
			this.inputLocked = true;
			this.setMainInputEnabled();
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
				this.bossRun = null;
				this.filterChallenge = null;
				this.setFilterPanelVisible(false);
				this.currentMapInfo = this.stagePacks[this.packIndex].map;
				this.ui.setOptions(this.getMainSceneOptions("map"));
				this.ui.setPuzzle(clonePuzzle(this.currentMapInfo.puzzle));
				this.updateHud();
				if (status) this.setStatus(status, "good", 1200);
			},
			animated,
		);
	}

	createBossRun(pack, stage) {
		return {
			packId: pack.id,
			stageId: stage.id,
			totalRounds: stage.boss?.rounds ?? 3,
			nextRoundToGenerate: 1,
			currentRound: 0,
			queue: [],
			prefetchPromise: null,
		};
	}

	pickRandom(items, fallback) {
		if (!Array.isArray(items) || items.length === 0) return fallback;
		return items[Math.floor(Math.random() * items.length)];
	}

	buildBossGenerationOptions(pack, stage) {
		const boss = stage.boss ?? {};
		const symmetry = this.pickRandom(boss.symmetryModes ?? [0], 0);
		const complexity = this.jitter(boss.baseComplexity ?? 0.65, 0.12);
		return this.defaultStageOptions({
			seed: this.createRandomSeed(),
			ratios: {
				hexagonEdge: pack.bossFeatures.useHexagons ? 0.1 + complexity * 0.2 : 0,
				square: pack.bossFeatures.useSquares ? 0.1 + complexity * 0.2 : 0,
				star: pack.bossFeatures.useStars ? 0.1 + complexity * 0.2 : 0,
				tetris: pack.bossFeatures.useTetris ? 0.1 + complexity * 0.2 : 0,
				tetrisNegative: pack.bossFeatures.useTetrisNegative ? 0.1 + complexity * 0.2 : 0,
				triangle: pack.bossFeatures.useTriangles ? 0.1 + complexity * 0.2 : 0,
				eraser: pack.bossFeatures.useEraser ? 0.05 + complexity * 0.1 : 0,
			},
			useBrokenEdges: pack.bossFeatures.useBrokenEdges,
			symmetry,
			complexity: complexity,
			difficulty: this.jitter(boss.baseDifficulty ?? 0.65, 0.12),
			pathLength: this.jitter(boss.basePathLength ?? 0.55, 0.1),
		});
	}

	async generateBossPuzzle(pack, stage) {
		await wait(0);
		const boss = stage.boss;
		if (!boss) throw new Error(`Boss stage config missing: ${pack.id}:${stage.id}`);

		try {
			return this.core.createPuzzle(boss.rows, boss.cols, this.buildBossGenerationOptions(pack, stage));
		} catch (error) {
			console.warn("Boss generation failed, using fallback:", `${pack.id}:${stage.id}`, error);
			const complexity = 0.45;
			const fallback = this.defaultStageOptions({
				seed: this.createRandomSeed(),
				ratios: {
					hexagonEdge: pack.bossFeatures.useHexagons ? 0.1 + complexity * 0.2 : 0,
					square: pack.bossFeatures.useSquares ? 0.1 + complexity * 0.2 : 0,
					star: pack.bossFeatures.useStars ? 0.1 + complexity * 0.2 : 0,
					tetris: pack.bossFeatures.useTetris ? 0.1 + complexity * 0.2 : 0,
					tetrisNegative: pack.bossFeatures.useTetrisNegative ? 0.1 + complexity * 0.2 : 0,
					triangle: pack.bossFeatures.useTriangles ? 0.1 + complexity * 0.2 : 0,
					eraser: pack.bossFeatures.useEraser ? 0.05 + complexity * 0.1 : 0,
				},
				useBrokenEdges: pack.bossFeatures.useBrokenEdges,
				symmetry: 0,
				complexity: complexity,
				difficulty: 0.45,
				pathLength: 0.45,
			});
			return this.core.createPuzzle(boss.rows, boss.cols, fallback);
		}
	}

	async prefetchBossRound(run, pack, stage) {
		if (run.prefetchPromise) return run.prefetchPromise;
		if (run.nextRoundToGenerate > run.totalRounds) return;

		run.prefetchPromise = (async () => {
			while (run.queue.length < 1 && run.nextRoundToGenerate <= run.totalRounds) {
				const round = run.nextRoundToGenerate++;
				const puzzle = await this.generateBossPuzzle(pack, stage);
				run.queue.push({ round, puzzle });
			}
		})().finally(() => {
			if (this.bossRun === run) run.prefetchPromise = null;
		});

		return run.prefetchPromise;
	}

	async consumeNextBossPuzzle(run, pack, stage) {
		while (run.queue.length === 0) {
			await this.prefetchBossRound(run, pack, stage);
			if (run.queue.length === 0 && run.nextRoundToGenerate > run.totalRounds) {
				throw new Error(`Boss queue underflow: ${pack.id}:${stage.id}`);
			}
		}

		const next = run.queue.shift();
		run.currentRound = next.round;
		void this.prefetchBossRound(run, pack, stage);
		return next.puzzle;
	}

	async openStageScene(stageIndex, status = "", animated = true) {
		const pack = this.stagePacks[this.packIndex];
		const stage = pack.stages[stageIndex];

		await this.changeScene(
			"stage",
			stage.kind === "boss" ? "BOSS" : `STAGE ${stageIndex + 1}`,
			async () => {
				this.stageIndex = stageIndex;
				this.ui.setOptions(this.getMainSceneOptions("stage"));
				this.filterChallenge = null;
				this.setFilterPanelVisible(false);

				if (stage.kind === "boss") {
					this.bossRun = this.createBossRun(pack, stage);
					const puzzle = await this.consumeNextBossPuzzle(this.bossRun, pack, stage);
					this.currentStagePuzzle = puzzle;
					this.ui.setPuzzle(clonePuzzle(this.currentStagePuzzle));
					this.updateHud();
					if (status) {
						this.setStatus(status, "good", 1200);
					} else {
						this.setStatus(`BOSS ${this.bossRun.currentRound}/${this.bossRun.totalRounds}`, "neutral", 1200);
					}
					return;
				}

				this.bossRun = null;
				const data = await PuzzleSerializer.deserialize(stage.code);
				if (!data.puzzle) throw new Error(`Stage decode failed: ${stage.id}`);
				this.currentStagePuzzle = data.puzzle;
				if (this.isFilterStage(pack, stage)) {
					this.setupFilterChallenge(pack, stage);
				}
				this.ui.setPuzzle(clonePuzzle(this.currentStagePuzzle));
				this.updateHud();
				if (status) this.setStatus(status, "good", 1200);
			},
			animated,
		);
	}

	async cyclePack(delta) {
		if (this.inputLocked) return;
		if (this.scene !== "map") return;
		const count = this.stagePacks.length;
		const next = this.packIndex + delta;
		if (next < 0 || next >= count) {
			this.setStatus("NO ROUTE", "bad", 1000);
			return;
		}
		this.packIndex = next;
		await this.openMapScene(`ROUTE ${this.packIndex + 1}`, true);
	}

	async handleMainPathComplete(event) {
		if (this.inputLocked) return;

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
		const key = `${endNode.x},${endNode.y}`;

		const routeDelta = this.currentMapInfo.routeByNode.get(key);
		if (routeDelta) {
			await this.cyclePack(routeDelta);
			return;
		}

		const stageIndex = this.currentMapInfo.stageByNode.get(key);
		if (stageIndex == null) return;

		const pack = this.stagePacks[this.packIndex];
		if (!this.isStageUnlocked(pack, stageIndex)) {
			this.setStatus("LOCKED", "bad", 900);
			return;
		}

		await this.openStageScene(stageIndex, "", true);
	}

	async onBossStageSolved(pack, stage) {
		const run = this.bossRun;
		if (!run) return;

		const clearedRound = run.currentRound;
		this.playClearFlash();

		if (clearedRound < run.totalRounds) {
			this.setStatus(`ROUND ${clearedRound} CLEAR`, "good", 900);
			await wait(900);
			const nextPuzzle = await this.consumeNextBossPuzzle(run, pack, stage);
			this.currentStagePuzzle = nextPuzzle;
			this.ui.setPuzzle(clonePuzzle(this.currentStagePuzzle));
			this.updateHud();
			this.setStatus(`BOSS ${run.currentRound}/${run.totalRounds}`, "neutral", 1200);
			return;
		}

		this.clearedStageIds.add(this.getStageClearKey(pack, stage));
		this.bossRun = null;
		this.updateHud();
		this.setStatus("BOSS CLEAR", "good", 1200);
		await wait(900);
		await this.openMapScene("MAP RETURN", true);
	}

	async onStageSolved() {
		if (this.stageIndex == null) return;

		const pack = this.stagePacks[this.packIndex];
		const stage = pack.stages[this.stageIndex];
		if (stage.kind === "boss") {
			await this.onBossStageSolved(pack, stage);
			return;
		}

		this.clearedStageIds.add(this.getStageClearKey(pack, stage));
		this.updateHud();

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
		const action = this.menuActionByIndex.get(actionIndex);
		if (!action) return;

		if (action.id === "close") {
			this.setMenuOpen(false);
		} else if (action.id === "map") {
			this.setMenuOpen(false);
			await this.openMapScene("", true);
		}

		setTimeout(() => {
			if (this.menuPuzzle) this.menuUI.setPuzzle(clonePuzzle(this.menuPuzzle));
		}, 20);
	}

	setMenuOpen(open) {
		this.menuOpen = !!open;
		if (!this.menuOpen && typeof document !== "undefined") {
			const focused = document.activeElement;
			if (focused instanceof HTMLElement && this.menuOverlay?.contains(focused)) focused.blur();
		}
		this.menuOverlay.classList.toggle("hidden", !this.menuOpen);
		this.menuOverlay.setAttribute("aria-hidden", this.menuOpen ? "false" : "true");

		if (this.menuOpen) {
			this.refreshMenuPuzzle();
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
		this.refreshMenuPuzzle();
		this.updateHud();
		this.setMainInputEnabled();
	}

	setMainInputEnabled() {
		const mainEnabled = !this.inputLocked && !this.menuOpen;
		this.gameCanvas.style.pointerEvents = mainEnabled ? "auto" : "none";

		const menuEnabled = !this.inputLocked && this.menuOpen;
		this.menuCanvas.style.pointerEvents = menuEnabled ? "auto" : "none";
		this.menuViewport.classList.toggle("disabled", !menuEnabled);

		this.menuToggleBtn.disabled = this.inputLocked;
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
		const maxWidth = 800;
		const availW = Math.max(1, Math.min(maxWidth, viewport.clientWidth) - margin * 2);
		const availH = Math.max(1, viewport.clientHeight - margin * 2);
		let scale = Math.min(availW / baseW, availH / baseH);
		if (!Number.isFinite(scale) || scale <= 0) scale = 1;

		shell.style.width = `${baseW}px`;
		shell.style.height = `${baseH}px`;
		shell.style.transform = `scale(${scale})`;

		canvas.style.width = `${baseW}px`;
		canvas.style.height = `${baseH}px`;
	}

	setFilterPanelVisible(visible) {
		if (!this.filterPanel) return;
		this.filterPanel.classList.toggle("hidden", !visible);
		this.filterPanel.setAttribute("aria-hidden", visible ? "false" : "true");
	}

	isFilterStage(pack, stage) {
		return pack?.id === "symbol" && stage?.kind === "filter";
	}

	setupFilterChallenge(pack, stage) {
		this.filterChallenge = {
			packId: pack.id,
			stageId: stage.id,
			activeIndex: 0,
			used: new Set([0]),
		};
		this.ui.setOptions({
			filter: {
				enabled: true,
				mode: "rgb",
				rgbColors: FILTER_RGB_COLORS,
				rgbIndex: 0,
			},
		});
		this.setFilterPanelVisible(true);
		this.syncFilterUi();
	}

	setFilterIndex(index) {
		const challenge = this.filterChallenge;
		if (!challenge) return;
		if (!Number.isFinite(index) || index < 0 || index > 2) return;
		challenge.activeIndex = index;
		challenge.used.add(index);
		this.ui.setOptions({
			filter: {
				enabled: true,
				mode: "rgb",
				rgbColors: FILTER_RGB_COLORS,
				rgbIndex: index,
			},
		});
		this.syncFilterUi();
		this.updateHud();
	}

	syncFilterUi() {
		const challenge = this.filterChallenge;
		this.filterButtons.forEach((button) => {
			const index = Number(button.dataset.filterIndex);
			const active = challenge && index === challenge.activeIndex;
			const used = challenge && challenge.used.has(index);
			button.classList.toggle("active", !!active);
			button.classList.toggle("used", !!used);
		});
		if (this.filterInfo) {
			this.filterInfo.textContent = challenge ? "RGB Filter" : "";
		}
	}

	updateHud() {
		if (!this.hud || !this.hudTitle || !this.hudDetail || !this.hudProgress || !this.hudProgressText) return;
		const pack = this.stagePacks[this.packIndex];
		const stage = this.stageIndex != null && pack ? pack.stages[this.stageIndex] : null;
		const isBossScene = this.scene === "stage" && stage?.kind === "boss" && !!this.bossRun;

		this.hud.classList.toggle("hidden", !isBossScene);
		if (!isBossScene) return;

		const total = Math.max(1, this.bossRun.totalRounds);
		const clearedRounds = Math.max(0, this.bossRun.currentRound - 1);
		const percent = Math.max(0, Math.min(100, Math.round((clearedRounds / total) * 100)));

		this.hudTitle.textContent = `BOSS ${this.bossRun.currentRound}/${this.bossRun.totalRounds}`;
		this.hudDetail.textContent = `Cleared ${clearedRounds}/${this.bossRun.totalRounds}`;
		this.hudProgress.value = percent;
		this.hudProgressText.textContent = `${percent}%`;
	}
}
if (typeof window !== "undefined") {
	window.addEventListener("DOMContentLoaded", () => {
		const game = new WitnessGamePage();
		window.witnessGamePage = game;
		void game.init();
	});
}
