import assert from "node:assert";
import { describe, it } from "node:test";
import { WitnessCore } from "../../src/index";
import { CellType } from "../../src/types";

describe("Color Options", () => {
	const core = new WitnessCore();

	it("should use availableColors if provided", () => {
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

	it("should use defaultColors if provided", () => {
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
});
