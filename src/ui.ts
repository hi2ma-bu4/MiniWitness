import { CellType, Color, EdgeType, NodeType, SymmetryType, type CellConstraint, type Point, type PuzzleData, type ValidationResult } from "./types";

/**
 * UI表示設定
 */
export interface WitnessUIOptions {
	/** 線を引く操作モード */
	inputMode?: "drag" | "twoClick";
	/** グリッド周囲の余白 */
	gridPadding?: number;
	/** セル1辺のサイズ */
	cellSize?: number;
	/** 通常ノードの半径 */
	nodeRadius?: number;
	/** 開始ノードの半径 */
	startNodeRadius?: number;
	/** パスの太さ */
	pathWidth?: number;
	/** 出口の長さ */
	exitLength?: number;
	/** パズルのサイズに合わせてCanvasサイズを自動調整するか */
	autoResize?: boolean;
	/** 失敗時にマークを赤く点滅させるか */
	blinkMarksOnError?: boolean;
	/** 失敗時に引いた線（対称線含む）を残すか（falseの場合はフェードアウトする） */
	stayPathOnError?: boolean;
	/** パスが完了した際に自動的にバリデーションを実行するか (Workerモード時のみ有効) */
	autoValidate?: boolean;
	/** WebWorkerを使用して生成・検証を行うか */
	useWorker?: boolean;
	/** Workerスクリプトのパス (デフォルトは import.meta.url) */
	workerScript?: string;
	/** アニメーション設定 */
	animations?: {
		/** 点滅・前アニメーションの時間(ms) */
		blinkDuration: number;
		/** 無効化フェードの時間(ms) */
		fadeDuration: number;
		/** 点滅の周期(ms) */
		blinkPeriod: number;
	};
	/** 色設定 */
	colors?: {
		/** 通常のパスの色 */
		path?: string;
		/** エラー時の色 */
		error?: string;
		/** 成功時のフラッシュ/アニメーション用 */
		success?: string;
		/** 対称パスの色 */
		symmetry?: string;
		/** 途中で離した際のフェード色 */
		interrupted?: string;
		/** グリッドの色 */
		grid?: string;
		/** ノードの色 */
		node?: string;
		/** 六角形（通過必須）の色 */
		hexagon?: string;
		/** メイン線のみの六角形の色 */
		hexagonMain?: string;
		/** 対称線のみの六角形の色 */
		hexagonSymmetry?: string;
		/** 各色のカラーコードマップ */
		colorMap?: Record<number, string>;
		/** 各色のカラーコードリスト（インデックスがColor値に対応） */
		colorList?: string[];
	};
	/** パズル全体に掛けるカラーフィルター設定 */
	filter?: {
		/** フィルターを有効化するか */
		enabled?: boolean;
		/** カスタム単色か、RGB 3色プリセットか */
		mode?: "custom" | "rgb";
		/** customモード時に使用する色 */
		customColor?: string;
		/** rgbモード時の3色フィルター */
		rgbColors?: [string, string, string];
		/** rgbモード時に使用する色インデックス */
		rgbIndex?: 0 | 1 | 2;
		/** 白黒化のしきい値 (0-255) */
		threshold?: number;
	};
	/** 高解像度ディスプレイ(Retina等)に対応させるためのピクセル比。省略時はwindow.devicePixelRatioが使用されます。 */
	pixelRatio?: number;
}

/**
 * WitnessUIが発行するイベントのマップ
 */
export interface WitnessEventMap {
	/** 描画の直前 (コンテキストが渡される) */
	"render:before": { ctx: WitnessContext };
	/** 描画の直後 (コンテキストが渡される) */
	"render:after": { ctx: WitnessContext };
	/** パスの描き始め (グリッド座標) */
	"path:start": { x: number; y: number; startIndex: number };
	/** パスの移動中 (グリッド座標、パス全体、現在のマウス位置) */
	"path:move": { x: number; y: number; path: Point[]; currentMousePos: Point };
	/** パスの終了 (パス全体、出口に到達したか) */
	"path:end": { path: Point[]; isExit: boolean; startNode: { x: number; y: number; index: number } | null; endNode: { x: number; y: number; index: number } | null };
	/** パスが完了し、出口に到達した瞬間 */
	"path:complete": { path: Point[]; startNode: { x: number; y: number; index: number } | null; endNode: { x: number; y: number; index: number } | null };
	/** ゴール可能状態（先端がゴールの出っ張りに近い）の変化 */
	"goal:reachable": { reachable: boolean };
	/** ゴールに到達し、成功または失敗のアニメーションが開始された時 */
	"goal:reached": { path: Point[]; isValid: boolean; startNode: { x: number; y: number; index: number } | null; endNode: { x: number; y: number; index: number } | null };
	/** 無効化アニメーション（消しゴム等）が終了し、完全にバリデーション表示が完了した時 */
	"goal:validated": { result: ValidationResult };
	/** Workerで新しいパズルが生成された時 */
	"puzzle:generated": { puzzle: PuzzleData; genOptions: any };
	/** 新しいパズルがセットされた時 */
	"puzzle:created": { puzzle: PuzzleData };
}

export type WitnessEventName = keyof WitnessEventMap;

type WitnessContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type WitnessHitTarget = { kind: "node"; x: number; y: number } | { kind: "cell"; r: number; c: number } | { kind: "hEdge"; r: number; c: number } | { kind: "vEdge"; r: number; c: number };

/**
 * the witnessパズルの描画とユーザー操作を管理するクラス
 */
export class WitnessUI {
	private canvas: HTMLCanvasElement | OffscreenCanvas;
	private ctx: WitnessContext | null = null;
	private worker: Worker | null = null;
	private puzzle: PuzzleData | null = null;
	private options: Required<WitnessUIOptions>;
	private listeners: Map<string, Set<Function>> = new Map();

	private path: Point[] = [];
	private isDrawing = false;
	private currentMousePos: Point = { x: 0, y: 0 };
	private exitTipPos: Point | null = null;
	private isInvalidPath = false;
	private isValidPath = false;

	// アニメーション・状態表示用
	private invalidatedCells: Point[] = [];
	private invalidatedEdges: { type: "h" | "v"; r: number; c: number }[] = [];
	private invalidatedNodes: Point[] = [];
	private errorCells: Point[] = [];
	private errorEdges: { type: "h" | "v"; r: number; c: number }[] = [];
	private errorNodes: Point[] = [];
	private eraserAnimationStartTime = 0;
	private isFading = false;
	private fadeOpacity = 1.0;
	private fadeColor = "#ff4444";
	private fadingPath: Point[] = [];
	private fadingTipPos: Point | null = null;

	private isSuccessFading = false;
	private successFadeStartTime = 0;
	private startTime = Date.now();

	// 透過描画用のオフスクリーンCanvas
	private offscreenCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
	private offscreenCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
	private filterCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
	private filterCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

	private canvasRect: { left: number; top: number; width: number; height: number } | null = null;
	private isDestroyed = false;
	private animationFrameId: number | null = null;
	private timeoutId: any = null;

	// イベントハンドラの参照（解除用）
	private boundMouseDown: ((e: MouseEvent) => void) | null = null;
	private boundMouseMove: ((e: MouseEvent) => void) | null = null;
	private boundMouseUp: ((e: MouseEvent) => void) | null = null;
	private boundTouchStart: ((e: TouchEvent) => void) | null = null;
	private boundTouchMove: ((e: TouchEvent) => void) | null = null;
	private boundTouchEnd: ((e: TouchEvent) => void) | null = null;
	private boundUpdateRect: (() => void) | null = null;
	private isTwoClickDrawing = false;
	private activeStartNode: { x: number; y: number; index: number } | null = null;

	constructor(canvasOrId: HTMLCanvasElement | OffscreenCanvas | string, puzzle?: PuzzleData, options: WitnessUIOptions = {}) {
		if (typeof canvasOrId === "string") {
			if (typeof document === "undefined") {
				throw new Error("Cannot look up canvas by ID in a non-browser environment.");
			}
			const el = document.getElementById(canvasOrId);
			if (!(el instanceof HTMLCanvasElement)) {
				throw new Error(`Element with id "${canvasOrId}" is not a canvas.`);
			}
			this.canvas = el;
		} else {
			this.canvas = canvasOrId;
		}

		this.options = this.mergeOptions(options);

		// Workerを使用する場合の初期化
		if (this.options.useWorker && typeof window !== "undefined" && this.canvas instanceof HTMLCanvasElement && this.canvas.transferControlToOffscreen) {
			const script = this.options.workerScript ?? (import.meta as any).url;
			if (script) {
				this.worker = new Worker(script, { type: "module" });
				const offscreen = this.canvas.transferControlToOffscreen();
				const sanitizedOptions = this.sanitizeOptions(this.options);
				this.worker.postMessage(
					{
						type: "init",
						payload: {
							canvas: offscreen,
							options: sanitizedOptions,
						},
					},
					[offscreen],
				);

				this.worker.addEventListener("message", (e) => {
					const { type, payload } = e.data;
					if (type === "drawingStarted") {
						this.isDrawing = payload !== false; // payloadがfalseなら開始失敗
						if (!this.isDrawing) {
							this.isTwoClickDrawing = false;
							this.setTwoClickPointerUi(false);
						}
					} else if (type === "drawingEnded") {
						this.isDrawing = false;
						this.isTwoClickDrawing = false;
						this.setTwoClickPointerUi(false);
					} else if (type === "pathComplete") {
						const path = Array.isArray(payload?.path) ? payload.path : payload;
						this.emit("path:complete", { path, startNode: this.getStartNodeMetaFromPath(), endNode: this.getEndNodeMetaFromPath() });
					} else if (type === "puzzleCreated") {
						// Workerで生成されたパズルは自動的にUIへ反映する
						if (payload?.puzzle) {
							this.setPuzzle(payload.puzzle);
						}
						this.emit("puzzle:generated", payload);
					} else if (type === "validationResult") {
						this.emit("goal:validated", { result: payload });
					} else if (type === "uiEvent") {
						this.emit(payload.type, payload.data);
					}
				});
			}
		}

		if (!this.worker) {
			const context = (this.canvas as any).getContext("2d") as WitnessContext | null;
			if (!context) throw new Error("Could not get 2D context.");
			this.ctx = context;
			this.ctx.imageSmoothingEnabled = false;
			this.animate();
		}

		if (puzzle) {
			this.setPuzzle(puzzle);
		}

		this.initEvents();
	}

	/**
	 * デフォルトオプションとユーザー指定オプションをマージする
	 * @param options 指定されたオプション
	 * @returns マージ後の全オプション
	 */
	private mergeOptions(options: WitnessUIOptions): Required<WitnessUIOptions> {
		const animations = {
			blinkDuration: options.animations?.blinkDuration ?? this.options?.animations?.blinkDuration ?? 1000,
			fadeDuration: options.animations?.fadeDuration ?? this.options?.animations?.fadeDuration ?? 1000,
			blinkPeriod: options.animations?.blinkPeriod ?? this.options?.animations?.blinkPeriod ?? 800,
		};

		const colors = {
			path: options.colors?.path ?? this.options?.colors?.path ?? "#ffcc00",
			error: options.colors?.error ?? this.options?.colors?.error ?? "#ff4444",
			success: options.colors?.success ?? this.options?.colors?.success ?? "#ffcc00",
			symmetry: options.colors?.symmetry ?? this.options?.colors?.symmetry ?? "rgba(255, 255, 255, 0.5)",
			interrupted: options.colors?.interrupted ?? this.options?.colors?.interrupted ?? "#ffcc00",
			grid: options.colors?.grid ?? this.options?.colors?.grid ?? "#555",
			node: options.colors?.node ?? this.options?.colors?.node ?? "#555",
			hexagon: options.colors?.hexagon ?? this.options?.colors?.hexagon ?? "#000",
			hexagonMain: options.colors?.hexagonMain ?? this.options?.colors?.hexagonMain ?? "#00ffff",
			hexagonSymmetry: options.colors?.hexagonSymmetry ?? this.options?.colors?.hexagonSymmetry ?? "#ffff00",
			colorMap: options.colors?.colorMap ??
				this.options?.colors?.colorMap ?? {
					[Color.Black]: "#000",
					[Color.White]: "#fff",
					[Color.Red]: "#f00",
					[Color.Blue]: "#00f",
					[Color.None]: "#ffcc00",
				},
			colorList: options.colors?.colorList ?? this.options?.colors?.colorList,
		};

		return {
			inputMode: options.inputMode ?? this.options?.inputMode ?? "drag",
			gridPadding: options.gridPadding ?? this.options?.gridPadding ?? 60,
			cellSize: options.cellSize ?? this.options?.cellSize ?? 80,
			nodeRadius: options.nodeRadius ?? this.options?.nodeRadius ?? 6,
			startNodeRadius: options.startNodeRadius ?? this.options?.startNodeRadius ?? 22,
			pathWidth: options.pathWidth ?? this.options?.pathWidth ?? 18,
			exitLength: options.exitLength ?? this.options?.exitLength ?? 25,
			autoResize: options.autoResize ?? this.options?.autoResize ?? true,
			blinkMarksOnError: options.blinkMarksOnError ?? this.options?.blinkMarksOnError ?? true,
			stayPathOnError: options.stayPathOnError ?? this.options?.stayPathOnError ?? true,
			autoValidate: options.autoValidate ?? this.options?.autoValidate ?? false,
			useWorker: options.useWorker ?? this.options?.useWorker ?? false,
			workerScript: options.workerScript ?? this.options?.workerScript,
			animations,
			colors,
			filter: {
				enabled: options.filter?.enabled ?? this.options?.filter?.enabled ?? false,
				mode: options.filter?.mode ?? this.options?.filter?.mode ?? "custom",
				customColor: options.filter?.customColor ?? this.options?.filter?.customColor ?? "#ffffff",
				rgbColors: options.filter?.rgbColors ?? this.options?.filter?.rgbColors ?? ["#ff0000", "#00ff00", "#0000ff"],
				rgbIndex: options.filter?.rgbIndex ?? this.options?.filter?.rgbIndex ?? 0,
				threshold: options.filter?.threshold ?? this.options?.filter?.threshold ?? 128,
			},
			pixelRatio: options.pixelRatio ?? this.options?.pixelRatio ?? (typeof window !== "undefined" ? window.devicePixelRatio : 1),
		};
	}

	/**
	 * パズルデータを設定し、再描画する
	 */
	public setPuzzle(puzzle: PuzzleData) {
		if (this.worker) {
			this.puzzle = puzzle;
			if (this.options.autoResize) {
				this.resizeCanvas();
			}
			this.worker.postMessage({ type: "setPuzzle", payload: { puzzle } });
			this.emit("puzzle:created", { puzzle });
			return;
		}

		this.puzzle = puzzle;
		this.path = [];
		this.isDrawing = false;
		this.exitTipPos = null;
		this.isInvalidPath = false;
		this.isValidPath = false;
		this.invalidatedCells = [];
		this.invalidatedEdges = [];
		this.invalidatedNodes = [];
		this.errorCells = [];
		this.errorEdges = [];
		this.errorNodes = [];
		this.activeStartNode = null;
		this.cancelFade();

		if (this.options.autoResize) {
			this.resizeCanvas();
		}
		this.draw();
		this.emit("puzzle:created", { puzzle });
	}

	/**
	 * 外部からパス（解答経路）を強制的に設定する
	 * @param path 経路の点配列
	 */
	public setPath(path: Point[]) {
		if (this.worker) {
			this.worker.postMessage({ type: "setPath", payload: { path } });
			return;
		}

		this.cancelFade();
		this.isInvalidPath = false;
		this.isValidPath = false;
		this.isSuccessFading = false;

		if (path.length > 0) {
			this.path = [...path];
			const lastPoint = this.path[this.path.length - 1];
			const lastPos = this.getCanvasCoords(lastPoint.x, lastPoint.y);
			const exitDir = this.getExitDir(lastPoint.x, lastPoint.y);

			if (exitDir) {
				this.exitTipPos = {
					x: lastPos.x + exitDir.x * this.options.exitLength,
					y: lastPos.y + exitDir.y * this.options.exitLength,
				};
			} else {
				this.exitTipPos = null;
			}
			this.currentMousePos = lastPos;
		} else {
			this.path = [];
			this.exitTipPos = null;
		}

		this.draw();
	}

	/**
	 * 表示オプションを更新する
	 */
	public setOptions(options: WitnessUIOptions) {
		const prevInputMode = this.options.inputMode;
		this.options = this.mergeOptions({ ...this.options, ...options });

		if (prevInputMode !== this.options.inputMode && this.options.inputMode !== "twoClick") {
			this.isTwoClickDrawing = false;
			this.setTwoClickPointerUi(false);
		}
		if (this.worker) {
			if (this.options.autoResize && this.puzzle) {
				this.resizeCanvas();
			}
			const sanitizedOptions = this.sanitizeOptions(options);
			this.worker.postMessage({ type: "setOptions", payload: sanitizedOptions });
			return;
		}
		if (this.options.autoResize && this.puzzle) {
			this.resizeCanvas();
		}
		this.draw();
	}

	// --- Event Emitter ---

	/**
	 * イベントリスナーを追加する
	 */
	public addEventListener<K extends WitnessEventName>(type: K, listener: (data: WitnessEventMap[K]) => void) {
		if (!this.listeners.has(type)) {
			this.listeners.set(type, new Set());
		}
		this.listeners.get(type)!.add(listener);
	}

	/**
	 * イベントリスナーを削除する
	 */
	public removeEventListener<K extends WitnessEventName>(type: K, listener: (data: WitnessEventMap[K]) => void) {
		const set = this.listeners.get(type);
		if (set) {
			set.delete(listener);
		}
	}

	/**
	 * イベントリスナーを追加する (エイリアス)
	 */
	public on<K extends WitnessEventName>(type: K, listener: (data: WitnessEventMap[K]) => void) {
		this.addEventListener(type, listener);
		return this;
	}

	/**
	 * イベントリスナーを削除する (エイリアス)
	 */
	public off<K extends WitnessEventName>(type: K, listener: (data: WitnessEventMap[K]) => void) {
		this.removeEventListener(type, listener);
		return this;
	}

	/**
	 * 内部イベントを発行する
	 */
	private emit<K extends WitnessEventName>(type: K, data: WitnessEventMap[K]) {
		const set = this.listeners.get(type);
		if (set) {
			set.forEach((l) => l(data));
		}

		// Workerモードで、自身がWorker内で動作している場合、メインスレッドにイベントを転送する
		if (typeof self !== "undefined" && (self as any).postMessage && !this.worker) {
			const isOffscreen = typeof OffscreenCanvas !== "undefined" && this.canvas instanceof OffscreenCanvas;
			if (isOffscreen) {
				// 以下のイベントは個別のメッセージ(pathComplete等)でも送信されるため、
				// 二重発行を防ぐためにuiEventとしては送信しない
				const redundantEvents = ["path:complete", "puzzle:created", "goal:validated"];
				if (!redundantEvents.includes(type)) {
					try {
						const serializableData = type === "render:before" || type === "render:after" ? { phase: type } : data;
						(self as any).postMessage({ type: "uiEvent", payload: { type, data: serializableData } });
					} catch (e) {
						// シリアライズ不可なデータが含まれていた場合は無視
					}
				}
			}
		}
	}

	/**
	 * 検証結果を反映させる（不正解時の赤点滅や、消しゴムによる無効化の表示）
	 */
	public setValidationResult(isValid: boolean, invalidatedCells: Point[] = [], invalidatedEdges: { type: "h" | "v"; r: number; c: number }[] = [], errorCells: Point[] = [], errorEdges: { type: "h" | "v"; r: number; c: number }[] = [], invalidatedNodes: Point[] = [], errorNodes: Point[] = []) {
		if (this.worker) {
			this.worker.postMessage({
				type: "setValidationResult",
				payload: { isValid, invalidatedCells, invalidatedEdges, errorCells, errorEdges, invalidatedNodes, errorNodes },
			});
			return;
		}

		this.invalidatedCells = invalidatedCells;
		this.invalidatedEdges = invalidatedEdges;
		this.invalidatedNodes = invalidatedNodes;
		this.errorCells = errorCells;
		this.errorEdges = errorEdges;
		this.errorNodes = errorNodes;
		this.eraserAnimationStartTime = Date.now();

		if (isValid) {
			this.isValidPath = true;
			this.isSuccessFading = true;
			this.successFadeStartTime = Date.now();
		} else {
			this.isInvalidPath = true;
			// 失敗時のフェードアウト設定が有効な場合、アニメーション（点滅）待ちの後に startFade が呼ばれるようにする
		}

		this.emit("goal:reached", { path: this.path, isValid, startNode: this.getStartNodeMetaFromPath(), endNode: this.getEndNodeMetaFromPath() });
	}

	/**
	 * パズルのサイズに合わせてCanvasの物理サイズを調整する
	 */
	private resizeCanvas() {
		if (!this.puzzle || !this.canvas) return;
		const w = this.puzzle.cols * this.options.cellSize + this.options.gridPadding * 2;
		const h = this.puzzle.rows * this.options.cellSize + this.options.gridPadding * 2;

		const dpr = this.options.pixelRatio;

		if (typeof HTMLCanvasElement !== "undefined" && this.canvas instanceof HTMLCanvasElement) {
			try {
				this.canvas.width = w * dpr;
				this.canvas.height = h * dpr;
			} catch (e) {
				// InvalidStateError occurs after transferControlToOffscreen()
			}
		} else {
			this.canvas.width = w * dpr;
			this.canvas.height = h * dpr;
		}

		// サイズ変更後に矩形情報を再計算してWorkerに通知
		if (this.worker && this.boundUpdateRect) {
			this.boundUpdateRect();
		}
	}

	/**
	 * Canvasの表示上の矩形情報を設定する（Worker時などに必要）
	 */
	public setCanvasRect(rect: { left: number; top: number; width: number; height: number }) {
		// DOMRect等の場合、シリアライズできない可能性があるためプレーンなオブジェクトに変換
		const plainRect = {
			left: rect.left,
			top: rect.top,
			width: rect.width,
			height: rect.height,
		};
		this.canvasRect = plainRect;
		if (this.worker) {
			this.worker.postMessage({ type: "setCanvasRect", payload: plainRect });
		}
	}

	/**
	 * Workerにパズル生成を依頼する (Workerモード時のみ有効)
	 */
	public createPuzzle(rows: number, cols: number, genOptions: any) {
		if (this.worker) {
			this.worker.postMessage({ type: "createPuzzle", payload: { rows, cols, genOptions } });
		}
	}

	private setTwoClickPointerUi(active: boolean) {
		if (typeof HTMLCanvasElement === "undefined" || !(this.canvas instanceof HTMLCanvasElement)) return;
		if (typeof document === "undefined") return;

		if (active) {
			this.canvas.style.cursor = "none";
			this.canvas.requestPointerLock?.();
		} else {
			if (document.pointerLockElement === this.canvas) {
				document.exitPointerLock?.();
			}
			this.canvas.style.cursor = "";
		}
	}

	/**
	 * マウス・タッチイベントを初期化する
	 */
	private initEvents() {
		if (typeof window === "undefined" || typeof HTMLCanvasElement === "undefined" || !(this.canvas instanceof HTMLCanvasElement)) return;

		this.boundMouseDown = (e: MouseEvent) => {
			const consumed = this.options.inputMode === "twoClick" && this.isDrawing ? this.handleEnd(e, "mouse") : this.handleStart(e, "mouse");
			if (consumed) {
				if (e.cancelable) e.preventDefault();
			}
		};
		this.boundMouseMove = (e: MouseEvent) => {
			if (this.isDrawing) {
				if (e.cancelable) e.preventDefault();
			}
			this.handleMove(e);
		};
		this.boundMouseUp = (e: MouseEvent) => {
			if (this.options.inputMode !== "twoClick" && this.isDrawing) {
				if (e.cancelable) e.preventDefault();
				this.handleEnd(e, "mouse");
			}
		};

		this.boundTouchStart = (e: TouchEvent) => {
			if (this.handleStart(e.touches[0], "touch")) {
				if (e.cancelable) e.preventDefault();
			}
		};
		this.boundTouchMove = (e: TouchEvent) => {
			if (this.isDrawing) {
				if (e.cancelable) e.preventDefault();
				this.handleMove(e.touches[0]);
			}
		};
		this.boundTouchEnd = (e: TouchEvent) => {
			if (this.options.inputMode !== "twoClick" && this.isDrawing) {
				if (e.cancelable) e.preventDefault();
				this.handleEnd(e.changedTouches[0], "touch");
			}
		};

		this.canvas.addEventListener("mousedown", this.boundMouseDown);
		window.addEventListener("mousemove", this.boundMouseMove, { passive: false });
		window.addEventListener("mouseup", this.boundMouseUp, { passive: false });

		this.canvas.addEventListener("touchstart", this.boundTouchStart, { passive: false });
		window.addEventListener("touchmove", this.boundTouchMove, { passive: false });
		window.addEventListener("touchend", this.boundTouchEnd, { passive: false });

		if (this.worker) {
			this.boundUpdateRect = () => {
				if (this.canvas instanceof HTMLCanvasElement) {
					const rect = this.canvas.getBoundingClientRect();
					this.setCanvasRect(rect);
				}
			};
			window.addEventListener("resize", this.boundUpdateRect);
			window.addEventListener("scroll", this.boundUpdateRect);
			this.boundUpdateRect();
		}
	}

	/**
	 * イベントリスナーを解除し、リソースを解放する
	 */
	public destroy() {
		this.isDestroyed = true;
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
		}

		if (this.animationFrameId !== null && typeof cancelAnimationFrame !== "undefined") {
			cancelAnimationFrame(this.animationFrameId);
		}
		if (this.timeoutId !== null) {
			clearTimeout(this.timeoutId);
		}

		if (typeof window === "undefined" || typeof HTMLCanvasElement === "undefined" || !(this.canvas instanceof HTMLCanvasElement)) return;

		if (this.boundMouseDown) this.canvas.removeEventListener("mousedown", this.boundMouseDown);
		if (this.boundMouseMove) window.removeEventListener("mousemove", this.boundMouseMove);
		if (this.boundMouseUp) window.removeEventListener("mouseup", this.boundMouseUp);

		if (this.boundTouchStart) this.canvas.removeEventListener("touchstart", this.boundTouchStart);
		if (this.boundTouchMove) window.removeEventListener("touchmove", this.boundTouchMove);
		if (this.boundTouchEnd) window.removeEventListener("touchend", this.boundTouchEnd);

		if (this.boundUpdateRect) {
			window.removeEventListener("resize", this.boundUpdateRect);
			window.removeEventListener("scroll", this.boundUpdateRect);
		}

		this.boundMouseDown = null;
		this.boundMouseMove = null;
		this.boundMouseUp = null;
		this.boundTouchStart = null;
		this.boundTouchMove = null;
		this.boundTouchEnd = null;

		this.setTwoClickPointerUi(false);
	}

	// --- 座標変換 ---

	/**
	 * グリッド座標をCanvas上のピクセル座標に変換する
	 * @param gridX グリッドX
	 * @param gridY グリッドY
	 * @returns Canvas座標
	 */
	private getCanvasCoords(gridX: number, gridY: number): Point {
		return {
			x: this.options.gridPadding + gridX * this.options.cellSize,
			y: this.options.gridPadding + gridY * this.options.cellSize,
		};
	}

	/**
	 * 画面座標をCanvas上の論理座標に変換する
	 */
	private toCanvasPoint(clientX: number, clientY: number): Point {
		const dpr = this.options.pixelRatio;
		const rect = this.canvasRect || (typeof HTMLCanvasElement !== "undefined" && this.canvas instanceof HTMLCanvasElement ? this.canvas.getBoundingClientRect() : { left: 0, top: 0, width: this.canvas.width / dpr, height: this.canvas.height / dpr });
		return {
			x: (clientX - rect.left) * (this.canvas.width / dpr / rect.width),
			y: (clientY - rect.top) * (this.canvas.height / dpr / rect.height),
		};
	}

	/**
	 * 入力座標がノード/エッジ/セルのどこに当たっているか判定する
	 */
	public hitTestInput(clientX: number, clientY: number): WitnessHitTarget | null {
		if (!this.puzzle) return null;
		const p = this.toCanvasPoint(clientX, clientY);
		const gx = (p.x - this.options.gridPadding) / this.options.cellSize;
		const gy = (p.y - this.options.gridPadding) / this.options.cellSize;
		const nearX = Math.round(gx);
		const nearY = Math.round(gy);
		const dx = Math.abs(gx - nearX);
		const dy = Math.abs(gy - nearY);
		const nodeThreshold = 0.15;
		const edgeThreshold = 0.1;

		if (dx <= nodeThreshold && dy <= nodeThreshold) {
			if (nearX >= 0 && nearX <= this.puzzle.cols && nearY >= 0 && nearY <= this.puzzle.rows) return { kind: "node", x: nearX, y: nearY };
			return null;
		}

		if (dy <= edgeThreshold && gx >= 0 && gx <= this.puzzle.cols && nearY >= 0 && nearY <= this.puzzle.rows) {
			const c = Math.floor(gx);
			if (c >= 0 && c < this.puzzle.cols) return { kind: "hEdge", r: nearY, c };
		}
		if (dx <= edgeThreshold && gy >= 0 && gy <= this.puzzle.rows && nearX >= 0 && nearX <= this.puzzle.cols) {
			const r = Math.floor(gy);
			if (r >= 0 && r < this.puzzle.rows) return { kind: "vEdge", r, c: nearX };
		}

		const c = Math.floor(gx);
		const r = Math.floor(gy);
		if (c >= 0 && c < this.puzzle.cols && r >= 0 && r < this.puzzle.rows) return { kind: "cell", r, c };
		return null;
	}

	/**
	 * 指定されたノードが出口の場合、その出っ張りの方向ベクトルを返す
	 * @param x グリッドX
	 * @param y グリッドY
	 * @returns 方向ベクトル、またはnull
	 */
	private getExitDir(x: number, y: number): Point | null {
		if (!this.puzzle) return null;
		if (this.puzzle.nodes[y]?.[x]?.type !== NodeType.End) return null;

		const { cols, rows } = this.puzzle;
		const isLeft = x === 0;
		const isRight = x === cols;
		const isTop = y === 0;
		const isBottom = y === rows;

		// 外周チェック
		if (!isLeft && !isRight && !isTop && !isBottom) return null;

		// 角のチェック
		const isCorner = (isLeft || isRight) && (isTop || isBottom);
		if (isCorner) {
			if (cols >= rows) {
				return isLeft ? { x: -1, y: 0 } : { x: 1, y: 0 };
			} else {
				return isTop ? { x: 0, y: -1 } : { x: 0, y: 1 };
			}
		}

		if (isLeft) return { x: -1, y: 0 };
		if (isRight) return { x: 1, y: 0 };
		if (isTop) return { x: 0, y: -1 };
		if (isBottom) return { x: 0, y: 1 };

		return null;
	}

	// --- イベントハンドラ ---

	public handleStart(e: { clientX: number; clientY: number }, source: "mouse" | "touch" = "mouse"): boolean {
		if (this.options.inputMode === "twoClick" && source !== "mouse") {
			return false;
		}
		const shouldStartDrawing = this.isStartNodeHit(e);

		if (this.worker) {
			if (!shouldStartDrawing) {
				this.isDrawing = false;
				return false;
			}

			this.isDrawing = true; // 先行してフラグを立てる
			this.isTwoClickDrawing = this.options.inputMode === "twoClick";
			if (this.isTwoClickDrawing) {
				this.setTwoClickPointerUi(true);
			}
			this.worker.postMessage({ type: "event", payload: { eventType: "mousedown", eventData: { clientX: e.clientX, clientY: e.clientY } } });
			return true;
		}
		if (!shouldStartDrawing) return false;

		// スタート地点がクリックされた場合のみ、前回の状態をリセットして開始する
		this.cancelFade();
		this.isSuccessFading = false;
		this.isInvalidPath = false;
		this.isValidPath = false;
		this.invalidatedCells = [];
		this.invalidatedEdges = [];
		this.invalidatedNodes = [];
		this.errorCells = [];
		this.errorEdges = [];
		this.errorNodes = [];

		this.isDrawing = true;
		this.isTwoClickDrawing = this.options.inputMode === "twoClick";
		this.path = [{ x: shouldStartDrawing.x, y: shouldStartDrawing.y }];
		this.currentMousePos = this.getCanvasCoords(shouldStartDrawing.x, shouldStartDrawing.y);
		this.exitTipPos = null;

		if (this.isTwoClickDrawing) {
			this.setTwoClickPointerUi(true);
		}

		this.draw();
		this.activeStartNode = { ...shouldStartDrawing, index: this.getNodeIndexByType(NodeType.Start, shouldStartDrawing.x, shouldStartDrawing.y) };
		this.emit("path:start", { x: shouldStartDrawing.x, y: shouldStartDrawing.y, startIndex: this.activeStartNode.index });
		return true;
	}

	private isStartNodeHit(e: { clientX: number; clientY: number }): Point | null {
		if (!this.puzzle) return null;

		const canvasPoint = this.toCanvasPoint(e.clientX, e.clientY);
		const mouseX = canvasPoint.x;
		const mouseY = canvasPoint.y;

		for (let r = 0; r <= this.puzzle.rows; r++) {
			for (let c = 0; c <= this.puzzle.cols; c++) {
				if (this.puzzle.nodes[r][c].type !== NodeType.Start) continue;
				const nodePos = this.getCanvasCoords(c, r);
				if (Math.hypot(nodePos.x - mouseX, nodePos.y - mouseY) < this.options.startNodeRadius) {
					return { x: c, y: r };
				}
			}
		}
		return null;
	}

	public handleMove(e: { clientX: number; clientY: number; movementX?: number; movementY?: number; pointerLocked?: boolean }) {
		if (this.worker) {
			if (this.isDrawing) {
				this.worker.postMessage({
					type: "event",
					payload: {
						eventType: "mousemove",
						eventData: {
							clientX: e.clientX,
							clientY: e.clientY,
							movementX: (e as MouseEvent).movementX,
							movementY: (e as MouseEvent).movementY,
							pointerLocked: typeof document !== "undefined" && typeof HTMLCanvasElement !== "undefined" && this.canvas instanceof HTMLCanvasElement && document.pointerLockElement === this.canvas,
						},
					},
				});
			}
			return;
		}
		if (!this.puzzle || !this.isDrawing) return;

		const dpr = this.options.pixelRatio;
		const rect = this.canvasRect || (typeof HTMLCanvasElement !== "undefined" && this.canvas instanceof HTMLCanvasElement ? this.canvas.getBoundingClientRect() : { left: 0, top: 0, width: this.canvas.width / dpr, height: this.canvas.height / dpr });
		const canvasPoint = this.toCanvasPoint(e.clientX, e.clientY);
		let mouseX = canvasPoint.x;
		let mouseY = canvasPoint.y;

		const isPointerLocked = e.pointerLocked === true || (this.isTwoClickDrawing && typeof document !== "undefined" && typeof HTMLCanvasElement !== "undefined" && this.canvas instanceof HTMLCanvasElement && document.pointerLockElement === this.canvas);

		if (this.isTwoClickDrawing && isPointerLocked) {
			const scaleX = this.canvas.width / dpr / rect.width;
			const scaleY = this.canvas.height / dpr / rect.height;
			mouseX = this.currentMousePos.x + (e.movementX ?? 0) * scaleX;
			mouseY = this.currentMousePos.y + (e.movementY ?? 0) * scaleY;
		}

		const lastPoint = this.path[this.path.length - 1];
		const lastPos = this.getCanvasCoords(lastPoint.x, lastPoint.y);

		const dx = mouseX - lastPos.x;
		const dy = mouseY - lastPos.y;

		const symmetry = this.puzzle.symmetry || SymmetryType.None;

		const exitDir = this.getExitDir(lastPoint.x, lastPoint.y);
		const intendedDir = Math.abs(dx) > Math.abs(dy) ? { x: dx > 0 ? 1 : -1, y: 0 } : { x: 0, y: dy > 0 ? 1 : -1 };

		// ゴールの出っ張り方向への移動
		if (exitDir && intendedDir.x === exitDir.x && intendedDir.y === exitDir.y) {
			const dot = dx * exitDir.x + dy * exitDir.y;
			const length = Math.max(0, Math.min(dot, this.options.exitLength));
			this.currentMousePos = {
				x: lastPos.x + exitDir.x * length,
				y: lastPos.y + exitDir.y * length,
			};
			this.draw();
			return;
		}

		const tryMoveTo = (target: Point, d: number) => {
			const edgeType = this.getEdgeType(lastPoint, target);
			if (target.x < 0 || target.x > this.puzzle!.cols || target.y < 0 || target.y > this.puzzle!.rows || edgeType === EdgeType.Absent) {
				this.currentMousePos = lastPos;
				return;
			}

			let maxMove = edgeType === EdgeType.Broken ? this.options.cellSize * 0.35 : this.options.cellSize;
			const antiClipDistance = Math.max(0, this.options.cellSize - this.options.pathWidth - 1);
			const antiClipDistanceForBothTips = Math.max(0, antiClipDistance / 2);
			const getStartNodeExtraPadding = (p: Point, start: Point): number => {
				if (p.x !== start.x || p.y !== start.y) return 0;
				return Math.max(0, this.options.startNodeRadius - this.options.pathWidth / 2);
			};

			// 自己衝突チェック（メインパスのエッジ）
			const targetEdgeKey = this.getEdgeKey(lastPoint, target);
			const isBacktracking = this.path.length >= 2 && target.x === this.path[this.path.length - 2].x && target.y === this.path[this.path.length - 2].y;

			if (!isBacktracking) {
				for (let i = 0; i < this.path.length - 1; i++) {
					if (this.getEdgeKey(this.path[i], this.path[i + 1]) === targetEdgeKey) {
						// 既に使用中のエッジに向かう場合は、即座にブロック（戻る動作は別途 handleMove で snap 処理される）
						maxMove = 0;
						break;
					}
				}
			}

			// 自己衝突チェック（メインパスのノード）
			const isTargetInPath = this.path.some((p) => p.x === target.x && p.y === target.y);
			if (isTargetInPath && this.path.length >= 2) {
				const secondToLast = this.path[this.path.length - 2];
				if (target.x !== secondToLast.x || target.y !== secondToLast.y) {
					const mainStart = this.path[0];
					const extraPadding = getStartNodeExtraPadding(target, mainStart);
					maxMove = Math.min(maxMove, Math.max(0, antiClipDistance - extraPadding));
				}
			}

			if (symmetry !== SymmetryType.None) {
				const symLast = this.getSymmetricalPoint(lastPoint);
				const symTarget = this.getSymmetricalPoint(target);
				const symEdgeType = this.getEdgeType(symLast, symTarget);
				const symPath = this.getSymmetryPath(this.path);
				const symEdgeKey = this.getEdgeKey(symLast, symTarget);
				const mainStart = this.path[0];
				const symStart = symPath[0];

				if (symTarget.x < 0 || symTarget.x > this.puzzle!.cols || symTarget.y < 0 || symTarget.y > this.puzzle!.rows || symEdgeType === EdgeType.Absent) {
					this.currentMousePos = lastPos;
					return;
				}

				if (symEdgeType === EdgeType.Broken) {
					maxMove = Math.min(maxMove, this.options.cellSize * 0.35);
				}

				// 対称パスとの衝突チェック
				const isNodeOccupiedBySym = symPath.some((p) => p.x === target.x && p.y === target.y);
				const isSymNodeOccupiedByMain = this.path.some((p) => p.x === symTarget.x && p.y === symTarget.y);
				const isMeetingAtNode = target.x === symTarget.x && target.y === symTarget.y;
				const isEdgeOccupiedBySym = symPath.some((p, i) => i < symPath.length - 1 && this.getEdgeKey(symPath[i], symPath[i + 1]) === targetEdgeKey);
				const isMirrorEdgeOccupiedByMain = this.path.some((p, i) => i < this.path.length - 1 && this.getEdgeKey(this.path[i], this.path[i + 1]) === symEdgeKey);
				const isSelfMirrorEdge = targetEdgeKey === symEdgeKey;

				if (isNodeOccupiedBySym || isEdgeOccupiedBySym) {
					const extraPadding = getStartNodeExtraPadding(target, symStart);
					maxMove = Math.min(maxMove, Math.max(0, antiClipDistance - extraPadding));
				}

				if (isSymNodeOccupiedByMain || isMirrorEdgeOccupiedByMain) {
					const extraPadding = getStartNodeExtraPadding(symTarget, mainStart);
					maxMove = Math.min(maxMove, Math.max(0, antiClipDistance - extraPadding));
				}

				// 対称先端どうしが互いに近づくケースでは、両先端の合計移動量で判定する必要がある
				if (isSelfMirrorEdge) {
					maxMove = Math.min(maxMove, antiClipDistanceForBothTips);
				}

				// 対称の中央ノードに向かい合って進むケース（偶数盤面）は、通常のめり込み防止距離まで許可する
				if (isMeetingAtNode) {
					maxMove = Math.min(maxMove, maxMove - (maxMove - antiClipDistance) / 2);
				}
			}
			if (target.x !== lastPoint.x) {
				this.currentMousePos = {
					x: lastPos.x + Math.max(-maxMove, Math.min(maxMove, d)),
					y: lastPos.y,
				};
			} else {
				this.currentMousePos = {
					x: lastPos.x,
					y: lastPos.y + Math.max(-maxMove, Math.min(maxMove, d)),
				};
			}
		};

		if (Math.abs(dx) > Math.abs(dy)) {
			const dir = dx > 0 ? 1 : -1;
			tryMoveTo({ x: lastPoint.x + dir, y: lastPoint.y }, dx);
		} else {
			const dir = dy > 0 ? 1 : -1;
			tryMoveTo({ x: lastPoint.x, y: lastPoint.y + dir }, dy);
		}

		const neighbors = [
			{ x: lastPoint.x + 1, y: lastPoint.y },
			{ x: lastPoint.x - 1, y: lastPoint.y },
			{ x: lastPoint.x, y: lastPoint.y + 1 },
			{ x: lastPoint.x, y: lastPoint.y - 1 },
		];

		const symPath = this.getSymmetryPath(this.path);

		for (const n of neighbors) {
			if (n.x >= 0 && n.x <= this.puzzle.cols && n.y >= 0 && n.y <= this.puzzle.rows) {
				const nPos = this.getCanvasCoords(n.x, n.y);
				const dist = Math.hypot(nPos.x - this.currentMousePos.x, nPos.y - this.currentMousePos.y);

				if (dist < this.options.cellSize * 0.3) {
					const idx = this.path.findIndex((p) => p.x === n.x && p.y === n.y);
					if (idx === -1) {
						// 衝突チェック
						if (symmetry !== SymmetryType.None) {
							const sn = this.getSymmetricalPoint(n);
							// ノード自体が対称点の場合
							if (n.x === sn.x && n.y === sn.y) continue;
							// 他の線への衝突チェック
							if (this.path.some((p) => p.x === sn.x && p.y === sn.y)) continue;
							if (symPath.some((p) => p.x === n.x && p.y === n.y)) continue;
							// エッジの衝突チェック
							const edgeKey = this.getEdgeKey(lastPoint, n);
							const symEdgeKey = this.getEdgeKey(this.getSymmetricalPoint(lastPoint), sn);
							if (edgeKey === symEdgeKey) continue;
						}
						this.path.push(n);
						this.emit("path:move", { x: n.x, y: n.y, path: this.path, currentMousePos: this.currentMousePos });
					} else if (idx === this.path.length - 2) {
						const popped = this.path.pop();
						if (popped) {
							this.emit("path:move", { x: popped.x, y: popped.y, path: this.path, currentMousePos: this.currentMousePos });
						}
					}
				}
			}
		}

		this.draw();
	}

	public handleEnd(e: { clientX: number; clientY: number }, source: "mouse" | "touch" = "mouse"): boolean {
		if (this.options.inputMode === "twoClick" && source !== "mouse") {
			return false;
		}

		if (this.worker) {
			if (this.isDrawing) {
				this.isDrawing = false;
				this.isTwoClickDrawing = false;
				this.setTwoClickPointerUi(false);
				this.worker.postMessage({ type: "event", payload: { eventType: "mouseup", eventData: { clientX: e.clientX, clientY: e.clientY } } });
			}
			return true;
		}
		if (!this.puzzle || !this.isDrawing) return false;
		this.isDrawing = false;
		this.isTwoClickDrawing = false;
		this.setTwoClickPointerUi(false);

		const lastPoint = this.path[this.path.length - 1];
		const lastPos = this.getCanvasCoords(lastPoint.x, lastPoint.y);
		const exitDir = this.getExitDir(lastPoint.x, lastPoint.y);

		const startNode = this.getStartNodeMetaFromPath();
		const endNode = this.getEndNodeMetaFromPath();
		if (exitDir) {
			const dx_exit = this.currentMousePos.x - lastPos.x;
			const dy_exit = this.currentMousePos.y - lastPos.y;
			const dot = dx_exit * exitDir.x + dy_exit * exitDir.y;

			if (dot > 0) {
				// 出っ張りの範囲に入っていれば、最後まで伸ばしてゴールとする
				this.exitTipPos = {
					x: lastPos.x + exitDir.x * this.options.exitLength,
					y: lastPos.y + exitDir.y * this.options.exitLength,
				};
				this.emit("path:complete", { path: this.path, startNode, endNode });
				this.emit("path:end", { path: this.path, isExit: true, startNode, endNode });
				return true;
			}
		}

		// キャンセル時も現在の先端位置を保持し、フェード開始前にノードへ縮まないようにする
		this.exitTipPos = { ...this.currentMousePos };
		this.emit("path:end", { path: this.path, isExit: false, startNode, endNode: null });
		this.startFade(this.options.colors.interrupted); // 途中で離した場合は指定されたフェード色で消える
		return true;
	}

	private getNodeIndexByType(type: NodeType.Start | NodeType.End, x: number, y: number): number {
		if (!this.puzzle) return -1;
		let index = 0;
		for (let r = 0; r <= this.puzzle.rows; r++) {
			for (let c = 0; c <= this.puzzle.cols; c++) {
				if (this.puzzle.nodes[r][c].type === type) {
					if (c === x && r === y) {
						return index;
					}
					index++;
				}
			}
		}
		return -1;
	}

	private getStartNodeMetaFromPath(): { x: number; y: number; index: number } | null {
		if (this.activeStartNode) return this.activeStartNode;
		if (!this.path.length) return null;
		const start = this.path[0];
		return { x: start.x, y: start.y, index: this.getNodeIndexByType(NodeType.Start, start.x, start.y) };
	}

	private getEndNodeMetaFromPath(): { x: number; y: number; index: number } | null {
		if (!this.path.length) return null;
		const end = this.path[this.path.length - 1];
		if (!this.puzzle || this.puzzle.nodes[end.y]?.[end.x]?.type !== NodeType.End) return null;
		return { x: end.x, y: end.y, index: this.getNodeIndexByType(NodeType.End, end.x, end.y) };
	}

	/**
	 * 二点間のエッジタイプを取得する
	 * @param p1 点1
	 * @param p2 点2
	 * @returns エッジタイプ
	 */
	private getEdgeType(p1: Point, p2: Point): EdgeType {
		if (!this.puzzle) return EdgeType.Absent;
		if (p1.x === p2.x) {
			const y = Math.min(p1.y, p2.y);
			if (y < 0 || y >= this.puzzle.rows) return EdgeType.Absent;
			return this.puzzle.vEdges[y][p1.x].type;
		} else {
			const x = Math.min(p1.x, p2.x);
			if (x < 0 || x >= this.puzzle.cols) return EdgeType.Absent;
			return this.puzzle.hEdges[p1.y][x].type;
		}
	}

	/**
	 * パスのフェードアウトアニメーションを開始する
	 * @param color フェード時の色
	 */
	private startFade(color = "#ff4444") {
		this.isFading = true;
		this.fadeOpacity = 1.0;
		this.fadeColor = color;
		this.fadingPath = [...this.path];
		this.fadingTipPos = this.exitTipPos ? { ...this.exitTipPos } : null;
		this.path = [];
	}

	/**
	 * 現在のフェードアニメーションを中止する
	 */
	private cancelFade() {
		this.isFading = false;
	}

	/**
	 * アニメーションループ
	 */
	private animate() {
		if (this.isDestroyed) return;
		const now = Date.now();

		if (this.isFading) {
			// フェード速度を fadeDuration に基づいて計算
			const step = 1000 / (this.options.animations.fadeDuration * 60); // 60FPS想定
			this.fadeOpacity -= step;
			if (this.fadeOpacity <= 0) {
				this.isFading = false;
				this.fadeOpacity = 0;
				if (this.isInvalidPath) {
					this.isInvalidPath = false;
					this.emit("goal:validated", { result: { isValid: false } as any });
				}
			}
		}

		if (this.isSuccessFading) {
			const elapsed = now - this.successFadeStartTime;
			if (elapsed > this.options.animations.blinkDuration + this.options.animations.fadeDuration) {
				this.isSuccessFading = false;
				this.emit("goal:validated", { result: { isValid: true } as any });
			}
		}

		// 失敗時かつフェード設定ありの場合、即座にフェードアウトを開始する
		if (this.isInvalidPath && !this.options.stayPathOnError && !this.isFading && this.path.length > 0) {
			this.startFade(this.options.colors.error);
		}

		this.draw();

		if (typeof requestAnimationFrame !== "undefined") {
			this.animationFrameId = requestAnimationFrame(() => this.animate());
		} else {
			this.timeoutId = setTimeout(() => this.animate(), 1000 / 60);
			if (this.timeoutId && (this.timeoutId as any).unref) {
				(this.timeoutId as any).unref();
			}
		}
	}

	// --- Drawing Logic ---

	private lastGoalReachable = false;

	public draw() {
		if (!this.puzzle || !this.ctx) return;

		const ctx = this.ctx;
		this.emit("render:before", { ctx });

		const now = Date.now();
		const dpr = this.options.pixelRatio;

		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.globalAlpha = 1.0;
		ctx.clearRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);

		this.drawGrid(ctx);
		this.drawConstraints(ctx);
		this.drawNodes(ctx);

		if (this.path.length === 0 && !this.isDrawing) {
			this.drawRipples(ctx);
		}

		if (this.isFading) {
			this.drawPath(ctx, this.fadingPath, false, this.fadeColor, this.fadeOpacity, this.fadingTipPos);
			if (this.puzzle.symmetry !== undefined && this.puzzle.symmetry !== SymmetryType.None) {
				const symFadingPath = this.getSymmetryPath(this.fadingPath);
				let symColor = this.options.colors.symmetry as string;
				if (this.isInvalidPath) {
					const originalSymAlpha = this.colorToRgba(symColor).a;
					symColor = this.setAlpha(this.options.colors.error as string, originalSymAlpha);
				}

				const symTipPos = this.getSymmetryTipPos(this.fadingTipPos, this.fadingPath);
				this.drawPath(ctx, symFadingPath, false, symColor, this.fadeOpacity, symTipPos);
			}
		} else if (this.path.length > 0) {
			const originalPathColor = this.options.colors.path as string;
			const originalPathAlpha = this.colorToRgba(originalPathColor).a;
			const errorColor = this.options.colors.error as string;

			let color = this.isInvalidPath ? this.setAlpha(errorColor, originalPathAlpha) : originalPathColor;

			// 成功時は成功時の色をデフォルトとする（対称モード時は元の色を維持）
			if ((this.isSuccessFading || this.isValidPath) && !this.puzzle.symmetry) {
				color = this.setAlpha(this.options.colors.success as string, originalPathAlpha);
			}

			// Eraser無効化前の点滅時などの色制御
			let pathOpacity = 1.0;
			if (!this.isDrawing && this.exitTipPos && !this.isInvalidPath) {
				const elapsed = now - (this.isSuccessFading ? this.successFadeStartTime : this.eraserAnimationStartTime);
				const blinkDuration = this.options.animations.blinkDuration!;
				if (elapsed < blinkDuration) {
					if (this.isSuccessFading) {
						const hasNegation = this.invalidatedCells.length > 0 || this.invalidatedEdges.length > 0 || this.invalidatedNodes.length > 0;
						if (hasNegation && this.options.blinkMarksOnError) {
							// 消しゴム無効化がある成功時は、アニメーション中のみ赤色（一瞬で切り替え）
							color = this.setAlpha(this.options.colors.error as string, originalPathAlpha);
							if (!this.options.stayPathOnError) {
								pathOpacity = Math.max(0, 1.0 - elapsed / this.options.animations.fadeDuration);
							}
						}
					}
				}
			}

			const mainTipPos = this.isDrawing ? this.currentMousePos : this.exitTipPos;
			const symTipPos = this.getSymmetryTipPos(mainTipPos, this.path);

			// ゴール到達時の発光処理（点滅）
			const isAtExit = this.isPathAtExit(this.path, this.isDrawing ? this.currentMousePos : this.exitTipPos);

			if (isAtExit !== this.lastGoalReachable) {
				this.lastGoalReachable = isAtExit;
				this.emit("goal:reachable", { reachable: isAtExit });
			}

			if (isAtExit && !this.isInvalidPath && !this.isSuccessFading && !this.isValidPath) {
				const originalAlpha = this.colorToRgba(color).a;
				const pulseFactor = (Math.sin((now * Math.PI * 2) / 600) + 1) / 2;
				color = this.lerpColor(color, "#ffffff", pulseFactor * 0.6);
				color = this.setAlpha(color, originalAlpha);
			}

			this.drawPath(ctx, this.path, this.isDrawing, color, pathOpacity, mainTipPos);

			if (this.puzzle.symmetry !== undefined && this.puzzle.symmetry !== SymmetryType.None) {
				const symPath = this.getSymmetryPath(this.path);
				const originalSymColor = this.options.colors.symmetry as string;
				const originalSymAlpha = this.colorToRgba(originalSymColor).a;
				let symColor = originalSymColor;
				let symPathOpacity = pathOpacity;

				// エラー時や成功時は色を上書き（対称モード成功時は元の色を維持）
				if (this.isInvalidPath) {
					symColor = this.setAlpha(errorColor, originalSymAlpha);
				}

				if (!this.isDrawing && this.exitTipPos && !this.isInvalidPath) {
					const elapsed = now - (this.isSuccessFading ? this.successFadeStartTime : this.eraserAnimationStartTime);
					const blinkDuration = this.options.animations.blinkDuration!;
					if (elapsed < blinkDuration) {
						if (this.isSuccessFading) {
							const hasNegation = this.invalidatedCells.length > 0 || this.invalidatedEdges.length > 0 || this.invalidatedNodes.length > 0;
							if (hasNegation && this.options.blinkMarksOnError) {
								symColor = this.setAlpha(this.options.colors.error as string, originalSymAlpha);
							}
						}
					}
				}

				// 対称パスの発光処理
				if (isAtExit && !this.isInvalidPath && !this.isSuccessFading && !this.isValidPath) {
					const pulseFactor = (Math.sin((now * Math.PI * 2) / 400) + 1) / 2;
					symColor = this.lerpColor(symColor, "#ffffff", pulseFactor * 0.6);
					symColor = this.setAlpha(symColor, originalSymAlpha);
				}

				this.drawPath(ctx, symPath, this.isDrawing, symColor, symPathOpacity, symTipPos);
			}
		}
		if (this.isDrawing && this.isTwoClickDrawing && this.path.length > 0) {
			const lastPoint = this.path[this.path.length - 1];
			const lastPos = this.getCanvasCoords(lastPoint.x, lastPoint.y);
			const pointerPos = this.exitTipPos ? this.exitTipPos : this.currentMousePos || lastPos;
			this.drawTwoClickPointer(ctx, pointerPos);
		}
		this.applyFilter(ctx);
		this.emit("render:after", { ctx });
	}

	private drawTwoClickPointer(ctx: WitnessContext, pos: Point) {
		ctx.save();
		ctx.beginPath();
		ctx.arc(pos.x, pos.y, this.options.pathWidth * 0.5, 0, Math.PI * 2);
		ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
		ctx.fill();
		ctx.restore();
	}

	private applyFilter(ctx: WitnessContext) {
		if (!this.options.filter.enabled) return;

		const filterColor = this.getActiveFilterColor();
		if (filterColor === null || this.isNoopFilterColor(filterColor)) return;

		const filterRgb = this.colorToRgba(filterColor);
		const width = Math.max(1, Math.floor(this.canvas.width));
		const height = Math.max(1, Math.floor(this.canvas.height));
		const filterBuffer = this.prepareFilterBuffer(width, height);

		if (!filterBuffer) return;
		const filterCtx = filterBuffer.ctx;
		try {
			// 元の計算式 (dst.rgb *= filter.rgb / 255) を blend で再現しつつ、
			// ピクセル走査を避けて負荷を下げる。
			filterCtx.save();
			filterCtx.setTransform(1, 0, 0, 1, 0, 0);
			filterCtx.clearRect(0, 0, width, height);
			filterCtx.drawImage(this.canvas as any, 0, 0, width, height);

			filterCtx.globalCompositeOperation = "multiply";
			filterCtx.fillStyle = `rgb(${filterRgb.r}, ${filterRgb.g}, ${filterRgb.b})`;
			filterCtx.fillRect(0, 0, width, height);

			// multiply で不透明化したalphaを元画像のalphaマスクで戻す。
			filterCtx.globalCompositeOperation = "destination-in";
			filterCtx.drawImage(this.canvas as any, 0, 0, width, height);
			filterCtx.restore();

			ctx.save();
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.clearRect(0, 0, width, height);
			ctx.drawImage(filterBuffer.canvas as any, 0, 0, width, height);
			ctx.restore();
		} catch (e) {
			// 特殊なCanvas実装などで合成モードが使えない場合は何もしない
		}
	}

	private prepareFilterBuffer(width: number, height: number): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: WitnessContext } | null {
		if (!this.filterCanvas) {
			if (typeof document !== "undefined") {
				this.filterCanvas = document.createElement("canvas");
			} else if (typeof OffscreenCanvas !== "undefined") {
				this.filterCanvas = new OffscreenCanvas(width, height);
			} else {
				return null;
			}
			this.filterCtx = (this.filterCanvas as any).getContext("2d") as WitnessContext | null;
		}
		if (!this.filterCtx || !this.filterCanvas) return null;

		if (this.filterCanvas.width !== width || this.filterCanvas.height !== height) {
			this.filterCanvas.width = width;
			this.filterCanvas.height = height;
		}

		return { canvas: this.filterCanvas, ctx: this.filterCtx as WitnessContext };
	}

	private getActiveFilterColor(): string | null {
		if (this.options.filter.mode === "rgb") {
			const colors = this.options.filter.rgbColors ?? ["#ff0000", "#00ff00", "#0000ff"];
			const index = Math.max(0, Math.min(2, this.options.filter.rgbIndex ?? 0));
			return colors[index] ?? null;
		}
		const color = this.options.filter.customColor;
		if (typeof color !== "string") return null;
		const trimmed = color.trim();
		return trimmed.length > 0 ? trimmed : null;
	}

	private isNoopFilterColor(color: string): boolean {
		const normalized = color.toLowerCase().replace(/\s+/g, "");
		if (normalized === "#fff" || normalized === "#ffffff" || normalized === "rgb(255,255,255)" || normalized === "rgba(255,255,255,1)") {
			return true;
		}

		const rgba = this.colorToRgba(color);
		return rgba.r === 255 && rgba.g === 255 && rgba.b === 255;
	}

	/**
	 * ゴール地点の波紋アニメーションを描画する
	 * @param ctx 描画コンテキスト
	 */
	private drawRipples(ctx: WitnessContext) {
		if (!this.puzzle) return;
		const time = (Date.now() - this.startTime) / 500;

		for (let r = 0; r <= this.puzzle.rows; r++) {
			for (let c = 0; c <= this.puzzle.cols; c++) {
				const node = this.puzzle.nodes[r][c];
				if (node.type === NodeType.End) {
					const pos = this.getCanvasCoords(c, r);
					const dir = this.getExitDir(c, r);
					if (!dir) continue;
					const exitPos = {
						x: pos.x + dir.x * this.options.exitLength,
						y: pos.y + dir.y * this.options.exitLength,
					};

					const t = time % 4.0;
					const radius = t * 5;
					const opacity = Math.max(0, 1 - t / 3.0);

					ctx.beginPath();
					ctx.arc(exitPos.x, exitPos.y, radius, 0, Math.PI * 2);
					ctx.strokeStyle = `rgba(170, 170, 170, ${opacity * 0.4})`;
					ctx.lineWidth = 2;
					ctx.stroke();
				}
			}
		}
	}

	/**
	 * グリッド（背景の線）を描画する
	 * @param ctx 描画コンテキスト
	 */
	private drawGrid(ctx: WitnessContext) {
		if (!this.puzzle || !this.options.colors.grid) return;
		ctx.strokeStyle = this.options.colors.grid;
		ctx.lineWidth = 12;
		ctx.lineCap = "round";

		const drawEdge = (p1: Point, p2: Point, type: EdgeType) => {
			if (type === EdgeType.Absent) return;

			if (type === EdgeType.Broken) {
				const gapSize = 0.15;
				const q1 = {
					x: p1.x + (p2.x - p1.x) * (0.5 - gapSize),
					y: p1.y + (p2.y - p1.y) * (0.5 - gapSize),
				};
				const q2 = {
					x: p1.x + (p2.x - p1.x) * (0.5 + gapSize),
					y: p1.y + (p2.y - p1.y) * (0.5 + gapSize),
				};

				ctx.beginPath();
				ctx.moveTo(p1.x, p1.y);
				ctx.lineTo(q1.x, q1.y);
				ctx.stroke();

				ctx.beginPath();
				ctx.moveTo(q2.x, q2.y);
				ctx.lineTo(p2.x, p2.y);
				ctx.stroke();
			} else {
				ctx.beginPath();
				ctx.moveTo(p1.x, p1.y);
				ctx.lineTo(p2.x, p2.y);
				ctx.stroke();
			}
		};

		for (let r = 0; r <= this.puzzle.rows; r++) {
			for (let c = 0; c < this.puzzle.cols; c++) {
				drawEdge(this.getCanvasCoords(c, r), this.getCanvasCoords(c + 1, r), this.puzzle.hEdges[r][c].type);
			}
		}

		for (let r = 0; r < this.puzzle.rows; r++) {
			for (let c = 0; c <= this.puzzle.cols; c++) {
				drawEdge(this.getCanvasCoords(c, r), this.getCanvasCoords(c, r + 1), this.puzzle.vEdges[r][c].type);
			}
		}
	}

	/**
	 * 全ての制約記号（四角、星、六角形など）を描画する
	 * @param ctx 描画コンテキスト
	 */
	private drawConstraints(ctx: WitnessContext) {
		if (!this.puzzle) return;
		const now = Date.now();
		const blinkFactor = (Math.sin((now * Math.PI * 2) / this.options.animations.blinkPeriod!) + 1) / 2;
		const invalidatedCellSet = new Set(this.invalidatedCells.map((p) => `${p.x},${p.y}`));
		const errorCellSet = new Set(this.errorCells.map((p) => `${p.x},${p.y}`));
		const invalidatedEdgeSet = new Set(this.invalidatedEdges.map((e) => `${e.type},${e.r},${e.c}`));
		const errorEdgeSet = new Set(this.errorEdges.map((e) => `${e.type},${e.r},${e.c}`));
		const invalidatedNodeSet = new Set(this.invalidatedNodes.map((p) => `${p.x},${p.y}`));
		const errorNodeSet = new Set(this.errorNodes.map((p) => `${p.x},${p.y}`));

		for (let r = 0; r < this.puzzle.rows; r++) {
			for (let c = 0; c < this.puzzle.cols; c++) {
				const cell = this.puzzle.cells[r][c];
				const pos = this.getCanvasCoords(c + 0.5, r + 0.5);
				const cellKey = `${c},${r}`;

				const isInvalidated = invalidatedCellSet.has(cellKey);
				const isError = errorCellSet.has(cellKey);

				let opacity = 1.0;
				let overrideColor: string | undefined = undefined;

				const originalColor = this.getColorCode(cell.color);
				const errorColor = this.options.colors.error as string;

				if (isError && this.options.blinkMarksOnError) {
					overrideColor = this.lerpColor(originalColor, errorColor, blinkFactor);
				}

				if (isInvalidated) {
					const elapsed = now - (this.isSuccessFading ? this.successFadeStartTime : this.eraserAnimationStartTime);
					const blinkDuration = this.options.animations.blinkDuration!;

					if (elapsed < blinkDuration) {
						if (this.options.blinkMarksOnError) {
							const transitionIn = Math.min(1.0, elapsed / 200);
							const transitionOut = elapsed > blinkDuration * 0.8 ? (blinkDuration - elapsed) / (blinkDuration * 0.2) : 1.0;
							const transitionFactor = Math.min(transitionIn, transitionOut);
							overrideColor = this.lerpColor(originalColor, errorColor, blinkFactor * transitionFactor);
						}
					} else {
						opacity = Math.max(0.3, 1.0 - (elapsed - blinkDuration) / this.options.animations.fadeDuration!);
					}
				}

				ctx.save();
				if (opacity < 1.0) {
					ctx.globalAlpha *= opacity;
				}
				this.drawConstraintItem(ctx, cell, pos, overrideColor);
				ctx.restore();
			}
		}

		ctx.lineWidth = 2;
		const hexRadius = 8;
		const getHexColor = (type: EdgeType | NodeType) => {
			if (type === EdgeType.Hexagon || type === NodeType.Hexagon) return this.options.colors.hexagon as string;
			if (type === EdgeType.HexagonMain || type === NodeType.HexagonMain) return this.options.colors.hexagonMain as string;
			if (type === EdgeType.HexagonSymmetry || type === NodeType.HexagonSymmetry) return this.options.colors.hexagonSymmetry as string;
			return this.options.colors.hexagon as string;
		};

		for (let r = 0; r <= this.puzzle.rows; r++) {
			for (let c = 0; c < this.puzzle.cols; c++) {
				const type = this.puzzle.hEdges[r][c].type;
				if (type === EdgeType.Hexagon || type === EdgeType.HexagonMain || type === EdgeType.HexagonSymmetry) {
					const pos = this.getCanvasCoords(c + 0.5, r);
					ctx.save();
					const edgeKey = `h,${r},${c}`;
					const isInvalidated = invalidatedEdgeSet.has(edgeKey);
					const isError = errorEdgeSet.has(edgeKey);
					const baseColor = getHexColor(type);

					if (isError && this.options.blinkMarksOnError) {
						const color = this.lerpColor(baseColor, this.options.colors.error as string, blinkFactor);
						this.drawHexagon(ctx, pos.x, pos.y, hexRadius, color);
					} else if (isInvalidated) {
						const elapsed = now - (this.isSuccessFading ? this.successFadeStartTime : this.eraserAnimationStartTime);
						const blinkDuration = this.options.animations.blinkDuration!;
						if (elapsed < blinkDuration) {
							if (this.options.blinkMarksOnError) {
								const transitionIn = Math.min(1.0, elapsed / 200);
								const transitionOut = elapsed > blinkDuration * 0.8 ? (blinkDuration - elapsed) / (blinkDuration * 0.2) : 1.0;
								const transitionFactor = Math.min(transitionIn, transitionOut);
								const color = this.lerpColor(baseColor, this.options.colors.error as string, blinkFactor * transitionFactor);
								this.drawHexagon(ctx, pos.x, pos.y, hexRadius, color);
							} else {
								this.drawHexagon(ctx, pos.x, pos.y, hexRadius, baseColor);
							}
						} else {
							ctx.globalAlpha *= Math.max(0.3, 1.0 - (elapsed - blinkDuration) / this.options.animations.fadeDuration!);
							this.drawHexagon(ctx, pos.x, pos.y, hexRadius, baseColor);
						}
					} else {
						this.drawHexagon(ctx, pos.x, pos.y, hexRadius, baseColor);
					}
					ctx.restore();
				}
			}
		}
		for (let r = 0; r < this.puzzle.rows; r++) {
			for (let c = 0; c <= this.puzzle.cols; c++) {
				const type = this.puzzle.vEdges[r][c].type;
				if (type === EdgeType.Hexagon || type === EdgeType.HexagonMain || type === EdgeType.HexagonSymmetry) {
					const pos = this.getCanvasCoords(c, r + 0.5);
					ctx.save();
					const edgeKey = `v,${r},${c}`;
					const isInvalidated = invalidatedEdgeSet.has(edgeKey);
					const isError = errorEdgeSet.has(edgeKey);
					const baseColor = getHexColor(type);

					if (isError && this.options.blinkMarksOnError) {
						const color = this.lerpColor(baseColor, this.options.colors.error as string, blinkFactor);
						this.drawHexagon(ctx, pos.x, pos.y, hexRadius, color);
					} else if (isInvalidated) {
						const elapsed = now - (this.isSuccessFading ? this.successFadeStartTime : this.eraserAnimationStartTime);
						const blinkDuration = this.options.animations.blinkDuration!;
						if (elapsed < blinkDuration) {
							if (this.options.blinkMarksOnError) {
								const transitionIn = Math.min(1.0, elapsed / 200);
								const transitionOut = elapsed > blinkDuration * 0.8 ? (blinkDuration - elapsed) / (blinkDuration * 0.2) : 1.0;
								const transitionFactor = Math.min(transitionIn, transitionOut);
								const color = this.lerpColor(baseColor, this.options.colors.error as string, blinkFactor * transitionFactor);
								this.drawHexagon(ctx, pos.x, pos.y, hexRadius, color);
							} else {
								this.drawHexagon(ctx, pos.x, pos.y, hexRadius, baseColor);
							}
						} else {
							ctx.globalAlpha *= Math.max(0.3, 1.0 - (elapsed - blinkDuration) / this.options.animations.fadeDuration!);
							this.drawHexagon(ctx, pos.x, pos.y, hexRadius, baseColor);
						}
					} else {
						this.drawHexagon(ctx, pos.x, pos.y, hexRadius, baseColor);
					}
					ctx.restore();
				}
			}
		}

		for (let r = 0; r <= this.puzzle.rows; r++) {
			for (let c = 0; c <= this.puzzle.cols; c++) {
				const type = this.puzzle.nodes[r][c].type;
				if (type === NodeType.Hexagon || type === NodeType.HexagonMain || type === NodeType.HexagonSymmetry) {
					const pos = this.getCanvasCoords(c, r);
					ctx.save();
					const nodeKey = `${c},${r}`;
					const isInvalidated = invalidatedNodeSet.has(nodeKey);
					const isError = errorNodeSet.has(nodeKey);
					const baseColor = getHexColor(type);

					if (isError && this.options.blinkMarksOnError) {
						const color = this.lerpColor(baseColor, this.options.colors.error as string, blinkFactor);
						this.drawHexagon(ctx, pos.x, pos.y, hexRadius, color);
					} else if (isInvalidated) {
						const elapsed = now - (this.isSuccessFading ? this.successFadeStartTime : this.eraserAnimationStartTime);
						const blinkDuration = this.options.animations.blinkDuration!;
						if (elapsed < blinkDuration) {
							if (this.options.blinkMarksOnError) {
								const transitionIn = Math.min(1.0, elapsed / 200);
								const transitionOut = elapsed > blinkDuration * 0.8 ? (blinkDuration - elapsed) / (blinkDuration * 0.2) : 1.0;
								const transitionFactor = Math.min(transitionIn, transitionOut);
								const color = this.lerpColor(baseColor, this.options.colors.error as string, blinkFactor * transitionFactor);
								this.drawHexagon(ctx, pos.x, pos.y, hexRadius, color);
							} else {
								this.drawHexagon(ctx, pos.x, pos.y, hexRadius, baseColor);
							}
						} else {
							ctx.globalAlpha *= Math.max(0.3, 1.0 - (elapsed - blinkDuration) / this.options.animations.fadeDuration!);
							this.drawHexagon(ctx, pos.x, pos.y, hexRadius, baseColor);
						}
					} else {
						this.drawHexagon(ctx, pos.x, pos.y, hexRadius, baseColor);
					}
					ctx.restore();
				}
			}
		}
	}

	/**
	 * 単一の制約アイテムを描画（座標はキャンバス全体に対する絶対座標）
	 */
	private drawConstraintItem(ctx: WitnessContext, cell: CellConstraint, pos: Point, overrideColor?: string) {
		if (cell.type === CellType.Square) {
			const size = 26;
			const radius = 8;
			ctx.fillStyle = overrideColor || this.getColorCode(cell.color);
			this.drawRoundedRect(ctx, pos.x - size / 2, pos.y - size / 2, size, size, radius);
		} else if (cell.type === CellType.Star) {
			this.drawStar(ctx, pos.x, pos.y, 12, 16, 8, cell.color, overrideColor);
		} else if (cell.type === CellType.Tetris || cell.type === CellType.TetrisRotated) {
			this.drawTetris(ctx, pos.x, pos.y, cell.shape || [], cell.type === CellType.TetrisRotated, cell.color, false, overrideColor);
		} else if (cell.type === CellType.TetrisNegative || cell.type === CellType.TetrisNegativeRotated) {
			this.drawTetris(ctx, pos.x, pos.y, cell.shape || [], cell.type === CellType.TetrisNegativeRotated, cell.color, true, overrideColor);
		} else if (cell.type === CellType.Eraser) {
			this.drawEraser(ctx, pos.x, pos.y, 14, 3, cell.color, overrideColor);
		} else if (cell.type === CellType.Triangle) {
			this.drawTriangle(ctx, pos.x, pos.y, cell.count || 0, cell.color, overrideColor);
		}
	}

	/**
	 * 全てのノード（交点、始点、終点）を描画する
	 * @param ctx 描画コンテキスト
	 */
	private drawNodes(ctx: WitnessContext) {
		if (!this.puzzle) return;
		const isNodeIsolated = (c: number, r: number) => {
			const connectedEdges: EdgeType[] = [];
			if (c > 0) connectedEdges.push(this.puzzle!.hEdges[r][c - 1].type);
			if (c < this.puzzle!.cols) connectedEdges.push(this.puzzle!.hEdges[r][c].type);
			if (r > 0) connectedEdges.push(this.puzzle!.vEdges[r - 1][c].type);
			if (r < this.puzzle!.rows) connectedEdges.push(this.puzzle!.vEdges[r][c].type);
			return connectedEdges.length > 0 && connectedEdges.every((e) => e === EdgeType.Absent);
		};

		for (let r = 0; r <= this.puzzle.rows; r++) {
			for (let c = 0; c <= this.puzzle.cols; c++) {
				if (isNodeIsolated(c, r)) continue;

				const node = this.puzzle.nodes[r][c];
				if (node.type === NodeType.Hexagon || node.type === NodeType.HexagonMain || node.type === NodeType.HexagonSymmetry) continue;

				const pos = this.getCanvasCoords(c, r);

				if (node.type === NodeType.Start) {
					if (this.options.colors.node) ctx.fillStyle = this.options.colors.node;
					ctx.beginPath();
					ctx.arc(pos.x, pos.y, this.options.startNodeRadius, 0, Math.PI * 2);
					ctx.fill();
				} else if (node.type === NodeType.End) {
					const dir = this.getExitDir(c, r);
					if (!dir) continue;
					if (this.options.colors.node) ctx.strokeStyle = this.options.colors.node;
					ctx.lineWidth = 12;
					ctx.lineCap = "round";
					ctx.beginPath();
					ctx.moveTo(pos.x, pos.y);
					ctx.lineTo(pos.x + dir.x * this.options.exitLength, pos.y + dir.y * this.options.exitLength);
					ctx.stroke();
				} else {
					if (this.options.colors.node) ctx.fillStyle = this.options.colors.node;
					ctx.beginPath();
					ctx.arc(pos.x, pos.y, this.options.nodeRadius, 0, Math.PI * 2);
					ctx.fill();
				}
			}
		}
	}

	/**
	 * 解答パスを描画する（オフスクリーン合成により重なりを防止）
	 * @param ctx 描画コンテキスト
	 * @param path パス座標配列
	 * @param isDrawing 描画中かどうか
	 * @param color パスの色
	 * @param opacity 不透明度
	 * @param tipPos 先端の座標（描画中用）
	 */
	private drawPath(ctx: WitnessContext, path: Point[], isDrawing: boolean, color: string | undefined, opacity: number, tipPos: Point | null = null) {
		if (path.length === 0 || !color || color === "transparent") return;

		const rgba = this.colorToRgba(color);
		const finalColor = `rgb(${rgba.r},${rgba.g},${rgba.b})`;
		const finalOpacity = opacity * rgba.a;

		// 重なり部分の色が濃くなるのを防ぐため、常にオフスクリーンで不透明に描画してから透過で合成する
		const { canvas: tempCanvas, ctx: tempCtx } = this.prepareOffscreen();
		this.drawPathInternal(tempCtx, path, isDrawing, finalColor, tipPos);
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.globalAlpha = finalOpacity;
		ctx.drawImage(tempCanvas, 0, 0);
		ctx.restore();
	}

	/**
	 * 解答パスの実際の描画処理
	 * @param ctx 描画コンテキスト
	 * @param path パス座標配列
	 * @param isDrawing 描画中かどうか
	 * @param color パスの色
	 * @param tipPos 先端の座標
	 */
	private drawPathInternal(ctx: WitnessContext, path: Point[], isDrawing: boolean, color: string, tipPos: Point | null = null) {
		ctx.save();
		ctx.strokeStyle = color;
		ctx.fillStyle = color;
		ctx.lineWidth = this.options.pathWidth;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";

		ctx.beginPath();
		const startPos = this.getCanvasCoords(path[0].x, path[0].y);
		ctx.moveTo(startPos.x, startPos.y);

		for (let i = 1; i < path.length; i++) {
			const pos = this.getCanvasCoords(path[i].x, path[i].y);
			ctx.lineTo(pos.x, pos.y);
		}

		const actualTipPos = tipPos || this.currentMousePos;
		if (isDrawing || tipPos) {
			ctx.lineTo(actualTipPos.x, actualTipPos.y);
		}

		ctx.stroke();

		ctx.beginPath();
		ctx.arc(startPos.x, startPos.y, this.options.startNodeRadius, 0, Math.PI * 2);
		ctx.fill();

		if (isDrawing || tipPos) {
			ctx.beginPath();
			ctx.arc(actualTipPos.x, actualTipPos.y, this.options.pathWidth / 2, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.restore();
	}

	/**
	 * 角丸長方形を描画する
	 */
	private drawRoundedRect(ctx: WitnessContext, x: number, y: number, width: number, height: number, radius: number) {
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
		ctx.fill();
	}

	/**
	 * 六角形（通過必須マーク）を描画する
	 */
	private drawHexagon(ctx: WitnessContext, x: number, y: number, radius: number, overrideColor?: string) {
		if (!this.options.colors.hexagon && !overrideColor) return;
		ctx.fillStyle = (overrideColor || this.options.colors.hexagon) as string;
		ctx.beginPath();
		for (let i = 0; i < 6; i++) {
			const angle = (Math.PI / 3) * i;
			const px = x + radius * Math.cos(angle);
			const py = y + radius * Math.sin(angle);
			if (i === 0) ctx.moveTo(px, py);
			else ctx.lineTo(px, py);
		}
		ctx.closePath();
		ctx.fill();
	}

	/**
	 * 消しゴム（テトラポッド）を描画する
	 */
	private drawEraser(ctx: WitnessContext, x: number, y: number, radius: number, points: number, colorEnum: Color, overrideColor?: string) {
		ctx.strokeStyle = overrideColor || this.getColorCode(colorEnum);
		ctx.lineWidth = radius * 0.5;
		ctx.lineCap = "butt";
		const rotation = 0.5;
		ctx.beginPath();
		for (let i = 0; i < points; i++) {
			const angle = ((Math.PI * 2) / points) * i + rotation;
			const px = x + radius * Math.cos(angle);
			const py = y + radius * Math.sin(angle);

			ctx.moveTo(x, y);
			ctx.lineTo(px, py);
		}
		ctx.stroke();
	}

	/**
	 * 星を描画する
	 */
	private drawStar(ctx: WitnessContext, x: number, y: number, innerRadius: number, outerRadius: number, points: number, colorEnum: Color, overrideColor?: string) {
		ctx.fillStyle = overrideColor || this.getColorCode(colorEnum);
		ctx.beginPath();
		for (let i = 0; i < points * 2; i++) {
			const radius = i % 2 === 0 ? outerRadius : innerRadius;
			const angle = (Math.PI / points) * i;
			const px = x + radius * Math.cos(angle);
			const py = y + radius * Math.sin(angle);
			if (i === 0) ctx.moveTo(px, py);
			else ctx.lineTo(px, py);
		}
		ctx.closePath();
		ctx.fill();
	}

	/**
	 * 三角形を描画する
	 */
	private drawTriangle(ctx: WitnessContext, x: number, y: number, count: number, colorEnum: Color, overrideColor?: string) {
		if (count <= 0) return;
		const color = overrideColor || this.getColorCode(colorEnum, "#ffcc00");
		ctx.fillStyle = color;

		const size = 12; // 三角形の外接円半径に近いサイズ
		const r = size * 0.8;
		const spacing = r * 2.2;

		const drawSingleTriangle = (tx: number, ty: number) => {
			ctx.beginPath();
			for (let i = 0; i < 3; i++) {
				const angle = (Math.PI * 2 * i) / 3 - Math.PI / 2;
				const px = tx + r * Math.cos(angle);
				const py = ty + r * Math.sin(angle);
				if (i === 0) ctx.moveTo(px, py);
				else ctx.lineTo(px, py);
			}
			ctx.closePath();
			ctx.fill();
		};

		const offset = (count - 1) * spacing * 0.5;
		for (let i = 0; i < count; i++) {
			drawSingleTriangle(x - offset + i * spacing, y);
		}
	}

	/**
	 * テトリスピースを描画する
	 */
	private drawTetris(ctx: WitnessContext, x: number, y: number, shape: number[][], rotated: boolean, colorEnum: Color, isNegative: boolean, overrideColor?: string) {
		if (!shape || shape.length === 0) return;
		const cellSize = 12;
		const gap = 2;
		const totalW = shape[0].length * cellSize + (shape[0].length - 1) * gap;
		const totalH = shape.length * cellSize + (shape.length - 1) * gap;

		ctx.save();
		ctx.translate(x, y);
		if (rotated) {
			ctx.rotate(Math.PI / 8);
		}

		const color = overrideColor || this.getColorCode(colorEnum, isNegative ? "#00ffff" : "#ffcc00");

		if (isNegative) {
			ctx.strokeStyle = color;
			ctx.lineWidth = 2;
			for (let r = 0; r < shape.length; r++) {
				for (let c = 0; c < shape[r].length; c++) {
					if (shape[r][c]) {
						const px = c * (cellSize + gap) - totalW / 2;
						const py = r * (cellSize + gap) - totalH / 2;
						ctx.strokeRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
					}
				}
			}
		} else {
			ctx.fillStyle = color;
			for (let r = 0; r < shape.length; r++) {
				for (let c = 0; c < shape[r].length; c++) {
					if (shape[r][c]) {
						const px = c * (cellSize + gap) - totalW / 2;
						const py = r * (cellSize + gap) - totalH / 2;
						ctx.fillRect(px, py, cellSize, cellSize);
					}
				}
			}
		}
		ctx.restore();
	}

	/**
	 * Color値に対応するカラーコードを取得する
	 * @param colorEnum Color値
	 * @param defaultFallback 見つからない場合のデフォルト
	 * @returns カラーコード文字列
	 */
	private getColorCode(colorEnum: Color, defaultFallback = "#666"): string {
		if (this.options.colors.colorList && this.options.colors.colorList[colorEnum] !== undefined) {
			return this.options.colors.colorList[colorEnum];
		}
		if (this.options.colors.colorMap && this.options.colors.colorMap[colorEnum] !== undefined) {
			return this.options.colors.colorMap[colorEnum];
		}
		// none (0) をデフォルトカラー（フォールバック）とする
		if (colorEnum !== 0) {
			return this.getColorCode(0, defaultFallback);
		}
		return defaultFallback;
	}

	/**
	 * カラー文字列をRGBA成分に分解する
	 * @param color #hex または rgba() 文字列
	 * @returns RGBAオブジェクト
	 */
	private colorToRgba(color: string): { r: number; g: number; b: number; a: number } {
		if (!color || color === "transparent") {
			return { r: 0, g: 0, b: 0, a: 0 };
		}

		if (color.startsWith("rgba") || color.startsWith("rgb")) {
			const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
			if (match) {
				return {
					r: parseInt(match[1]),
					g: parseInt(match[2]),
					b: parseInt(match[3]),
					a: match[4] ? parseFloat(match[4]) : 1.0,
				};
			}
		}

		let c = color.startsWith("#") ? color.slice(1) : color;
		if (c.length === 3 || c.length === 4) {
			c = c
				.split("")
				.map((s) => s + s)
				.join("");
		}

		if (c.length === 6) {
			const i = parseInt(c, 16);
			return {
				r: (i >> 16) & 255,
				g: (i >> 8) & 255,
				b: i & 255,
				a: 1.0,
			};
		} else if (c.length === 8) {
			const i = parseInt(c, 16);
			return {
				r: (i >> 24) & 255,
				g: (i >> 16) & 255,
				b: (i >> 8) & 255,
				a: (i & 255) / 255,
			};
		}
		return { r: 0, g: 0, b: 0, a: 1.0 };
	}

	/**
	 * 二つの色を線形補間する
	 * @param c1 色1
	 * @param c2 色2
	 * @param t 割合 (0.0 - 1.0)
	 * @returns 補間後の色 (rgba形式)
	 */
	private lerpColor(c1: string, c2: string, t: number): string {
		try {
			const rgba1 = this.colorToRgba(c1);
			const rgba2 = this.colorToRgba(c2);
			const r = Math.round(rgba1.r + (rgba2.r - rgba1.r) * t);
			const g = Math.round(rgba1.g + (rgba2.g - rgba1.g) * t);
			const b = Math.round(rgba1.b + (rgba2.b - rgba1.b) * t);
			const a = rgba1.a + (rgba2.a - rgba1.a) * t;
			return `rgba(${r},${g},${b},${a})`;
		} catch (e) {
			return c1;
		}
	}

	/**
	 * 色のアルファ値を上書きする
	 * @param color 元の色
	 * @param alpha 新しいアルファ値
	 * @returns 変更後の色
	 */
	private setAlpha(color: string, alpha: number): string {
		const rgba = this.colorToRgba(color);
		return `rgba(${rgba.r},${rgba.g},${rgba.b},${alpha})`;
	}

	/**
	 * 指定されたパスの対称パスを生成する
	 * @param path メインパス
	 * @returns 対称パス
	 */
	private getSymmetryPath(path: Point[]): Point[] {
		if (!this.puzzle || !this.puzzle.symmetry) return [];
		return path.map((p) => this.getSymmetricalPoint(p));
	}

	/**
	 * 指定された点の対称点を取得する
	 * @param p 元の点
	 * @param isFloat 小数点座標を維持するか
	 * @returns 対称点
	 */
	private getSymmetricalPoint(p: Point, isFloat = false): Point {
		if (!this.puzzle || !this.puzzle.symmetry) return { ...p };
		const { cols, rows, symmetry } = this.puzzle;
		if (symmetry === SymmetryType.Horizontal) {
			return { x: cols - p.x, y: p.y };
		} else if (symmetry === SymmetryType.Vertical) {
			return { x: p.x, y: rows - p.y };
		} else if (symmetry === SymmetryType.Rotational) {
			return { x: cols - p.x, y: rows - p.y };
		}
		return { ...p };
	}

	/**
	 * メイン線先端から対称線先端座標を求める
	 */
	private getSymmetryTipPos(tipPos: Point | null, path: Point[]): Point | null {
		if (!this.puzzle || !this.puzzle.symmetry || !tipPos || path.length === 0) return null;

		const symPath = this.getSymmetryPath(path);
		const lastMain = path[path.length - 1];
		const lastSym = symPath[symPath.length - 1];
		const lastMainPos = this.getCanvasCoords(lastMain.x, lastMain.y);
		const lastSymPos = this.getCanvasCoords(lastSym.x, lastSym.y);

		const dx = tipPos.x - lastMainPos.x;
		const dy = tipPos.y - lastMainPos.y;

		const symDelta = this.getSymmetricalPoint({ x: dx / this.options.cellSize, y: dy / this.options.cellSize }, true);
		const centerDelta = this.getSymmetricalPoint({ x: 0, y: 0 }, true);

		return {
			x: lastSymPos.x + (symDelta.x - centerDelta.x) * this.options.cellSize,
			y: lastSymPos.y + (symDelta.y - centerDelta.y) * this.options.cellSize,
		};
	}

	/**
	 * 指定されたパスの先端が出口の出っ張りにあるか判定する
	 */
	private isPathAtExit(path: Point[], tipPos: Point | null): boolean {
		if (path.length === 0 || !tipPos) return false;
		const lastPoint = path[path.length - 1];
		const exitDir = this.getExitDir(lastPoint.x, lastPoint.y);
		if (!exitDir) return false;

		const lastPos = this.getCanvasCoords(lastPoint.x, lastPoint.y);
		const dx = tipPos.x - lastPos.x;
		const dy = tipPos.y - lastPos.y;
		const dot = dx * exitDir.x + dy * exitDir.y;

		return dot >= this.options.exitLength * 0.9; // 90%以上引き切っていたら
	}

	/**
	 * 二点間のエッジを識別するユニークなキーを取得する
	 */
	private getEdgeKey(p1: Point, p2: Point): string {
		return p1.x < p2.x || (p1.x === p2.x && p1.y < p2.y) ? `${p1.x},${p1.y}-${p2.x},${p2.y}` : `${p2.x},${p2.y}-${p1.x},${p1.y}`;
	}

	/**
	 * 合成用のオフスクリーンCanvasを準備する
	 */
	/**
	 * Workerに送信できない関数などのプロパティを除去したオプションを生成する
	 */
	private sanitizeOptions(options: WitnessUIOptions): any {
		const sanitized: any = {};
		for (const key in options) {
			const value = (options as any)[key];
			if (value && typeof value === "object" && !Array.isArray(value)) {
				sanitized[key] = {};
				for (const subKey in value) {
					if (typeof (value as any)[subKey] !== "function") {
						(sanitized[key] as any)[subKey] = (value as any)[subKey];
					}
				}
			} else if (typeof value !== "function") {
				sanitized[key] = value;
			}
		}
		return sanitized;
	}

	private prepareOffscreen(): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: WitnessContext } {
		const dpr = this.options.pixelRatio;
		if (!this.offscreenCanvas) {
			if (typeof document !== "undefined") {
				this.offscreenCanvas = document.createElement("canvas");
			} else if (typeof OffscreenCanvas !== "undefined") {
				this.offscreenCanvas = new OffscreenCanvas(this.canvas.width, this.canvas.height);
			} else {
				throw new Error("Offscreen canvas not supported in this environment.");
			}
			this.offscreenCtx = (this.offscreenCanvas as any).getContext("2d") as WitnessContext | null;
		}
		if (this.offscreenCanvas.width !== this.canvas.width || this.offscreenCanvas.height !== this.canvas.height) {
			this.offscreenCanvas.width = this.canvas.width;
			this.offscreenCanvas.height = this.canvas.height;
		}
		if (!this.offscreenCtx) throw new Error("Could not get offscreen 2D context.");
		this.offscreenCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
		this.offscreenCtx.clearRect(0, 0, this.offscreenCanvas.width / dpr, this.offscreenCanvas.height / dpr);
		return { canvas: this.offscreenCanvas, ctx: this.offscreenCtx };
	}
}
