import assert from "node:assert";
import { test } from "node:test";
import { CellType, PuzzleGenerator } from "../../dist/MiniWitness.js";

test("Generator - Tetris Negative pieces should not be identical to any positive piece in the same region", () => {
	const generator = new PuzzleGenerator();
	const options = {
		useTetris: true,
		useTetrisNegative: true,
		difficulty: 0.5,
		complexity: 0.8,
	};

	for (let i = 0; i < 20; i++) {
		const grid = generator.generate(4, 4, options);

		// Use logic from validator to find regions
		// But for generation testing, we can just check all cells
		const tetrisPos: any[] = [];
		const tetrisNeg: any[] = [];

		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				const cell = grid.cells[r][c];
				if (cell.type === CellType.Tetris || cell.type === CellType.TetrisRotated) {
					tetrisPos.push(cell.shape);
				} else if (cell.type === CellType.TetrisNegative || cell.type === CellType.TetrisNegativeRotated) {
					tetrisNeg.push(cell.shape);
				}
			}
		}

		if (tetrisNeg.length > 0) {
			for (const negShape of tetrisNeg) {
				const negStr = JSON.stringify(negShape);
				for (const posShape of tetrisPos) {
					const posStr = JSON.stringify(posShape);
					assert.notStrictEqual(negStr, posStr, "Found identical positive and negative shapes in generated puzzle");
				}
			}
		}
	}
});
