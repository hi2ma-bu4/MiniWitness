import assert from "node:assert";
import { describe, test } from "node:test";
import { PuzzleGenerator } from "../../dist/MiniWitness.js";

const generator = new PuzzleGenerator();

const allConstraints = {
	ratios: {
		hexagonEdge: 0.1,
		hexagonNode: 0.1,
		square: 0.1,
		star: 0.1,
		tetris: 0.1,
		tetrisNegative: 0.1,
		eraser: 0.1,
		triangle: 0.1,
	},
	useBrokenEdges: true,
	complexity: 1,
	difficulty: 1,
};

describe("Generation performance baseline", () => {
	test("6x6 generation with all constraints emits a valid grid and logs elapsed time", { timeout: 150_000 }, (t) => {
		const started = performance.now();
		const grid = generator.generate(6, 6, allConstraints);
		const elapsed = performance.now() - started;

		t.diagnostic(`6x6 all-constraints generation: ${elapsed.toFixed(2)}ms`);
		assert.equal(grid.rows, 6);
		assert.equal(grid.cols, 6);
		assert.ok(elapsed > 0);
	});
});
