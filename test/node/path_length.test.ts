import assert from "node:assert";
import { describe, test } from "node:test";
import { EdgeType, PuzzleGenerator } from "../../dist/MiniWitness.js";

describe("Path Length", { concurrency: true }, async (t) => {
	test("compare 0.0 and 1.0", () => {
		const generator = new PuzzleGenerator();
		const size = 5;

		// High complexity to encourage more hexagons
		const optionsShort = { pathLength: 0.0, useHexagons: true, complexity: 1.0 };
		const optionsLong = { pathLength: 1.0, useHexagons: true, complexity: 1.0 };

		function countHex(grid: any): number {
			let hex = 0;
			for (let r = 0; r <= grid.rows; r++) for (let c = 0; c < grid.cols; c++) if (grid.hEdges[r][c].type === EdgeType.Hexagon) hex++;

			for (let r = 0; r < grid.rows; r++) for (let c = 0; c <= grid.cols; c++) if (grid.vEdges[r][c].type === EdgeType.Hexagon) hex++;

			return hex;
		}

		let totalHexShort = 0;
		let totalHexLong = 0;
		const trials = 5;

		for (let i = 0; i < trials; i++) {
			totalHexShort += countHex(generator.generate(size, size, optionsShort));
			totalHexLong += countHex(generator.generate(size, size, optionsLong));
		}

		const avgShort = totalHexShort / trials;
		const avgLong = totalHexLong / trials;

		console.log(`Average Hexagons (Short): ${avgShort}`);
		console.log(`Average Hexagons (Long): ${avgLong}`);

		// Long paths should generally have more hexagons
		assert.ok(avgLong > avgShort, `Long paths should have more hexagons on average. Long: ${avgLong}, Short: ${avgShort}`);
	});

	test("mid value (0.5)", () => {
		const generator = new PuzzleGenerator();
		const options = { pathLength: 0.5 };
		const grid = generator.generate(4, 4, options);
		assert.ok(grid !== null, "Should generate a grid with pathLength 0.5");
	});
});
