import assert from "node:assert";
import { describe, test } from "node:test";
import { CellType, Color, NodeType, type PuzzleData, WitnessCore } from "../../dist/MiniWitness.js";

const core = new WitnessCore();

function createBasicGrid(rows: number, cols: number): PuzzleData {
	const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ type: CellType.None, color: Color.None })));
	const vEdges = Array.from({ length: rows }, () => Array.from({ length: cols + 1 }, () => ({ type: 0 })));
	const hEdges = Array.from({ length: rows + 1 }, () => Array.from({ length: cols }, () => ({ type: 0 })));
	const nodes = Array.from({ length: rows + 1 }, () => Array.from({ length: cols + 1 }, () => ({ type: NodeType.Normal })));
	nodes[rows][0].type = NodeType.Start;
	nodes[0][cols].type = NodeType.End;
	return { rows, cols, cells, vEdges, hEdges, nodes };
}

/* =========================
 * Square エラー報告
 * ========================= */
describe("Error reporting - Square", { concurrency: true }, () => {
	test("Square color conflict", () => {
		const puzzle = createBasicGrid(1, 2);
		puzzle.cells[0][0] = { type: CellType.Square, color: Color.Black };
		puzzle.cells[0][1] = { type: CellType.Square, color: Color.White };

		const path = {
			points: [
				{ x: 0, y: 1 },
				{ x: 1, y: 1 },
				{ x: 2, y: 1 },
				{ x: 2, y: 0 },
			],
		};

		const result = core.validateSolution(puzzle, path);

		assert.strictEqual(result.isValid, false);
		assert.ok(result.errorCells && result.errorCells.length >= 2);
		const errorKeys = new Set(result.errorCells.map((p) => `${p.x},${p.y}`));
		assert.ok(errorKeys.has("0,0"));
		assert.ok(errorKeys.has("1,0"));
	});
});

/* =========================
 * Star エラー報告
 * ========================= */
describe("Error reporting - Star", { concurrency: true }, () => {
	test("Star single", () => {
		const puzzle = createBasicGrid(1, 1);
		puzzle.cells[0][0] = { type: CellType.Star, color: Color.Red };

		const path = {
			points: [
				{ x: 0, y: 1 },
				{ x: 1, y: 1 },
				{ x: 1, y: 0 },
			],
		};

		const result = core.validateSolution(puzzle, path);

		assert.strictEqual(result.isValid, false);
		assert.ok(result.errorCells && result.errorCells.length === 1);
		assert.strictEqual(result.errorCells[0].x, 0);
		assert.strictEqual(result.errorCells[0].y, 0);
	});
});

/* =========================
 * Eraser エラー報告
 * ========================= */
describe("Error reporting - Eraser", { concurrency: true }, () => {
	test("Eraser failing to negate (Star pair + Eraser)", () => {
		const puzzle = createBasicGrid(1, 3);
		puzzle.cells[0][0] = { type: CellType.Star, color: Color.Red };
		puzzle.cells[0][1] = { type: CellType.Eraser, color: Color.White };
		puzzle.cells[0][2] = { type: CellType.Star, color: Color.Red };

		const path = {
			points: [
				{ x: 0, y: 1 },
				{ x: 1, y: 1 },
				{ x: 2, y: 1 },
				{ x: 3, y: 1 },
				{ x: 3, y: 0 },
			],
		};

		const result = core.validateSolution(puzzle, path);

		assert.strictEqual(result.isValid, false);
		assert.strictEqual(result.invalidatedCells?.length, 0);
		assert.ok(result.errorCells?.some((p) => p.x === 1 && p.y === 0));
	});

	test("Eraser in valid region should not negate", () => {
		const puzzle = createBasicGrid(1, 2);
		puzzle.cells[0][0] = { type: CellType.Square, color: Color.Black };
		puzzle.cells[0][1] = { type: CellType.Eraser, color: Color.White };

		const path = {
			points: [
				{ x: 0, y: 1 },
				{ x: 1, y: 1 },
				{ x: 2, y: 1 },
				{ x: 2, y: 0 },
			],
		};

		const result = core.validateSolution(puzzle, path);

		assert.strictEqual(result.isValid, false);
		assert.strictEqual(result.invalidatedCells?.length, 0);
		assert.ok(result.errorCells?.some((p) => p.x === 1 && p.y === 0));
		assert.ok(!result.errorCells?.some((p) => p.x === 0 && p.y === 0));
	});
});
