import { PuzzleSerializer, WitnessCore, WitnessUI } from "../dist/MiniWitness.js";

class WitnessGame {
	constructor() {
		this.core = new WitnessCore();
		this.ui = new WitnessUI("game-canvas", null, {
			onPathComplete: (path) => this.validate(path),
		});

		this.statusMsg = document.getElementById("status-message");
		this.sizeSelect = document.getElementById("size-select");
		this.newPuzzleBtn = document.getElementById("new-puzzle-btn");
		this.sharePuzzleBtn = document.getElementById("share-puzzle-btn");

		this.puzzle = null;
		this.currentOptions = null;

		this.init();
	}

	async init() {
		this.newPuzzleBtn.addEventListener("click", () => this.startNewGame());
		this.sharePuzzleBtn.addEventListener("click", () => this.sharePuzzle());

		// URLパラメータからパズルを読み込む
		const params = new URLSearchParams(window.location.search);
		const puzzleData = params.get("puzzle");
		if (puzzleData) {
			try {
				const { puzzle, options } = await PuzzleSerializer.deserialize(puzzleData);
				this.loadPuzzle(puzzle, options);
				this.updateStatus("Puzzle loaded from URL!");
			} catch (e) {
				console.error("Failed to load puzzle from URL:", e);
				this.startNewGame();
			}
		} else {
			this.startNewGame();
		}
	}

	startNewGame() {
		const size = parseInt(this.sizeSelect.value);
		const useCustomTheme = document.getElementById("custom-theme").checked;

		const options = {
			useHexagons: document.getElementById("use-hexagons").checked,
			useSquares: document.getElementById("use-squares").checked,
			useStars: document.getElementById("use-stars").checked,
			useTetris: document.getElementById("use-tetris").checked,
			useEraser: document.getElementById("use-eraser").checked,
			useBrokenEdges: document.getElementById("use-broken-edges").checked,
			complexity: parseFloat(document.getElementById("complexity-slider").value),
			difficulty: parseFloat(document.getElementById("difficulty-slider").value),
			pathLength: parseFloat(document.getElementById("path-length-slider").value),
			availableColors: useCustomTheme ? [1, 2, 3, 4] : undefined,
			defaultColors: useCustomTheme ? { Tetris: 5 } : undefined,
		};

		this.updateStatus("Generating puzzle... (Searching for optimal difficulty)");
		setTimeout(() => {
			const puzzle = this.core.createPuzzle(size, size, options);
			this.loadPuzzle(puzzle, options);
		}, 10);
	}

	loadPuzzle(puzzle, options) {
		this.puzzle = puzzle;
		this.currentOptions = options;

		// UIのコントロールを更新
		this.sizeSelect.value = puzzle.rows;
		document.getElementById("use-hexagons").checked = !!options.useHexagons;
		document.getElementById("use-squares").checked = !!options.useSquares;
		document.getElementById("use-stars").checked = !!options.useStars;
		document.getElementById("use-tetris").checked = !!options.useTetris;
		document.getElementById("use-eraser").checked = !!options.useEraser;
		document.getElementById("use-broken-edges").checked = !!options.useBrokenEdges;
		document.getElementById("complexity-slider").value = options.complexity ?? 1;
		document.getElementById("difficulty-slider").value = options.difficulty ?? 1;
		document.getElementById("path-length-slider").value = options.pathLength ?? 0.5;

		const useCustomTheme = !!options.availableColors;
		document.getElementById("custom-theme").checked = useCustomTheme;

		const colorList = useCustomTheme ? ["#444444", "#00ff00", "#ff00ff", "#00ffff", "#ffffff", "#ffff00"] : undefined;

		const diff = this.core.calculateDifficulty(this.puzzle);

		this.ui.setOptions({
			colors: {
				colorList: colorList,
			},
		});

		this.ui.setPuzzle(this.puzzle);
		this.updateStatus(`Puzzle loaded! (Difficulty: ${diff.toFixed(2)})`);
	}

	async sharePuzzle() {
		if (!this.puzzle) return;

		try {
			const serialized = await PuzzleSerializer.serialize(this.puzzle, this.currentOptions);
			const url = new URL(window.location.href);
			url.searchParams.set("puzzle", serialized);

			// クリップボードにコピー
			await navigator.clipboard.writeText(url.toString());
			this.updateStatus("Puzzle link copied to clipboard!", "#4f4");

			// ブラウザの履歴を更新
			window.history.pushState({}, "", url.toString());
		} catch (e) {
			console.error("Failed to share puzzle:", e);
			this.updateStatus("Failed to share puzzle.", "#f44");
		}
	}

	updateStatus(msg, color = "#aaa") {
		this.statusMsg.textContent = msg;
		this.statusMsg.style.color = color;
	}

	validate(path) {
		const result = this.core.validateSolution(this.puzzle, { points: path });
		this.ui.setValidationResult(result.isValid, result.invalidatedCells, result.invalidatedEdges, result.errorCells, result.errorEdges);

		if (result.isValid) {
			this.updateStatus("Correct! Well done!", "#4f4");
		} else {
			this.updateStatus("Incorrect: " + (result.errorReason || "Try again"), "#f44");
		}
	}
}

window.witnessGame = new WitnessGame();
window.PuzzleSerializer = PuzzleSerializer;
