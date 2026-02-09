import assert from "node:assert";
import { test } from "node:test";
import { CellType, Color, NodeType, PuzzleGenerator, WitnessCore, type PuzzleData } from "../../dist/MiniWitness.js";

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

test("Tetris validation - single 1x1", () => {
	const puzzle = createBasicGrid(1, 1);
	puzzle.cells[0][0] = { type: CellType.Tetris, color: Color.None, shape: [[1]] };
	const result = core.validateSolution(puzzle, {
		points: [
			{ x: 0, y: 1 },
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
		],
	});
	assert.strictEqual(result.isValid, true, `Should be valid: ${result.errorReason}`);
});

test("Tetris generator - colored pieces when Stars enabled", () => {
	const generator = new PuzzleGenerator();
	const options = {
		useTetris: true,
		useStars: true,
		complexity: 1.0,
		availableColors: [Color.Black, Color.White, Color.Red], // Ensure Blue is excluded
	};

	let foundColoredTetris = false;
	for (let i = 0; i < 50; i++) {
		const grid = generator.generate(4, 4, options);
		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				const cell = grid.cells[r][c];
				if ((cell.type === CellType.Tetris || cell.type === CellType.TetrisRotated) && cell.color !== Color.None) {
					foundColoredTetris = true;
					assert.notStrictEqual(cell.color, Color.Blue, "Colored Tetris piece should not be Blue");
					break;
				}
			}
			if (foundColoredTetris) break;
		}
		if (foundColoredTetris) break;
	}
	assert.ok(foundColoredTetris, "Generator should have placed at least one colored Tetris piece when useStars is true");
});

test("Tetris validation - disconnected pieces tiling 2x2", () => {
	const puzzle = createBasicGrid(2, 2);
	// Region: all cells. Area 4.
	const points = [
		{ x: 0, y: 2 },
		{ x: 0, y: 1 },
		{ x: 0, y: 0 },
		{ x: 1, y: 0 },
		{ x: 2, y: 0 },
	];
	// Pieces: P1 and P2 combine to cover 2x2
	puzzle.cells[0][0] = {
		type: CellType.Tetris,
		color: Color.None,
		shape: [
			[0, 1],
			[1, 0],
		],
	};
	puzzle.cells[1][1] = {
		type: CellType.Tetris,
		color: Color.None,
		shape: [
			[1, 0],
			[0, 1],
		],
	};

	const result = core.validateSolution(puzzle, { points: points });
	assert.strictEqual(result.isValid, true, `Should be valid: ${result.errorReason}`);
});

test("Tetris validation - piece ordering bug fix", () => {
	const puzzle = createBasicGrid(3, 2);
	// Path isolates col 0. Area 3.
	const points = [
		{ x: 0, y: 3 },
		{ x: 1, y: 3 },
		{ x: 1, y: 2 },
		{ x: 1, y: 1 },
		{ x: 1, y: 0 },
		{ x: 2, y: 0 },
	];

	// P1 (2x1 vertical) and P2 (1x1). Total area 3.
	// P1 cannot be at (0,0) in some orders if not trying all pieces.
	puzzle.cells[0][0] = { type: CellType.Tetris, color: Color.None, shape: [[1], [1]] };
	puzzle.cells[2][0] = { type: CellType.Tetris, color: Color.None, shape: [[1]] };

	const result = core.validateSolution(puzzle, { points: points });
	assert.strictEqual(result.isValid, true, `Should be valid: ${result.errorReason}`);
});

test("Tetris and Star interaction - different colors (invalid)", () => {
	const puzzle = createBasicGrid(2, 1); // 1x2 region
	// 1x2 Tetris (Red) + 1 Black Star.
	// Total Black = 1. Invalid Star rule.
	puzzle.cells[0][0] = { type: CellType.Tetris, color: Color.Red, shape: [[1], [1]] };
	puzzle.cells[1][0] = { type: CellType.Star, color: Color.Black };

	const result = core.validateSolution(puzzle, {
		points: [
			{ x: 0, y: 2 },
			{ x: 1, y: 2 },
			{ x: 1, y: 1 },
			{ x: 1, y: 0 },
		],
	});
	assert.strictEqual(result.isValid, false, "Should be invalid: red tetris and black star don't pair");
});

test("Tetris generator", () => {
	const generator = new PuzzleGenerator();
	const options = {
		useTetris: true,
		complexity: 0.5,
	};

	const grid = generator.generate(3, 3, options);
	let foundTetris = false;
	for (let r = 0; r < grid.rows; r++) {
		for (let c = 0; c < grid.cols; c++) {
			if (grid.cells[r][c].type === CellType.Tetris || grid.cells[r][c].type === CellType.TetrisRotated) {
				foundTetris = true;
				assert.ok(grid.cells[r][c].shape, "Tetris piece should have a shape");
			}
		}
	}
	assert.ok(foundTetris, "Generator should have placed at least one Tetris piece");
});

test("Tetris generator - reliability check", () => {
	const generator = new PuzzleGenerator();
	const options = {
		useTetris: true,
		complexity: 0.5,
	};

	// 50回生成して、全てにテトリスが含まれているか確認
	for (let i = 0; i < 50; i++) {
		const grid = generator.generate(4, 4, options);
		let foundTetris = false;
		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				if (grid.cells[r][c].type === CellType.Tetris || grid.cells[r][c].type === CellType.TetrisRotated) {
					foundTetris = true;
					break;
				}
			}
			if (foundTetris) break;
		}
		assert.ok(foundTetris, `Attempt ${i}: Generator should have placed at least one Tetris piece when useTetris is true`);
	}
});

test("Tetris validation - mismatch area", () => {
	const puzzle = createBasicGrid(1, 2);
	puzzle.cells[0][0] = { type: CellType.Tetris, color: Color.None, shape: [[1]] };
	const result = core.validateSolution(puzzle, {
		points: [
			{ x: 0, y: 1 },
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 2, y: 0 },
		],
	});
	// Region area is 2, Tetris area is 1.
	assert.strictEqual(result.isValid, false, "Should be invalid: area mismatch");
});

test("Tetris validation - 2x2 square piece", () => {
	const puzzle = createBasicGrid(2, 2);
	puzzle.cells[0][0] = {
		type: CellType.Tetris,
		color: Color.None,
		shape: [
			[1, 1],
			[1, 1],
		],
	};
	const result = core.validateSolution(puzzle, {
		points: [
			{ x: 0, y: 2 },
			{ x: 0, y: 1 },
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 2, y: 0 },
		],
	});
	// Region is 2x2. Valid.
	assert.strictEqual(result.isValid, true, `Should be valid: ${result.errorReason}`);
});

test("Tetris validation - rotation required (TetrisRotated)", () => {
	const puzzle = createBasicGrid(2, 1); // 1x2 vertical region
	// Piece is 1x2 horizontal
	puzzle.cells[0][0] = { type: CellType.TetrisRotated, color: Color.None, shape: [[1, 1]] };
	const result = core.validateSolution(puzzle, {
		points: [
			{ x: 0, y: 2 },
			{ x: 0, y: 1 },
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
		],
	});
	assert.strictEqual(result.isValid, true, `Should be valid with rotation: ${result.errorReason}`);
});

test("Tetris validation - rotation forbidden (Tetris)", () => {
	const puzzle = createBasicGrid(2, 1);
	puzzle.cells[0][0] = { type: CellType.Tetris, color: Color.None, shape: [[1, 1]] };
	const result = core.validateSolution(puzzle, {
		points: [
			{ x: 0, y: 2 },
			{ x: 0, y: 1 },
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
		],
	});
	assert.strictEqual(result.isValid, false, "Should be invalid without rotation");
});

test("Tetris validation - multiple pieces combined", () => {
	const puzzle = createBasicGrid(2, 2);
	// Two 1x2 pieces in a 2x2 region
	puzzle.cells[0][0] = { type: CellType.Tetris, color: Color.None, shape: [[1, 1]] };
	puzzle.cells[1][1] = { type: CellType.Tetris, color: Color.None, shape: [[1, 1]] };
	const result = core.validateSolution(puzzle, {
		points: [
			{ x: 0, y: 2 },
			{ x: 0, y: 1 },
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 2, y: 0 },
		],
	});
	assert.strictEqual(result.isValid, true, `Should be valid: combined pieces`);
});

test("Tetris and Star interaction - area mismatch", () => {
	const puzzle = createBasicGrid(1, 2);
	// Region area 2.
	// 1x1 Tetris (Black) + 1 Black Star.
	// Total Black = 2. Valid.
	puzzle.cells[0][0] = { type: CellType.Tetris, color: Color.Black, shape: [[1]] };
	puzzle.cells[0][1] = { type: CellType.Star, color: Color.Black };

	const result = core.validateSolution(puzzle, {
		points: [
			{ x: 0, y: 1 },
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 2, y: 0 },
		],
	});
	// Tetris area 1, region area 2. Should be invalid due to Tetris rule.
	assert.strictEqual(result.isValid, false, "Should be invalid: area mismatch");
});

test("Tetris and Star interaction - correct area", () => {
	const puzzle = createBasicGrid(2, 1); // 1x2 region
	// 1x2 Tetris (Black) + 1 Black Star.
	// Total Black = 2. Valid Star rule.
	// Tetris area 2, Region area 2. Valid Tetris rule.
	puzzle.cells[0][0] = { type: CellType.Tetris, color: Color.Black, shape: [[1], [1]] };
	puzzle.cells[1][0] = { type: CellType.Star, color: Color.Black };

	const result = core.validateSolution(puzzle, {
		points: [
			{ x: 0, y: 2 },
			{ x: 1, y: 2 },
			{ x: 1, y: 1 },
			{ x: 1, y: 0 },
		],
	});
	assert.strictEqual(result.isValid, true, `Should be valid: ${result.errorReason}`);
});
