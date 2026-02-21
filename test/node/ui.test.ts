import assert from "node:assert";
import { describe, test } from "node:test";
import { CellType, Color, NodeType, PuzzleSerializer, SymmetryType, WitnessUI } from "../../dist/MiniWitness.js";

describe("WitnessUI Full Test Suite", { concurrency: false }, async () => {
	if (typeof (global as any).OffscreenCanvas === "undefined") {
		(global as any).OffscreenCanvas = class {
			width: number;
			height: number;
			constructor(width: number, height: number) {
				this.width = width;
				this.height = height;
			}
			getContext() {
				return {
					imageSmoothingEnabled: true,
					clearRect: () => {},
					save: () => {},
					restore: () => {},
					beginPath: () => {},
					moveTo: () => {},
					lineTo: () => {},
					stroke: () => {},
					fill: () => {},
					arc: () => {},
					fillRect: () => {},
					translate: () => {},
					rotate: () => {},
					setTransform: () => {},
					closePath: () => {},
					quadraticCurveTo: () => {},
					drawImage: () => {},
				};
			}
		};
	}

	await test("WitnessUI export", () => {
		assert.ok(WitnessUI, "WitnessUI should be exported");
	});

	await test("PuzzleSerializer export", () => {
		assert.ok(PuzzleSerializer, "PuzzleSerializer should be exported");
	});

	const createMockCanvas = () => ({
		width: 100,
		height: 100,
		style: {},
		requestPointerLock: () => {},
		getContext: () => ({
			imageSmoothingEnabled: true,
			clearRect: () => {},
			save: () => {},
			restore: () => {},
			beginPath: () => {},
			moveTo: () => {},
			lineTo: () => {},
			stroke: () => {},
			fill: () => {},
			arc: () => {},
			fillRect: () => {},
			translate: () => {},
			rotate: () => {},
			setTransform: () => {},
			closePath: () => {},
			quadraticCurveTo: () => {},
			drawImage: () => {},
		}),
	});

	function createEmptyPuzzle(rows: number, cols: number) {
		return {
			rows,
			cols,
			cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ type: CellType.None, color: Color.None }))),
			vEdges: Array.from({ length: rows }, () => Array.from({ length: cols + 1 }, () => ({ type: 0 }))),
			hEdges: Array.from({ length: rows + 1 }, () => Array.from({ length: cols }, () => ({ type: 0 }))),
			nodes: Array.from({ length: rows + 1 }, () => Array.from({ length: cols + 1 }, () => ({ type: NodeType.Normal }))),
		};
	}

	await test("WitnessUI instantiation in Node (should not crash with mock canvas)", () => {
		const ui = new WitnessUI(createMockCanvas() as unknown as HTMLCanvasElement);
		assert.ok(ui instanceof WitnessUI);
	});

	await test("WitnessUI setValidationResult updates internal state", () => {
		const ui = new WitnessUI(createMockCanvas() as unknown as HTMLCanvasElement);
		const internalUI = ui as any;
		ui.setValidationResult(true, [{ x: 0, y: 0 }]);
		assert.strictEqual(internalUI.isSuccessFading, true);
		assert.ok(internalUI.successFadeStartTime > 0);
		assert.strictEqual(internalUI.invalidatedCells.length, 1);
	});

	await test("WitnessUI preserves color in symmetry mode", () => {
		const ui = new WitnessUI(createMockCanvas() as unknown as HTMLCanvasElement);
		const internalUI = ui as any;
		internalUI.puzzle = { symmetry: 1 };
		ui.setValidationResult(true);
		assert.strictEqual(internalUI.puzzle.symmetry, 1);
		assert.strictEqual(internalUI.isSuccessFading, true);
	});

	await test("WitnessUI instantiation with mock canvas object", () => {
		const ui = new WitnessUI(createMockCanvas() as unknown as HTMLCanvasElement);
		assert.ok(ui instanceof WitnessUI);
	});

	await test("WitnessUI setCanvasRect", () => {
		const ui = new WitnessUI(createMockCanvas() as unknown as HTMLCanvasElement);
		const internalUI = ui as any;
		const rect = { left: 10, top: 20, width: 300, height: 400 };
		ui.setCanvasRect(rect);
		assert.deepStrictEqual(internalUI.canvasRect, rect);
	});

	await test("WitnessUI DPI Scaling (pixelRatio)", () => {
		const puzzle = createEmptyPuzzle(4, 4);
		const canvas = createMockCanvas();
		const ui = new WitnessUI(canvas as any, puzzle as any, { pixelRatio: 2, cellSize: 80, gridPadding: 60 });

		// 4x80 + 60*2 = 440. 440 * 2 = 880.
		assert.strictEqual(canvas.width, 880);
		assert.strictEqual(canvas.height, 880);
	});

	await test("WitnessUI Event Emitter (on/emit)", () => {
		const ui = new WitnessUI(createMockCanvas() as any);
		let eventFired = false;
		let receivedData = null;

		ui.on("path:start", (data) => {
			eventFired = true;
			receivedData = data;
		});

		(ui as any).emit("path:start", { x: 1, y: 2 });

		assert.strictEqual(eventFired, true);
		assert.deepStrictEqual(receivedData, { x: 1, y: 2 });
	});

	await test("WitnessUI goal:reachable event", () => {
		const puzzle = createEmptyPuzzle(1, 1);
		puzzle.nodes[0][1].type = NodeType.End;
		const ui = new WitnessUI(createMockCanvas() as any, puzzle as any);

		let reachable = false;
		ui.on("goal:reachable", (data) => {
			reachable = data.reachable;
		});

		const internalUI = ui as any;
		internalUI.path = [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
		];

		// 届いている状態にする
		const lastPos = internalUI.getCanvasCoords(1, 0);
		internalUI.currentMousePos = { x: lastPos.x + 23, y: lastPos.y };
		internalUI.isDrawing = true;

		ui.draw();
		assert.strictEqual(reachable, true);

		// 離れた状態にする
		internalUI.currentMousePos = { x: lastPos.x, y: lastPos.y };
		ui.draw();
		assert.strictEqual(reachable, false);
	});

	await test("WitnessUI new options are merged correctly", () => {
		const ui = new WitnessUI(createMockCanvas() as unknown as HTMLCanvasElement, undefined, {
			blinkMarksOnError: false,
			stayPathOnError: false,
		});
		const internalUI = ui as any;
		assert.strictEqual(internalUI.options.blinkMarksOnError, false);
		assert.strictEqual(internalUI.options.stayPathOnError, false);
	});

	await test("WitnessUI inputMode defaults to drag", () => {
		const ui = new WitnessUI(createMockCanvas() as unknown as HTMLCanvasElement);
		const internalUI = ui as any;
		assert.strictEqual(internalUI.options.inputMode, "drag");
	});

	await test("WitnessUI twoClick mode starts and ends by click", () => {
		const puzzle = createEmptyPuzzle(1, 1);
		puzzle.nodes[0][0].type = NodeType.Start;
		puzzle.nodes[0][1].type = NodeType.End;
		const ui = new WitnessUI(createMockCanvas() as any, puzzle as any, {
			inputMode: "twoClick",
			cellSize: 80,
			gridPadding: 60,
		});

		const internalUI = ui as any;
		const startX = 60;
		const startY = 60;
		const started = ui.handleStart({ clientX: startX, clientY: startY }, "mouse");
		assert.strictEqual(started, true);
		assert.strictEqual(internalUI.isDrawing, true);

		ui.handleMove({ clientX: 140, clientY: 60 });
		assert.strictEqual(internalUI.path.length >= 1, true);

		const ended = ui.handleEnd({ clientX: 140, clientY: 60 }, "mouse");
		assert.strictEqual(ended, true);
		assert.strictEqual(internalUI.isDrawing, false);
	});

	await test("WitnessUI twoClick pointer-locked move follows movement delta", () => {
		const puzzle = createEmptyPuzzle(1, 2);
		puzzle.nodes[0][0].type = NodeType.Start;
		const ui = new WitnessUI(createMockCanvas() as any, puzzle as any, {
			inputMode: "twoClick",
			cellSize: 80,
			gridPadding: 60,
		});
		const internalUI = ui as any;
		ui.handleStart({ clientX: 60, clientY: 60 }, "mouse");
		const before = { ...internalUI.currentMousePos };
		ui.handleMove({ clientX: 60, clientY: 60, movementX: 20, movementY: 0, pointerLocked: true });
		assert.ok(internalUI.currentMousePos.x > before.x);
	});

	await test("WitnessUI twoClick mode is unavailable on touch", () => {
		const puzzle = createEmptyPuzzle(1, 1);
		puzzle.nodes[0][0].type = NodeType.Start;
		const ui = new WitnessUI(createMockCanvas() as any, puzzle as any, { inputMode: "twoClick" });
		const started = ui.handleStart({ clientX: 60, clientY: 60 }, "touch");
		assert.strictEqual(started, false);
	});

	await test("WitnessUI draws twoClick pointer overlay", () => {
		const calls: string[] = [];
		const ctx = {
			imageSmoothingEnabled: true,
			clearRect: () => {},
			save: () => calls.push("save"),
			restore: () => calls.push("restore"),
			beginPath: () => calls.push("beginPath"),
			moveTo: () => {},
			lineTo: () => {},
			stroke: () => {},
			fill: () => calls.push("fill"),
			arc: () => calls.push("arc"),
			fillRect: () => {},
			translate: () => {},
			rotate: () => {},
			setTransform: () => {},
			closePath: () => {},
			quadraticCurveTo: () => {},
			drawImage: () => {},
			fillStyle: "#000000",
		};
		const puzzle = createEmptyPuzzle(1, 1);
		puzzle.nodes[0][0].type = NodeType.Start;
		const ui = new WitnessUI({ width: 100, height: 100, getContext: () => ctx } as any, puzzle as any, { inputMode: "twoClick" });
		const internalUI = ui as any;
		internalUI.isDrawing = true;
		internalUI.isTwoClickDrawing = true;
		internalUI.path = [{ x: 0, y: 0 }];
		internalUI.currentMousePos = { x: 60, y: 60 };
		ui.draw();
		assert.ok(calls.includes("arc"));
		assert.ok(calls.includes("fill"));
	});

	await test("WitnessUI stayPathOnError=false triggers fade immediately", () => {
		const ui = new WitnessUI(createMockCanvas() as unknown as HTMLCanvasElement, undefined, {
			stayPathOnError: false,
			animations: { blinkDuration: 100, fadeDuration: 100, blinkPeriod: 100 },
		});
		const internalUI = ui as any;

		internalUI.path = [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
		];
		ui.setValidationResult(false);
		internalUI.animate();

		assert.strictEqual(internalUI.isFading, true);
		assert.strictEqual(internalUI.path.length, 0);
	});

	await test("WitnessUI success result with negation turns line red during blink", () => {
		const ui = new WitnessUI(createMockCanvas() as unknown as HTMLCanvasElement);
		const internalUI = ui as any;
		internalUI.path = [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
		];
		internalUI.exitTipPos = { x: 100, y: 100 };
		ui.setValidationResult(true, [{ x: 0, y: 0 }]);
		assert.strictEqual(internalUI.isSuccessFading, true);
		assert.strictEqual(internalUI.invalidatedCells.length, 1);
	});

	await test("WitnessUI success result with negation and stayPathOnError=false fades during blink", () => {
		const ui = new WitnessUI(createMockCanvas() as unknown as HTMLCanvasElement, undefined, {
			stayPathOnError: false,
			animations: { blinkDuration: 1000, fadeDuration: 1000, blinkPeriod: 1000 },
		});
		const internalUI = ui as any;
		internalUI.path = [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
		];
		internalUI.exitTipPos = { x: 100, y: 100 };

		ui.setValidationResult(true, [{ x: 0, y: 0 }]);

		const start = internalUI.successFadeStartTime;
		const originalNow = Date.now;
		Date.now = () => start + 500;

		try {
			assert.strictEqual(internalUI.path.length, 2);
			assert.strictEqual(internalUI.isSuccessFading, true);
			assert.strictEqual(internalUI.isFading, false);
		} finally {
			Date.now = originalNow;
		}
	});

	await test("WitnessUI symmetry path fading state", () => {
		const puzzle = createEmptyPuzzle(1, 1);
		(puzzle as any).symmetry = 1;

		const ui = new WitnessUI(createMockCanvas() as any, puzzle as any);
		const internalUI = ui as any;

		internalUI.prepareOffscreen = () => ({
			canvas: { width: 100, height: 100 },
			ctx: internalUI.ctx,
		});

		internalUI.path = [{ x: 0, y: 0 }];
		ui.setOptions({ stayPathOnError: false });
		ui.setValidationResult(false);
		internalUI.animate();

		assert.strictEqual(internalUI.isFading, true);
		assert.strictEqual(internalUI.isInvalidPath, true);
		assert.strictEqual(internalUI.fadingPath.length, 1);
	});

	await test("WitnessUI symmetry tip keeps mirrored offset on even grid", () => {
		const puzzle = createEmptyPuzzle(2, 2);
		(puzzle as any).symmetry = 1;
		const ui = new WitnessUI(createMockCanvas() as any, puzzle as any, { cellSize: 80, gridPadding: 60 });
		const internalUI = ui as any;

		const path = [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
		];
		const lastMainPos = internalUI.getCanvasCoords(1, 0);
		const mainTip = { x: lastMainPos.x + 24, y: lastMainPos.y };
		const symTip = internalUI.getSymmetryTipPos(mainTip, path);
		const symPath = internalUI.getSymmetryPath(path);
		const lastSymPos = internalUI.getCanvasCoords(symPath[symPath.length - 1].x, symPath[symPath.length - 1].y);

		assert.ok(symTip);
		assert.strictEqual(symTip.x - lastSymPos.x, -24);
		assert.strictEqual(symTip.y - lastSymPos.y, 0);
	});

	await test("WitnessUI symmetry tip keeps mirrored offset on odd grid", () => {
		const puzzle = createEmptyPuzzle(3, 3);
		(puzzle as any).symmetry = 1;
		const ui = new WitnessUI(createMockCanvas() as any, puzzle as any, { cellSize: 80, gridPadding: 60 });
		const internalUI = ui as any;

		const path = [
			{ x: 0, y: 1 },
			{ x: 1, y: 1 },
		];
		const lastMainPos = internalUI.getCanvasCoords(1, 1);
		const mainTip = { x: lastMainPos.x + 18, y: lastMainPos.y };
		const symTip = internalUI.getSymmetryTipPos(mainTip, path);
		const symPath = internalUI.getSymmetryPath(path);
		const lastSymPos = internalUI.getCanvasCoords(symPath[symPath.length - 1].x, symPath[symPath.length - 1].y);

		assert.ok(symTip);
		assert.strictEqual(symTip.x - lastSymPos.x, -18);
		assert.strictEqual(symTip.y - lastSymPos.y, 0);
	});

	await test("WitnessUI symmetry midpoint approach (even grid) allows near-center distance", () => {
		const puzzle = createEmptyPuzzle(2, 2);
		(puzzle as any).symmetry = SymmetryType.Horizontal;
		const ui = new WitnessUI(createMockCanvas() as any, puzzle as any, { cellSize: 80, gridPadding: 60, pathWidth: 24 });
		const internalUI = ui as any;

		internalUI.isDrawing = true;
		internalUI.path = [{ x: 0, y: 1 }];
		const lastPos = internalUI.getCanvasCoords(0, 1);
		internalUI.currentMousePos = { ...lastPos };

		ui.handleMove({ clientX: lastPos.x + 500, clientY: lastPos.y });

		const moved = internalUI.currentMousePos.x - lastPos.x;
		const maxAllowed = 80 - 24 - 1;
		assert.ok(moved > 0);
		assert.ok(moved <= maxAllowed + 0.0001);
	});

	await test("WitnessUI symmetry anti-clip limits self-mirror-edge approach (odd grid)", () => {
		const puzzle = createEmptyPuzzle(2, 3);
		(puzzle as any).symmetry = SymmetryType.Horizontal;
		const ui = new WitnessUI(createMockCanvas() as any, puzzle as any, { cellSize: 80, gridPadding: 60, pathWidth: 24 });
		const internalUI = ui as any;

		internalUI.isDrawing = true;
		internalUI.path = [{ x: 1, y: 1 }];
		const lastPos = internalUI.getCanvasCoords(1, 1);
		internalUI.currentMousePos = { ...lastPos };

		ui.handleMove({ clientX: lastPos.x + 500, clientY: lastPos.y });

		const moved = internalUI.currentMousePos.x - lastPos.x;
		const maxAllowed = (80 - 24 - 1) / 2;
		assert.ok(moved > 0);
		assert.ok(moved <= maxAllowed + 0.0001);
	});

	await test("WitnessUI cancel keeps tip position for fade", () => {
		const puzzle = createEmptyPuzzle(2, 2);
		puzzle.nodes[0][0].type = NodeType.Start;
		const ui = new WitnessUI(createMockCanvas() as any, puzzle as any, { cellSize: 80, gridPadding: 60 });
		const internalUI = ui as any;

		internalUI.isDrawing = true;
		internalUI.path = [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
		];
		const tip = { x: 133, y: 60 };
		internalUI.currentMousePos = { ...tip };

		const ended = ui.handleEnd({ clientX: tip.x, clientY: tip.y }, "mouse");
		assert.strictEqual(ended, true);
		assert.deepStrictEqual(internalUI.exitTipPos, tip);
		assert.deepStrictEqual(internalUI.fadingTipPos, tip);
	});

	await test("WitnessUI skips filter rendering for noop colors", () => {
		const calls: string[] = [];
		const ctx = {
			imageSmoothingEnabled: true,
			clearRect: () => calls.push("clearRect"),
			save: () => calls.push("save"),
			restore: () => calls.push("restore"),
			beginPath: () => {},
			moveTo: () => {},
			lineTo: () => {},
			stroke: () => {},
			fill: () => {},
			arc: () => {},
			fillRect: () => calls.push("fillRect"),
			translate: () => {},
			rotate: () => {},
			setTransform: () => {},
			closePath: () => {},
			quadraticCurveTo: () => {},
			drawImage: () => calls.push("drawImage"),
			globalCompositeOperation: "source-over",
			fillStyle: "#000000",
		};
		const canvas = { width: 100, height: 100, getContext: () => ctx };
		const ui = new WitnessUI(canvas as any, undefined, {
			filter: { enabled: true, mode: "custom", customColor: "#ffffff" },
		});
		(ui as any).applyFilter(ctx);
		assert.deepStrictEqual(calls, []);
	});

	await test("WitnessUI applies filter while preserving alpha mask", () => {
		const calls: string[] = [];
		const makeContext = () => ({
			imageSmoothingEnabled: true,
			clearRect: () => calls.push("clearRect"),
			save: () => calls.push("save"),
			restore: () => calls.push("restore"),
			beginPath: () => {},
			moveTo: () => {},
			lineTo: () => {},
			stroke: () => {},
			fill: () => {},
			arc: () => {},
			fillRect: () => calls.push("fillRect"),
			translate: () => {},
			rotate: () => {},
			setTransform: () => {},
			closePath: () => {},
			quadraticCurveTo: () => {},
			drawImage: () => calls.push("drawImage"),
			globalCompositeOperation: "source-over",
			fillStyle: "#000000",
		});

		const mainCtx = makeContext();
		const offscreenCtx = makeContext();
		const offscreenCanvas = {
			width: 100,
			height: 100,
			getContext: () => offscreenCtx,
		};
		const canvas = { width: 100, height: 100, getContext: () => mainCtx };

		const originalDocument = (global as any).document;
		(global as any).document = { createElement: () => offscreenCanvas };

		try {
			const ui = new WitnessUI(canvas as any, undefined, {
				filter: { enabled: true, mode: "custom", customColor: "#ff0000" },
			});
			(ui as any).applyFilter(mainCtx);
		} finally {
			(global as any).document = originalDocument;
		}

		assert.ok(calls.includes("fillRect"));
		assert.ok(calls.filter((c) => c === "drawImage").length >= 3);
	});

	await test("WitnessUI destroy removes listeners", () => {
		const originalCanvasElement = (global as any).HTMLCanvasElement;
		(global as any).HTMLCanvasElement = class {};

		const mockCanvas = Object.assign(Object.create((global as any).HTMLCanvasElement.prototype), createMockCanvas());

		const added: any[] = [];
		const removed: any[] = [];

		mockCanvas.addEventListener = (t: string, l: any) => added.push({ t, l });
		mockCanvas.removeEventListener = (t: string, l: any) => removed.push({ t, l });

		const originalWindow = global.window;
		const winAdded: any[] = [];
		const winRemoved: any[] = [];

		(global as any).window = {
			addEventListener: (t: string, l: any) => winAdded.push({ t, l }),
			removeEventListener: (t: string, l: any) => winRemoved.push({ t, l }),
		};

		try {
			const ui = new WitnessUI(mockCanvas);
			ui.destroy();
			assert.strictEqual(added.length, removed.length);
			assert.strictEqual(winAdded.length, winRemoved.length);
		} finally {
			(global as any).window = originalWindow;
			(global as any).HTMLCanvasElement = originalCanvasElement;
		}
	});

	await test("WitnessUI isPathAtExit detects goal reach", () => {
		const puzzle = createEmptyPuzzle(1, 1);
		puzzle.nodes[0][1].type = NodeType.End;
		const ui = new WitnessUI(createMockCanvas() as unknown as HTMLCanvasElement, puzzle as any);
		const internalUI = ui as any;

		internalUI.prepareOffscreen = () => ({
			canvas: { width: 100, height: 100 },
			ctx: internalUI.ctx,
		});

		internalUI.path = [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
		];
		internalUI.isDrawing = true;

		// 座標計算
		const lastPos = internalUI.getCanvasCoords(1, 0);
		// exitLength はデフォルトで 25

		// 届いていない場合 (90%未満)
		internalUI.currentMousePos = { x: lastPos.x + 10, y: lastPos.y };
		assert.strictEqual(internalUI.isPathAtExit(internalUI.path, internalUI.currentMousePos), false);

		// 届いている場合 (90%以上)
		internalUI.currentMousePos = { x: lastPos.x + 23, y: lastPos.y };
		assert.strictEqual(internalUI.isPathAtExit(internalUI.path, internalUI.currentMousePos), true);
	});

	await test("WitnessUI setPath updates internal state", () => {
		const puzzle = createEmptyPuzzle(1, 1);
		puzzle.nodes[0][1].type = NodeType.End;
		const ui = new WitnessUI(createMockCanvas() as unknown as HTMLCanvasElement, puzzle as any);
		const internalUI = ui as any;

		const path = [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
		];
		ui.setPath(path);

		assert.deepStrictEqual(internalUI.path, path);
		assert.ok(internalUI.exitTipPos !== null, "exitTipPos should be set if path ends at goal");
		assert.strictEqual(internalUI.isInvalidPath, false);
	});
});
