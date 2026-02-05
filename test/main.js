import { WitnessCore, WitnessUI } from "../dist/MiniWitness.js";

class WitnessGame {
	constructor() {
		this.core = new WitnessCore();
		this.ui = new WitnessUI("game-canvas", null, {
			onPathComplete: (path) => this.validate(path),
		});

		this.statusMsg = document.getElementById("status-message");
		this.sizeSelect = document.getElementById("size-select");
		this.newPuzzleBtn = document.getElementById("new-puzzle-btn");

		this.puzzle = null;

		this.init();
	}

	init() {
		this.newPuzzleBtn.addEventListener("click", () => this.startNewGame());
		this.startNewGame();
	}

	startNewGame() {
		const size = parseInt(this.sizeSelect.value);
		const useCustomTheme = document.getElementById("custom-theme").checked;

		// カスタムテーマ用の設定
		const colorList = useCustomTheme
			? [
					"#444444", // 0: Background/None
					"#00ff00", // 1: Green (was Black)
					"#ff00ff", // 2: Magenta (was White)
					"#00ffff", // 3: Cyan (was Red)
					"#ffffff", // 4: White (was Blue)
					"#ffff00", // 5: Yellow (Default for custom tetris)
				]
			: undefined;

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
			// カスタムカラーを使用する場合
			availableColors: useCustomTheme ? [1, 2, 3, 4] : undefined,
			defaultColors: useCustomTheme
				? {
						Tetris: 5, // String key for better readability
					}
				: undefined,
		};

		this.updateStatus("Generating puzzle... (Searching for optimal difficulty)");
		setTimeout(() => {
			this.puzzle = this.core.createPuzzle(size, size, options);
			const diff = this.core.calculateDifficulty(this.puzzle);

			// UIのオプションも更新
			this.ui.setOptions({
				colors: {
					colorList: colorList,
					// colorListが指定された場合、従来のcolorMapより優先されます
				},
			});

			this.ui.setPuzzle(this.puzzle);
			this.updateStatus(`New puzzle generated! (Difficulty: ${diff.toFixed(2)})`);
		}, 10);
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
