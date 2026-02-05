import { CellType, Color, EdgeType, NodeType, type Point, type PuzzleData } from "./types";

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
		/** 途中で離した際のフェード色 */
		interrupted?: string;
		/** グリッドの色 */
		grid?: string;
		/** ノードの色 */
		node?: string;
		/** 六角形（通過必須）の色 */
		hexagon?: string;
		/** 各色のカラーコードマップ */
		colorMap?: Record<number, string>;
		/** 各色のカラーコードリスト（インデックスがColor値に対応） */
		colorList?: string[];
	};
	/** パスが完了（出口に到達）した際のコールバック */
	onPathComplete?: (path: Point[]) => void;
}

/**
 * the witnessパズルの描画とユーザー操作を管理するクラス
 */
export class WitnessUI {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
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
	private errorCells: Point[] = [];
	private errorEdges: { type: "h" | "v"; r: number; c: number }[] = [];
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
	private offscreenCanvas: HTMLCanvasElement | null = null;
	private offscreenCtx: CanvasRenderingContext2D | null = null;

	constructor(canvasOrId: HTMLCanvasElement | string, puzzle?: PuzzleData, options: WitnessUIOptions = {}) {
		if (typeof window === "undefined") {
			// Node.js環境などでの実行
			this.canvas = {} as HTMLCanvasElement;
			this.ctx = {} as CanvasRenderingContext2D;
			this.options = this.mergeOptions(options);
			return;
		}

		if (typeof canvasOrId === "string") {
			const el = document.getElementById(canvasOrId);
			if (!(el instanceof HTMLCanvasElement)) {
				throw new Error(`Element with id "${canvasOrId}" is not a canvas.`);
			}
			this.canvas = el;
		} else {
			this.canvas = canvasOrId;
		}

		const context = this.canvas.getContext("2d");
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

	private mergeOptions(options: WitnessUIOptions): Required<WitnessUIOptions> {
		return {
			gridPadding: options.gridPadding ?? 60,
			cellSize: options.cellSize ?? 80,
			nodeRadius: options.nodeRadius ?? 6,
			startNodeRadius: options.startNodeRadius ?? 22,
			pathWidth: options.pathWidth ?? 18,
			exitLength: options.exitLength ?? 25,
			autoResize: options.autoResize ?? true,
			animations: {
				blinkDuration: options.animations?.blinkDuration ?? 1000,
				fadeDuration: options.animations?.fadeDuration ?? 1000,
				blinkPeriod: options.animations?.blinkPeriod ?? 800,
			},
			colors: {
				path: options.colors?.path ?? "#ffcc00",
				error: options.colors?.error ?? "#ff4444",
				success: options.colors?.success ?? "#ffcc00",
				interrupted: options.colors?.interrupted ?? "#ffcc00",
				grid: options.colors?.grid ?? "#555",
				node: options.colors?.node ?? "#555",
				hexagon: options.colors?.hexagon ?? "#ffcc00",
				colorMap: options.colors?.colorMap ?? {
					[Color.Black]: "#000",
					[Color.White]: "#fff",
					[Color.Red]: "#f00",
					[Color.Blue]: "#00f",
					[Color.None]: "#ffcc00",
				},
				colorList: options.colors?.colorList,
			},
			onPathComplete: options.onPathComplete ?? (() => {}),
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
		this.errorCells = [];
		this.errorEdges = [];
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
	public setValidationResult(isValid: boolean, invalidatedCells: Point[] = [], invalidatedEdges: { type: "h" | "v"; r: number; c: number }[] = [], errorCells: Point[] = [], errorEdges: { type: "h" | "v"; r: number; c: number }[] = []) {
		this.invalidatedCells = invalidatedCells;
		this.invalidatedEdges = invalidatedEdges;
		this.errorCells = errorCells;
		this.errorEdges = errorEdges;
		this.eraserAnimationStartTime = Date.now();

		if (isValid) {
			this.isSuccessFading = true;
			this.successFadeStartTime = Date.now();
		} else {
			this.isInvalidPath = true;
		}
	}

	private resizeCanvas() {
		if (!this.puzzle || !this.canvas) return;
		this.canvas.width = this.puzzle.cols * this.options.cellSize + this.options.gridPadding * 2;
		this.canvas.height = this.puzzle.rows * this.options.cellSize + this.options.gridPadding * 2;
	}

	private initEvents() {
		if (typeof window === "undefined") return;
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

	private getCanvasCoords(gridX: number, gridY: number): Point {
		return {
			x: this.options.gridPadding + gridX * this.options.cellSize,
			y: this.options.gridPadding + gridY * this.options.cellSize,
		};
	}

	private getExitDir(x: number, y: number): Point | null {
		if (!this.puzzle) return null;
		if (this.puzzle.nodes[y][x].type !== NodeType.End) return null;
		if (x === this.puzzle.cols) return { x: 1, y: 0 };
		if (x === 0) return { x: -1, y: 0 };
		if (y === 0) return { x: 0, y: -1 };
		if (y === this.puzzle.rows) return { x: 0, y: 1 };
		return { x: 1, y: 0 };
	}

	// --- イベントハンドラ ---

	private handleStart(e: { clientX: number; clientY: number }): boolean {
		if (!this.puzzle) return false;

		const rect = this.canvas.getBoundingClientRect();
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
						this.errorCells = [];
						this.errorEdges = [];

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

	private handleMove(e: { clientX: number; clientY: number }) {
		if (!this.puzzle || !this.isDrawing) return;

		const rect = this.canvas.getBoundingClientRect();
		const mouseX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
		const mouseY = (e.clientY - rect.top) * (this.canvas.height / rect.height);

		const lastPoint = this.path[this.path.length - 1];
		const lastPos = this.getCanvasCoords(lastPoint.x, lastPoint.y);

		const dx = mouseX - lastPos.x;
		const dy = mouseY - lastPos.y;

		const exitDir = this.getExitDir(lastPoint.x, lastPoint.y);
		if (exitDir) {
			const dot = dx * exitDir.x + dy * exitDir.y;
			if (dot > 0) {
				const length = Math.min(dot, this.options.exitLength);
				this.currentMousePos = {
					x: lastPos.x + exitDir.x * length,
					y: lastPos.y + exitDir.y * length,
				};
				this.draw();
				return;
			}
		}

		if (Math.abs(dx) > Math.abs(dy)) {
			const dir = dx > 0 ? 1 : -1;
			const target = { x: lastPoint.x + dir, y: lastPoint.y };
			const edgeType = this.getEdgeType(lastPoint, target);

			if (target.x >= 0 && target.x <= this.puzzle.cols && edgeType !== EdgeType.Absent) {
				const maxMove = edgeType === EdgeType.Broken ? this.options.cellSize * 0.35 : this.options.cellSize;
				this.currentMousePos = {
					x: lastPos.x + Math.max(-maxMove, Math.min(maxMove, dx)),
					y: lastPos.y,
				};
			} else {
				this.currentMousePos = lastPos;
			}
		} else {
			const dir = dy > 0 ? 1 : -1;
			const target = { x: lastPoint.x, y: lastPoint.y + dir };
			const edgeType = this.getEdgeType(lastPoint, target);

			if (target.y >= 0 && target.y <= this.puzzle.rows && edgeType !== EdgeType.Absent) {
				const maxMove = edgeType === EdgeType.Broken ? this.options.cellSize * 0.35 : this.options.cellSize;
				this.currentMousePos = {
					x: lastPos.x,
					y: lastPos.y + Math.max(-maxMove, Math.min(maxMove, dy)),
				};
			} else {
				this.currentMousePos = lastPos;
			}
		}

		const neighbors = [
			{ x: lastPoint.x + 1, y: lastPoint.y },
			{ x: lastPoint.x - 1, y: lastPoint.y },
			{ x: lastPoint.x, y: lastPoint.y + 1 },
			{ x: lastPoint.x, y: lastPoint.y - 1 },
		];

		for (const n of neighbors) {
			if (n.x >= 0 && n.x <= this.puzzle.cols && n.y >= 0 && n.y <= this.puzzle.rows) {
				const nPos = this.getCanvasCoords(n.x, n.y);
				const dist = Math.hypot(nPos.x - this.currentMousePos.x, nPos.y - this.currentMousePos.y);

				if (dist < this.options.cellSize * 0.3) {
					const idx = this.path.findIndex((p) => p.x === n.x && p.y === n.y);
					if (idx === -1) {
						this.path.push(n);
					} else if (idx === this.path.length - 2) {
						this.path.pop();
					}
				}
			}
		}

		this.draw();
	}

	private handleEnd(e: { clientX: number; clientY: number }) {
		if (!this.puzzle || !this.isDrawing) return;
		this.isDrawing = false;

		const lastPoint = this.path[this.path.length - 1];
		const lastPos = this.getCanvasCoords(lastPoint.x, lastPoint.y);
		const exitDir = this.getExitDir(lastPoint.x, lastPoint.y);

		if (exitDir) {
			const distToExit = Math.hypot(this.currentMousePos.x - lastPos.x, this.currentMousePos.y - lastPos.y);
			if (distToExit > this.options.exitLength * 0.1) {
				this.exitTipPos = { ...this.currentMousePos };
				this.options.onPathComplete(this.path);
				return;
			}
		}

		this.exitTipPos = exitDir ? { ...this.currentMousePos } : null;
		this.startFade(this.options.colors.interrupted); // 途中で離した場合は指定されたフェード色で消える
	}

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

	private startFade(color = "#ff4444") {
		this.isFading = true;
		this.fadeOpacity = 1.0;
		this.fadeColor = color;
		this.fadingPath = [...this.path];
		this.fadingTipPos = this.exitTipPos ? { ...this.exitTipPos } : null;
		this.path = [];
	}

	private cancelFade() {
		this.isFading = false;
	}

	private animate() {
		if (typeof window === "undefined") return;
		this.draw();

		if (this.isFading) {
			// フェード速度を fadeDuration に基づいて計算
			const step = 1000 / (this.options.animations.fadeDuration * 60); // 60FPS想定
			this.fadeOpacity -= step;
			if (this.fadeOpacity <= 0) {
				this.isFading = false;
				this.fadeOpacity = 0;
			}
		}

		requestAnimationFrame(() => this.animate());
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
		} else if (this.path.length > 0) {
			let color = this.isInvalidPath ? (this.options.colors.error as string) : (this.options.colors.path as string);

			// 成功時は成功時の色をデフォルトとする
			if (this.isSuccessFading) {
				color = this.options.colors.success as string;
			}

			// Eraser無効化前の点滅時などの色制御
			if (!this.isDrawing && this.exitTipPos && !this.isInvalidPath) {
				const elapsed = now - (this.isSuccessFading ? this.successFadeStartTime : this.eraserAnimationStartTime);
				const blinkDuration = this.options.animations.blinkDuration!;
				if (elapsed < blinkDuration) {
					if (this.isSuccessFading) {
						const hasNegation = this.invalidatedCells.length > 0 || this.invalidatedEdges.length > 0;
						if (hasNegation) {
							// 消しゴム無効化がある成功時は、アニメーション中のみ赤色（一瞬で切り替え）
							color = this.options.colors.error as string;
						}
					} else {
						// 失敗時（Eraserあり）は点滅させる
						// 開始と終了を滑らかにする
						const transitionIn = Math.min(1.0, elapsed / 200);
						const transitionOut = elapsed > blinkDuration * 0.8 ? (blinkDuration - elapsed) / (blinkDuration * 0.2) : 1.0;
						const transitionFactor = Math.min(transitionIn, transitionOut);

						const blinkFactor = (Math.sin((now * Math.PI * 2) / this.options.animations.blinkPeriod!) + 1) / 2;
						color = this.lerpColor(this.options.colors.path as string, this.options.colors.error as string, blinkFactor * transitionFactor);
					}
				}
			}

			this.drawPath(ctx, this.path, this.isDrawing, color, 1.0, this.isDrawing ? this.currentMousePos : this.exitTipPos);
		}
	}

	private drawRipples(ctx: CanvasRenderingContext2D) {
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

	private drawGrid(ctx: CanvasRenderingContext2D) {
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

	private drawConstraints(ctx: CanvasRenderingContext2D) {
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

				if (isError) {
					overrideColor = this.lerpColor(originalColor, errorColor, blinkFactor);
				}

				if (isInvalidated) {
					const elapsed = now - (this.isSuccessFading ? this.successFadeStartTime : this.eraserAnimationStartTime);
					const blinkDuration = this.options.animations.blinkDuration!;

					if (this.isFading) {
						opacity = this.fadeOpacity;
					} else if (elapsed < blinkDuration) {
						const transitionIn = Math.min(1.0, elapsed / 200);
						const transitionOut = elapsed > blinkDuration * 0.8 ? (blinkDuration - elapsed) / (blinkDuration * 0.2) : 1.0;
						const transitionFactor = Math.min(transitionIn, transitionOut);
						overrideColor = this.lerpColor(originalColor, errorColor, blinkFactor * transitionFactor);
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
		for (let r = 0; r <= this.puzzle.rows; r++) {
			for (let c = 0; c < this.puzzle.cols; c++) {
				if (this.puzzle.hEdges[r][c].type === EdgeType.Hexagon) {
					const pos = this.getCanvasCoords(c + 0.5, r);
					ctx.save();
					const isInvalidated = this.invalidatedEdges.some((e) => e.type === "h" && e.r === r && e.c === c);
					const isError = this.errorEdges.some((e) => e.type === "h" && e.r === r && e.c === c);

					if (isError) {
						const color = this.lerpColor(this.options.colors.hexagon as string, this.options.colors.error as string, blinkFactor);
						this.drawHexagon(ctx, pos.x, pos.y, hexRadius, color);
					} else if (isInvalidated) {
						const elapsed = now - (this.isSuccessFading ? this.successFadeStartTime : this.eraserAnimationStartTime);
						const blinkDuration = this.options.animations.blinkDuration!;
						if (this.isFading) ctx.globalAlpha *= this.fadeOpacity;
						else if (elapsed < blinkDuration) {
							const transitionIn = Math.min(1.0, elapsed / 200);
							const transitionOut = elapsed > blinkDuration * 0.8 ? (blinkDuration - elapsed) / (blinkDuration * 0.2) : 1.0;
							const transitionFactor = Math.min(transitionIn, transitionOut);
							const color = this.lerpColor(this.options.colors.hexagon as string, this.options.colors.error as string, blinkFactor * transitionFactor);
							this.drawHexagon(ctx, pos.x, pos.y, hexRadius, color);
						} else {
							ctx.globalAlpha *= Math.max(0.3, 1.0 - (elapsed - blinkDuration) / this.options.animations.fadeDuration!);
							this.drawHexagon(ctx, pos.x, pos.y, hexRadius);
						}
					} else {
						this.drawHexagon(ctx, pos.x, pos.y, hexRadius);
					}
					ctx.restore();
				}
			}
		}
		for (let r = 0; r < this.puzzle.rows; r++) {
			for (let c = 0; c <= this.puzzle.cols; c++) {
				if (this.puzzle.vEdges[r][c].type === EdgeType.Hexagon) {
					const pos = this.getCanvasCoords(c, r + 0.5);
					ctx.save();
					const isInvalidated = this.invalidatedEdges.some((e) => e.type === "v" && e.r === r && e.c === c);
					const isError = this.errorEdges.some((e) => e.type === "v" && e.r === r && e.c === c);

					if (isError) {
						const color = this.lerpColor(this.options.colors.hexagon as string, this.options.colors.error as string, blinkFactor);
						this.drawHexagon(ctx, pos.x, pos.y, hexRadius, color);
					} else if (isInvalidated) {
						const elapsed = now - (this.isSuccessFading ? this.successFadeStartTime : this.eraserAnimationStartTime);
						const blinkDuration = this.options.animations.blinkDuration!;
						if (this.isFading) ctx.globalAlpha *= this.fadeOpacity;
						else if (elapsed < blinkDuration) {
							const transitionIn = Math.min(1.0, elapsed / 200);
							const transitionOut = elapsed > blinkDuration * 0.8 ? (blinkDuration - elapsed) / (blinkDuration * 0.2) : 1.0;
							const transitionFactor = Math.min(transitionIn, transitionOut);
							const color = this.lerpColor(this.options.colors.hexagon as string, this.options.colors.error as string, blinkFactor * transitionFactor);
							this.drawHexagon(ctx, pos.x, pos.y, hexRadius, color);
						} else {
							ctx.globalAlpha *= Math.max(0.3, 1.0 - (elapsed - blinkDuration) / this.options.animations.fadeDuration!);
							this.drawHexagon(ctx, pos.x, pos.y, hexRadius);
						}
					} else {
						this.drawHexagon(ctx, pos.x, pos.y, hexRadius);
					}
					ctx.restore();
				}
			}
		}
	}

	/**
	 * 単一の制約アイテムを描画（座標はキャンバス全体に対する絶対座標）
	 */
	private drawConstraintItem(ctx: CanvasRenderingContext2D, cell: any, pos: Point, overrideColor?: string) {
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

	private drawNodes(ctx: CanvasRenderingContext2D) {
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

	private drawPath(ctx: CanvasRenderingContext2D, path: Point[], isDrawing: boolean, color: string | undefined, opacity: number, tipPos: Point | null = null) {
		if (path.length === 0 || !color) return;

		if (opacity < 1.0) {
			const { canvas: tempCanvas, ctx: tempCtx } = this.prepareOffscreen();
			this.drawPathInternal(tempCtx, path, isDrawing, color, tipPos);
			ctx.save();
			ctx.globalAlpha = opacity;
			ctx.drawImage(tempCanvas, 0, 0);
			ctx.restore();
		} else {
			this.drawPathInternal(ctx, path, isDrawing, color, tipPos);
		}
	}

	private drawPathInternal(ctx: CanvasRenderingContext2D, path: Point[], isDrawing: boolean, color: string, tipPos: Point | null = null) {
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

		if (isDrawing || tipPos) {
			const pos = tipPos || this.currentMousePos;
			ctx.lineTo(pos.x, pos.y);
		}

		ctx.stroke();

		ctx.beginPath();
		ctx.arc(startPos.x, startPos.y, this.options.startNodeRadius, 0, Math.PI * 2);
		ctx.fill();

		if (isDrawing) {
			ctx.beginPath();
			ctx.arc(this.currentMousePos.x, this.currentMousePos.y, this.options.pathWidth / 2, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.restore();
	}

	private drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
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

	private drawHexagon(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, overrideColor?: string) {
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

	private drawEraser(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, points: number, colorEnum: Color, overrideColor?: string) {
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

	private drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, innerRadius: number, outerRadius: number, points: number, colorEnum: Color, overrideColor?: string) {
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

	private drawTetris(ctx: CanvasRenderingContext2D, x: number, y: number, shape: number[][], rotated: boolean, colorEnum: Color, overrideColor?: string) {
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

	private getColorCode(colorEnum: Color, defaultFallback = "#666"): string {
		if (this.options.colors.colorList && this.options.colors.colorList[colorEnum] !== undefined) {
			return this.options.colors.colorList[colorEnum];
		}
		if (this.options.colors.colorMap && this.options.colors.colorMap[colorEnum] !== undefined) {
			return this.options.colors.colorMap[colorEnum];
		}
		return defaultFallback;
	}

	private hexToRgb(hex: string): { r: number; g: number; b: number } {
		let c = hex.startsWith("#") ? hex.slice(1) : hex;
		if (c.length === 3) {
			c = c
				.split("")
				.map((s) => s + s)
				.join("");
		}
		const i = parseInt(c, 16);
		return {
			r: (i >> 16) & 255,
			g: (i >> 8) & 255,
			b: i & 255,
		};
	}

	private rgbToHex(r: number, g: number, b: number): string {
		return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
	}

	private lerpColor(c1: string, c2: string, t: number): string {
		try {
			const rgb1 = this.hexToRgb(c1);
			const rgb2 = this.hexToRgb(c2);
			return this.rgbToHex(Math.round(rgb1.r + (rgb2.r - rgb1.r) * t), Math.round(rgb1.g + (rgb2.g - rgb1.g) * t), Math.round(rgb1.b + (rgb2.b - rgb1.b) * t));
		} catch (e) {
			return c1;
		}
	}

	private prepareOffscreen() {
		if (typeof document === "undefined") {
			return { canvas: {} as HTMLCanvasElement, ctx: {} as CanvasRenderingContext2D };
		}
		if (!this.offscreenCanvas) {
			this.offscreenCanvas = document.createElement("canvas");
			this.offscreenCtx = this.offscreenCanvas.getContext("2d");
		}
		if (this.offscreenCanvas.width !== this.canvas.width || this.offscreenCanvas.height !== this.canvas.height) {
			this.offscreenCanvas.width = this.canvas.width;
			this.offscreenCanvas.height = this.canvas.height;
		}
		this.offscreenCtx!.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
		return { canvas: this.offscreenCanvas, ctx: this.offscreenCtx! };
	}
}
