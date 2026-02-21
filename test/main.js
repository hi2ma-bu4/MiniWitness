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
		this.customOverlayButtons = [];
		this.customLongPressTimer = null;
		this.customPressPoint = null;
		this.customLongPressed = false;
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
		this.canvas.addEventListener("mousedown", (e) => this.onCustomPointerDown(e), true);
		this.canvas.addEventListener("mouseup", (e) => this.onCustomPointerUp(e), true);
		this.canvas.addEventListener("touchstart", (e) => this.onCustomPointerDown(e), { capture: true, passive: false });
		this.canvas.addEventListener("touchend", (e) => this.onCustomPointerUp(e), { capture: true, passive: false });
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
			defaultColors: useCustomTheme ? this.currentOptions?.defaultColors || { Tetris: 5, TetrisNegative: 5, Triangle: 5 } : undefined,
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
			if (this.customMode) this.drawCustomOverlay(event?.ctx);
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
		document.getElementById("custom-tool-indicator").textContent = `Edit on canvas: ${mode} | Tool: ${labels[this.customTool.target]} | Color: ${colorName} | Target: ${hitLabel}`;
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

	getTetrisShapePreset(index) {
		const presets = [
			[[1]],
			[[1, 1]],
			[[1, 1, 1]],
			[[1, 1, 1, 1]],
			[
				[1, 1],
				[1, 1],
			],
			[
				[1, 0],
				[1, 1],
			],
			[
				[1, 0, 0],
				[1, 1, 1],
			],
			[
				[1, 1, 1],
				[0, 1, 0],
			],
			[
				[0, 1, 1],
				[1, 1, 0],
			],
		];
		return presets[index % presets.length];
	}

	syncCustomEditorFromCurrentPuzzle() {
		const puzzle = this.puzzle ? structuredClone(this.puzzle) : this.createEmptyPuzzle(parseInt(this.sizeSelect.value), parseInt(this.sizeSelect.value));
		this.customEditorPuzzle = puzzle;
		document.getElementById("custom-puzzle-json").value = JSON.stringify(puzzle, null, 2);
	}

	onCustomPointerDown(event) {
		if (!this.customMode || !this.ui) return;
		if (event.cancelable) event.preventDefault();
		event.stopImmediatePropagation?.();
		const p = this.extractClientPoint(event);
		this.customPressPoint = p;
		this.customLongPressed = false;
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
		this.applyCustomCycle(hit);
		this.refreshCustomPuzzle(hit.kind);
	}

	applyCustomDelete(clientX, clientY) {
		if (!this.customEditorPuzzle) this.syncCustomEditorFromCurrentPuzzle();
		if (!this.customEditorPuzzle) return;
		const hit = this.ui.hitTestInput(clientX, clientY);
		if (!hit) return;
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
			const order = [NodeType.Normal, NodeType.Start, NodeType.End];
			const cur = p.nodes[hit.y][hit.x].type;
			p.nodes[hit.y][hit.x].type = order[(order.indexOf(cur) + 1 + order.length) % order.length];
			this.customTool = { target: "node", value: p.nodes[hit.y][hit.x].type };
			return;
		}
		if (hit.kind === "hEdge" || hit.kind === "vEdge") {
			const order = [EdgeType.Normal, EdgeType.Broken, EdgeType.Absent, EdgeType.Hexagon, EdgeType.HexagonMain, EdgeType.HexagonSymmetry];
			const edge = hit.kind === "hEdge" ? p.hEdges[hit.r][hit.c] : p.vEdges[hit.r][hit.c];
			edge.type = order[(order.indexOf(edge.type) + 1 + order.length) % order.length];
			this.customTool = { target: "edge", value: edge.type };
			return;
		}
		const cell = p.cells[hit.r][hit.c];
		if (cell.type === CellType.None) {
			cell.type = CellType.Square;
			cell.color = this.customColor;
		} else {
			cell.color = (cell.color % 4) + 1;
			this.customColor = cell.color;
			if (cell.type === CellType.Triangle) {
				cell.count = ((cell.count || 1) % 3) + 1;
			}
			if ([CellType.Tetris, CellType.TetrisNegative].includes(cell.type)) {
				const seq = Number(cell.__shapeSeq || 0) + 1;
				cell.shape = this.getTetrisShapePreset(seq);
				cell.__shapeSeq = seq;
			}
		}
		this.customTool = { target: "cell", value: cell.type };
	}

	syncCustomOverlayCanvasSize() {
		if (!this.customOverlayCanvas || !this.canvas?.getBoundingClientRect) return;
		const rect = this.canvas.getBoundingClientRect();
		const width = Math.max(1, Math.round(rect.width));
		const height = Math.max(1, Math.round(rect.height));
		this.customOverlayCanvas.style.width = `${width}px`;
		this.customOverlayCanvas.style.height = `${height}px`;
		if (this.customOverlayCanvas.width !== width) this.customOverlayCanvas.width = width;
		if (this.customOverlayCanvas.height !== height) this.customOverlayCanvas.height = height;
		if (this.gameContainer?.getBoundingClientRect) {
			const cRect = this.canvas.getBoundingClientRect();
			const gRect = this.gameContainer.getBoundingClientRect();
			this.customOverlayCanvas.style.left = `${Math.round(cRect.left - gRect.left)}px`;
			this.customOverlayCanvas.style.top = `${Math.round(cRect.top - gRect.top)}px`;
		}
	}

	clearCustomOverlayCanvas() {
		if (!this.customOverlayCanvas) return;
		const ctx = this.customOverlayCanvas.getContext("2d");
		if (!ctx) return;
		ctx.clearRect(0, 0, this.customOverlayCanvas.width, this.customOverlayCanvas.height);
	}

	getCustomOverlayContext(ctx) {
		if (ctx && typeof ctx.save === "function") return ctx;
		if (!this.customOverlayCanvas) return null;
		this.syncCustomOverlayCanvasSize();
		if (!this.customOverlayCtx) this.customOverlayCtx = this.customOverlayCanvas.getContext("2d");
		if (!this.customOverlayCtx) return null;
		this.customOverlayCtx.clearRect(0, 0, this.customOverlayCanvas.width, this.customOverlayCanvas.height);
		return this.customOverlayCtx;
	}

	handleOverlayClick(clientX, clientY) {
		for (const btn of this.customOverlayButtons) {
			if (clientX >= btn.x && clientX <= btn.x + btn.w && clientY >= btn.y && clientY <= btn.y + btn.h) {
				btn.action();
				if (this.ui) this.ui.draw();
				return true;
			}
		}
		return false;
	}

	drawCustomOverlay(ctx) {
		if (!this.customMode || !this.ui || !this.canvas.getBoundingClientRect) return;
		const overlayCtx = this.getCustomOverlayContext(ctx);
		if (!overlayCtx) return;
		const rect = this.canvas.getBoundingClientRect();
		const x0 = rect.left + 10;
		const y0 = rect.top + 10;
		const items = [
			{ key: "node", label: "Node" },
			{ key: "edge", label: "Edge" },
			{ key: "cell", label: "Cell" },
		];
		const colors = [1, 2, 3, 4];
		this.customOverlayButtons = [];
		overlayCtx.save();
		overlayCtx.globalAlpha = 0.9;
		overlayCtx.fillStyle = "rgba(10,10,10,0.7)";
		overlayCtx.fillRect(10, 10, 260, 68);
		overlayCtx.font = "12px sans-serif";
		items.forEach((it, i) => {
			const bx = 16 + i * 58;
			const by = 18;
			overlayCtx.fillStyle = this.customTool.target === it.key ? "#4db8ff" : "#333";
			overlayCtx.fillRect(bx, by, 52, 20);
			overlayCtx.fillStyle = "#fff";
			overlayCtx.fillText(it.label, bx + 10, by + 14);
			this.customOverlayButtons.push({
				x: x0 + (bx - 10),
				y: y0 + (by - 10),
				w: 52,
				h: 20,
				action: () => {
					this.customTool.target = it.key;
					this.updateCustomToolIndicator("overlay");
				},
			});
		});
		colors.forEach((c, i) => {
			const bx = 16 + i * 32;
			const by = 46;
			overlayCtx.fillStyle = ["", "#000", "#fff", "#d44", "#36f"][c];
			overlayCtx.fillRect(bx, by, 24, 16);
			overlayCtx.strokeStyle = this.customColor === c ? "#4db8ff" : "#888";
			overlayCtx.lineWidth = 2;
			overlayCtx.strokeRect(bx, by, 24, 16);
			this.customOverlayButtons.push({
				x: x0 + (bx - 10),
				y: y0 + (by - 10),
				w: 24,
				h: 16,
				action: () => {
					this.customColor = c;
					this.updateCustomToolIndicator("overlay");
				},
			});
		});
		overlayCtx.fillStyle = "#ddd";
		overlayCtx.fillText("Tap: cycle / recolor   Hold: clear", 150, 58);
		overlayCtx.restore();
	}

	refreshCustomPuzzle(hitLabel) {
		document.getElementById("custom-puzzle-json").value = JSON.stringify(this.customEditorPuzzle, null, 2);
		this.loadPuzzle(structuredClone(this.customEditorPuzzle), this.getOptionsFromUI());
		this.updateCustomToolIndicator(hitLabel);
		if (!this.customMode) this.clearCustomOverlayCanvas();
	}

	clearCustomBoard() {
		this.customEditorPuzzle = this.createEmptyPuzzle(parseInt(this.sizeSelect.value), parseInt(this.sizeSelect.value));
		this.refreshCustomPuzzle("cleared");
	}

	applyCustomPuzzle() {
		try {
			const advancedJson = document.getElementById("custom-puzzle-json").value.trim();
			if (advancedJson) this.customEditorPuzzle = JSON.parse(advancedJson);
			if (!this.customEditorPuzzle) this.clearCustomBoard();
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
