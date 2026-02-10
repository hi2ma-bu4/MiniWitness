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

describe("Tetris Negative validation", { concurrency: true }, () => {
	test("exact match (disjoint)", () => {
		const puzzle = createBasicGrid(2, 2);

		puzzle.cells[0][0] = {
			type: CellType.Tetris,
			color: Color.None,
			shape: [
				[1, 1],
				[1, 1],
			],
		};
		puzzle.cells[0][1] = {
			type: CellType.TetrisNegative,
			color: Color.None,
			shape: [[1]],
		};

		const path = {
			points: [
				{ x: 0, y: 2 },
				{ x: 1, y: 2 },
				{ x: 1, y: 1 },
				{ x: 2, y: 1 },
				{ x: 2, y: 0 },
			],
		};

		const result = core.validateSolution(puzzle, path);
		assert.strictEqual(result.isValid, true);
	});

	test("net area 0", () => {
		const puzzle = createBasicGrid(2, 2);

		puzzle.cells[0][0] = { type: CellType.Tetris, color: Color.None, shape: [[1]] };
		puzzle.cells[0][1] = { type: CellType.TetrisNegative, color: Color.None, shape: [[1]] };

		const path = {
			points: [
				{ x: 0, y: 2 },
				{ x: 1, y: 2 },
				{ x: 1, y: 1 },
				{ x: 2, y: 1 },
				{ x: 2, y: 0 },
			],
		};

		const result = core.validateSolution(puzzle, path);
		assert.strictEqual(result.isValid, true);
	});

	test("rotation", () => {
		const puzzle = createBasicGrid(3, 3);

		puzzle.cells[0][0] = {
			type: CellType.TetrisRotated,
			color: Color.None,
			shape: [[1, 1, 1]],
		};
		puzzle.cells[1][0] = {
			type: CellType.TetrisNegative,
			color: Color.None,
			shape: [[1]],
		};

		const path = {
			points: [
				{ x: 0, y: 3 },
				{ x: 0, y: 2 },
				{ x: 1, y: 2 },
				{ x: 1, y: 1 },
				{ x: 1, y: 0 },
				{ x: 2, y: 0 },
				{ x: 3, y: 0 },
			],
		};

		const result = core.validateSolution(puzzle, path);
		assert.strictEqual(result.isValid, true);
	});

	test("overlapping positive pieces", () => {
		const puzzle = createBasicGrid(2, 2);

		puzzle.cells[1][0] = { type: CellType.Tetris, color: Color.None, shape: [[1, 1]] };
		puzzle.cells[0][1] = { type: CellType.Tetris, color: Color.None, shape: [[1], [1]] };
		puzzle.cells[1][1] = { type: CellType.TetrisNegative, color: Color.None, shape: [[1]] };

		const path = {
			points: [
				{ x: 0, y: 2 },
				{ x: 0, y: 1 },
				{ x: 1, y: 1 },
				{ x: 1, y: 0 },
				{ x: 2, y: 0 },
			],
		};

		const result = core.validateSolution(puzzle, path);
		assert.strictEqual(result.isValid, true);
	});

	test("must stay within puzzle boundaries", () => {
		const puzzle = createBasicGrid(2, 2);

		puzzle.cells[0][0] = { type: CellType.Tetris, color: Color.None, shape: [[1, 1, 1]] };
		puzzle.cells[0][1] = { type: CellType.TetrisNegative, color: Color.None, shape: [[1]] };

		const path = {
			points: [
				{ x: 0, y: 2 },
				{ x: 1, y: 2 },
				{ x: 1, y: 1 },
				{ x: 2, y: 1 },
				{ x: 2, y: 0 },
			],
		};

		const result = core.validateSolution(puzzle, path);
		assert.strictEqual(result.isValid, false);
	});

	test("net area 0 with different shapes should be INVALID", () => {
		const puzzle = createBasicGrid(2, 2);

		puzzle.cells[0][0] = { type: CellType.Tetris, color: Color.None, shape: [[1, 1]] };
		puzzle.cells[0][1] = {
			type: CellType.TetrisNegative,
			color: Color.None,
			shape: [[1], [1]],
		};

		const path = {
			points: [
				{ x: 0, y: 2 },
				{ x: 1, y: 2 },
				{ x: 1, y: 1 },
				{ x: 2, y: 1 },
				{ x: 2, y: 0 },
			],
		};

		const result = core.validateSolution(puzzle, path);
		assert.strictEqual(result.isValid, false);
	});

	test("net area 0 with different shapes but ONE is rotatable should be VALID", () => {
		const puzzle = createBasicGrid(2, 2);

		puzzle.cells[0][0] = { type: CellType.Tetris, color: Color.None, shape: [[1, 1]] };
		puzzle.cells[0][1] = {
			type: CellType.TetrisNegativeRotated,
			color: Color.None,
			shape: [[1], [1]],
		};

		const path = {
			points: [
				{ x: 0, y: 2 },
				{ x: 1, y: 2 },
				{ x: 1, y: 1 },
				{ x: 2, y: 1 },
				{ x: 2, y: 0 },
			],
		};

		const result = core.validateSolution(puzzle, path);
		assert.strictEqual(result.isValid, true);
	});

	test("2:1 cancellation (P1 + P2 = N)", () => {
		const puzzle = createBasicGrid(2, 2);

		puzzle.cells[0][0] = { type: CellType.Tetris, color: Color.None, shape: [[1]] };
		puzzle.cells[0][1] = { type: CellType.Tetris, color: Color.None, shape: [[1]] };
		puzzle.cells[1][0] = {
			type: CellType.TetrisNegative,
			color: Color.None,
			shape: [[1, 1]],
		};

		const path = {
			points: [
				{ x: 0, y: 2 },
				{ x: 1, y: 2 },
				{ x: 2, y: 2 },
				{ x: 2, y: 1 },
				{ x: 2, y: 0 },
			],
		};

		const result = core.validateSolution(puzzle, path);
		assert.strictEqual(result.isValid, true);
	});

	test("1:2 cancellation (P = N1 + N2)", () => {
		const puzzle = createBasicGrid(2, 2);

		puzzle.cells[0][0] = { type: CellType.Tetris, color: Color.None, shape: [[1, 1]] };
		puzzle.cells[0][1] = { type: CellType.TetrisNegative, color: Color.None, shape: [[1]] };
		puzzle.cells[1][0] = { type: CellType.TetrisNegative, color: Color.None, shape: [[1]] };

		const path = {
			points: [
				{ x: 0, y: 2 },
				{ x: 1, y: 2 },
				{ x: 2, y: 2 },
				{ x: 2, y: 1 },
				{ x: 2, y: 0 },
			],
		};

		const result = core.validateSolution(puzzle, path);
		assert.strictEqual(result.isValid, true);
	});

	test("complex non-zero (P - N1 - N2 = T)", () => {
		const puzzle = createBasicGrid(3, 2);

		puzzle.cells[0][0] = {
			type: CellType.Tetris,
			color: Color.None,
			shape: [
				[1, 1],
				[1, 1],
				[1, 1],
			],
		};
		puzzle.cells[1][0] = {
			type: CellType.TetrisNegative,
			color: Color.None,
			shape: [[1], [1]],
		};
		puzzle.cells[2][0] = {
			type: CellType.TetrisNegative,
			color: Color.None,
			shape: [[1]],
		};

		const path = {
			points: [
				{ x: 0, y: 3 },
				{ x: 1, y: 3 },
				{ x: 1, y: 2 },
				{ x: 1, y: 1 },
				{ x: 1, y: 0 },
				{ x: 2, y: 0 },
			],
		};

		const result = core.validateSolution(puzzle, path);
		assert.strictEqual(result.isValid, true);
	});
});
