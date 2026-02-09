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

test("Tetris Negative - net area 0 with different shapes should be INVALID", () => {
	const puzzle = createBasicGrid(2, 2);
	// 1x2 positive - 2x1 negative = 0 cells but shapes differ.
	puzzle.cells[0][0] = { type: CellType.Tetris, color: Color.None, shape: [[1, 1]] };
	puzzle.cells[0][1] = { type: CellType.TetrisNegative, color: Color.None, shape: [[1], [1]] };

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
	assert.strictEqual(result.isValid, false, "Should be invalid: different shapes (1x2 vs 2x1) cannot cancel to zero without rotation");
});

test("Tetris Negative - net area 0 with different shapes but ONE is rotatable should be VALID", () => {
	const puzzle = createBasicGrid(2, 2);
	// 1x2 positive - 2x1 negative (rotatable) = 0 cells.
	puzzle.cells[0][0] = { type: CellType.Tetris, color: Color.None, shape: [[1, 1]] };
	puzzle.cells[0][1] = { type: CellType.TetrisNegativeRotated, color: Color.None, shape: [[1], [1]] };

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
	assert.strictEqual(result.isValid, true, "Should be valid: 1x2 can be canceled by 2x1 rotatable");
});

test("Tetris Negative - 2:1 cancellation (P1 + P2 = N)", () => {
	const puzzle = createBasicGrid(2, 2);
	// P1: 1x1, P2: 1x1, N: 2x1.
	puzzle.cells[0][0] = { type: CellType.Tetris, color: Color.None, shape: [[1]] };
	puzzle.cells[0][1] = { type: CellType.Tetris, color: Color.None, shape: [[1]] };
	puzzle.cells[1][0] = { type: CellType.TetrisNegative, color: Color.None, shape: [[1, 1]] };

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
	assert.strictEqual(result.isValid, true, "Should be valid: 1x1 + 1x1 = 2x1. Net area 0.");
});

test("Tetris Negative - 1:2 cancellation (P = N1 + N2)", () => {
	const puzzle = createBasicGrid(2, 2);
	// P: 2x1, N1: 1x1, N2: 1x1.
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
	assert.strictEqual(result.isValid, true, "Should be valid: 2x1 = 1x1 + 1x1. Net area 0.");
});

test("Tetris Negative - complex non-zero (P - N1 - N2 = T)", () => {
	const puzzle = createBasicGrid(3, 2);
	// Region: Left column. Area 3.
	// P: 2x3 (area 6) at (0,0) -> (1,2)
	// N1: 1x2 vertical at (1,0)-(1,1) -> area 2
	// N2: 1x1 at (1,2) -> area 1
	// Net area: 6 - 2 - 1 = 3.
	puzzle.cells[0][0] = {
		type: CellType.Tetris,
		color: Color.None,
		shape: [
			[1, 1],
			[1, 1],
			[1, 1],
		],
	};
	puzzle.cells[1][0] = { type: CellType.TetrisNegative, color: Color.None, shape: [[1], [1]] };
	puzzle.cells[2][0] = { type: CellType.TetrisNegative, color: Color.None, shape: [[1]] };

	// Path to isolate column 0.
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
	assert.strictEqual(result.isValid, true, "Should be valid: 6 - 2 - 1 = 3. Matches region.");
});
