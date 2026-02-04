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
		const options = {
			useHexagons: document.getElementById("use-hexagons").checked,
			useSquares: document.getElementById("use-squares").checked,
			useStars: document.getElementById("use-stars").checked,
			useTetris: document.getElementById("use-tetris").checked,
			useEraser: document.getElementById("use-eraser").checked,
			useBrokenEdges: document.getElementById("use-broken-edges").checked,
			complexity: parseFloat(document.getElementById("complexity-slider").value),
			difficulty: parseFloat(document.getElementById("difficulty-slider").value),
		};

		this.updateStatus("Generating puzzle... (Searching for optimal difficulty)");
		setTimeout(() => {
			this.puzzle = this.core.createPuzzle(size, size, options);
			const diff = this.core.calculateDifficulty(this.puzzle);

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
		this.ui.setValidationResult(result.isValid, result.invalidatedCells, result.invalidatedEdges);

		if (result.isValid) {
			this.updateStatus("Correct! Well done!", "#4f4");
		} else {
			this.updateStatus("Incorrect: " + (result.errorReason || "Try again"), "#f44");
		}
	}
}

window.witnessGame = new WitnessGame();
