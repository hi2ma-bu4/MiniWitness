import { PuzzleSerializer, RngType, WitnessCore, WitnessUI } from "../dist/MiniWitness.js";

class WitnessGame {
	constructor() {
		this.core = new WitnessCore();
		this.canvas = document.getElementById("game-canvas");
		this.ui = null;
		this.worker = null;
		this.isWorkerMode = false;

		this.statusMsg = document.getElementById("status-message");
		this.sizeSelect = document.getElementById("size-select");
		this.newPuzzleBtn = document.getElementById("new-puzzle-btn");
		this.sharePuzzleBtn = document.getElementById("share-puzzle-btn");

		this.puzzle = null;
		this.currentOptions = null;
		this.isDrawing = false;

		this.init();
	}

	async init() {
		const useWorkerCheckbox = document.getElementById("use-worker");
		useWorkerCheckbox.addEventListener("change", () => {
			alert("Mode change requires page reload. Reloading now...");
			const url = new URL(window.location.href);
			url.searchParams.set("worker", useWorkerCheckbox.checked ? "1" : "0");
			window.location.href = url.toString();
		});

		const params = new URLSearchParams(window.location.search);
		if (params.get("worker") == null) {
			this.isWorkerMode = !!window.Worker && !!this.canvas.transferControlToOffscreen;
		} else {
			this.isWorkerMode = params.get("worker") === "1";
		}
		useWorkerCheckbox.checked = this.isWorkerMode;

		if (this.isWorkerMode && this.canvas.transferControlToOffscreen) {
			this.initWorker();
		} else {
			this.ui = new WitnessUI(this.canvas, null, {
				onPathComplete: (path) => this.validate(path),
			});
		}

		this.newPuzzleBtn.addEventListener("click", () => this.startNewGame());
		this.sharePuzzleBtn.addEventListener("click", () => this.sharePuzzle());

		document.getElementById("sym-color-select").addEventListener("change", () => {
			const options = {
				colors: {
					symmetry: document.getElementById("sym-color-select").value,
				},
			};
			if (this.isWorkerMode) {
				this.worker.postMessage({ type: "setOptions", payload: options });
			} else if (this.ui) {
				this.ui.setOptions(options);
			}
		});

		document.getElementById("blink-marks").addEventListener("change", () => {
			const options = { blinkMarksOnError: document.getElementById("blink-marks").checked };
			if (this.isWorkerMode) {
				this.worker.postMessage({ type: "setOptions", payload: options });
			} else if (this.ui) {
				this.ui.setOptions(options);
			}
		});

		document.getElementById("stay-path").addEventListener("change", () => {
			const options = { stayPathOnError: document.getElementById("stay-path").checked };
			if (this.isWorkerMode) {
				this.worker.postMessage({ type: "setOptions", payload: options });
			} else if (this.ui) {
				this.ui.setOptions(options);
			}
		});

		// URLパラメータからシードとRNGを読み込む
		const seed = params.get("seed");
		const rngType = params.get("rng");
		if (seed) document.getElementById("seed-input").value = seed;
		if (rngType) document.getElementById("rng-select").value = rngType;

		// URLパラメータからパズルを読み込む
		const puzzleData = params.get("puzzle");
		if (puzzleData) {
			try {
				const { puzzle, options } = await PuzzleSerializer.deserialize(puzzleData);
				options.availableColors = options.availableColors || true;
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
			useTetrisNegative: document.getElementById("use-tetris-negative").checked,
			useEraser: document.getElementById("use-eraser").checked,
			useBrokenEdges: document.getElementById("use-broken-edges").checked,
			symmetry: parseInt(document.getElementById("symmetry-select").value),
			complexity: parseFloat(document.getElementById("complexity-slider").value),
			difficulty: parseFloat(document.getElementById("difficulty-slider").value),
			pathLength: parseFloat(document.getElementById("path-length-slider").value),
			availableColors: useCustomTheme ? [1, 2, 3, 4] : undefined,
			defaultColors: useCustomTheme ? { Tetris: 5 } : undefined,
			seed: document.getElementById("seed-input").value || undefined,
			rngType: parseInt(document.getElementById("rng-select").value),
		};

		this.updateStatus("Generating puzzle... (Searching for optimal difficulty)");
		setTimeout(() => {
			if (this.isWorkerMode) {
				this.worker.postMessage({ type: "createPuzzle", payload: { rows: size, cols: size, genOptions: options } });
			} else {
				const puzzle = this.core.createPuzzle(size, size, options);
				this.loadPuzzle(puzzle, options);
			}
		}, 10);
	}

	loadPuzzle(puzzle, options) {
		this.puzzle = puzzle;
		this.currentOptions = options;

		// UIのコントロールを更新
		this.sizeSelect.value = puzzle.rows;
		if (options.rngType != null && options.rngType !== RngType.MathRandom) {
			document.getElementById("rng-select").value = options.rngType;
		}

		document.getElementById("use-hexagons").checked = !!options.useHexagons;
		document.getElementById("use-squares").checked = !!options.useSquares;
		document.getElementById("use-stars").checked = !!options.useStars;
		document.getElementById("use-tetris").checked = !!options.useTetris;
		document.getElementById("use-tetris-negative").checked = !!options.useTetrisNegative;
		document.getElementById("use-eraser").checked = !!options.useEraser;
		document.getElementById("use-broken-edges").checked = !!options.useBrokenEdges;
		document.getElementById("symmetry-select").value = options.symmetry ?? 0;
		document.getElementById("complexity-slider").value = options.complexity ?? 1;
		document.getElementById("difficulty-slider").value = options.difficulty ?? 1;
		document.getElementById("path-length-slider").value = options.pathLength ?? 0.5;

		const useCustomTheme = !!options.availableColors;
		document.getElementById("custom-theme").checked = useCustomTheme;

		const colorList = useCustomTheme ? ["#444444", "#00ff00", "#ff00ff", "#00ffff", "#ffffff", "#ffff00"] : undefined;

		const diff = this.core.calculateDifficulty(this.puzzle);
		const symColor = document.getElementById("sym-color-select").value;
		const blinkMarks = document.getElementById("blink-marks").checked;
		const stayPath = document.getElementById("stay-path").checked;

		const uiOptions = {
			blinkMarksOnError: blinkMarks,
			stayPathOnError: stayPath,
			colors: {
				colorList: colorList,
				symmetry: symColor,
			},
		};

		if (this.isWorkerMode) {
			this.worker.postMessage({ type: "setPuzzle", payload: { puzzle: this.puzzle, options: uiOptions } });
		} else {
			this.ui.setOptions(uiOptions);
			this.ui.setPuzzle(this.puzzle);
		}
		let status = `Puzzle loaded! (Difficulty: ${diff.toFixed(2)})`;
		if (this.puzzle.seed && options.rngType !== RngType.MathRandom) status += ` [Seed: ${this.puzzle.seed}]`;
		this.updateStatus(status);
	}

	async sharePuzzle() {
		if (!this.puzzle) return;

		try {
			const serialized = await PuzzleSerializer.serialize(this.puzzle, this.currentOptions);
			const url = new URL(window.location.href);
			url.searchParams.set("puzzle", serialized);
			if (this.puzzle.seed && this.currentOptions?.rngType !== RngType.MathRandom) {
				url.searchParams.set("seed", this.puzzle.seed);
			}
			url.searchParams.set("rng", document.getElementById("rng-select").value);

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

	initWorker() {
		this.worker = new Worker("./worker.js", { type: "module" });
		const offscreen = this.canvas.transferControlToOffscreen();

		this.worker.postMessage(
			{
				type: "init",
				payload: {
					canvas: offscreen,
					options: {
						onPathComplete: true, // Marker to indicate we want callbacks
					},
				},
			},
			[offscreen],
		);

		this.worker.onmessage = (e) => {
			const { type, payload } = e.data;
			if (type === "pathComplete") {
				this.validate(payload);
			} else if (type === "puzzleCreated") {
				this.loadPuzzle(payload.puzzle, payload.genOptions);
			} else if (type === "drawingStarted") {
				this.isDrawing = true;
			} else if (type === "drawingEnded") {
				this.isDrawing = false;
			} else if (type === "validationResult") {
				const result = payload;
				if (result.isValid) {
					this.updateStatus("Correct! Well done!", "#4f4");
				} else {
					this.updateStatus("Incorrect: " + (result.errorReason || "Try again"), "#f44");
				}
			}
		};

		// フォワードイベント
		const forwardEvent = (e) => {
			const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
			const eventData = {
				clientX: e.clientX || (touch ? touch.clientX : 0),
				clientY: e.clientY || (touch ? touch.clientY : 0),
			};
			this.worker.postMessage({
				type: "event",
				payload: {
					eventType: e.type,
					eventData,
				},
			});
		};

		this.canvas.addEventListener("mousedown", (e) => {
			forwardEvent(e);
		});
		window.addEventListener("mousemove", (e) => {
			if (this.isDrawing) forwardEvent(e);
		});
		window.addEventListener("mouseup", (e) => {
			if (this.isDrawing) forwardEvent(e);
		});

		this.canvas.addEventListener(
			"touchstart",
			(e) => {
				// スタートノードの判定（簡易版）
				const rect = this.canvas.getBoundingClientRect();
				const touch = e.touches[0];
				const mouseX = (touch.clientX - rect.left) * (this.canvas.width / rect.width);
				const mouseY = (touch.clientY - rect.top) * (this.canvas.height / rect.height);

				let hitStart = false;
				if (this.puzzle) {
					const gridPadding = 60;
					const cellSize = 80;
					const startNodeRadius = 22;
					for (let r = 0; r <= this.puzzle.rows; r++) {
						for (let c = 0; c <= this.puzzle.cols; c++) {
							if (this.puzzle.nodes[r][c].type === 1) {
								// NodeType.Start
								const nodeX = gridPadding + c * cellSize;
								const nodeY = gridPadding + r * cellSize;
								if (Math.hypot(nodeX - mouseX, nodeY - mouseY) < startNodeRadius) {
									hitStart = true;
									break;
								}
							}
						}
						if (hitStart) break;
					}
				}

				if (hitStart) {
					forwardEvent(e);
					if (e.cancelable) e.preventDefault();
				}
			},
			{ passive: false },
		);
		window.addEventListener(
			"touchmove",
			(e) => {
				if (this.isDrawing) {
					forwardEvent(e);
					if (e.cancelable) e.preventDefault();
				}
			},
			{ passive: false },
		);
		window.addEventListener(
			"touchend",
			(e) => {
				if (this.isDrawing) {
					forwardEvent(e);
					if (e.cancelable) e.preventDefault();
				}
			},
			{ passive: false },
		);

		// 定期的にRectを更新
		const updateRect = () => {
			const rect = this.canvas.getBoundingClientRect();
			this.worker.postMessage({
				type: "setCanvasRect",
				payload: {
					left: rect.left,
					top: rect.top,
					width: rect.width,
					height: rect.height,
				},
			});
		};
		window.addEventListener("resize", updateRect);
		window.addEventListener("scroll", updateRect);
		updateRect();
	}

	validate(path) {
		if (this.isWorkerMode) {
			this.worker.postMessage({ type: "validate", payload: { path } });
		} else {
			const result = this.core.validateSolution(this.puzzle, { points: path });
			this.ui.setValidationResult(result.isValid, result.invalidatedCells, result.invalidatedEdges, result.errorCells, result.errorEdges, result.invalidatedNodes, result.errorNodes);

			if (result.isValid) {
				this.updateStatus("Correct! Well done!", "#4f4");
			} else {
				this.updateStatus("Incorrect: " + (result.errorReason || "Try again"), "#f44");
			}
		}
	}
}

window.witnessGame = new WitnessGame();
window.PuzzleSerializer = PuzzleSerializer;
