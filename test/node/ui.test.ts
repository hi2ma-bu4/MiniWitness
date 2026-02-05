import assert from "node:assert";
import { test } from "node:test";
import { WitnessUI } from "../../dist/MiniWitness.js";

test("WitnessUI export", () => {
	assert.ok(WitnessUI, "WitnessUI should be exported");
});

test("WitnessUI instantiation in Node (should not crash)", () => {
	// In Node, WitnessUI should not crash but it won't have a real canvas
	const ui = new WitnessUI("dummy-id");
	assert.ok(ui instanceof WitnessUI);
});

test("WitnessUI setValidationResult updates internal state", () => {
	const ui = new WitnessUI("dummy-id") as any;
	ui.setValidationResult(true, [{ x: 0, y: 0 }]);
	assert.strictEqual(ui.isSuccessFading, true, "isSuccessFading should be true on valid result");
	assert.ok(ui.successFadeStartTime > 0, "successFadeStartTime should be set");
	assert.strictEqual(ui.invalidatedCells.length, 1, "invalidatedCells should be updated");
});
