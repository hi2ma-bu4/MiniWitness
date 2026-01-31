import assert from "node:assert";
import { test } from "node:test";
import { CellType, Color, NodeType, PuzzleData, SolutionPath, WitnessCore } from "../../dist/MiniWitness.js";

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

function getPath(cols: number, rows: number = 1): SolutionPath {
	const points = [];
	for (let i = 0; i <= cols; i++) points.push({ x: i, y: rows });
	points.push({ x: cols, y: rows - 1 });
	return { points };
}

test("Star validation - pair of stars", () => {
	const puzzle = createBasicGrid(1, 2);
	puzzle.cells[0][0] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][1] = { type: CellType.Star, color: Color.Black };
	const result = core.validateSolution(puzzle, getPath(2));
	assert.strictEqual(result.isValid, true, `Should be valid: ${result.errorReason}`);
});

test("Star validation - single star", () => {
	const puzzle = createBasicGrid(1, 2);
	puzzle.cells[0][0] = { type: CellType.Star, color: Color.Black };
	const result = core.validateSolution(puzzle, getPath(2));
	assert.strictEqual(result.isValid, false, "Should be invalid: single star");
});

test("Star validation - three stars", () => {
	const puzzle = createBasicGrid(1, 3);
	puzzle.cells[0][0] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][1] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][2] = { type: CellType.Star, color: Color.Black };
	const result = core.validateSolution(puzzle, getPath(3));
	assert.strictEqual(result.isValid, false, "Should be invalid: three stars");
});

test("Star validation - star and square same color", () => {
	const puzzle = createBasicGrid(1, 2);
	puzzle.cells[0][0] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][1] = { type: CellType.Square, color: Color.Black };
	const result = core.validateSolution(puzzle, getPath(2));
	assert.strictEqual(result.isValid, true, `Should be valid: ${result.errorReason}`);
});

test("Star validation - star and two squares same color", () => {
	const puzzle = createBasicGrid(1, 3);
	puzzle.cells[0][0] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][1] = { type: CellType.Square, color: Color.Black };
	puzzle.cells[0][2] = { type: CellType.Square, color: Color.Black };
	const result = core.validateSolution(puzzle, getPath(3));
	assert.strictEqual(result.isValid, false, "Should be invalid: star + two squares");
});

test("Star validation - stars of different colors in same region", () => {
	const puzzle = createBasicGrid(1, 4);
	puzzle.cells[0][0] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][1] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][2] = { type: CellType.Star, color: Color.White };
	puzzle.cells[0][3] = { type: CellType.Star, color: Color.White };
	const result = core.validateSolution(puzzle, getPath(4));
	assert.strictEqual(result.isValid, true, `Should be valid: ${result.errorReason}`);
});

test("Square validation - different colors in same region", () => {
	const puzzle = createBasicGrid(1, 2);
	puzzle.cells[0][0] = { type: CellType.Square, color: Color.Black };
	puzzle.cells[0][1] = { type: CellType.Square, color: Color.White };
	const result = core.validateSolution(puzzle, getPath(2));
	assert.strictEqual(result.isValid, false, "Should be invalid: squares of different colors");
});

test("Square validation - mixed with none", () => {
	const puzzle = createBasicGrid(1, 2);
	puzzle.cells[0][0] = { type: CellType.Square, color: Color.Black };
	puzzle.cells[0][1] = { type: CellType.None, color: Color.None };
	const result = core.validateSolution(puzzle, getPath(2));
	assert.strictEqual(result.isValid, true, `Should be valid: ${result.errorReason}`);
});

test("Square validation - same color", () => {
	const puzzle = createBasicGrid(1, 2);
	puzzle.cells[0][0] = { type: CellType.Square, color: Color.Black };
	puzzle.cells[0][1] = { type: CellType.Square, color: Color.Black };
	const result = core.validateSolution(puzzle, getPath(2));
	assert.strictEqual(result.isValid, true, `Should be valid: ${result.errorReason}`);
});

test("Star validation - two regions, one valid, one invalid", () => {
	// 2x2 grid, path splits it in half
	const puzzle = createBasicGrid(2, 2);
	// Path: (0,1) -> (1,1) -> (2,1) -> (2,0)
	// Regions:
	//   Bottom: (0,1), (1,1)
	//   Top: (0,0), (1,0)
	const path: SolutionPath = {
		points: [
			{ x: 0, y: 2 }, // Start
			{ x: 0, y: 1 },
			{ x: 1, y: 1 },
			{ x: 2, y: 1 },
			{ x: 2, y: 0 }, // End
		],
	};
	// Region Top: (0,0), (1,0)
	// Region Bottom: (0,1), (1,1)

	puzzle.cells[0][0] = { type: CellType.Star, color: Color.Red };
	puzzle.cells[0][1] = { type: CellType.Star, color: Color.Red }; // Valid top region

	puzzle.cells[1][0] = { type: CellType.Star, color: Color.Blue }; // Invalid bottom region (single blue star)

	const result = core.validateSolution(puzzle, path);
	assert.strictEqual(result.isValid, false, "Should be invalid: one region has single star");
});

test("Star validation - star outside region with its color marks", () => {
	const puzzle = createBasicGrid(2, 2);
	const path: SolutionPath = {
		points: [
			{ x: 0, y: 2 },
			{ x: 0, y: 1 },
			{ x: 1, y: 1 },
			{ x: 2, y: 1 },
			{ x: 2, y: 0 },
		],
	};
	// Region Top: (0,0), (1,0)
	// Region Bottom: (0,1), (1,1)

	puzzle.cells[0][0] = { type: CellType.Star, color: Color.Red }; // Top
	puzzle.cells[1][0] = { type: CellType.Square, color: Color.Red }; // Bottom

	const result = core.validateSolution(puzzle, path);
	assert.strictEqual(result.isValid, false, "Should be invalid: red star is alone in its region");
});

test("Star validation - mixed colors with squares", () => {
	const puzzle = createBasicGrid(1, 3);
	// Region is (0,0), (0,1), (0,2)
	// White Square, White Star -> Total White = 2 (Valid)
	// Black Square, Black Square -> Total Black = 2 (Valid)
	puzzle.cells[0][0] = { type: CellType.Square, color: Color.White };
	puzzle.cells[0][1] = { type: CellType.Star, color: Color.White };
	puzzle.cells[0][2] = { type: CellType.Square, color: Color.Black }; // Should fail because mixed with White Square

	const result = core.validateSolution(puzzle, getPath(3));
	assert.strictEqual(result.isValid, false, "Should be invalid: mixed square colors");
});

test("Star validation - star with different color square", () => {
	const puzzle = createBasicGrid(1, 2);
	// Black Star, White Square
	puzzle.cells[0][0] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][1] = { type: CellType.Square, color: Color.White };

	const result = core.validateSolution(puzzle, getPath(2));
	// Star Rule for Black: Total Black must be 2. Current is 1. -> Fail.
	assert.strictEqual(result.isValid, false, "Should be invalid: star needs another mark of same color");
});

test("Star validation - star mixed with square of different color", () => {
	const puzzle = createBasicGrid(1, 3);
	// Region is (0,0), (0,1), (0,2)
	// Black Star, Black Star -> Valid for Black
	// White Square -> Valid for White (it is the only square color)
	puzzle.cells[0][0] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][1] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][2] = { type: CellType.Square, color: Color.White };

	const result = core.validateSolution(puzzle, getPath(3));
	// According to rules:
	// - Squares in region are [White] -> size 1 -> OK.
	// - Star colors are [Black]. Black count is 2 -> OK.
	// SO IT SHOULD BE VALID.
	assert.strictEqual(result.isValid, true, `Should be valid: ${result.errorReason}`);
});

test("Star validation - broken edges as boundaries", () => {
	const puzzle = createBasicGrid(1, 2);
	// 1x2 grid. Vertices: (0,0), (1,0), (2,0), (0,1), (1,1), (2,1)
	// Cells: (0,0), (1,0)
	// Add a broken edge between (0,0) and (1,0) -> VERTICAL edge at col 1, row 0
	puzzle.vEdges[0][1].type = 2; // EdgeType.Broken

	puzzle.cells[0][0] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][1] = { type: CellType.Star, color: Color.Black };

	// If broken edge works, they are in DIFFERENT regions.
	// Each region will have only 1 black star -> should FAIL.
	const result = core.validateSolution(puzzle, getPath(2));
	assert.strictEqual(result.isValid, false, "Should be invalid: broken edge separates the stars");
});

test("Star validation - star with multiple same color squares", () => {
	const puzzle = createBasicGrid(1, 4);
	puzzle.cells[0][0] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][1] = { type: CellType.Square, color: Color.Black };
	puzzle.cells[0][2] = { type: CellType.Square, color: Color.Black };
	puzzle.cells[0][3] = { type: CellType.Square, color: Color.Black };

	const result = core.validateSolution(puzzle, getPath(4));
	// 1 star, 3 squares -> 4 total. FAIL.
	assert.strictEqual(result.isValid, false, "Should be invalid: star needs exactly 2 of same color");
});

test("Star validation - color counts are independent", () => {
	const puzzle = createBasicGrid(1, 4);
	// Region has: 2 Black Stars, 1 White Star, 1 White Square
	puzzle.cells[0][0] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][1] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][2] = { type: CellType.Star, color: Color.White };
	puzzle.cells[0][3] = { type: CellType.Square, color: Color.White };

	const result = core.validateSolution(puzzle, getPath(4));
	assert.strictEqual(result.isValid, true, `Should be valid: ${result.errorReason}`);
});
