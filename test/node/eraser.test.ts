import assert from "node:assert";
import { test } from "node:test";
import { CellType, Color, EdgeType, NodeType, type PuzzleData, PuzzleGenerator, type SolutionPath, WitnessCore } from "../../dist/MiniWitness.js";

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

test("Eraser validation - erase star violation", () => {
	const puzzle3 = createBasicGrid(1, 4);
	puzzle3.cells[0][0] = { type: CellType.Star, color: Color.Black };
	puzzle3.cells[0][1] = { type: CellType.Star, color: Color.Black };
	puzzle3.cells[0][2] = { type: CellType.Star, color: Color.Black };
	puzzle3.cells[0][3] = { type: CellType.Eraser, color: Color.White };

	const result = core.validateSolution(puzzle3, getPath(4));
	assert.strictEqual(result.isValid, true, `Should be valid with eraser: ${result.errorReason}`);
});

test("Eraser validation - eraser in already valid region", () => {
	const puzzle = createBasicGrid(1, 3);
	puzzle.cells[0][0] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][1] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][2] = { type: CellType.Eraser, color: Color.White };

	const result = core.validateSolution(puzzle, getPath(3));
	assert.strictEqual(result.isValid, false, "Should be invalid: eraser has nothing to erase and not needed as mark");
});

test("Eraser validation - erase square violation", () => {
	const puzzle = createBasicGrid(1, 3);
	puzzle.cells[0][0] = { type: CellType.Square, color: Color.Black };
	puzzle.cells[0][1] = { type: CellType.Square, color: Color.White };
	puzzle.cells[0][2] = { type: CellType.Eraser, color: Color.White };

	const result = core.validateSolution(puzzle, getPath(3));
	assert.strictEqual(result.isValid, true, "Should be valid: eraser removes white square");
});

test("Eraser validation - two erasers erasing each other in valid region", () => {
	const puzzle = createBasicGrid(1, 2);
	puzzle.cells[0][0] = { type: CellType.Eraser, color: Color.White };
	puzzle.cells[0][1] = { type: CellType.Eraser, color: Color.White };

	const result = core.validateSolution(puzzle, getPath(2));
	assert.strictEqual(result.isValid, true, "Should be valid: two erasers negate each other");
});

test("Eraser validation - one star and two erasers (invalid)", () => {
	const puzzle = createBasicGrid(1, 3);
	puzzle.cells[0][0] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][1] = { type: CellType.Eraser, color: Color.White };
	puzzle.cells[0][2] = { type: CellType.Eraser, color: Color.White };

	const result = core.validateSolution(puzzle, getPath(3));
	assert.strictEqual(result.isValid, false, "1 Star + 2 Erasers should be INVALID");
});

test("Eraser validation - colored eraser completing star pair (invalid)", () => {
	const puzzle = createBasicGrid(1, 2);
	puzzle.cells[0][0] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][1] = { type: CellType.Eraser, color: Color.Black };

	const result = core.validateSolution(puzzle, getPath(2));
	assert.strictEqual(result.isValid, false, "1 Star + 1 Eraser of same color should be INVALID (no error to negate)");
});

test("Eraser validation - colored eraser redundant pair", () => {
	const puzzle = createBasicGrid(1, 3);
	puzzle.cells[0][0] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][1] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][2] = { type: CellType.Eraser, color: Color.Black };

	const result = core.validateSolution(puzzle, getPath(3));
	assert.strictEqual(result.isValid, true, "2 Stars + 1 Eraser of same color should be VALID (Eraser can negate one Star to form a pair)");
});

test("Eraser validation - complex scenario (2 White Sq, 1 White Star, 1 Black Star, 1 Black Eraser)", () => {
	const puzzle = createBasicGrid(1, 5);
	puzzle.cells[0][0] = { type: CellType.Square, color: Color.White };
	puzzle.cells[0][1] = { type: CellType.Square, color: Color.White };
	puzzle.cells[0][2] = { type: CellType.Star, color: Color.White };
	puzzle.cells[0][3] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][4] = { type: CellType.Eraser, color: Color.Black };

	const result = core.validateSolution(puzzle, getPath(5));
	assert.strictEqual(result.isValid, true, "Should be valid: Black Eraser pairs with Black Star AND negates one White Square");

	// Check that exactly one White Square was invalidated.
	// The Star(White) now has 2 white marks (1 Square + 1 Star).
	// The Star(Black) now has 2 black marks (1 Star + 1 Eraser).
	const invalidated = result.invalidatedCells || [];
	assert.strictEqual(invalidated.length, 1, "Exactly one cell should be invalidated");
	const cell = puzzle.cells[invalidated[0].y][invalidated[0].x];
	assert.strictEqual(cell.type, CellType.Square, "The invalidated cell should be a Square");
	assert.strictEqual(cell.color, Color.White, "The invalidated Square should be White");
});

test("Eraser validation - star, red stars, black stars and same color eraser (invalid)", () => {
	// 1 White Star, 2 Red Stars, 2 Black Stars, 1 White Eraser
	// If Eraser is mark: White(2), Red(2), Black(2). No error to negate -> INVALID
	// If Eraser negates White Star: White(1) (only Eraser remains). -> INVALID
	const puzzle = createBasicGrid(1, 6);
	puzzle.cells[0][0] = { type: CellType.Star, color: Color.White };
	puzzle.cells[0][1] = { type: CellType.Star, color: Color.Red };
	puzzle.cells[0][2] = { type: CellType.Star, color: Color.Red };
	puzzle.cells[0][3] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][4] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][5] = { type: CellType.Eraser, color: Color.White };

	const result = core.validateSolution(puzzle, getPath(6));
	assert.strictEqual(result.isValid, false, "Should be invalid: Eraser has no error to negate (it and star form a pair)");
});

test("Generation independence - Tetris and Eraser without Squares/Stars", () => {
	const generator = new PuzzleGenerator();
	const options = {
		useHexagons: false,
		useSquares: false,
		useStars: false,
		useTetris: true,
		useEraser: true,
		complexity: 1.0,
	};

	const grid = generator.generate(4, 4, options);
	let hasTetris = false;
	let hasEraser = false;
	for (let r = 0; r < grid.rows; r++) {
		for (let c = 0; c < grid.cols; c++) {
			if (grid.cells[r][c].type === CellType.Tetris || grid.cells[r][c].type === CellType.TetrisRotated) hasTetris = true;
			if (grid.cells[r][c].type === CellType.Eraser) hasEraser = true;
		}
	}
	assert.ok(hasTetris, "Should generate Tetris even if Squares/Stars are off");
	assert.ok(hasEraser, "Should generate Eraser even if Squares/Stars are off");
});

test("Eraser validation - white eraser completing white star pair (valid if error exists)", () => {
	const puzzle = createBasicGrid(1, 3);
	puzzle.cells[0][0] = { type: CellType.Star, color: Color.White };
	puzzle.cells[0][1] = { type: CellType.Eraser, color: Color.White };
	puzzle.cells[0][2] = { type: CellType.Star, color: Color.Black }; // Missing pair for Black Star

	const result = core.validateSolution(puzzle, getPath(3));
	assert.strictEqual(result.isValid, true, "1 White Star + 1 White Eraser + 1 lone Black Star should be VALID");
});

test("Eraser validation - erase hexagon violation", () => {
	const puzzle = createBasicGrid(1, 2);
	// Hexagon on H(0,0) -> between (0,0) and (1,0)
	puzzle.hEdges[0][0].type = EdgeType.Hexagon;
	puzzle.cells[0][0] = { type: CellType.Eraser, color: Color.White };

	// Path: (0,1) -> (1,1) -> (2,1) -> (2,0)
	// This path does NOT pass through H(0,0)
	const path: SolutionPath = {
		points: [
			{ x: 0, y: 1 },
			{ x: 1, y: 1 },
			{ x: 2, y: 1 },
			{ x: 2, y: 0 },
		],
	};

	const result = core.validateSolution(puzzle, path);
	assert.strictEqual(result.isValid, true, `Should be valid: eraser negates missed hexagon. Error: ${result.errorReason}`);
	assert.strictEqual(result.invalidatedEdges?.length, 1, "One hexagon should be invalidated");
	assert.strictEqual(result.invalidatedEdges[0].type, "h");
	assert.strictEqual(result.invalidatedEdges[0].r, 0);
	assert.strictEqual(result.invalidatedEdges[0].c, 0);
});

test("Eraser validation bug reproduction - 1 Star + 1 Eraser of same color", () => {
	const puzzle = createBasicGrid(1, 2);
	puzzle.cells[0][0] = { type: CellType.Star, color: Color.White };
	puzzle.cells[0][1] = { type: CellType.Eraser, color: Color.White };

	const result = core.validateSolution(puzzle, getPath(2));
	assert.strictEqual(result.isValid, false, "Should be invalid (Eraser has no error to negate)");

	const errorCells = result.errorCells || [];
	const invalidatedCells = result.invalidatedCells || [];
	const hasStarError = errorCells.some((p) => puzzle.cells[p.y][p.x].type === CellType.Star);
	const hasEraserError = errorCells.some((p) => puzzle.cells[p.y][p.x].type === CellType.Eraser);
	const isStarInvalidated = invalidatedCells.some((p) => puzzle.cells[p.y][p.x].type === CellType.Star);

	console.log("Error Cells:", errorCells);
	console.log("Invalidated Cells:", invalidatedCells);

	// We expect the bug to be present initially.
	// If hasStarError is true, the bug is present.
	assert.strictEqual(hasEraserError, true, "Eraser should be an error");

	// This is the check that will fail if the bug is present.
	// The user wants hasStarError to be false.
	assert.strictEqual(hasStarError, false, "Star should NOT be an error");
	assert.strictEqual(isStarInvalidated, false, "Star should NOT be invalidated");
});

test("Eraser validation bug reproduction - 3 Star + 1 Eraser of same color", () => {
	const puzzle = createBasicGrid(1, 4);
	puzzle.cells[0][0] = { type: CellType.Star, color: Color.White };
	puzzle.cells[0][1] = { type: CellType.Star, color: Color.White };
	puzzle.cells[0][2] = { type: CellType.Star, color: Color.White };
	puzzle.cells[0][3] = { type: CellType.Eraser, color: Color.White };

	const result = core.validateSolution(puzzle, getPath(4));
	assert.strictEqual(result.isValid, false, "Should be invalid (Eraser has no error to negate)");

	const errorCells = result.errorCells || [];
	const invalidatedCells = result.invalidatedCells || [];
	const starError = errorCells.filter((p) => puzzle.cells[p.y][p.x].type === CellType.Star).length;
	const eraserError = errorCells.filter((p) => puzzle.cells[p.y][p.x].type === CellType.Eraser).length;
	const starInvalidated = invalidatedCells.filter((p) => puzzle.cells[p.y][p.x].type === CellType.Star).length;

	console.log("Error Cells:", errorCells);
	console.log("Invalidated Cells:", invalidatedCells);

	assert.strictEqual(eraserError, 0, "Eraser should NOT be an error");

	assert.strictEqual(starError, 3, "Star should be an 3 error");
	assert.strictEqual(starInvalidated, 1, "Star should be 1 invalidated");
});
