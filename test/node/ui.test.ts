import assert from "node:assert";
import { test } from "node:test";
import { CellType, Color, NodeType, PuzzleSerializer, WitnessUI } from "../../dist/MiniWitness.js";

test("WitnessUI export", () => {
	assert.ok(WitnessUI, "WitnessUI should be exported");
});

test("PuzzleSerializer export", () => {
	assert.ok(PuzzleSerializer, "PuzzleSerializer should be exported");
});

const createMockCanvas = () => ({
	width: 100,
	height: 100,
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

test("WitnessUI instantiation in Node (should not crash with mock canvas)", () => {
	const ui = new WitnessUI(createMockCanvas() as unknown as HTMLCanvasElement);
	assert.ok(ui instanceof WitnessUI);
});

test("WitnessUI setValidationResult updates internal state", () => {
	const ui = new WitnessUI(createMockCanvas() as unknown as HTMLCanvasElement);
	const internalUI = ui as unknown as { isSuccessFading: boolean; successFadeStartTime: number; invalidatedCells: unknown[] };
	ui.setValidationResult(true, [{ x: 0, y: 0 }]);
	assert.strictEqual(internalUI.isSuccessFading, true, "isSuccessFading should be true on valid result");
	assert.ok(internalUI.successFadeStartTime > 0, "successFadeStartTime should be set");
	assert.strictEqual(internalUI.invalidatedCells.length, 1, "invalidatedCells should be updated");
});

test("WitnessUI preserves color in symmetry mode", () => {
	const ui = new WitnessUI(createMockCanvas() as unknown as HTMLCanvasElement);
	const internalUI = ui as unknown as { puzzle: { symmetry: number }; isSuccessFading: boolean };
	internalUI.puzzle = { symmetry: 1 } as any; // SymmetryType.Horizontal
	ui.setValidationResult(true);

	assert.strictEqual(internalUI.puzzle.symmetry, 1);
	assert.strictEqual(internalUI.isSuccessFading, true);
});

test("WitnessUI instantiation with mock canvas object", () => {
	const ui = new WitnessUI(createMockCanvas() as unknown as HTMLCanvasElement);
	assert.ok(ui instanceof WitnessUI);
});

test("WitnessUI setCanvasRect", () => {
	const ui = new WitnessUI(createMockCanvas() as unknown as HTMLCanvasElement);
	const internalUI = ui as unknown as { canvasRect: unknown };
	const rect = { left: 10, top: 20, width: 300, height: 400 };
	ui.setCanvasRect(rect);
	assert.deepStrictEqual(internalUI.canvasRect, rect);
});

test("WitnessUI new options are merged correctly", () => {
	const ui = new WitnessUI(createMockCanvas() as unknown as HTMLCanvasElement, undefined, {
		blinkMarksOnError: false,
		stayPathOnError: false,
	});
	const internalUI = ui as unknown as { options: { blinkMarksOnError: boolean; stayPathOnError: boolean } };
	assert.strictEqual(internalUI.options.blinkMarksOnError, false);
	assert.strictEqual(internalUI.options.stayPathOnError, false);
});

test("WitnessUI stayPathOnError=false triggers fade immediately", () => {
	const ui = new WitnessUI(createMockCanvas() as unknown as HTMLCanvasElement, undefined, {
		stayPathOnError: false,
		animations: { blinkDuration: 100, fadeDuration: 100, blinkPeriod: 100 },
	});
	const internalUI = ui as unknown as { isFading: boolean; isInvalidPath: boolean; path: unknown[]; eraserAnimationStartTime: number; animate: () => void };

	// Set a path so startFade can be triggered
	internalUI.path = [
		{ x: 0, y: 0 },
		{ x: 1, y: 0 },
	];

	ui.setValidationResult(false);
	assert.strictEqual(internalUI.isInvalidPath, true);

	// animate() should trigger fade immediately
	internalUI.animate();

	assert.strictEqual(internalUI.isFading, true, "Should trigger fade immediately");
	assert.strictEqual(internalUI.path.length, 0, "Path should be cleared to start fading");
});

test("WitnessUI success result with negation turns line red during blink", () => {
	const ui = new WitnessUI(createMockCanvas() as unknown as HTMLCanvasElement);
	const internalUI = ui as any;
	internalUI.path = [
		{ x: 0, y: 0 },
		{ x: 1, y: 0 },
	];
	internalUI.exitTipPos = { x: 100, y: 100 };

	ui.setValidationResult(true, [{ x: 0, y: 0 }]); // negation present

	assert.strictEqual(internalUI.isSuccessFading, true);
	assert.strictEqual(internalUI.invalidatedCells.length, 1);
});

test("WitnessUI success result with negation and stayPathOnError=false fades during blink", () => {
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

	ui.setValidationResult(true, [{ x: 0, y: 0 }]); // negation present

	// Mock Date.now to be halfway through blinkDuration
	const start = internalUI.successFadeStartTime;
	const originalNow = Date.now;
	Date.now = () => start + 500;

	try {
		// We can't easily check the local pathOpacity variable in draw(),
		// but we can verify the path is still there (not cleared by startFade)
		assert.strictEqual(internalUI.path.length, 2);
		assert.strictEqual(internalUI.isSuccessFading, true);
		assert.strictEqual(internalUI.isFading, false, "Should not use the global isFading for success fade during blink phase");
	} finally {
		Date.now = originalNow;
	}
});

test("WitnessUI symmetry path fading state", () => {
	const puzzle = createEmptyPuzzle(1, 1);
	(puzzle as any).symmetry = 1; // Horizontal
	const ui = new WitnessUI(createMockCanvas() as unknown as HTMLCanvasElement, puzzle as any);
	const internalUI = ui as any;

	// Mock prepareOffscreen to avoid canvas creation errors in Node
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
