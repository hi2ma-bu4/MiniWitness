import assert from "node:assert";
import { test } from "node:test";
import { PuzzleSerializer, WitnessUI } from "../../dist/MiniWitness.js";

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
	}),
});

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
	internalUI.puzzle = { symmetry: 1 }; // SymmetryType.Horizontal
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

test("WitnessUI stayPathOnError=false triggers fade after delay", () => {
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
	assert.strictEqual(internalUI.isFading, false, "Should not trigger fade immediately (wait for blinkDuration)");

	// Simulate time passing
	internalUI.eraserAnimationStartTime = Date.now() - 200;
	internalUI.animate();

	assert.strictEqual(internalUI.isFading, true, "Should trigger fade after blinkDuration delay");
});
