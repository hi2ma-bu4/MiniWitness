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

		// Note: The generator only guarantees uniqueness within the same region.
		// Since we don't have the region information here, we check all pieces
		// and only fail if a negative piece is identical to ALL positive pieces
		// (which is unlikely if there's variety) or if we are sure it's trivial.
		// Actually, we'll keep the original test's strictness but acknowledge
		// it might occasionally fail if different regions have identical pieces.

		const tetrisPos: string[] = [];
		const tetrisNeg: string[] = [];

		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				const cell = grid.cells[r][c];
				if (cell.type === CellType.Tetris || cell.type === CellType.TetrisRotated) {
					tetrisPos.push(JSON.stringify(cell.shape));
				} else if (cell.type === CellType.TetrisNegative || cell.type === CellType.TetrisNegativeRotated) {
					tetrisNeg.push(JSON.stringify(cell.shape));
				}
			}
		}

		if (tetrisNeg.length > 0) {
			for (const negStr of tetrisNeg) {
				for (const posStr of tetrisPos) {
					assert.notStrictEqual(negStr, posStr, `Found identical positive and negative shapes (${negStr}) in generated puzzle trial ${i}`);
				}
			}
		}
	}
});
