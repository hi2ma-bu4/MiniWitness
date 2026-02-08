import { CellType, Color, EdgeType, NodeType, SymmetryType, type CellConstraint, type Point, type PuzzleData } from "./types";

/**
 * UI表示設定
 */
export interface WitnessUIOptions {
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
	/** パスが完了（出口に到達）した際のコールバック */
	onPathComplete?: (path: Point[]) => void;
}

type WitnessContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * the witnessパズルの描画とユーザー操作を管理するクラス
 */
export class WitnessUI {
	private canvas: HTMLCanvasElement | OffscreenCanvas;
	private ctx: WitnessContext;
	private puzzle: PuzzleData | null = null;
	private options: Required<WitnessUIOptions>;

	private path: Point[] = [];
	private isDrawing = false;
	private currentMousePos: Point = { x: 0, y: 0 };
	private exitTipPos: Point | null = null;
	private isInvalidPath = false;

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

	private canvasRect: { left: number; top: number; width: number; height: number } | null = null;

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

		const context = (this.canvas as HTMLCanvasElement).getContext("2d") as WitnessContext | null;
		if (!context) throw new Error("Could not get 2D context.");
		this.ctx = context;
		this.ctx.imageSmoothingEnabled = false;

		this.options = this.mergeOptions(options);

		if (puzzle) {
			this.setPuzzle(puzzle);
		}

		this.initEvents();
		this.animate();
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
			gridPadding: options.gridPadding ?? this.options?.gridPadding ?? 60,
			cellSize: options.cellSize ?? this.options?.cellSize ?? 80,
			nodeRadius: options.nodeRadius ?? this.options?.nodeRadius ?? 6,
			startNodeRadius: options.startNodeRadius ?? this.options?.startNodeRadius ?? 22,
			pathWidth: options.pathWidth ?? this.options?.pathWidth ?? 18,
			exitLength: options.exitLength ?? this.options?.exitLength ?? 25,
			autoResize: options.autoResize ?? this.options?.autoResize ?? true,
			blinkMarksOnError: options.blinkMarksOnError ?? this.options?.blinkMarksOnError ?? true,
			stayPathOnError: options.stayPathOnError ?? this.options?.stayPathOnError ?? true,
			animations,
			colors,
			onPathComplete: options.onPathComplete ?? this.options?.onPathComplete ?? (() => {}),
		};
	}

	/**
	 * パズルデータを設定し、再描画する
	 */
	public setPuzzle(puzzle: PuzzleData) {
		this.puzzle = puzzle;
		this.path = [];
		this.isDrawing = false;
		this.exitTipPos = null;
		this.invalidatedCells = [];
		this.invalidatedEdges = [];
		this.invalidatedNodes = [];
		this.errorCells = [];
		this.errorEdges = [];
		this.errorNodes = [];
		this.cancelFade();

		if (this.options.autoResize) {
			this.resizeCanvas();
		}
		this.draw();
	}

	/**
	 * 表示オプションを更新する
	 */
	public setOptions(options: WitnessUIOptions) {
		this.options = this.mergeOptions({ ...this.options, ...options });
		if (this.options.autoResize && this.puzzle) {
			this.resizeCanvas();
		}
		this.draw();
	}

	/**
	 * 検証結果を反映させる（不正解時の赤点滅や、消しゴムによる無効化の表示）
	 */
	public setValidationResult(isValid: boolean, invalidatedCells: Point[] = [], invalidatedEdges: { type: "h" | "v"; r: number; c: number }[] = [], errorCells: Point[] = [], errorEdges: { type: "h" | "v"; r: number; c: number }[] = [], invalidatedNodes: Point[] = [], errorNodes: Point[] = []) {
		this.invalidatedCells = invalidatedCells;
		this.invalidatedEdges = invalidatedEdges;
		this.invalidatedNodes = invalidatedNodes;
		this.errorCells = errorCells;
		this.errorEdges = errorEdges;
		this.errorNodes = errorNodes;
		this.eraserAnimationStartTime = Date.now();

		if (isValid) {
			this.isSuccessFading = true;
			this.successFadeStartTime = Date.now();
		} else {
			this.isInvalidPath = true;
			// 失敗時のフェードアウト設定が有効な場合、アニメーション（点滅）待ちの後に startFade が呼ばれるようにする
		}
	}

	/**
	 * パズルのサイズに合わせてCanvasの物理サイズを調整する
	 */
	private resizeCanvas() {
		if (!this.puzzle || !this.canvas) return;
		this.canvas.width = this.puzzle.cols * this.options.cellSize + this.options.gridPadding * 2;
		this.canvas.height = this.puzzle.rows * this.options.cellSize + this.options.gridPadding * 2;
	}

	/**
	 * Canvasの表示上の矩形情報を設定する（Worker時などに必要）
	 */
	public setCanvasRect(rect: { left: number; top: number; width: number; height: number }) {
		this.canvasRect = rect;
	}

	/**
	 * マウス・タッチイベントを初期化する
	 */
	private initEvents() {
		if (typeof window === "undefined" || !(this.canvas instanceof HTMLCanvasElement)) return;
		this.canvas.addEventListener("mousedown", (e) => this.handleStart(e));
		window.addEventListener("mousemove", (e) => this.handleMove(e));
		window.addEventListener("mouseup", (e) => this.handleEnd(e));

		this.canvas.addEventListener(
			"touchstart",
			(e) => {
				if (this.handleStart(e.touches[0])) {
					e.preventDefault();
				}
			},
			{ passive: false },
		);
		window.addEventListener(
			"touchmove",
			(e) => {
				if (this.isDrawing) {
					e.preventDefault();
				}
				this.handleMove(e.touches[0]);
			},
			{ passive: false },
		);
		window.addEventListener(
			"touchend",
			(e) => {
				if (this.isDrawing) {
					e.preventDefault();
				}
				this.handleEnd(e.changedTouches[0]);
			},
			{ passive: false },
		);
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
	 * 指定されたノードが出口の場合、その出っ張りの方向ベクトルを返す
	 * @param x グリッドX
	 * @param y グリッドY
	 * @returns 方向ベクトル、またはnull
	 */
	private getExitDir(x: number, y: number): Point | null {
		if (!this.puzzle) return null;
		if (this.puzzle.nodes[y]?.[x]?.type !== NodeType.End) return null;
		if (x === this.puzzle.cols) return { x: 1, y: 0 };
		if (x === 0) return { x: -1, y: 0 };
		if (y === 0) return { x: 0, y: -1 };
		if (y === this.puzzle.rows) return { x: 0, y: 1 };
		return { x: 1, y: 0 };
	}

	// --- イベントハンドラ ---

	public handleStart(e: { clientX: number; clientY: number }): boolean {
		if (!this.puzzle) return false;

		const rect = this.canvasRect || (this.canvas instanceof HTMLCanvasElement ? this.canvas.getBoundingClientRect() : { left: 0, top: 0, width: this.canvas.width, height: this.canvas.height });
		const mouseX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
		const mouseY = (e.clientY - rect.top) * (this.canvas.height / rect.height);

		for (let r = 0; r <= this.puzzle.rows; r++) {
			for (let c = 0; c <= this.puzzle.cols; c++) {
				if (this.puzzle.nodes[r][c].type === NodeType.Start) {
					const nodePos = this.getCanvasCoords(c, r);
					const dist = Math.hypot(nodePos.x - mouseX, nodePos.y - mouseY);
					if (dist < this.options.startNodeRadius) {
						// スタート地点がクリックされた場合のみ、前回の状態をリセットして開始する
						this.cancelFade();
						this.isSuccessFading = false;
						this.isInvalidPath = false;
						this.invalidatedCells = [];
						this.invalidatedEdges = [];
						this.invalidatedNodes = [];
						this.errorCells = [];
						this.errorEdges = [];
						this.errorNodes = [];

						this.isDrawing = true;
						this.path = [{ x: c, y: r }];
						this.currentMousePos = nodePos;
						this.exitTipPos = null;
						this.draw();
						return true;
					}
				}
			}
		}
		return false;
	}

	public handleMove(e: { clientX: number; clientY: number }) {
		if (!this.puzzle || !this.isDrawing) return;

		const rect = this.canvasRect || (this.canvas instanceof HTMLCanvasElement ? this.canvas.getBoundingClientRect() : { left: 0, top: 0, width: this.canvas.width, height: this.canvas.height });
		const mouseX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
		const mouseY = (e.clientY - rect.top) * (this.canvas.height / rect.height);

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
					maxMove = Math.min(maxMove, this.options.cellSize * 0.5 - this.options.pathWidth * 0.5);
				}
			}

			if (symmetry !== SymmetryType.None) {
				const symLast = this.getSymmetricalPoint(lastPoint);
				const symTarget = this.getSymmetricalPoint(target);
				const symEdgeType = this.getEdgeType(symLast, symTarget);
				const symPath = this.getSymmetryPath(this.path);
				const symEdgeKey = this.getEdgeKey(symLast, symTarget);

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

				if (isNodeOccupiedBySym || isSymNodeOccupiedByMain || isMeetingAtNode || isEdgeOccupiedBySym || isMirrorEdgeOccupiedByMain || isSelfMirrorEdge) {
					maxMove = Math.min(maxMove, this.options.cellSize * 0.5 - this.options.pathWidth * 0.5);
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
					} else if (idx === this.path.length - 2) {
						this.path.pop();
					}
				}
			}
		}

		this.draw();
	}

	public handleEnd(e: { clientX: number; clientY: number }) {
		if (!this.puzzle || !this.isDrawing) return;
		this.isDrawing = false;

		const lastPoint = this.path[this.path.length - 1];
		const lastPos = this.getCanvasCoords(lastPoint.x, lastPoint.y);
		const exitDir = this.getExitDir(lastPoint.x, lastPoint.y);

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
				this.options.onPathComplete(this.path);
				return;
			}
		}

		this.exitTipPos = exitDir ? { ...this.currentMousePos } : null;
		this.startFade(this.options.colors.interrupted); // 途中で離した場合は指定されたフェード色で消える
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
		const now = Date.now();

		if (this.isFading) {
			// フェード速度を fadeDuration に基づいて計算
			const step = 1000 / (this.options.animations.fadeDuration * 60); // 60FPS想定
			this.fadeOpacity -= step;
			if (this.fadeOpacity <= 0) {
				this.isFading = false;
				this.fadeOpacity = 0;
			}
		}

		// 失敗時かつフェード設定ありの場合、即座にフェードアウトを開始する
		if (this.isInvalidPath && !this.options.stayPathOnError && !this.isFading && this.path.length > 0) {
			this.startFade(this.options.colors.error);
		}

		this.draw();

		if (typeof requestAnimationFrame !== "undefined") {
			requestAnimationFrame(() => this.animate());
		}
	}

	// --- Drawing Logic ---

	public draw() {
		if (!this.puzzle || !this.ctx) return;

		const ctx = this.ctx;
		const now = Date.now();
		ctx.globalAlpha = 1.0;
		ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

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

				let symTipPos: Point | null = null;
				if (this.fadingTipPos) {
					const gridRelX = (this.fadingTipPos.x - this.options.gridPadding) / this.options.cellSize;
					const gridRelY = (this.fadingTipPos.y - this.options.gridPadding) / this.options.cellSize;
					const symGridRel = this.getSymmetricalPoint({ x: gridRelX, y: gridRelY });
					symTipPos = {
						x: symGridRel.x * this.options.cellSize + this.options.gridPadding,
						y: symGridRel.y * this.options.cellSize + this.options.gridPadding,
					};
				}
				// 途中で離した場合はメインと同じ色で消えても良いが、一応対称側の色でフェードさせる
				this.drawPath(ctx, symFadingPath, false, symColor, this.fadeOpacity, symTipPos);
			}
		} else if (this.path.length > 0) {
			const originalPathColor = this.options.colors.path as string;
			const originalPathAlpha = this.colorToRgba(originalPathColor).a;
			const errorColor = this.options.colors.error as string;

			let color = this.isInvalidPath ? this.setAlpha(errorColor, originalPathAlpha) : originalPathColor;

			// 成功時は成功時の色をデフォルトとする（対称モード時は元の色を維持）
			if (this.isSuccessFading && !this.puzzle.symmetry) {
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
							color = this.options.colors.error as string;
							if (!this.options.stayPathOnError) {
								pathOpacity = Math.max(0, 1.0 - elapsed / this.options.animations.fadeDuration);
							}
						}
					}
				}
			}

			this.drawPath(ctx, this.path, this.isDrawing, color, pathOpacity, this.isDrawing ? this.currentMousePos : this.exitTipPos);

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
								symColor = this.options.colors.error as string;
							}
						}
					}
				}

				let symTipPos: Point | null = null;
				if (this.isDrawing || this.exitTipPos) {
					const tip = this.isDrawing ? this.currentMousePos : this.exitTipPos!;
					// Canvas座標からグリッド相対座標に変換して対称点を求め、再度Canvas座標に戻す
					const gridRelX = (tip.x - this.options.gridPadding) / this.options.cellSize;
					const gridRelY = (tip.y - this.options.gridPadding) / this.options.cellSize;
					const symGridRel = this.getSymmetricalPoint({ x: gridRelX, y: gridRelY }, true);
					symTipPos = {
						x: symGridRel.x * this.options.cellSize + this.options.gridPadding,
						y: symGridRel.y * this.options.cellSize + this.options.gridPadding,
					};
				}
				this.drawPath(ctx, symPath, this.isDrawing, symColor, symPathOpacity, symTipPos);
			}
		}
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

		for (let r = 0; r < this.puzzle.rows; r++) {
			for (let c = 0; c < this.puzzle.cols; c++) {
				const cell = this.puzzle.cells[r][c];
				const pos = this.getCanvasCoords(c + 0.5, r + 0.5);

				const isInvalidated = this.invalidatedCells.some((p) => p.x === c && p.y === r);
				const isError = this.errorCells.some((p) => p.x === c && p.y === r);

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

				if (opacity < 1.0 || overrideColor) {
					const { canvas: tempCanvas, ctx: tempCtx } = this.prepareOffscreen();
					this.drawConstraintItem(tempCtx, cell, pos, overrideColor);
					ctx.save();
					ctx.globalAlpha = opacity;
					ctx.drawImage(tempCanvas, 0, 0);
					ctx.restore();
				} else {
					this.drawConstraintItem(ctx, cell, pos);
				}
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
					const isInvalidated = this.invalidatedEdges.some((e) => e.type === "h" && e.r === r && e.c === c);
					const isError = this.errorEdges.some((e) => e.type === "h" && e.r === r && e.c === c);
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
					const isInvalidated = this.invalidatedEdges.some((e) => e.type === "v" && e.r === r && e.c === c);
					const isError = this.errorEdges.some((e) => e.type === "v" && e.r === r && e.c === c);
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
					const isInvalidated = this.invalidatedNodes.some((p) => p.x === c && p.y === r);
					const isError = this.errorNodes.some((p) => p.x === c && p.y === r);
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
			this.drawTetris(ctx, pos.x, pos.y, cell.shape || [], cell.type === CellType.TetrisRotated, cell.color, overrideColor);
		} else if (cell.type === CellType.Eraser) {
			this.drawEraser(ctx, pos.x, pos.y, 14, 3, cell.color, overrideColor);
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
	 * テトリスピースを描画する
	 */
	private drawTetris(ctx: WitnessContext, x: number, y: number, shape: number[][], rotated: boolean, colorEnum: Color, overrideColor?: string) {
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
		// overrideColorがある場合はそれを優先、なければColor.Noneかつデフォルトカラー設定がない場合は黄色(#ffcc00)
		ctx.fillStyle = overrideColor || this.getColorCode(colorEnum, "#ffcc00");

		for (let r = 0; r < shape.length; r++) {
			for (let c = 0; c < shape[r].length; c++) {
				if (shape[r][c]) {
					const px = c * (cellSize + gap) - totalW / 2;
					const py = r * (cellSize + gap) - totalH / 2;
					ctx.fillRect(px, py, cellSize, cellSize);
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
	 * 二点間のエッジを識別するユニークなキーを取得する
	 */
	private getEdgeKey(p1: Point, p2: Point): string {
		return p1.x < p2.x || (p1.x === p2.x && p1.y < p2.y) ? `${p1.x},${p1.y}-${p2.x},${p2.y}` : `${p2.x},${p2.y}-${p1.x},${p1.y}`;
	}

	/**
	 * 合成用のオフスクリーンCanvasを準備する
	 */
	private prepareOffscreen(): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: WitnessContext } {
		if (!this.offscreenCanvas) {
			if (typeof document !== "undefined") {
				this.offscreenCanvas = document.createElement("canvas");
			} else if (typeof OffscreenCanvas !== "undefined") {
				this.offscreenCanvas = new OffscreenCanvas(this.canvas.width, this.canvas.height);
			} else {
				throw new Error("Offscreen canvas not supported in this environment.");
			}
			this.offscreenCtx = (this.offscreenCanvas as HTMLCanvasElement).getContext("2d") as WitnessContext | null;
		}
		if (this.offscreenCanvas.width !== this.canvas.width || this.offscreenCanvas.height !== this.canvas.height) {
			this.offscreenCanvas.width = this.canvas.width;
			this.offscreenCanvas.height = this.canvas.height;
		}
		if (!this.offscreenCtx) throw new Error("Could not get offscreen 2D context.");
		this.offscreenCtx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
		return { canvas: this.offscreenCanvas, ctx: this.offscreenCtx };
	}
}
