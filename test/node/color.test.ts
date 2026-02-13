import assert from "node:assert";
import { describe, test } from "node:test";
import { CellType, WitnessCore } from "../../dist/MiniWitness.js";

describe("Color Options", { concurrency: true }, () => {
	const core = new WitnessCore();

	test("should use availableColors if provided", () => {
		const availableColors = [10, 11, 12];
		const grid = core.createPuzzle(3, 3, {
			useSquares: true,
			useStars: false,
			availableColors: availableColors,
			complexity: 1.0,
		});

		let foundCustomColor = false;
		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				if (grid.cells[r][c].type === CellType.Square) {
					assert.ok(availableColors.includes(grid.cells[r][c].color), `Color ${grid.cells[r][c].color} not in ${availableColors}`);
					foundCustomColor = true;
				}
			}
		}
		assert.ok(foundCustomColor, "Should have generated at least one square");
	});

	test("should use defaultColors if provided", () => {
		const defaultTetrisColor = 5;
		const grid = core.createPuzzle(4, 4, {
			useTetris: true,
			useStars: false, // Avoid random color assignment for stars
			defaultColors: {
				Tetris: defaultTetrisColor,
			},
			complexity: 1.0,
		});

		let foundTetris = false;
		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				if (grid.cells[r][c].type === CellType.Tetris || grid.cells[r][c].type === CellType.TetrisRotated) {
					assert.strictEqual(grid.cells[r][c].color, defaultTetrisColor);
					foundTetris = true;
				}
			}
		}
		assert.ok(foundTetris, "Should have generated at least one tetris piece");
	});

	test("Tetris and Triangle marks should use default color even with Eraser", () => {
		const defaultTetrisColor = 5;
		const defaultTriangleColor = 6;

		// Run multiple times to increase chance of hitting the Eraser-Tetris/Triangle error generation path
		for (let i = 0; i < 20; i++) {
			const grid = core.createPuzzle(4, 4, {
				useTetris: true,
				useTriangles: true,
				useEraser: true,
				useStars: false,
				defaultColors: {
					Tetris: defaultTetrisColor,
					Triangle: defaultTriangleColor,
				},
				complexity: 1.0,
			});

			for (let r = 0; r < grid.rows; r++) {
				for (let c = 0; c < grid.cols; c++) {
					const cell = grid.cells[r][c];
					if (cell.type === CellType.Tetris || cell.type === CellType.TetrisRotated) {
						assert.strictEqual(cell.color, defaultTetrisColor, `Tetris at (${r},${c}) has wrong color ${cell.color} at iteration ${i}`);
					}
					if (cell.type === CellType.TetrisNegative || cell.type === CellType.TetrisNegativeRotated) {
						assert.strictEqual(cell.color, defaultTetrisColor, `TetrisNegative at (${r},${c}) has wrong color ${cell.color} at iteration ${i}`);
					}
					if (cell.type === CellType.Triangle) {
						assert.strictEqual(cell.color, defaultTriangleColor, `Triangle at (${r},${c}) has wrong color ${cell.color} at iteration ${i}`);
					}
				}
			}
		}
	});
});
