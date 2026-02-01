import { WitnessCore } from "../dist/MiniWitness.js";

class WitnessGame {
	constructor() {
		this.core = new WitnessCore();
		this.canvas = document.getElementById("game-canvas");
		this.ctx = this.canvas.getContext("2d");
		this.statusMsg = document.getElementById("status-message");
		this.sizeSelect = document.getElementById("size-select");
		this.newPuzzleBtn = document.getElementById("new-puzzle-btn");

		this.puzzle = null;
		this.path = []; // Array of {x, y} points
		this.isDrawing = false;
		this.currentMousePos = { x: 0, y: 0 };

		// Animation state
		this.isFading = false;
		this.fadeOpacity = 1.0;
		this.fadingPath = [];
		this.animationId = null;

		this.gridPadding = 60;
		this.cellSize = 80;
		this.nodeRadius = 12;
		this.startNodeRadius = 24;
		this.pathWidth = 18;
		this.exitLength = 25;

		this.init();
	}

	init() {
		this.newPuzzleBtn.addEventListener("click", () => this.startNewGame());

		this.canvas.addEventListener("mousedown", (e) => this.handleStart(e));
		window.addEventListener("mousemove", (e) => this.handleMove(e));
		window.addEventListener("mouseup", (e) => this.handleEnd(e));

		this.canvas.addEventListener(
			"touchstart",
			(e) => {
				e.preventDefault();
				this.handleStart(e.touches[0]);
			},
			{ passive: false },
		);
		window.addEventListener(
			"touchmove",
			(e) => {
				this.handleMove(e.touches[0]);
			},
			{ passive: false },
		);
		window.addEventListener(
			"touchend",
			(e) => {
				this.handleEnd(e.changedTouches[0]);
			},
			{ passive: false },
		);

		this.startNewGame();
	}

	startNewGame() {
		this.cancelFade();
		const size = parseInt(this.sizeSelect.value);
		const options = {
			useHexagons: document.getElementById("use-hexagons").checked,
			useSquares: document.getElementById("use-squares").checked,
			useStars: document.getElementById("use-stars").checked,
			useBrokenEdges: document.getElementById("use-broken-edges").checked,
			complexity: parseFloat(document.getElementById("complexity-slider").value),
			difficulty: parseFloat(document.getElementById("difficulty-slider").value),
		};

		this.updateStatus("Generating puzzle... (Searching for optimal difficulty)");
		// Use setTimeout to allow UI to update before heavy generation
		setTimeout(() => {
			this.puzzle = this.core.createPuzzle(size, size, options);
			const diff = this.core.calculateDifficulty(this.puzzle);
			this.path = [];
			this.isDrawing = false;

			this.resizeCanvas();
			this.updateStatus(`New puzzle generated! (Difficulty: ${diff.toFixed(2)})`);
			this.draw();
		}, 10);
	}

	resizeCanvas() {
		this.canvas.width = this.puzzle.cols * this.cellSize + this.gridPadding * 2;
		this.canvas.height = this.puzzle.rows * this.cellSize + this.gridPadding * 2;
	}

	updateStatus(msg, color = "#aaa") {
		this.statusMsg.textContent = msg;
		this.statusMsg.style.color = color;
	}

	// --- Coordinate Conversion ---

	getCanvasCoords(gridX, gridY) {
		return {
			x: this.gridPadding + gridX * this.cellSize,
			y: this.gridPadding + gridY * this.cellSize,
		};
	}

	getGridCoords(canvasX, canvasY) {
		const x = (canvasX - this.gridPadding) / this.cellSize;
		const y = (canvasY - this.gridPadding) / this.cellSize;
		return { x, y };
	}

	getExitDir(x, y) {
		if (this.puzzle.nodes[y][x].type !== 2) return null;
		if (x === this.puzzle.cols) return { x: 1, y: 0 };
		if (x === 0) return { x: -1, y: 0 };
		if (y === 0) return { x: 0, y: -1 };
		if (y === this.puzzle.rows) return { x: 0, y: 1 };
		return { x: 1, y: 0 }; // Default
	}

	// --- Event Handlers ---

	handleStart(e) {
		this.cancelFade();

		const rect = this.canvas.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		const mouseY = e.clientY - rect.top;

		// Check if clicked near a start node
		for (let r = 0; r <= this.puzzle.rows; r++) {
			for (let c = 0; c <= this.puzzle.cols; c++) {
				if (this.puzzle.nodes[r][c].type === 1) {
					// NodeType.Start
					const nodePos = this.getCanvasCoords(c, r);
					const dist = Math.hypot(nodePos.x - mouseX, nodePos.y - mouseY);
					if (dist < this.startNodeRadius) {
						this.isDrawing = true;
						this.path = [{ x: c, y: r }];
						this.currentMousePos = nodePos;
						this.updateStatus("Drawing path...");
						this.draw();
						return;
					}
				}
			}
		}
	}

	handleMove(e) {
		if (!this.isDrawing) return;

		const rect = this.canvas.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		const mouseY = e.clientY - rect.top;

		const lastPoint = this.path[this.path.length - 1];
		const lastPos = this.getCanvasCoords(lastPoint.x, lastPoint.y);

		const dx = mouseX - lastPos.x;
		const dy = mouseY - lastPos.y;

		// Check if at End node to allow protrusion movement
		const exitDir = this.getExitDir(lastPoint.x, lastPoint.y);
		if (exitDir) {
			const dot = dx * exitDir.x + dy * exitDir.y;
			if (dot > 0) {
				const length = Math.min(dot, this.exitLength);
				this.currentMousePos = {
					x: lastPos.x + exitDir.x * length,
					y: lastPos.y + exitDir.y * length,
				};
				this.draw();
				return;
			}
		}

		// Constrain movement to grid lines
		if (Math.abs(dx) > Math.abs(dy)) {
			const dir = dx > 0 ? 1 : -1;
			const target = { x: lastPoint.x + dir, y: lastPoint.y };
			const edgeType = this.getEdgeType(lastPoint, target);

			if (target.x >= 0 && target.x <= this.puzzle.cols && edgeType !== 2) {
				const maxMove = edgeType === 1 ? this.cellSize * 0.35 : this.cellSize;
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

			if (target.y >= 0 && target.y <= this.puzzle.rows && edgeType !== 2) {
				const maxMove = edgeType === 1 ? this.cellSize * 0.35 : this.cellSize;
				this.currentMousePos = {
					x: lastPos.x,
					y: lastPos.y + Math.max(-maxMove, Math.min(maxMove, dy)),
				};
			} else {
				this.currentMousePos = lastPos;
			}
		}

		// Snap to nodes
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

				if (dist < this.cellSize * 0.3) {
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

	handleEnd(e) {
		if (!this.isDrawing) return;
		this.isDrawing = false;

		const lastPoint = this.path[this.path.length - 1];
		const lastPos = this.getCanvasCoords(lastPoint.x, lastPoint.y);
		const exitDir = this.getExitDir(lastPoint.x, lastPoint.y);

		if (exitDir) {
			const distToExit = Math.hypot(this.currentMousePos.x - lastPos.x, this.currentMousePos.y - lastPos.y);
			if (distToExit > this.exitLength * 0.5) {
				this.validate();
				return;
			}
		}

		// If not reached exit
		this.path = [];
		this.updateStatus("Drag all the way to the exit!", "#f44");
		this.draw();
	}

	getEdgeType(p1, p2) {
		if (p1.x === p2.x) {
			const y = Math.min(p1.y, p2.y);
			if (y < 0 || y >= this.puzzle.rows) return 2; // Absent
			return this.puzzle.vEdges[y][p1.x].type;
		} else {
			const x = Math.min(p1.x, p2.x);
			if (x < 0 || x >= this.puzzle.cols) return 2; // Absent
			return this.puzzle.hEdges[p1.y][x].type;
		}
	}

	isBrokenEdge(p1, p2) {
		const type = this.getEdgeType(p1, p2);
		// 1: Broken, 2: Absent
		return type === 1 || type === 2;
	}

	validate() {
		const result = this.core.validateSolution(this.puzzle, { points: this.path });
		if (result.isValid) {
			this.updateStatus("Correct! Well done!", "#4f4");
		} else {
			this.updateStatus("Incorrect: " + (result.errorReason || "Try again"), "#f44");
			this.startFade();
		}
	}

	// --- Animation ---

	startFade() {
		this.isFading = true;
		this.fadeOpacity = 1.0;
		this.fadingPath = [...this.path];
		this.path = [];
		this.animate();
	}

	cancelFade() {
		this.isFading = false;
		if (this.animationId) {
			cancelAnimationFrame(this.animationId);
			this.animationId = null;
		}
	}

	animate() {
		if (!this.isFading) return;

		this.fadeOpacity -= 0.015; // Slow fade
		if (this.fadeOpacity <= 0) {
			this.isFading = false;
			this.fadeOpacity = 0;
			this.draw();
			return;
		}

		this.draw();
		this.animationId = requestAnimationFrame(() => this.animate());
	}

	// --- Drawing Logic ---

	draw() {
		const ctx = this.ctx;
		ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

		this.drawGrid(ctx);
		this.drawConstraints(ctx);
		this.drawNodes(ctx);

		if (this.isFading) {
			this.drawPath(ctx, this.fadingPath, false, "#ff4444", this.fadeOpacity);
		} else if (this.path.length > 0) {
			this.drawPath(ctx, this.path, this.isDrawing, "#ffcc00", 1.0);
		}
	}

	drawGrid(ctx) {
		ctx.strokeStyle = "#444";
		ctx.lineWidth = 12;
		ctx.lineCap = "round";

		const drawEdge = (p1, p2, type) => {
			if (type === 2) return; // Absent

			const midX = (p1.x + p2.x) / 2;
			const midY = (p1.y + p2.y) / 2;

			if (type === 1) {
				// Broken (with gap in the middle)
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
				// Normal or Hexagon
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

	drawConstraints(ctx) {
		for (let r = 0; r < this.puzzle.rows; r++) {
			for (let c = 0; c < this.puzzle.cols; c++) {
				const cell = this.puzzle.cells[r][c];
				const pos = this.getCanvasCoords(c + 0.5, r + 0.5);
				if (cell.type === 1) {
					// Square
					const size = 20;
					ctx.fillStyle = this.getColorCode(cell.color);
					ctx.fillRect(pos.x - size / 2, pos.y - size / 2, size, size);
				} else if (cell.type === 2) {
					// Star (8-pointed sunburst)
					this.drawStar(ctx, pos.x, pos.y, 10, 14, 8, cell.color);
				}
			}
		}

		ctx.lineWidth = 2;
		const hexRadius = 8;
		for (let r = 0; r <= this.puzzle.rows; r++) {
			for (let c = 0; c < this.puzzle.cols; c++) {
				if (this.puzzle.hEdges[r][c].type === 3) {
					const pos = this.getCanvasCoords(c + 0.5, r);
					this.drawHexagon(ctx, pos.x, pos.y, hexRadius);
				}
			}
		}
		for (let r = 0; r < this.puzzle.rows; r++) {
			for (let c = 0; c <= this.puzzle.cols; c++) {
				if (this.puzzle.vEdges[r][c].type === 3) {
					const pos = this.getCanvasCoords(c, r + 0.5);
					this.drawHexagon(ctx, pos.x, pos.y, hexRadius);
				}
			}
		}
	}

	drawNodes(ctx) {
		const isNodeIsolated = (c, r) => {
			const connectedEdges = [];
			if (c > 0) connectedEdges.push(this.puzzle.hEdges[r][c - 1]);
			if (c < this.puzzle.cols) connectedEdges.push(this.puzzle.hEdges[r][c]);
			if (r > 0) connectedEdges.push(this.puzzle.vEdges[r - 1][c]);
			if (r < this.puzzle.rows) connectedEdges.push(this.puzzle.vEdges[r][c]);
			return connectedEdges.length > 0 && connectedEdges.every((e) => e.type === 2); // 2 is Absent
		};

		for (let r = 0; r <= this.puzzle.rows; r++) {
			for (let c = 0; c <= this.puzzle.cols; c++) {
				if (isNodeIsolated(c, r)) continue;

				const node = this.puzzle.nodes[r][c];
				const pos = this.getCanvasCoords(c, r);

				if (node.type === 1) {
					ctx.fillStyle = "#444";
					ctx.beginPath();
					ctx.arc(pos.x, pos.y, this.startNodeRadius, 0, Math.PI * 2);
					ctx.fill();
				} else if (node.type === 2) {
					ctx.strokeStyle = "#444";
					ctx.lineWidth = 12;
					const dir = this.getExitDir(c, r);
					ctx.beginPath();
					ctx.moveTo(pos.x, pos.y);
					ctx.lineTo(pos.x + dir.x * this.exitLength, pos.y + dir.y * this.exitLength);
					ctx.stroke();
				} else {
					ctx.fillStyle = "#444";
					ctx.beginPath();
					ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
					ctx.fill();
				}
			}
		}
	}

	drawPath(ctx, path, isDrawing, color, opacity) {
		if (path.length === 0) return;

		ctx.save();
		ctx.globalAlpha = opacity;
		ctx.strokeStyle = color;
		ctx.fillStyle = color;
		ctx.lineWidth = this.pathWidth;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";

		ctx.beginPath();
		const startPos = this.getCanvasCoords(path[0].x, path[0].y);
		ctx.moveTo(startPos.x, startPos.y);

		for (let i = 1; i < path.length; i++) {
			const pos = this.getCanvasCoords(path[i].x, path[i].y);
			ctx.lineTo(pos.x, pos.y);
		}

		if (isDrawing) {
			ctx.lineTo(this.currentMousePos.x, this.currentMousePos.y);
		}

		ctx.stroke();

		// Draw start circle
		ctx.beginPath();
		ctx.arc(startPos.x, startPos.y, this.startNodeRadius, 0, Math.PI * 2);
		ctx.fill();

		// Draw path tip
		if (isDrawing) {
			ctx.beginPath();
			ctx.arc(this.currentMousePos.x, this.currentMousePos.y, this.pathWidth / 2, 0, Math.PI * 2);
			ctx.fill();
		} else {
			// If not drawing, we might want to draw a circle at the last point of fading path
			const lastPoint = path[path.length - 1];
			const lastPos = this.getCanvasCoords(lastPoint.x, lastPoint.y);
			// Check if we should also extend it to the exit if it was a validation attempt
			// For simplicity, we just draw up to the last point in path.
		}
		ctx.restore();
	}

	drawHexagon(ctx, x, y, radius) {
		ctx.fillStyle = "#ffcc00";
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

	drawStar(ctx, x, y, innerRadius, outerRadius, points, colorEnum) {
		ctx.fillStyle = this.getColorCode(colorEnum);
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

	getColorCode(colorEnum) {
		switch (colorEnum) {
			case 1:
				return "#000";
			case 2:
				return "#fff";
			case 3:
				return "#f00";
			case 4:
				return "#00f";
			default:
				return "#888";
		}
	}
}

window.witnessGame = new WitnessGame();
