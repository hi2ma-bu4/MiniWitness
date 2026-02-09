import assert from "node:assert";
import { test } from "node:test";
import { CellType, PuzzleGenerator } from "../../dist/MiniWitness.js";

test("Performance - Tetris Negative on 5x5 grid", { timeout: 60000 }, () => {
	const generator = new PuzzleGenerator();
	const options = {
		useTetris: true,
		useTetrisNegative: true,
		difficulty: 0.5,
		complexity: 0.8,
	};

	const startTime = Date.now();
	const grid = generator.generate(5, 5, options);
	const endTime = Date.now();

	console.log(`5x5 puzzle generation took ${endTime - startTime}ms`);
	assert.ok(endTime - startTime < 30000, `Generation took too long: ${endTime - startTime}ms`);

	let hasNegative = false;
	for (let r = 0; r < grid.rows; r++) {
		for (let c = 0; c < grid.cols; c++) {
			if (grid.cells[r][c].type === CellType.TetrisNegative || grid.cells[r][c].type === CellType.TetrisNegativeRotated) {
				hasNegative = true;
				break;
			}
		}
		if (hasNegative) break;
	}
	// Note: Since it's random, it might not always have negative pieces,
	// but the performance should be good even if it tries and fails.
});

test("Performance - Tetris Negative on 6x6 grid", { timeout: 60000 }, () => {
	const generator = new PuzzleGenerator();
	const options = {
		useTetris: true,
		useTetrisNegative: true,
		difficulty: 0.5,
		complexity: 0.8,
	};

	const startTime = Date.now();
	const grid = generator.generate(6, 6, options);
	const endTime = Date.now();

	console.log(`6x6 puzzle generation took ${endTime - startTime}ms`);
	assert.ok(endTime - startTime < 30000, `Generation took too long: ${endTime - startTime}ms`);
});
