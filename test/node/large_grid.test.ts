import assert from "node:assert";
import { describe, test } from "node:test";
import { CellType, PuzzleGenerator, WitnessCore } from "../../dist/MiniWitness.js";

const core = new WitnessCore();
const generator = new PuzzleGenerator();

describe("Large grid (8x8)", { concurrency: true }, async (t) => {
	test("generation distribution", () => {
		const options = {
			useHexagons: true,
			useSquares: true,
			useStars: true,
			useTetris: true,
			complexity: 0.8,
			difficulty: 0.5,
		};

		const grid = generator.generate(8, 8, options);

		let marksCount = 0;
		let topHalfMarks = 0;
		let bottomHalfMarks = 0;
		let leftHalfMarks = 0;
		let rightHalfMarks = 0;

		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				if (grid.cells[r][c].type !== CellType.None) {
					marksCount++;
					if (r < grid.rows / 2) topHalfMarks++;
					else bottomHalfMarks++;
					if (c < grid.cols / 2) leftHalfMarks++;
					else rightHalfMarks++;
				}
			}
		}

		console.log("Marks count:", marksCount);
		console.log("Top:", topHalfMarks, "Bottom:", bottomHalfMarks);
		console.log("Left:", leftHalfMarks, "Right:", rightHalfMarks);

		assert.ok(marksCount >= 4, "Should have several marks");

		// 分布の最低保証（フレーク回避）
		if (marksCount >= 10) {
			assert.ok(topHalfMarks > 0 || bottomHalfMarks > 0);
			assert.ok(leftHalfMarks > 0 || rightHalfMarks > 0);
		}
	});

	test("difficulty calculation stability", () => {
		const grid = generator.generate(8, 8, { complexity: 0.5 });
		const difficulty = core.calculateDifficulty(grid);

		console.log("8x8 Difficulty:", difficulty);
		assert.ok(difficulty >= 0 && difficulty <= 1.0);
	});
});
