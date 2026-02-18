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
		this.lastPath = null;

		this.filterState = {
			enabled: false,
			mode: "rgb",
			rgbIndex: 0,
			customView: "custom",
		};

		this.init();
	}

	async init() {
		const workerSelect = document.getElementById("worker-select");
		workerSelect.addEventListener("change", () => {
			alert("Mode change requires page reload. Reloading now...");
			const url = new URL(window.location.href);
			url.searchParams.set("worker", workerSelect.value);
			window.location.href = url.toString();
		});

		const params = new URLSearchParams(window.location.search);
		const workerParam = params.get("worker");
		if (workerParam == null) {
			this.workerType = !!window.Worker && !!this.canvas.transferControlToOffscreen ? 2 : 0;
		} else {
			this.workerType = parseInt(workerParam);
		}
		workerSelect.value = this.workerType;
		this.isWorkerMode = this.workerType > 0;

		if (this.isWorkerMode && this.canvas.transferControlToOffscreen) {
			this.initWorker(this.workerType);
		} else {
			this.ui = new WitnessUI(this.canvas, null, {
				pixelRatio: document.getElementById("use-hidpi").checked ? window.devicePixelRatio : 1,
			});
			this.setupUIEvents();
		}

		this.newPuzzleBtn.addEventListener("click", () => this.startNewGame());
		this.sharePuzzleBtn.addEventListener("click", () => this.sharePuzzle());

		document.getElementById("sym-color-select").addEventListener("change", () => {
			const options = {
				colors: {
					symmetry: document.getElementById("sym-color-select").value,
				},
			};
			if (this.ui) {
				this.ui.setOptions(options);
			} else if (this.worker) {
				this.worker.postMessage({ type: "setOptions", payload: options });
			}
		});

		document.getElementById("blink-marks").addEventListener("change", () => {
			const options = { blinkMarksOnError: document.getElementById("blink-marks").checked };
			if (this.ui) {
				this.ui.setOptions(options);
			} else if (this.worker) {
				this.worker.postMessage({ type: "setOptions", payload: options });
			}
		});

		document.getElementById("stay-path").addEventListener("change", () => {
			const options = { stayPathOnError: document.getElementById("stay-path").checked };
			if (this.ui) {
				this.ui.setOptions(options);
			} else if (this.worker) {
				this.worker.postMessage({ type: "setOptions", payload: options });
			}
		});

		document.getElementById("use-hidpi").addEventListener("change", () => {
			const options = { pixelRatio: document.getElementById("use-hidpi").checked ? window.devicePixelRatio : 1 };
			if (this.ui) {
				this.ui.setOptions(options);
			} else if (this.worker) {
				this.worker.postMessage({ type: "setOptions", payload: options });
			}
		});

		document.getElementById("filter-enabled").addEventListener("change", () => {
			this.filterState.enabled = document.getElementById("filter-enabled").checked;
			this.applyCurrentUIOptions();
		});

		document.getElementById("filter-mode").addEventListener("change", () => {
			this.filterState.mode = document.getElementById("filter-mode").value;
			this.applyCurrentUIOptions();
		});

		document.getElementById("filter-custom-color").addEventListener("input", () => {
			this.applyCurrentUIOptions();
		});

		document.getElementById("filter-r-btn").addEventListener("click", () => this.setRgbFilterIndex(0));
		document.getElementById("filter-g-btn").addEventListener("click", () => this.setRgbFilterIndex(1));
		document.getElementById("filter-b-btn").addEventListener("click", () => this.setRgbFilterIndex(2));

		document.getElementById("filter-primary-btn").addEventListener("click", () => {
			this.filterState.customView = "primary";
			this.applyCurrentUIOptions();
		});

		document.getElementById("filter-custom-btn").addEventListener("click", () => {
			this.filterState.customView = "custom";
			this.applyCurrentUIOptions();
		});

		this.updateFilterSwitcherUI();

		// URLパラメータからシードとRNGを読み込む
		const seed = params.get("seed");
		const rngType = params.get("rng");
		if (seed) document.getElementById("seed-input").value = seed;
		if (rngType) document.getElementById("rng-select").value = rngType;

		// URLパラメータからパズルを読み込む
		const puzzleData = params.get("puzzle");
		if (puzzleData) {
			try {
				const data = await PuzzleSerializer.deserialize(puzzleData);
				// Seedの反映
				if (data.seed) {
					document.getElementById("seed-input").value = data.seed.value;
					document.getElementById("rng-select").value = data.seed.type;
				}
				// Optionsの反映（読み込まれた設定をUIに反映）
				if (data.options) {
					this.currentOptions = { ...this.currentOptions, ...data.options };
					this.syncOptionsToUI(this.currentOptions);
				}

				if (data.puzzle) {
					const options = data.options || this.currentOptions || {};
					if (data.options?.availableColors) {
						options.availableColors = data.options.availableColors;
					}
					this.loadPuzzle(data.puzzle, options);
					if (data.path) {
						this.lastPath = data.path;
						if (this.ui) {
							this.ui.setPath(data.path.points);
							this.validate(data.path.points);
						}
					} else {
						this.updateStatus("Puzzle loaded from URL!");
					}
				} else {
					// パズルデータがない場合は、シードや設定を使用して新しく生成する
					this.startNewGame();
				}
			} catch (e) {
				console.error("Failed to load puzzle from URL:", e);
				this.startNewGame();
			}
		} else {
			this.startNewGame();
		}
	}

	getOptionsFromUI() {
		const size = parseInt(this.sizeSelect.value);
		const useCustomTheme = document.getElementById("custom-theme").checked;
		const options = {
			rows: size,
			cols: size,
			useHexagons: document.getElementById("use-hexagons").checked,
			useSquares: document.getElementById("use-squares").checked,
			useStars: document.getElementById("use-stars").checked,
			useTetris: document.getElementById("use-tetris").checked,
			useTetrisNegative: document.getElementById("use-tetris-negative").checked,
			useTriangles: document.getElementById("use-triangles").checked,
			useEraser: document.getElementById("use-eraser").checked,
			useBrokenEdges: document.getElementById("use-broken-edges").checked,
			symmetry: parseInt(document.getElementById("symmetry-select").value),
			complexity: parseFloat(document.getElementById("complexity-slider").value),
			difficulty: parseFloat(document.getElementById("difficulty-slider").value),
			pathLength: parseFloat(document.getElementById("path-length-slider").value),
			availableColors: useCustomTheme ? this.currentOptions?.availableColors || [1, 2, 3, 4] : undefined,
			defaultColors: useCustomTheme ? this.currentOptions?.defaultColors || { Tetris: 5, TetrisNegative: 5, Triangle: 5 } : undefined,
			seed: document.getElementById("seed-input").value || undefined,
			rngType: parseInt(document.getElementById("rng-select").value),
		};
		return options;
	}

	startNewGame() {
		const options = this.getOptionsFromUI();
		this.lastPath = null;

		this.updateStatus("Generating puzzle... (Searching for optimal difficulty)");
		setTimeout(() => {
			if (this.ui && this.workerType === 2) {
				// Use the library's built-in worker interface
				this.ui.createPuzzle(options.rows, options.cols, options);
			} else if (this.isWorkerMode) {
				this.worker.postMessage({ type: "createPuzzle", payload: { rows: options.rows, cols: options.cols, genOptions: options } });
			} else {
				const puzzle = this.core.createPuzzle(options.rows, options.cols, options);
				this.loadPuzzle(puzzle, options);
			}
		}, 10);
	}

	syncOptionsToUI(options) {
		if (options.rows) {
			this.sizeSelect.value = options.rows;
		}
		if (options.rngType != null && options.rngType !== RngType.MathRandom) {
			document.getElementById("rng-select").value = options.rngType;
		}
		document.getElementById("use-hexagons").checked = !!options.useHexagons;
		document.getElementById("use-squares").checked = !!options.useSquares;
		document.getElementById("use-stars").checked = !!options.useStars;
		document.getElementById("use-tetris").checked = !!options.useTetris;
		document.getElementById("use-tetris-negative").checked = !!options.useTetrisNegative;
		document.getElementById("use-triangles").checked = !!options.useTriangles;
		document.getElementById("use-eraser").checked = !!options.useEraser;
		document.getElementById("use-broken-edges").checked = !!options.useBrokenEdges;
		document.getElementById("symmetry-select").value = options.symmetry ?? 0;
		document.getElementById("complexity-slider").value = options.complexity ?? 1;
		document.getElementById("difficulty-slider").value = options.difficulty ?? 1;
		document.getElementById("path-length-slider").value = options.pathLength ?? 0.5;
		const useCustomTheme = !!(options.availableColors && options.availableColors.length > 0);
		document.getElementById("custom-theme").checked = useCustomTheme;
	}

	loadPuzzle(puzzle, options) {
		this.puzzle = puzzle;
		this.currentOptions = options;

		// UIのコントロールを更新
		this.sizeSelect.value = puzzle.rows;
		this.syncOptionsToUI(options);

		const useCustomTheme = !!(options.availableColors && (options.availableColors === true || options.availableColors.length > 0));
		const colorList = this.resolveColorList(useCustomTheme);

		const diff = this.core.calculateDifficulty(this.puzzle);
		const symColor = document.getElementById("sym-color-select").value;
		const blinkMarks = document.getElementById("blink-marks").checked;
		const stayPath = document.getElementById("stay-path").checked;

		const uiOptions = this.buildRenderOptions({ blinkMarks, stayPath, symColor, colorList });

		if (this.ui) {
			this.ui.setOptions(uiOptions);
			this.ui.setPuzzle(this.puzzle);
		} else if (this.worker) {
			this.worker.postMessage({ type: "setPuzzle", payload: { puzzle: this.puzzle, options: uiOptions } });
		}
		this.updateFilterSwitcherUI();
		let status = `Puzzle loaded! (Difficulty: ${diff.toFixed(2)})`;
		if (this.puzzle.seed && options.rngType !== RngType.MathRandom) status += ` [Seed: ${this.puzzle.seed}]`;
		this.updateStatus(status);
	}

	async sharePuzzle() {
		if (!this.puzzle) return;

		console.log("Sharing puzzle. lastPath:", this.lastPath);

		const shareOptions = {
			puzzle: document.getElementById("share-puzzle").checked ? this.puzzle : undefined,
			seed: document.getElementById("share-seed").checked
				? {
						type: parseInt(document.getElementById("rng-select").value),
						value: this.puzzle.seed || document.getElementById("seed-input").value,
					}
				: undefined,
			options: document.getElementById("share-options").checked ? this.getOptionsFromUI() : undefined,
			path: document.getElementById("share-path").checked ? this.lastPath : undefined,
			parityMode: document.getElementById("parity-mode").value,
		};

		try {
			console.log("Serialization input:", shareOptions);
			const serialized = await PuzzleSerializer.serialize(shareOptions);
			const url = new URL(window.location.href);
			url.searchParams.set("puzzle", serialized);

			// 旧パラメータを削除
			url.searchParams.delete("seed");
			url.searchParams.delete("rng");

			window.lastCopied = url.toString();

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

	initWorker(type) {
		if (type === 2) {
			// Direct Worker: Everything is handled by the library internally
			this.ui = new WitnessUI(this.canvas, null, {
				useWorker: true,
				workerScript: "../dist/MiniWitness.js",
				autoValidate: true,
				pixelRatio: document.getElementById("use-hidpi").checked ? window.devicePixelRatio : 1,
			});
			// In worker mode, WitnessUI automatically forwards events and syncs state.
			this.setupUIEvents();
			return;
		}

		// Custom Worker: Manual init (legacy)
		const script = "./worker.js";
		this.worker = new Worker(script, { type: "module" });

		if (true) {
			const offscreen = this.canvas.transferControlToOffscreen();
			this.worker.postMessage(
				{
					type: "init",
					payload: {
						canvas: offscreen,
						options: {},
					},
				},
				[offscreen],
			);

			// Forward events manually (legacy)
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
					// スタートノードの判定
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

		this.worker.addEventListener("message", (e) => {
			const { type, payload } = e.data;
			if (type === "pathComplete") {
				this.validate(payload);
			} else if (type === "puzzleCreated") {
				this.loadPuzzle(payload.puzzle, payload.genOptions);
			} else if (type === "drawingStarted") {
				this.isDrawing = payload !== false;
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
		});
	}

	setupUIEvents() {
		if (!this.ui) return;

		const logEl = document.getElementById("event-log");
		const log = (msg) => {
			const entry = document.createElement("div");
			entry.className = "log-entry";
			entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
			logEl.prepend(entry);
			if (logEl.children.length > 50) logEl.removeChild(logEl.lastChild);
		};

		this.ui.on("path:start", (data) => log(`Path Start: (${data.x}, ${data.y})`));
		this.ui.on("path:end", (data) => log(`Path End: exit=${data.isExit}, len=${data.path.length}`));
		this.ui.on("path:complete", (data) => this.validate(data.path));
		this.ui.on("goal:reachable", (data) => log(`Goal Reachable: ${data.reachable}`));
		this.ui.on("goal:reached", (data) => log(`Goal Reached: valid=${data.isValid}`));
		this.ui.on("goal:validated", (data) => {
			log(`Goal Validated: valid=${data.result.isValid}`);
			if (this.isWorkerMode && this.workerType === 2) {
				if (data.result.isValid) {
					this.updateStatus("Correct! Well done!", "#4f4");
				} else {
					this.updateStatus("Incorrect: " + (data.result.errorReason || "Try again"), "#f44");
				}
			}
		});
		this.ui.on("puzzle:generated", (data) => {
			log(`Puzzle Created`);
			if (this.isWorkerMode && this.workerType === 2) {
				this.loadPuzzle(data.puzzle, data.genOptions || this.currentOptions || {});
			}
		});
	}

	setRgbFilterIndex(index) {
		this.filterState.rgbIndex = index;
		this.applyCurrentUIOptions();
	}

	resolveColorList(useCustomTheme) {
		if (!useCustomTheme) return undefined;
		if (!this.filterState.enabled) {
			return ["#444444", "#00ff00", "#ff00ff", "#00ffff", "#ffffff", "#ffff00"];
		}
		// RGBフィルターで白黒判別しやすい原色寄り配色
		return ["#ff0000", "#0000ff", "#00ff00", "#000000", "#ffffff", "#ff00ff", "#00ffff", "#ffff00"];
	}

	buildFilterOptions() {
		const customColorInput = document.getElementById("filter-custom-color").value;
		const customColor = this.filterState.customView === "primary" ? "#ffffff" : customColorInput;
		return {
			enabled: this.filterState.enabled,
			mode: this.filterState.mode,
			customColor,
			rgbColors: ["#ff0000", "#00ff00", "#0000ff"],
			rgbIndex: this.filterState.rgbIndex,
			threshold: 128,
		};
	}

	buildRenderOptions({ blinkMarks, stayPath, symColor, colorList }) {
		return {
			blinkMarksOnError: blinkMarks,
			stayPathOnError: stayPath,
			colors: {
				colorList,
				symmetry: symColor,
			},
			filter: this.buildFilterOptions(),
		};
	}

	updateFilterSwitcherUI() {
		const enabled = this.filterState.enabled;
		const mode = this.filterState.mode;
		const switcher = document.getElementById("filter-switcher");
		const rgb = document.getElementById("filter-switcher-rgb");
		const custom = document.getElementById("filter-switcher-custom");
		switcher.classList.toggle("hidden", !enabled);
		rgb.classList.toggle("hidden", !enabled || mode !== "rgb");
		custom.classList.toggle("hidden", !enabled || mode !== "custom");

		const rgbButtons = [document.getElementById("filter-r-btn"), document.getElementById("filter-g-btn"), document.getElementById("filter-b-btn")];
		rgbButtons.forEach((btn, i) => btn.classList.toggle("active", i === this.filterState.rgbIndex));
		document.getElementById("filter-primary-btn").classList.toggle("active", this.filterState.customView === "primary");
		document.getElementById("filter-custom-btn").classList.toggle("active", this.filterState.customView === "custom");
	}

	applyCurrentUIOptions() {
		if (!this.puzzle || !this.currentOptions) {
			this.updateFilterSwitcherUI();
			return;
		}
		const useCustomTheme = !!(this.currentOptions.availableColors && (this.currentOptions.availableColors === true || this.currentOptions.availableColors.length > 0));
		const colorList = this.resolveColorList(useCustomTheme);
		const symColor = document.getElementById("sym-color-select").value;
		const blinkMarks = document.getElementById("blink-marks").checked;
		const stayPath = document.getElementById("stay-path").checked;
		const uiOptions = this.buildRenderOptions({ blinkMarks, stayPath, symColor, colorList });

		if (this.ui) {
			this.ui.setOptions(uiOptions);
		} else if (this.worker) {
			this.worker.postMessage({ type: "setOptions", payload: uiOptions });
		}
		this.updateFilterSwitcherUI();
	}

	validate(path) {
		this.lastPath = { points: path };

		if (this.worker) {
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
