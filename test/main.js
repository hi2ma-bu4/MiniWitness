import { CellType, EdgeType, NodeType, PuzzleSerializer, RngType, WitnessCore, WitnessUI } from "../dist/MiniWitness.js";

class WitnessGame {
	constructor() {
		this.core = new WitnessCore();
		this.canvas = document.getElementById("game-canvas");
		this.gameContainer = document.getElementById("game-container");
		this.ui = null;
		this.worker = null;
		this.isWorkerMode = false;

		this.statusMsg = document.getElementById("status-message");
		this.sizeSelect = document.getElementById("size-select");
		this.customRowsSelect = document.getElementById("custom-rows-select");
		this.customColsSelect = document.getElementById("custom-cols-select");
		this.newPuzzleBtn = document.getElementById("new-puzzle-btn");
		this.sharePuzzleBtn = document.getElementById("share-puzzle-btn");
		this.sharePathCheckbox = document.getElementById("share-path");
		this.sharePuzzleCheckbox = document.getElementById("share-puzzle");
		this.shareSeedCheckbox = document.getElementById("share-seed");
		this.shareOptionsCheckbox = document.getElementById("share-options");

		this.puzzle = null;
		this.currentOptions = null;
		this.isDrawing = false;
		this.lastPath = null;
		this.pendingSharedPath = null;

		this.filterState = {
			enabled: false,
			mode: "rgb",
			rgbIndex: 0,
			customView: "custom",
		};
		this.customMode = false;
		this.customEditorPuzzle = null;
		this.customTool = { target: "node", value: 0 };
		this.customColor = 1;
		this.customNodeType = null;
		this.customEdgeType = null;
		this.customMarkType = CellType.Square;
		this.customTriangleCount = 1;
		this.customTetrisRotatable = false;
		this.customTetrisShapeGrid = [
			[0, 0, 0, 0],
			[0, 1, 0, 0],
			[0, 1, 1, 0],
			[0, 0, 0, 0],
		];
		this.customOverlayButtons = [];
		this.customHistoryUndo = [];
		this.customHistoryRedo = [];
		this.customEyedropper = false;
		this.customLongPressTimer = null;
		this.customPressPoint = null;
		this.customLongPressed = false;
		this.customRightClickPicking = false;
		this.customOverlayCanvas = document.getElementById("custom-overlay-canvas");
		this.customOverlayCtx = null;

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
		document.getElementById("custom-mode-toggle").addEventListener("change", (e) => this.toggleCustomMode(e.target.checked));
		this.sizeSelect.addEventListener("change", () => {
			if (this.customRowsSelect) this.customRowsSelect.value = this.sizeSelect.value;
			if (this.customColsSelect) this.customColsSelect.value = this.sizeSelect.value;
		});
		this.canvas.addEventListener("mousedown", (e) => this.onCustomPointerDown(e), true);
		this.canvas.addEventListener("mouseup", (e) => this.onCustomPointerUp(e), true);
		this.canvas.addEventListener("touchstart", (e) => this.onCustomPointerDown(e), { capture: true, passive: false });
		this.canvas.addEventListener("touchend", (e) => this.onCustomPointerUp(e), { capture: true, passive: false });
		this.customOverlayCanvas.addEventListener("mousedown", (e) => this.onCustomPointerDown(e), true);
		this.customOverlayCanvas.addEventListener("mouseup", (e) => this.onCustomPointerUp(e), true);
		this.customOverlayCanvas.addEventListener("touchstart", (e) => this.onCustomPointerDown(e), { capture: true, passive: false });
		this.customOverlayCanvas.addEventListener("touchend", (e) => this.onCustomPointerUp(e), { capture: true, passive: false });
		this.canvas.addEventListener("contextmenu", (e) => {
			if (this.customMode) e.preventDefault();
		});
		this.customOverlayCanvas.addEventListener("contextmenu", (e) => {
			if (this.customMode) e.preventDefault();
		});
		window.addEventListener("resize", () => this.syncCustomOverlayCanvasSize());
		window.addEventListener("scroll", () => this.syncCustomOverlayCanvasSize());
		document.getElementById("custom-apply-btn").addEventListener("click", () => this.applyCustomPuzzle());
		document.getElementById("custom-sync-btn").addEventListener("click", () => this.syncCustomEditorFromCurrentPuzzle());
		document.getElementById("custom-clear-btn").addEventListener("click", () => this.clearCustomBoard());
		document.getElementById("custom-share-btn").addEventListener("click", () => this.shareCustomPuzzle());
		document.getElementById("custom-load-btn").addEventListener("click", () => this.loadCustomFromShareCode());

		this.sharePuzzleCheckbox.addEventListener("change", () => {
			if (this.sharePuzzleCheckbox.checked) this.sharePathCheckbox.checked = true;
		});

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

		document.getElementById("input-mode-select").addEventListener("change", () => {
			this.applyCurrentUIOptions();
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
		this.syncCustomOverlayCanvasSize();

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
				if (data.filter) {
					this.syncFilterToUI(data.filter);
				}

				const canRestorePathWithoutPuzzle = !data.puzzle && !!data.path && !!data.seed && !!data.options;
				if (canRestorePathWithoutPuzzle) {
					this.pendingSharedPath = data.path;
					this.sharePathCheckbox.checked = true;
				}

				if (data.puzzle) {
					this.sharePathCheckbox.checked = true;
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
			defaultColors: useCustomTheme ? this.currentOptions?.defaultColors || { Tetris: 0, TetrisNegative: 0, Triangle: 0 } : undefined,
			seed: document.getElementById("seed-input").value || undefined,
			rngType: parseInt(document.getElementById("rng-select").value),
		};
		return options;
	}

	startNewGame() {
		const options = this.getOptionsFromUI();
		this.lastPath = null;
		if (this.sharePathCheckbox.checked) this.sharePathCheckbox.checked = false;

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
		if (options.rows) this.sizeSelect.value = options.rows;
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
		if (options.inputMode) {
			document.getElementById("input-mode-select").value = options.inputMode;
		}
		document.getElementById("symmetry-select").value = options.symmetry ?? 0;
		document.getElementById("complexity-slider").value = options.complexity ?? 1;
		document.getElementById("difficulty-slider").value = options.difficulty ?? 1;
		document.getElementById("path-length-slider").value = options.pathLength ?? 0.5;
		const useCustomTheme = !!(options.availableColors && options.availableColors.length > 0);
		document.getElementById("custom-theme").checked = useCustomTheme;
	}

	syncFilterToUI(filter) {
		this.filterState.enabled = !!filter.enabled;
		this.filterState.mode = filter.mode === "rgb" ? "rgb" : "custom";
		this.filterState.rgbIndex = Math.max(0, Math.min(2, filter.rgbIndex ?? 0));
		document.getElementById("filter-enabled").checked = this.filterState.enabled;
		document.getElementById("filter-mode").value = this.filterState.mode;
		if (filter.customColor) {
			document.getElementById("filter-custom-color").value = filter.customColor;
		}
		this.applyCurrentUIOptions();
	}

	loadPuzzle(puzzle, options) {
		this.puzzle = puzzle;
		this.currentOptions = options;

		// UIのコントロールを更新
		this.sizeSelect.value = puzzle.rows;
		if (this.customRowsSelect) this.customRowsSelect.value = puzzle.rows;
		if (this.customColsSelect) this.customColsSelect.value = puzzle.cols;
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
			if (this.pendingSharedPath) {
				this.lastPath = this.pendingSharedPath;
				this.ui.setPath(this.pendingSharedPath.points);
				this.validate(this.pendingSharedPath.points);
				this.pendingSharedPath = null;
			}
		} else if (this.worker) {
			this.worker.postMessage({ type: "setPuzzle", payload: { puzzle: this.puzzle, options: uiOptions } });
			if (this.pendingSharedPath) {
				this.lastPath = this.pendingSharedPath;
				this.worker.postMessage({ type: "setPath", payload: { path: this.pendingSharedPath.points } });
				this.validate(this.pendingSharedPath.points);
				this.pendingSharedPath = null;
			}
		}
		this.updateFilterSwitcherUI();
		let status = `Puzzle loaded! (Difficulty: ${diff.toFixed(2)})`;
		if (this.puzzle.seed && options.rngType !== RngType.MathRandom) status += ` [Seed: ${this.puzzle.seed}]`;
		this.updateStatus(status);
	}

	async sharePuzzle() {
		if (!this.puzzle) return;

		console.log("Sharing puzzle. lastPath:", this.lastPath);

		const includePuzzle = this.sharePuzzleCheckbox.checked;
		const includeSeed = this.shareSeedCheckbox.checked;
		const includeOptions = this.shareOptionsCheckbox.checked;
		const includePathRequested = this.sharePathCheckbox.checked;
		const includePath = includePathRequested || (!includePuzzle && !!this.lastPath && includeSeed && includeOptions);

		const shareOptions = {
			puzzle: includePuzzle ? this.puzzle : undefined,
			seed: includeSeed
				? {
						type: parseInt(document.getElementById("rng-select").value),
						value: this.puzzle.seed || document.getElementById("seed-input").value,
					}
				: undefined,
			options: includeOptions ? this.getOptionsFromUI() : undefined,
			path: includePath ? this.lastPath : undefined,
			filter: document.getElementById("share-filter").checked ? this.buildFilterOptions() : undefined,
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

		this.ui.on("path:start", (data) => log(`Path Start: (${data.x}, ${data.y}) idx=${data.startIndex}`));
		this.ui.on("path:end", (data) => log(`Path End: exit=${data.isExit}, len=${data.path.length}, start=${data.startNode?.index ?? "-"}, end=${data.endNode?.index ?? "-"}`));
		this.ui.on("path:complete", (data) => this.validate(data.path));
		this.ui.on("goal:reachable", (data) => log(`Goal Reachable: ${data.reachable}`));
		this.ui.on("goal:reached", (data) => log(`Goal Reached: valid=${data.isValid}, start=${data.startNode?.index ?? "-"}, end=${data.endNode?.index ?? "-"}`));
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
		this.ui.on("render:after", (event) => {
			if (this.customMode) this.drawCustomOverlay();
		});
	}

	setRgbFilterIndex(index) {
		this.filterState.rgbIndex = index;
		this.applyCurrentUIOptions();
	}

	resolveColorList(useCustomTheme) {
		if (!useCustomTheme) return undefined;
		if (!this.filterState.enabled) {
			return ["#ffcc00", "#00ff00", "#ff00ff", "#00ffff", "#ffffff"];
		}
		// RGBフィルターで白黒判別しやすい原色寄り配色
		return ["#ffff00", "#ff0000", "#0000ff", "#00ff00", "#000000", "#ffffff", "#ff00ff", "#00ffff"];
	}

	getCustomPaletteColor(colorIndex) {
		const useCustomTheme = !!(this.currentOptions?.availableColors && (this.currentOptions.availableColors === true || this.currentOptions.availableColors.length > 0));
		const list = this.resolveColorList(useCustomTheme);
		const fallback = ["#ffcc00", "#000", "#fff", "#d44", "#36f"];
		return list?.[colorIndex] || fallback[colorIndex] || "#000";
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
			inputMode: document.getElementById("input-mode-select").value,
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

	toggleCustomMode(enabled) {
		if (enabled && !this.ui) {
			this.updateStatus("Custom create is available in non-worker mode.", "#f44");
			document.getElementById("custom-mode-toggle").checked = false;
			return;
		}
		this.customMode = enabled;
		document.getElementById("custom-create-tools").classList.toggle("hidden", !enabled);
		if (this.customOverlayCanvas) this.customOverlayCanvas.style.pointerEvents = enabled ? "auto" : "none";
		this.gameContainer?.classList.toggle("custom-mode-active", enabled);
		if (enabled) {
			this.syncCustomEditorFromCurrentPuzzle();
			this.updateCustomToolIndicator("canvas");
		} else {
			this.updateCustomToolIndicator("off");
			this.clearCustomOverlayCanvas();
		}
		if (this.ui) this.ui.draw();
	}

	updateCustomToolIndicator(hitLabel = "canvas") {
		const labels = { node: "Node", edge: "Edge", cell: "Cell" };
		const mode = this.customMode ? "ON" : "OFF";
		const colorName = ["None", "Black", "White", "Red", "Blue"][this.customColor] || this.customColor;
		const markLabel = this.getCustomMarkTypeLabel(this.customMarkType);
		const nodeLabel = this.getNodeTypeLabel(this.customNodeType);
		const edgeLabel = this.getEdgeTypeLabel(this.customEdgeType);
		document.getElementById("custom-tool-indicator").textContent = `Edit on canvas: ${mode} | Tool: ${labels[this.customTool.target]} | Node: ${nodeLabel} | Edge: ${edgeLabel} | Mark: ${markLabel} | Color: ${colorName} | Target: ${hitLabel}`;
	}

	getCustomBoardSize() {
		const fallback = parseInt(this.sizeSelect.value);
		const rows = parseInt(this.customRowsSelect?.value ?? this.sizeSelect.value) ?? fallback;
		const cols = parseInt(this.customColsSelect?.value ?? this.sizeSelect.value) ?? fallback;
		return { rows, cols };
	}

	createEmptyPuzzle(rows, cols) {
		return {
			rows,
			cols,
			symmetry: parseInt(document.getElementById("symmetry-select").value),
			cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ type: CellType.None, color: 0 }))),
			vEdges: Array.from({ length: rows }, () => Array.from({ length: cols + 1 }, () => ({ type: EdgeType.Normal }))),
			hEdges: Array.from({ length: rows + 1 }, () => Array.from({ length: cols }, () => ({ type: EdgeType.Normal }))),
			nodes: Array.from({ length: rows + 1 }, () => Array.from({ length: cols + 1 }, () => ({ type: NodeType.Normal }))),
		};
	}

	getNodeTypeLabel(type) {
		if (type == null) return "Cycle";
		return (
			{
				[NodeType.Normal]: "Normal",
				[NodeType.Start]: "Start",
				[NodeType.End]: "End",
			}[type] || `Node ${type}`
		);
	}

	getEdgeTypeLabel(type) {
		if (type == null) return "Cycle";
		return (
			{
				[EdgeType.Normal]: "Normal",
				[EdgeType.Broken]: "Broken",
				[EdgeType.Absent]: "Absent",
				[EdgeType.Hexagon]: "Hex",
				[EdgeType.HexagonMain]: "Hex Main",
				[EdgeType.HexagonSymmetry]: "Hex Sym",
			}[type] || `Edge ${type}`
		);
	}

	getCustomMarkTypeLabel(type) {
		return (
			{
				[CellType.None]: "None",
				[CellType.Square]: "Square",
				[CellType.Star]: "Star",
				[CellType.Tetris]: "Tetris",
				[CellType.TetrisRotated]: "Tetris Rot",
				[CellType.TetrisNegative]: "Tetris-",
				[CellType.TetrisNegativeRotated]: "Tetris- Rot",
				[CellType.Eraser]: "Eraser",
				[CellType.Triangle]: "Triangle",
			}[type] || `Type ${type}`
		);
	}

	trimTetrisShape(shape) {
		if (!Array.isArray(shape) || shape.length === 0) return [[1]];
		let minR = Infinity;
		let maxR = -1;
		let minC = Infinity;
		let maxC = -1;
		for (let r = 0; r < shape.length; r++) {
			for (let c = 0; c < shape[r].length; c++) {
				if (!shape[r][c]) continue;
				minR = Math.min(minR, r);
				maxR = Math.max(maxR, r);
				minC = Math.min(minC, c);
				maxC = Math.max(maxC, c);
			}
		}
		if (maxR < 0) return [[1]];
		const out = [];
		for (let r = minR; r <= maxR; r++) {
			const row = [];
			for (let c = minC; c <= maxC; c++) row.push(shape[r]?.[c] ? 1 : 0);
			out.push(row);
		}
		return out;
	}

	resizeTetrisShapeGrid(rows, cols) {
		const maxSize = 4;
		const nextRows = Math.max(1, Math.min(maxSize, rows));
		const nextCols = Math.max(1, Math.min(maxSize, cols));
		const next = Array.from({ length: nextRows }, (_, r) => Array.from({ length: nextCols }, (_, c) => (this.customTetrisShapeGrid?.[r]?.[c] ? 1 : 0)));
		if (next.flat().every((v) => !v)) next[0][0] = 1;
		this.customTetrisShapeGrid = next;
	}

	loadTetrisShapeGridFromShape(shape) {
		const src = this.trimTetrisShape(shape);
		this.customTetrisShapeGrid = src.map((row) => row.map((v) => (v ? 1 : 0)));
	}

	getCurrentTetrisShapeFromGrid() {
		return this.trimTetrisShape(this.customTetrisShapeGrid);
	}

	isTetrisMarkType(type) {
		return [CellType.Tetris, CellType.TetrisRotated, CellType.TetrisNegative, CellType.TetrisNegativeRotated].includes(type);
	}

	shapesEqual(shapeA, shapeB) {
		const a = this.trimTetrisShape(shapeA || [[1]]);
		const b = this.trimTetrisShape(shapeB || [[1]]);
		if (a.length !== b.length) return false;
		if ((a[0]?.length || 0) !== (b[0]?.length || 0)) return false;
		for (let r = 0; r < a.length; r++) {
			for (let c = 0; c < a[r].length; c++) {
				if (!!a[r][c] !== !!b[r][c]) return false;
			}
		}
		return true;
	}

	isSameCellPlacement(cell, activeMarkType) {
		if (!cell || cell.type !== activeMarkType) return false;
		if (activeMarkType === CellType.Triangle) {
			return (cell.count || 1) === this.customTriangleCount;
		}
		if (this.isTetrisMarkType(activeMarkType)) {
			return this.shapesEqual(cell.shape, this.getCurrentTetrisShapeFromGrid());
		}
		return true;
	}

	isNegativeTetrisType(type) {
		return type === CellType.TetrisNegative || type === CellType.TetrisNegativeRotated;
	}

	getBaseMarkType(type) {
		if (type === CellType.TetrisRotated) return CellType.Tetris;
		if (type === CellType.TetrisNegativeRotated) return CellType.TetrisNegative;
		return type;
	}

	applyRotatableToMarkType(type) {
		if (!this.isTetrisMarkType(type)) return type;
		const base = this.getBaseMarkType(type);
		if (base === CellType.TetrisNegative) return this.customTetrisRotatable ? CellType.TetrisNegativeRotated : CellType.TetrisNegative;
		return this.customTetrisRotatable ? CellType.TetrisRotated : CellType.Tetris;
	}

	inferCustomTargetFromHit(hit) {
		if (!hit) return null;
		if (hit.kind === "node") return "node";
		if (hit.kind === "hEdge" || hit.kind === "vEdge") return "edge";
		if (hit.kind === "cell") return "cell";
		return null;
	}

	syncCustomSelectionFromHit(hit) {
		if (!this.customEditorPuzzle || !hit) return;
		const target = this.inferCustomTargetFromHit(hit);
		if (!target) return;
		this.customTool.target = target;
		const p = this.customEditorPuzzle;
		if (target === "node") {
			const t = p.nodes[hit.y][hit.x].type;
			this.customNodeType = t;
			this.customTool.value = t;
			return;
		}
		if (target === "edge") {
			const edge = hit.kind === "hEdge" ? p.hEdges[hit.r][hit.c] : p.vEdges[hit.r][hit.c];
			this.customEdgeType = edge.type;
			this.customTool.value = edge.type;
			return;
		}
		const cell = p.cells[hit.r][hit.c];
		this.customMarkType = cell.type;
		this.customColor = cell.color ?? 0;
		if (cell.type === CellType.Triangle) this.customTriangleCount = cell.count || 1;
		if (this.isTetrisMarkType(cell.type) && cell.shape) this.loadTetrisShapeGridFromShape(cell.shape);
		if (this.isTetrisMarkType(cell.type)) this.customTetrisRotatable = cell.type === CellType.TetrisRotated || cell.type === CellType.TetrisNegativeRotated;
		if (this.isNegativeTetrisType(cell.type)) this.customColor = 0;
		this.customTool.value = cell.type;
	}

	pushCustomHistory() {
		if (!this.customEditorPuzzle) return;
		this.customHistoryUndo.push(structuredClone(this.customEditorPuzzle));
		if (this.customHistoryUndo.length > 100) this.customHistoryUndo.shift();
		this.customHistoryRedo = [];
	}

	undoCustomEdit() {
		if (!this.customEditorPuzzle || this.customHistoryUndo.length === 0) return;
		this.customHistoryRedo.push(structuredClone(this.customEditorPuzzle));
		this.customEditorPuzzle = this.customHistoryUndo.pop();
		this.refreshCustomPuzzle("undo");
	}

	redoCustomEdit() {
		if (!this.customEditorPuzzle || this.customHistoryRedo.length === 0) return;
		this.customHistoryUndo.push(structuredClone(this.customEditorPuzzle));
		this.customEditorPuzzle = this.customHistoryRedo.pop();
		this.refreshCustomPuzzle("redo");
	}

	syncCustomEditorFromCurrentPuzzle() {
		const customSize = this.getCustomBoardSize();
		const puzzle = this.puzzle ? structuredClone(this.puzzle) : this.createEmptyPuzzle(customSize.rows, customSize.cols);
		this.customEditorPuzzle = puzzle;
		document.getElementById("custom-puzzle-json").value = JSON.stringify(puzzle, null, 2);
	}

	onCustomPointerDown(event) {
		if (!this.customMode || !this.ui) return;
		const isMouseRightClick = event.type === "mousedown" && event.button === 2;
		if (event.cancelable) event.preventDefault();
		event.stopImmediatePropagation?.();
		const p = this.extractClientPoint(event);
		if (isMouseRightClick) {
			this.customRightClickPicking = true;
			if (!this.customEditorPuzzle) this.syncCustomEditorFromCurrentPuzzle();
			const hit = this.ui.hitTestInput(p.x, p.y);
			if (hit) {
				this.syncCustomSelectionFromHit(hit);
				this.updateCustomToolIndicator(`pick:${hit.kind}`);
				if (this.ui) this.ui.draw();
			}
			return;
		}
		this.customPressPoint = p;
		this.customLongPressed = false;
		this.customRightClickPicking = false;
		if (this.customLongPressTimer) clearTimeout(this.customLongPressTimer);
		this.customLongPressTimer = setTimeout(() => {
			this.customLongPressed = true;
			this.applyCustomDelete(p.x, p.y);
		}, 420);
	}

	onCustomPointerUp(event) {
		if (!this.customMode || !this.ui) return;
		if (event.cancelable) event.preventDefault();
		event.stopImmediatePropagation?.();
		if (this.customRightClickPicking) {
			this.customRightClickPicking = false;
			if (this.customLongPressTimer) clearTimeout(this.customLongPressTimer);
			this.customLongPressTimer = null;
			return;
		}
		const p = this.extractClientPoint(event);
		if (this.customLongPressTimer) clearTimeout(this.customLongPressTimer);
		this.customLongPressTimer = null;
		if (this.customLongPressed) return;
		this.applyCustomClick(p.x, p.y);
	}

	extractClientPoint(event) {
		const touch = event.changedTouches?.[0] || event.touches?.[0];
		return { x: touch ? touch.clientX : event.clientX, y: touch ? touch.clientY : event.clientY };
	}

	applyCustomClick(clientX, clientY) {
		if (!this.customEditorPuzzle) this.syncCustomEditorFromCurrentPuzzle();
		if (!this.customEditorPuzzle) return;
		if (this.handleOverlayClick(clientX, clientY)) return;
		const hit = this.ui.hitTestInput(clientX, clientY);
		if (!hit) return;
		const target = this.inferCustomTargetFromHit(hit);
		if (!target) return;

		if (this.customEyedropper) {
			this.syncCustomSelectionFromHit(hit);
			this.updateCustomToolIndicator(`pick:${target}`);
			if (this.ui) this.ui.draw();
			return;
		}

		if (this.customTool.target !== target) {
			this.syncCustomSelectionFromHit(hit);
			this.updateCustomToolIndicator(`switch:${target}`);
			if (this.ui) this.ui.draw();
			return;
		}
		this.pushCustomHistory();
		this.applyCustomCycle(hit);
		this.refreshCustomPuzzle(hit.kind);
	}

	applyCustomDelete(clientX, clientY) {
		if (!this.customEditorPuzzle) this.syncCustomEditorFromCurrentPuzzle();
		if (!this.customEditorPuzzle) return;
		const hit = this.ui.hitTestInput(clientX, clientY);
		if (!hit) return;
		this.pushCustomHistory();
		const p = this.customEditorPuzzle;
		if (hit.kind === "node") p.nodes[hit.y][hit.x].type = NodeType.Normal;
		if (hit.kind === "hEdge") p.hEdges[hit.r][hit.c].type = EdgeType.Normal;
		if (hit.kind === "vEdge") p.vEdges[hit.r][hit.c].type = EdgeType.Normal;
		if (hit.kind === "cell") p.cells[hit.r][hit.c] = { type: CellType.None, color: 0 };
		this.refreshCustomPuzzle(`${hit.kind}:delete`);
	}

	applyCustomCycle(hit) {
		const p = this.customEditorPuzzle;
		if (hit.kind === "node") {
			if (this.customNodeType == null) {
				const order = [NodeType.Normal, NodeType.Start, NodeType.End];
				const cur = p.nodes[hit.y][hit.x].type;
				p.nodes[hit.y][hit.x].type = order[(order.indexOf(cur) + 1 + order.length) % order.length];
				this.customTool = { target: "node", value: p.nodes[hit.y][hit.x].type };
			} else {
				p.nodes[hit.y][hit.x].type = this.customNodeType;
				this.customTool = { target: "node", value: this.customNodeType };
			}
			return;
		}
		if (hit.kind === "hEdge" || hit.kind === "vEdge") {
			const edge = hit.kind === "hEdge" ? p.hEdges[hit.r][hit.c] : p.vEdges[hit.r][hit.c];
			if (this.customEdgeType == null) {
				const order = [EdgeType.Normal, EdgeType.Broken, EdgeType.Absent, EdgeType.Hexagon, EdgeType.HexagonMain, EdgeType.HexagonSymmetry];
				edge.type = order[(order.indexOf(edge.type) + 1 + order.length) % order.length];
				this.customTool = { target: "edge", value: edge.type };
			} else {
				edge.type = this.customEdgeType;
				this.customTool = { target: "edge", value: this.customEdgeType };
			}
			return;
		}
		const cell = p.cells[hit.r][hit.c];
		if (this.customMarkType === CellType.None) {
			p.cells[hit.r][hit.c] = { type: CellType.None, color: 0 };
			return;
		}

		const activeMarkType = this.applyRotatableToMarkType(this.customMarkType);
		this.customMarkType = activeMarkType;
		const isNegativeTetris = this.isNegativeTetrisType(activeMarkType);
		const isSamePlacement = this.isSameCellPlacement(cell, activeMarkType);

		const colorList = this.resolveColorList(true) || ["#ffcc00", "#000", "#fff", "#f00", "#00f"];
		const colorCount = colorList.length;

		const allowedNone = [CellType.Tetris, CellType.TetrisRotated, CellType.TetrisNegative, CellType.TetrisNegativeRotated, CellType.Triangle].includes(this.getBaseMarkType(activeMarkType));
		let nextColor = isNegativeTetris ? 0 : isSamePlacement ? (cell.color + 1) % colorCount : this.customColor;
		if (!allowedNone && nextColor === 0) {
			nextColor = (nextColor + 1) % colorCount;
		}

		cell.type = activeMarkType;
		cell.color = nextColor;
		this.customColor = nextColor;
		delete cell.shape;
		delete cell.count;
		if (this.isTetrisMarkType(cell.type)) {
			cell.shape = this.getCurrentTetrisShapeFromGrid();
		}
		if (cell.type === CellType.Triangle) {
			cell.count = this.customTriangleCount;
		}
		this.customTool = { target: "cell", value: cell.type };
	}

	getCustomOverlayToolHeight() {
		if (!this.customMode) return 1;
		const rows = this.customTetrisShapeGrid?.length || 4;
		const isCellTool = this.customTool.target === "cell";
		const isNegativeTetrisMark = this.isNegativeTetrisType(this.customMarkType);
		const colorList = this.resolveColorList(true) || ["#ffcc00", "#000", "#fff", "#f00", "#00f"];
		const colorRows = isCellTool ? Math.ceil((isNegativeTetrisMark ? 1 : colorList.length) / 7) : 0;

		const base = 280;
		const rowCost = Math.max(0, rows - 4) * 18;
		const colorRowCost = Math.max(0, colorRows - 1) * 20;
		return Math.max(200, base + rowCost + colorRowCost);
	}

	syncCustomOverlayCanvasSize() {
		if (!this.customOverlayCanvas || !this.canvas?.getBoundingClientRect) return;
		const rect = this.canvas.getBoundingClientRect();
		const width = Math.max(1, Math.round(rect.width));
		const height = this.getCustomOverlayToolHeight();
		this.customOverlayCanvas.style.width = `${width}px`;
		this.customOverlayCanvas.style.height = `${height}px`;
		if (this.customOverlayCanvas.width !== width) this.customOverlayCanvas.width = width;
		if (this.customOverlayCanvas.height !== height) this.customOverlayCanvas.height = height;

		if (this.gameContainer?.getBoundingClientRect) {
			const cRect = this.canvas.getBoundingClientRect();
			const gRect = this.gameContainer.getBoundingClientRect();
			const left = `${Math.round(cRect.left - gRect.left)}px`;
			const top = `${Math.round(cRect.bottom - gRect.top)}px`;
			this.customOverlayCanvas.style.left = left;
			this.customOverlayCanvas.style.top = top;
			if (this.customMode) this.gameContainer.style.paddingBottom = `${height + 10}px`;
			else this.gameContainer.style.paddingBottom = "";
		}
	}

	clearCustomOverlayCanvas() {
		if (this.customOverlayCanvas) {
			const overlayCtx = this.customOverlayCanvas.getContext("2d");
			if (overlayCtx) overlayCtx.clearRect(0, 0, this.customOverlayCanvas.width, this.customOverlayCanvas.height);
		}
	}

	getCustomOverlayContext() {
		if (!this.customOverlayCanvas) return null;
		this.syncCustomOverlayCanvasSize();
		if (!this.customOverlayCtx) this.customOverlayCtx = this.customOverlayCanvas.getContext("2d");
		if (!this.customOverlayCtx) return null;
		this.customOverlayCtx.clearRect(0, 0, this.customOverlayCanvas.width, this.customOverlayCanvas.height);
		return this.customOverlayCtx;
	}

	toOverlayPoint(clientX, clientY) {
		if (!this.customOverlayCanvas?.getBoundingClientRect) return { x: clientX, y: clientY };
		const rect = this.customOverlayCanvas.getBoundingClientRect();
		return { x: clientX - rect.left, y: clientY - rect.top };
	}

	handleOverlayClick(clientX, clientY) {
		const p = this.toOverlayPoint(clientX, clientY);
		for (const btn of this.customOverlayButtons) {
			if (p.x >= btn.x && p.x <= btn.x + btn.w && p.y >= btn.y && p.y <= btn.y + btn.h) {
				btn.action();
				if (this.ui) this.ui.draw();
				return true;
			}
		}
		return false;
	}

	drawCustomOverlay() {
		if (!this.customMode || !this.ui || !this.canvas.getBoundingClientRect) return;
		const overlayCtx = this.getCustomOverlayContext();
		if (!overlayCtx) return;

		const isCellTool = this.customTool.target === "cell";
		const isNodeTool = this.customTool.target === "node";
		const isEdgeTool = this.customTool.target === "edge";
		const isTetrisMark = this.isTetrisMarkType(this.customMarkType);
		const isNegativeTetrisMark = this.isNegativeTetrisType(this.customMarkType);

		const canvasW = this.customOverlayCanvas.width;
		const panelW = Math.max(220, Math.min(canvasW - 20, 338));
		const px = 10;
		const contentW = panelW - 12;
		const markCols = contentW < 300 ? 3 : 4;
		const markGap = 6;
		const markBtnW = Math.floor((contentW - markGap * (markCols - 1)) / markCols);
		const tRows = this.customTetrisShapeGrid.length;
		const tCols = this.customTetrisShapeGrid[0]?.length || 1;
		const tCellSize = Math.max(8, Math.min(contentW < 300 ? 14 : 18, Math.floor((contentW - 2 * Math.max(0, tCols - 1)) / tCols)));
		const tGridW = tCellSize * tCols + 2 * (tCols - 1);

		let panelH = 68;
		if (isNodeTool) panelH = 104;
		if (isEdgeTool) {
			const edgeRows = Math.ceil(7 / 3);
			panelH = 36 + edgeRows * 24 + 28;
		}
		if (isCellTool) {
			const markRows = Math.ceil(7 / markCols);
			const colorList = this.resolveColorList(true) || ["#ffcc00", "#000", "#fff", "#f00", "#00f"];
			const colorRows = Math.ceil((isNegativeTetrisMark ? 1 : colorList.length) / 7);
			panelH = 78 + colorRows * 20 + markRows * 22 + (this.customMarkType === CellType.Triangle ? 22 : 0);
			if (isTetrisMark) panelH += Math.max(64, 26 + tRows * (tCellSize + 2));
			panelH += 22;
		}
		const py = 6;

		const items = [
			{ key: "node", label: "Node" },
			{ key: "edge", label: "Edge" },
			{ key: "cell", label: "Cell" },
		];
		this.customOverlayButtons = [];
		overlayCtx.save();
		overlayCtx.globalAlpha = 0.95;
		overlayCtx.fillStyle = "rgba(10,10,10,0.94)";
		overlayCtx.fillRect(px, py, panelW, panelH);
		overlayCtx.font = "12px sans-serif";
		items.forEach((it, i) => {
			const bx = px + 6 + i * 58;
			const by = py + 8;
			overlayCtx.fillStyle = this.customTool.target === it.key ? "#4db8ff" : "#333";
			overlayCtx.fillRect(bx, by, 52, 20);
			overlayCtx.fillStyle = "#fff";
			overlayCtx.fillText(it.label, bx + 10, by + 14);
			this.customOverlayButtons.push({
				x: bx,
				y: by,
				w: 52,
				h: 20,
				action: () => {
					this.customTool.target = it.key;
					this.updateCustomToolIndicator("overlay");
				},
			});
		});
		const undoW = 44;
		const undoX = px + panelW - undoW * 2 - 12;
		const undoY = py + 8;
		overlayCtx.fillStyle = this.customHistoryUndo.length > 0 ? "#333" : "#222";
		overlayCtx.fillRect(undoX, undoY, undoW, 20);
		overlayCtx.fillStyle = "#fff";
		overlayCtx.fillText("Undo", undoX + 7, undoY + 14);
		this.customOverlayButtons.push({ x: undoX, y: undoY, w: undoW, h: 20, action: () => this.undoCustomEdit() });

		overlayCtx.fillStyle = this.customHistoryRedo.length > 0 ? "#333" : "#222";
		overlayCtx.fillRect(undoX + undoW + 4, undoY, undoW, 20);
		overlayCtx.fillStyle = "#fff";
		overlayCtx.fillText("Redo", undoX + undoW + 10, undoY + 14);
		this.customOverlayButtons.push({ x: undoX + undoW + 4, y: undoY, w: undoW, h: 20, action: () => this.redoCustomEdit() });

		let y = py + 36;
		if (isNodeTool) {
			const nodeTypes = [null, NodeType.Normal, NodeType.Start, NodeType.End];
			nodeTypes.forEach((type, i) => {
				const bw = Math.floor((contentW - 3 * 6) / 4);
				const bx = px + 6 + i * (bw + 6);
				overlayCtx.fillStyle = this.customNodeType === type ? "#4db8ff" : "#333";
				overlayCtx.fillRect(bx, y, bw, 20);
				overlayCtx.fillStyle = "#fff";
				overlayCtx.fillText(this.getNodeTypeLabel(type), bx + 6, y + 14);
				this.customOverlayButtons.push({
					x: bx,
					y,
					w: bw,
					h: 20,
					action: () => {
						this.customNodeType = type;
						this.customTool = { target: "node", value: type };
					},
				});
			});
			y += 30;
			overlayCtx.fillStyle = "#ddd";
			overlayCtx.fillText("Tap node to place selected type", px + 6, y + 12);
		}

		if (isEdgeTool) {
			const edgeTypes = [null, EdgeType.Normal, EdgeType.Broken, EdgeType.Absent, EdgeType.Hexagon, EdgeType.HexagonMain, EdgeType.HexagonSymmetry];
			const cols = 3;
			const edgeRows = Math.ceil(edgeTypes.length / cols);
			const bw = Math.floor((contentW - (cols - 1) * 6) / cols);
			edgeTypes.forEach((type, i) => {
				const bx = px + 6 + (i % cols) * (bw + 6);
				const by = y + Math.floor(i / cols) * 24;
				overlayCtx.fillStyle = this.customEdgeType === type ? "#4db8ff" : "#333";
				overlayCtx.fillRect(bx, by, bw, 20);
				overlayCtx.fillStyle = "#fff";
				overlayCtx.fillText(this.getEdgeTypeLabel(type), bx + 4, by + 14);
				this.customOverlayButtons.push({
					x: bx,
					y: by,
					w: bw,
					h: 20,
					action: () => {
						this.customEdgeType = type;
						this.customTool = { target: "edge", value: type };
					},
				});
			});
			overlayCtx.fillStyle = "#ddd";
			overlayCtx.fillText("Tap edge to place selected type", px + 6, y + edgeRows * 24 + 14);
		}

		if (isCellTool) {
			const eyeX = px + panelW - 94;
			const eyeY = y;
			overlayCtx.fillStyle = this.customEyedropper ? "#4db8ff" : "#333";
			overlayCtx.fillRect(eyeX, eyeY, 88, 18);
			overlayCtx.fillStyle = "#fff";
			overlayCtx.fillText("Eyedropper", eyeX + 8, eyeY + 13);
			this.customOverlayButtons.push({
				x: eyeX,
				y: eyeY,
				w: 88,
				h: 18,
				action: () => {
					this.customEyedropper = !this.customEyedropper;
					if (this.customEyedropper) this.customTool.target = "cell";
					this.updateCustomToolIndicator("eyedropper");
				},
			});

			const colorList = this.resolveColorList(true) || ["#ffcc00", "#000", "#fff", "#f00", "#00f"];
			const isForbiddenNone = [CellType.Square, CellType.Star, CellType.Eraser].includes(this.getBaseMarkType(this.customMarkType));
			const colors = isNegativeTetrisMark ? [0] : colorList.map((_, i) => i).filter((i) => !isForbiddenNone || i !== 0);
			colors.forEach((c, i) => {
				const bx = px + 6 + (i % 7) * 32;
				const by = y + Math.floor(i / 7) * 20;
				overlayCtx.fillStyle = this.getCustomPaletteColor(c);
				overlayCtx.fillRect(bx, by, 24, 16);
				overlayCtx.strokeStyle = this.customColor === c ? "#4db8ff" : "#888";
				overlayCtx.lineWidth = 2;
				overlayCtx.strokeRect(bx, by, 24, 16);
				this.customOverlayButtons.push({
					x: bx,
					y: by,
					w: 24,
					h: 16,
					action: () => {
						this.customColor = c;
						this.updateCustomToolIndicator("overlay");
					},
				});
			});
			y += Math.ceil(colors.length / 7) * 20 + 4;

			const markTypes = [CellType.None, CellType.Square, CellType.Star, CellType.Triangle, CellType.Tetris, CellType.TetrisNegative, CellType.Eraser];
			markTypes.forEach((type, i) => {
				const bx = px + 6 + (i % markCols) * (markBtnW + markGap);
				const by = y + Math.floor(i / markCols) * 22;
				overlayCtx.fillStyle = this.getBaseMarkType(this.customMarkType) === this.getBaseMarkType(type) ? "#4db8ff" : "#333";
				overlayCtx.fillRect(bx, by, markBtnW, 18);
				overlayCtx.fillStyle = "#fff";
				overlayCtx.fillText(this.getCustomMarkTypeLabel(type), bx + 4, by + 13);
				this.customOverlayButtons.push({
					x: bx,
					y: by,
					w: markBtnW,
					h: 18,
					action: () => {
						this.customMarkType = this.applyRotatableToMarkType(type);
						if (this.isNegativeTetrisType(this.customMarkType)) this.customColor = 0;
						this.updateCustomToolIndicator("mark");
					},
				});
			});
			y += Math.ceil(markTypes.length / markCols) * 22;

			if (this.customMarkType === CellType.Triangle) {
				[1, 2, 3].forEach((count, i) => {
					const bx = px + 6 + i * 30;
					const by = y;
					overlayCtx.fillStyle = this.customTriangleCount === count ? "#4db8ff" : "#333";
					overlayCtx.fillRect(bx, by, 24, 18);
					overlayCtx.fillStyle = "#fff";
					overlayCtx.fillText(String(count), bx + 9, by + 13);
					this.customOverlayButtons.push({ x: bx, y: by, w: 24, h: 18, action: () => (this.customTriangleCount = count) });
				});
				y += 24;
			}

			if (isTetrisMark) {
				const rotBx = px + 6;
				const rotBy = y;
				overlayCtx.fillStyle = this.customTetrisRotatable ? "#4db8ff" : "#333";
				overlayCtx.fillRect(rotBx, rotBy, 92, 18);
				overlayCtx.fillStyle = "#fff";
				overlayCtx.fillText("Rotatable", rotBx + 12, rotBy + 13);
				this.customOverlayButtons.push({
					x: rotBx,
					y: rotBy,
					w: 92,
					h: 18,
					action: () => {
						this.customTetrisRotatable = !this.customTetrisRotatable;
						this.customMarkType = this.applyRotatableToMarkType(this.customMarkType);
					},
				});

				y += 24;
				const sizeBtnY = y;
				const sizeBtnW = 28;
				const sizeBtns = [
					{ label: "R+", dx: 0, action: () => this.resizeTetrisShapeGrid(tRows + 1, tCols) },
					{ label: "R-", dx: 32, action: () => this.resizeTetrisShapeGrid(tRows - 1, tCols) },
					{ label: "C+", dx: 64, action: () => this.resizeTetrisShapeGrid(tRows, tCols + 1) },
					{ label: "C-", dx: 96, action: () => this.resizeTetrisShapeGrid(tRows, tCols - 1) },
				];
				sizeBtns.forEach((b) => {
					const bx = px + 6 + b.dx;
					overlayCtx.fillStyle = "#333";
					overlayCtx.fillRect(bx, sizeBtnY, sizeBtnW, 18);
					overlayCtx.fillStyle = "#fff";
					overlayCtx.fillText(b.label, bx + 6, sizeBtnY + 13);
					this.customOverlayButtons.push({ x: bx, y: sizeBtnY, w: sizeBtnW, h: 18, action: b.action });
				});
				overlayCtx.fillStyle = "#bbb";
				overlayCtx.fillText(`${tRows}x${tCols}`, px + 138, sizeBtnY + 13);

				const gx = px + Math.max(110, contentW - tGridW);
				const gy = y + 22;
				for (let r = 0; r < tRows; r++) {
					for (let c = 0; c < tCols; c++) {
						const bx = gx + c * (tCellSize + 2);
						const by = gy + r * (tCellSize + 2);
						overlayCtx.fillStyle = this.customTetrisShapeGrid[r]?.[c] || 0 ? "#4db8ff" : "#1a1a1a";
						overlayCtx.fillRect(bx, by, tCellSize, tCellSize);
						overlayCtx.strokeStyle = "#777";
						overlayCtx.lineWidth = 1;
						overlayCtx.strokeRect(bx, by, tCellSize, tCellSize);
						this.customOverlayButtons.push({
							x: bx,
							y: by,
							w: tCellSize,
							h: tCellSize,
							action: () => {
								this.customTetrisShapeGrid[r][c] = this.customTetrisShapeGrid[r][c] ? 0 : 1;
								const activeCount = this.customTetrisShapeGrid.flat().reduce((a, b) => a + b, 0);
								if (activeCount === 0) this.customTetrisShapeGrid[r][c] = 1;
							},
						});
					}
				}
				y += 22 + tCellSize * tRows + 10;
			}

			overlayCtx.fillStyle = "#ddd";
			overlayCtx.fillText("Tap: place selected mark / Hold: clear", px + 6, py + panelH - 8);
		}
		overlayCtx.restore();
	}

	refreshCustomPuzzle(hitLabel) {
		document.getElementById("custom-puzzle-json").value = JSON.stringify(this.customEditorPuzzle, null, 2);
		const options = this.getOptionsFromUI();
		options.rows = this.customEditorPuzzle.rows;
		options.cols = this.customEditorPuzzle.cols;
		this.loadPuzzle(structuredClone(this.customEditorPuzzle), options);
		this.updateCustomToolIndicator(hitLabel);
		if (!this.customMode) this.clearCustomOverlayCanvas();
	}

	clearCustomBoard() {
		if (this.customEditorPuzzle) this.pushCustomHistory();
		const customSize = this.getCustomBoardSize();
		this.customEditorPuzzle = this.createEmptyPuzzle(customSize.rows, customSize.cols);
		this.refreshCustomPuzzle("cleared");
	}

	applyCustomPuzzle() {
		try {
			const advancedJson = document.getElementById("custom-puzzle-json").value.trim();
			if (advancedJson) this.customEditorPuzzle = JSON.parse(advancedJson);
			if (!this.customEditorPuzzle) this.clearCustomBoard();
			this.customHistoryUndo = [];
			this.customHistoryRedo = [];
			this.refreshCustomPuzzle("applied");
			this.updateStatus("Custom puzzle applied.", "#4f4");
		} catch (error) {
			console.error(error);
			this.updateStatus("Custom JSON parse failed.", "#f44");
		}
	}

	async shareCustomPuzzle() {
		try {
			if (!this.customEditorPuzzle) this.syncCustomEditorFromCurrentPuzzle();
			const serialized = await PuzzleSerializer.serialize({ puzzle: this.customEditorPuzzle, parityMode: document.getElementById("parity-mode").value });
			await navigator.clipboard.writeText(serialized);
			document.getElementById("custom-share-code").value = serialized;
			this.updateStatus("Custom share code copied.", "#4f4");
		} catch (error) {
			console.error(error);
			this.updateStatus("Failed to create custom share code.", "#f44");
		}
	}

	async loadCustomFromShareCode() {
		try {
			const shareCode = document.getElementById("custom-share-code").value.trim();
			if (!shareCode) return;
			const data = await PuzzleSerializer.deserialize(shareCode);
			if (!data.puzzle) throw new Error("No puzzle data in code");
			this.customEditorPuzzle = data.puzzle;
			this.customHistoryUndo = [];
			this.customHistoryRedo = [];
			this.refreshCustomPuzzle("loaded");
			this.updateStatus("Custom share code loaded.", "#4f4");
		} catch (error) {
			console.error(error);
			this.updateStatus("Failed to load custom share code.", "#f44");
		}
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

if (typeof window !== "undefined") {
	window.witnessGame = new WitnessGame();
	window.PuzzleSerializer = PuzzleSerializer;
}
