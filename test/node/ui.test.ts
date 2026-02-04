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
