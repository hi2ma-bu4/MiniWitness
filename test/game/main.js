import { EdgeType, NodeType, PuzzleSerializer, SymmetryType, WitnessCore, WitnessUI } from "../../dist/MiniWitness.js";

const STAGE_SEQUENCES = [["AAHDAIgBIIYQITGCAAAAAAAAAAAAAAAGQAAwAAEAGA", "AAHDAAgCIEQQGTIABAEAAAAwAAAAAAAAQAAAAAEA4w"], ["AAEEQQgZQAyCIAiAGDEAAAAAQIgIEUIAAAMAAAAGAAAAAAAAAAAAAIAAAAAAAEAAAEw"]];

const getStageData = (sequenceIndex, stageIndex) => {
	return STAGE_SEQUENCES[sequenceIndex]?.[stageIndex] || null;
};

// Compact horizontal line puzzle (button)
const createButtonPuzzle = (cols = 1) => {
	const puzzle = {
		rows: 0,
		cols: cols,
		cells: [],
		vEdges: [],
		hEdges: [Array.from({ length: cols }, () => ({ type: EdgeType.Normal }))],
		nodes: [Array.from({ length: cols + 1 }, () => ({ type: NodeType.Normal }))],
		symmetry: SymmetryType.None,
	};
	puzzle.nodes[0][0].type = NodeType.Start;
	puzzle.nodes[0][cols].type = NodeType.End;
	return puzzle;
};

// Menu puzzle with two goals: Left (Resume), Right (Back to Map)
const createMenuPuzzle = () => {
	const cols = 2;
	const puzzle = {
		rows: 1,
		cols: cols,
		cells: [
			[
				{ type: 0, color: 0 },
				{ type: 0, color: 0 },
			],
		],
		vEdges: [[{ type: EdgeType.Normal }, { type: EdgeType.Absent }, { type: EdgeType.Normal }]],
		hEdges: [
			[{ type: EdgeType.Normal }, { type: EdgeType.Normal }],
			[{ type: EdgeType.Absent }, { type: EdgeType.Absent }],
		],
		nodes: [
			[{ type: NodeType.Normal }, { type: NodeType.Start }, { type: NodeType.Normal }],
			[{ type: NodeType.End }, { type: NodeType.Normal }, { type: NodeType.End }],
		],
		symmetry: SymmetryType.None,
	};
	return puzzle;
};

// Map puzzle: vertical for portrait, horizontal for landscape
const createMapPuzzle = (numSequences) => {
	const isPortrait = window.innerHeight > window.innerWidth;

	if (isPortrait) {
		const rows = numSequences + 1;
		const puzzle = {
			rows: rows,
			cols: 1,
			cells: Array.from({ length: rows }, () => [{ type: 0, color: 0 }]),
			vEdges: Array.from({ length: rows }, () => [{ type: EdgeType.Normal }, { type: EdgeType.Absent }]),
			hEdges: Array.from({ length: rows + 1 }, () => [{ type: EdgeType.Absent }]),
			nodes: Array.from({ length: rows + 1 }, () => Array.from({ length: 2 }, () => ({ type: NodeType.Normal }))),
			symmetry: SymmetryType.None,
		};
		puzzle.nodes[0][0].type = NodeType.Start;
		for (let i = 0; i < numSequences; i++) {
			puzzle.nodes[i + 1][0].type = NodeType.End;
		}
		puzzle.nodes[rows][1].type = NodeType.End;
		puzzle.vEdges[rows - 1][1] = { type: EdgeType.Normal };
		puzzle.hEdges[rows][0] = { type: EdgeType.Normal };
		return puzzle;
	} else {
		const cols = numSequences + 1;
		const puzzle = {
			rows: 1,
			cols: cols,
			cells: [Array.from({ length: cols }, () => ({ type: 0, color: 0 }))],
			vEdges: [Array.from({ length: cols + 1 }, (v, i) => ({ type: i === 0 ? EdgeType.Normal : EdgeType.Absent }))],
			hEdges: [Array.from({ length: cols }, () => ({ type: EdgeType.Normal })), Array.from({ length: cols }, () => ({ type: EdgeType.Absent }))],
			nodes: [Array.from({ length: cols + 1 }, () => ({ type: NodeType.Normal })), Array.from({ length: cols + 1 }, () => ({ type: NodeType.Normal }))],
			symmetry: SymmetryType.None,
		};
		puzzle.nodes[0][0].type = NodeType.Start;
		for (let i = 0; i < numSequences; i++) {
			puzzle.nodes[0][i + 1].type = NodeType.End;
		}
		puzzle.nodes[1][0].type = NodeType.End;
		return puzzle;
	}
};

class Game {
	constructor() {
		this.core = new WitnessCore();
		this.mainCanvas = document.getElementById("game-canvas");
		this.triggerCanvas = document.getElementById("menu-trigger-canvas");
		this.menuCanvas = document.getElementById("menu-canvas");

		this.statusText = document.getElementById("status-text");
		this.statusOverlay = document.getElementById("status-overlay");
		this.mainContainer = document.getElementById("main-ui-container");
		this.menuContainer = document.getElementById("menu-container");
		this.triggerContainer = document.getElementById("menu-trigger-container");

		this.ui = new WitnessUI(this.mainCanvas, null, {
			autoResize: true,
			stayPathOnError: false,
			animations: { blinkDuration: 400, fadeDuration: 400, blinkPeriod: 400 },
		});

		this.triggerUi = new WitnessUI(this.triggerCanvas, createButtonPuzzle(1), {
			autoResize: true,
			stayPathOnError: false,
			animations: { blinkDuration: 200, fadeDuration: 200, blinkPeriod: 200 },
		});

		this.menuUi = new WitnessUI(this.menuCanvas, createMenuPuzzle(), {
			autoResize: true,
			stayPathOnError: false,
			animations: { blinkDuration: 300, fadeDuration: 300, blinkPeriod: 300 },
		});

		this.currentScene = "map";
		this.currentSequenceIndex = -1;
		this.currentStageIndex = -1;

		this.init();
	}

	init() {
		window.addEventListener("keydown", (e) => {
			if (e.key === "Escape" && this.currentScene === "stage") {
				if (this.menuContainer.classList.contains("hidden")) {
					this.openMenu();
				} else {
					this.resumeStage();
				}
			}
		});

		const setupEvents = (ui, onSuccess) => {
			ui.on("path:complete", (data) => {
				const result = this.core.validateSolution(ui.puzzle, { points: data.path });
				ui.setValidationResult(result.isValid, result.invalidatedCells, result.invalidatedEdges, result.errorCells, result.errorEdges, result.invalidatedNodes, result.errorNodes);
			});
			ui.on("goal:validated", (data) => {
				if (data.result.isValid) onSuccess(data);
			});
			ui.on("puzzle:created", () => this.resize());
		};

		setupEvents(this.ui, () => this.handleStageClear());
		setupEvents(this.triggerUi, () => this.openMenu());
		setupEvents(this.menuUi, (data) => {
			const endNode = this.menuUi.getEndNodeMetaFromPath();
			if (endNode) {
				if (endNode.x === 0) {
					// Left goal
					this.resumeStage();
				} else if (endNode.x === 2) {
					// Right goal
					this.showMap();
				}
			}
		});

		window.addEventListener("resize", () => {
			if (this.currentScene === "map") {
				this.ui.setPuzzle(createMapPuzzle(STAGE_SEQUENCES.length));
			}
			this.resize();
		});

		this.showMap();
	}

	resize() {
		const dpr = window.devicePixelRatio || 1;

		const resizeOne = (ui, canvas, maxWidthPercent, maxHeightPercent, baseCellSize = 80, basePadding = 60) => {
			const puzzle = ui.puzzle;
			if (!puzzle) return;

			const viewportW = window.innerWidth * maxWidthPercent;
			const viewportH = window.innerHeight * maxHeightPercent;

			const logicalW = puzzle.cols * baseCellSize + basePadding * 2;
			const logicalH = puzzle.rows * baseCellSize + basePadding * 2;

			const scale = Math.min(viewportW / logicalW, viewportH / logicalH);

			const currentCellSize = baseCellSize * scale;
			const currentPadding = basePadding * scale;

			ui.setOptions({
				cellSize: currentCellSize,
				gridPadding: currentPadding,
				pixelRatio: dpr,
			});

			canvas.style.width = `${Math.floor(puzzle.cols * currentCellSize + currentPadding * 2)}px`;
			canvas.style.height = `${Math.floor(puzzle.rows * currentCellSize + currentPadding * 2)}px`;
		};

		resizeOne(this.ui, this.mainCanvas, 0.9, 0.75);
		resizeOne(this.triggerUi, this.triggerCanvas, 0.3, 0.1, 40, 10);
		resizeOne(this.menuUi, this.menuCanvas, 0.8, 0.3, 100, 30);
	}

	async transition(action) {
		this.mainContainer.classList.add("scene-exit");
		await new Promise((r) => setTimeout(r, 600));
		await action();
		this.mainContainer.classList.remove("scene-exit");
		this.mainContainer.classList.add("scene-enter");
		this.mainContainer.offsetHeight;
		this.mainContainer.classList.remove("scene-enter");
	}

	showMap() {
		this.transition(() => {
			this.currentScene = "map";
			this.ui.setPuzzle(createMapPuzzle(STAGE_SEQUENCES.length));
			this.menuContainer.classList.add("hidden");
			this.triggerContainer.classList.add("hidden");
			this.showStatus("Map: Select a sequence");
		});
	}

	async showStage(sequenceIndex, stageIndex) {
		await this.transition(async () => {
			this.currentScene = "stage";
			this.currentSequenceIndex = sequenceIndex;
			this.currentStageIndex = stageIndex;
			const data = getStageData(sequenceIndex, stageIndex);
			if (!data) return;
			const puzzleData = await PuzzleSerializer.deserialize(data);
			this.ui.setPuzzle(puzzleData.puzzle);
			this.menuContainer.classList.add("hidden");
			this.triggerContainer.classList.remove("hidden");
			this.triggerUi.setPuzzle(createButtonPuzzle(1));
			this.showStatus(`Stage ${sequenceIndex + 1} - ${stageIndex + 1}`);
		});
	}

	openMenu() {
		this.menuContainer.classList.remove("hidden");
		this.menuUi.setPuzzle(createMenuPuzzle());
		this.triggerUi.setPuzzle(createButtonPuzzle(1)); // Reset trigger
		this.showStatus("PAUSED");
	}

	resumeStage() {
		this.menuContainer.classList.add("hidden");
		this.triggerUi.setPuzzle(createButtonPuzzle(1)); // Reset trigger
		this.showStatus(`Stage ${this.currentSequenceIndex + 1} - ${this.currentStageIndex + 1}`);
	}

	handleStageClear() {
		document.body.classList.add("clear-flash");
		setTimeout(() => document.body.classList.remove("clear-flash"), 800);

		if (this.currentScene === "map") {
			const endNode = this.ui.getEndNodeMetaFromPath();
			if (endNode) {
				const goalIndex = endNode.index;
				if (goalIndex < STAGE_SEQUENCES.length) {
					setTimeout(() => this.showStage(goalIndex, 0), 800);
				} else {
					this.showStatus("Exiting...", "#f44");
					setTimeout(() => location.reload(), 1000);
				}
			}
		} else {
			const nextStage = this.currentStageIndex + 1;
			const data = getStageData(this.currentSequenceIndex, nextStage);
			if (data) {
				setTimeout(() => this.showStage(this.currentSequenceIndex, nextStage), 800);
			} else {
				this.showStatus("Sequence Clear!", "#4f4");
				setTimeout(() => this.showMap(), 1500);
			}
		}
	}

	showStatus(text, color = "#fff") {
		this.statusText.textContent = text;
		this.statusText.style.color = color;
		this.statusOverlay.classList.remove("hidden");
		this.statusOverlay.classList.add("fade-in");
	}
}

window.addEventListener("DOMContentLoaded", () => {
	window.game = new Game();
});
