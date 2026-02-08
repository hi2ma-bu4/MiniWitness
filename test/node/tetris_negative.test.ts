import assert from "node:assert";
import { test } from "node:test";
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

test("Tetris Negative - exact match (disjoint)", () => {
	const puzzle = createBasicGrid(2, 2);
	// 2x2 piece (4 cells) - 1x1 negative (1 cell) = 3 cells.
	puzzle.cells[0][0] = {
		type: CellType.Tetris,
		color: Color.None,
		shape: [
			[1, 1],
			[1, 1],
		],
	};
	puzzle.cells[0][1] = { type: CellType.TetrisNegative, color: Color.None, shape: [[1]] };

	// Region A: (0,0), (0,1), (1,0). Area 3.
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
	assert.strictEqual(result.isValid, true, `Should be valid: 4 - 1 = 3. Error: ${result.errorReason}`);
});

test("Tetris Negative - net area 0", () => {
	const puzzle = createBasicGrid(2, 2);
	// 1x1 positive - 1x1 negative = 0 cells. Any region valid.
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
	assert.strictEqual(result.isValid, true, `Should be valid: net area 0. Error: ${result.errorReason}`);
});

test("Tetris Negative - rotation", () => {
	const puzzle = createBasicGrid(3, 3);
	// 3x1 positive (rotatable) - 1x1 negative = 2 cells.
	puzzle.cells[0][0] = { type: CellType.TetrisRotated, color: Color.None, shape: [[1, 1, 1]] };
	puzzle.cells[1][0] = { type: CellType.TetrisNegative, color: Color.None, shape: [[1]] };

	// Region area 2: (0,0), (1,0).
	// Path: (3,0)-(2,0)-(2,1)-(1,1)-(0,1)-(0,2)-(0,3)
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
	assert.strictEqual(result.isValid, true, `Should be valid with rotation: ${result.errorReason}`);
});

test("Tetris Negative - overlapping positive pieces", () => {
	const puzzle = createBasicGrid(2, 2);
	// P1 (2x1 horiz) at (1,0): covers (1,0), (1,1)
	// P2 (2x1 vert) at (0,1): covers (0,1), (1,1)
	// N1 (1x1) at (1,1): cancels one (1,1)
	// Net: (0,1), (1,0), (1,1). Area 3.

	puzzle.cells[1][0] = { type: CellType.Tetris, color: Color.None, shape: [[1, 1]] };
	puzzle.cells[0][1] = { type: CellType.Tetris, color: Color.None, shape: [[1], [1]] };
	puzzle.cells[1][1] = { type: CellType.TetrisNegative, color: Color.None, shape: [[1]] };

	// Region: (0,1), (1,0), (1,1). Area 3.
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
	assert.strictEqual(result.isValid, true, `Should be valid with overlapping pieces: ${result.errorReason}`);
});

test("Tetris Negative - must stay within puzzle boundaries", () => {
	const puzzle = createBasicGrid(2, 2);
	// 1x3 positive piece. Cannot fit inside 2x2 grid.
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
	assert.strictEqual(result.isValid, false, "Should be invalid: piece exceeds puzzle boundaries");
});
