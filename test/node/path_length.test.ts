import assert from "node:assert";
import { test } from "node:test";
import { EdgeType, PuzzleGenerator } from "../../dist/MiniWitness.js";

test("Path Length - compare 0.0 and 1.0", () => {
	const generator = new PuzzleGenerator();
	const size = 5;

	// Use high complexity to encourage more hexagons
	const optionsShort = { pathLength: 0.0, useHexagons: true, complexity: 1.0 };
	const optionsLong = { pathLength: 1.0, useHexagons: true, complexity: 1.0 };

	let totalHexShort = 0;
	let totalHexLong = 0;
	const trials = 10;

	for (let i = 0; i < trials; i++) {
		const gridShort = generator.generate(size, size, optionsShort);
		let hexShort = 0;
		for (let r = 0; r <= gridShort.rows; r++) for (let c = 0; c < gridShort.cols; c++) if (gridShort.hEdges[r][c].type === EdgeType.Hexagon) hexShort++;
		for (let r = 0; r < gridShort.rows; r++) for (let c = 0; c <= gridShort.cols; c++) if (gridShort.vEdges[r][c].type === EdgeType.Hexagon) hexShort++;
		totalHexShort += hexShort;

		const gridLong = generator.generate(size, size, optionsLong);
		let hexLong = 0;
		for (let r = 0; r <= gridLong.rows; r++) for (let c = 0; c < gridLong.cols; c++) if (gridLong.hEdges[r][c].type === EdgeType.Hexagon) hexLong++;
		for (let r = 0; r < gridLong.rows; r++) for (let c = 0; c <= gridLong.cols; c++) if (gridLong.vEdges[r][c].type === EdgeType.Hexagon) hexLong++;
		totalHexLong += hexLong;
	}

	const avgShort = totalHexShort / trials;
	const avgLong = totalHexLong / trials;

	console.log(`Average Hexagons (Short): ${avgShort}`);
	console.log(`Average Hexagons (Long): ${avgLong}`);

	// Long paths should generally have more hexagons because they are longer.
	assert.ok(avgLong > avgShort, `Long paths should have more hexagons on average. Long: ${avgLong}, Short: ${avgShort}`);
});

test("Path Length - mid value (0.5)", () => {
	const generator = new PuzzleGenerator();
	const options = { pathLength: 0.5 };
	const grid = generator.generate(4, 4, options);
	assert.ok(grid !== null, "Should generate a grid with pathLength 0.5");
});
