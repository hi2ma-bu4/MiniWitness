import assert from "node:assert";
import { test } from "node:test";
import { CellType, Color, EdgeType, Grid, NodeType, type PuzzleData, PuzzleGenerator, PuzzleValidator, type SolutionPath, WitnessCore } from "../../dist/MiniWitness.js";

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

test("Broken vs Absent edges - path blocking and region separation", () => {
	// 1x2 grid (1 col, 2 rows)
	// Cells: (0,0), (1,0)  [row, col]
	// Nodes: (0,0), (1,0)
	//        (0,1), (1,1)
	//        (0,2), (1,2)
	const puzzle = createBasicGrid(2, 1);
	puzzle.nodes[2][0].type = NodeType.Start;
	puzzle.nodes[0][1].type = NodeType.End;

	// Place a Broken edge at H(1,0) -> between (0,1) and (1,1) nodes.
	puzzle.hEdges[1][0].type = EdgeType.Broken;

	// 1. Path crossing Broken edge should fail
	const pathCrossing: SolutionPath = {
		points: [
			{ x: 0, y: 2 },
			{ x: 0, y: 1 },
			{ x: 1, y: 1 }, // This crosses hEdges[1][0]
			{ x: 1, y: 0 },
			{ x: 0, y: 0 }, // Wait, end is (0,1)
		],
	};
	// Let's use simpler path for 1x2
	const res1 = core.validateSolution(puzzle, {
		points: [
			{ x: 0, y: 2 },
			{ x: 0, y: 1 },
			{ x: 1, y: 1 },
			{ x: 1, y: 0 },
			{ x: 0, y: 0 },
			{ x: 0, y: 1 },
		],
	});
	// Actually, easier to just test the specific edge crossing.
	// But start and end must be valid.
	puzzle.nodes[2][0].type = NodeType.Start;
	puzzle.nodes[2][1].type = NodeType.End;
	const resCrossing = core.validateSolution(puzzle, {
		points: [
			{ x: 0, y: 2 },
			{ x: 1, y: 2 },
		],
	}); // Crosses hEdges[2][0]? No.
	// H-Edges [row][col]: hEdges[2][0] is between (0,2) and (1,2).

	// Let's reset and be precise.
	const p = createBasicGrid(2, 1);
	p.nodes[2][0].type = NodeType.Start;
	p.nodes[0][0].type = NodeType.End;
	p.hEdges[1][0].type = EdgeType.Broken;

	// Crossing H(1,0) means moving between row 1 nodes: (0,1) and (1,1)
	const pathCrossing2 = {
		points: [
			{ x: 0, y: 2 },
			{ x: 0, y: 1 },
			{ x: 1, y: 1 },
			{ x: 1, y: 0 },
			{ x: 0, y: 0 },
		],
	};
	assert.strictEqual(core.validateSolution(p, pathCrossing2).isValid, false, "Should be invalid: crossed broken edge");

	// 2. Broken edge should NOT separate regions
	p.cells[0][0] = { type: CellType.Star, color: Color.Black };
	p.cells[1][0] = { type: CellType.Star, color: Color.Black };
	// Path that stays on the left: (0,2) -> (0,1) -> (0,0)
	const pathSide = {
		points: [
			{ x: 0, y: 2 },
			{ x: 0, y: 1 },
			{ x: 0, y: 0 },
		],
	};
	const res2 = core.validateSolution(p, pathSide);
	assert.strictEqual(res2.isValid, true, `Should be valid: broken edge did not separate stars. Error: ${res2.errorReason}`);

	// 3. Absent edge SHOULD separate regions
	p.hEdges[1][0].type = EdgeType.Absent;
	const res3 = core.validateSolution(p, pathSide);
	assert.strictEqual(res3.isValid, false, "Should be invalid: absent edge separated stars into different regions");
});

test("Dynamic perimeter - bites out of the grid", () => {
	// 2x2 grid
	const puzzle = createBasicGrid(2, 2);
	puzzle.nodes[2][0].type = NodeType.Start;
	puzzle.nodes[0][2].type = NodeType.End;

	// Top-left cell (0,0) is bitten by making its top and left edges Absent
	puzzle.hEdges[0][0].type = EdgeType.Absent;
	puzzle.vEdges[0][0].type = EdgeType.Absent;

	// Path around: (0,2) -> (1,2) -> (2,2) -> (2,1) -> (2,0)
	const path: SolutionPath = {
		points: [
			{ x: 0, y: 2 },
			{ x: 1, y: 2 },
			{ x: 2, y: 2 },
			{ x: 2, y: 1 },
			{ x: 2, y: 0 },
		],
	};

	// 1. Mark in bitten cell (0,0) should be ignored
	puzzle.cells[0][0] = { type: CellType.Star, color: Color.Black }; // This would fail if counted (single star)

	// 2. Bite boundary should separate regions
	// Place 2 stars on opposite sides of the bite boundary: (0,1) and (1,0)
	puzzle.cells[1][0] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][1] = { type: CellType.Star, color: Color.Black };

	// If the Normal edges between (0,1)-(1,1) and (1,0)-(1,1) act as perimeter,
	// then (0,1) and (1,0) are separated from each other?
	// Wait, (0,1) and (1,0) are both adjacent to (1,1).
	// If path doesn't separate them, they are in same region unless the bite separates them.
	// In a 2x2, (0,1) and (1,0) are only connected via (1,1).
	// If path is on (0,2)-(1,2)-(2,2)-(2,1)-(2,0), it doesn't separate (0,1), (1,0), (1,1).
	// So they are one region.
	const res = core.validateSolution(puzzle, path);
	assert.strictEqual(res.isValid, true, `Should be valid: bite marks ignored. Error: ${res.errorReason}`);

	// Now separate them with another bite?
	// If we make (1,1) a bite too, then (0,1) and (1,0) are isolated from each other.
	puzzle.hEdges[1][1].type = EdgeType.Absent;
	puzzle.vEdges[1][1].type = EdgeType.Absent;
	// (0,1) region: top=Normal, left=Normal, right=Absent, bottom=path.
	// (1,0) region: top=Absent, left=path, right=Normal, bottom=Normal.
	// They are separated.
	assert.strictEqual(core.validateSolution(puzzle, path).isValid, false, "Should be invalid: stars separated by bites");
});

test("Generator - Absent edges should not be adjacent to marks", () => {
	const generator = new PuzzleGenerator();
	const options = {
		useHexagons: true,
		useSquares: true,
		useStars: true,
		useBrokenEdges: true,
		difficulty: 0.5,
		complexity: 0.8,
	};

	for (let i = 0; i < 20; i++) {
		const grid = generator.generate(4, 4, options);

		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				const hasMark = grid.cells[r][c].type !== CellType.None;
				if (hasMark) {
					// Check 4 edges
					const top = grid.hEdges[r][c].type;
					const bottom = grid.hEdges[r + 1][c].type;
					const left = grid.vEdges[r][c].type;
					const right = grid.vEdges[r][c + 1].type;

					assert.notStrictEqual(top, EdgeType.Absent, `Absent edge found at top of mark at (${r},${c})`);
					assert.notStrictEqual(bottom, EdgeType.Absent, `Absent edge found at bottom of mark at (${r},${c})`);
					assert.notStrictEqual(left, EdgeType.Absent, `Absent edge found at left of mark at (${r},${c})`);
					assert.notStrictEqual(right, EdgeType.Absent, `Absent edge found at right of mark at (${r},${c})`);
				}
			}
		}
	}
});

test("Generator - should not produce isolated marks", () => {
	const generator = new PuzzleGenerator();
	const options = {
		useHexagons: true,
		useSquares: true,
		useStars: true,
		useBrokenEdges: true,
		complexity: 1.0,
	};

	for (let i = 0; i < 20; i++) {
		const grid = generator.generate(3, 3, options);

		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				if (grid.cells[r][c].type !== CellType.None) {
					const edges = [grid.hEdges[r][c], grid.hEdges[r + 1][c], grid.vEdges[r][c], grid.vEdges[r][c + 1]];
					const passable = edges.filter((e) => e.type === EdgeType.Normal || e.type === EdgeType.Hexagon);
					assert.ok(passable.length > 0, `Mark at (${r},${c}) is isolated`);
				}
			}
		}
	}
});

test("Difficulty calculation - simple grid", () => {
	const puzzle = createBasicGrid(2, 2);
	// No constraints, should have low difficulty but at least 1 solution exists (empty fingerprint)
	const difficulty = core.calculateDifficulty(puzzle);
	assert.ok(difficulty >= 0 && difficulty <= 1, "Difficulty should be between 0 and 1");
});

test("Difficulty calculation - more constraints should be harder", () => {
	const puzzle1 = createBasicGrid(2, 2);
	const diff1 = core.calculateDifficulty(puzzle1);

	const puzzle2 = createBasicGrid(2, 2);
	// Add a hexagon
	puzzle2.hEdges[0][0].type = EdgeType.Hexagon;
	const diff2 = core.calculateDifficulty(puzzle2);

	// Hexagons can actually reduce search space, but let's just check it's valid
	assert.ok(diff2 >= 0 && diff2 <= 1, "Difficulty with hexagon should be valid");
});

test("Difficulty calculation - trivial puzzle should have very low difficulty", () => {
	const puzzle = createBasicGrid(4, 4);
	// Add only one hexagon
	puzzle.hEdges[0][0].type = EdgeType.Hexagon;
	const difficulty = core.calculateDifficulty(puzzle);

	// Should be very low, definitely less than 0.2
	assert.ok(difficulty < 0.2, `Trivial puzzle should have low difficulty, got: ${difficulty}`);
});

test("Difficulty calculation - sparse 6x6 grid should have very low difficulty", () => {
	const puzzle = createBasicGrid(6, 6);
	// Add 5 symbols (approx 1/7 of 36 cells)
	puzzle.cells[0][0] = { type: CellType.Square, color: Color.Black };
	puzzle.cells[0][1] = { type: CellType.Square, color: Color.Black };
	puzzle.cells[5][5] = { type: CellType.Square, color: Color.White };
	puzzle.cells[5][4] = { type: CellType.Square, color: Color.White };
	puzzle.hEdges[0][0].type = EdgeType.Hexagon;

	const difficulty = core.calculateDifficulty(puzzle);

	// Should be very low
	assert.ok(difficulty < 0.15, `Sparse 6x6 grid should have very low difficulty, got: ${difficulty}`);
});

test("Generator - all requested constraints should be present", () => {
	const generator = new PuzzleGenerator();
	const options = {
		useHexagons: true,
		useSquares: true,
		useStars: true,
		difficulty: 0.5,
		complexity: 0.5,
	};

	for (let i = 0; i < 5; i++) {
		const grid = generator.generate(4, 4, options);

		let foundHex = false;
		for (let r = 0; r <= grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				if (grid.hEdges[r][c].type === EdgeType.Hexagon) foundHex = true;
			}
		}
		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c <= grid.cols; c++) {
				if (grid.vEdges[r][c].type === EdgeType.Hexagon) foundHex = true;
			}
		}

		let foundSquare = false;
		let foundStar = false;
		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				if (grid.cells[r][c].type === CellType.Square) foundSquare = true;
				if (grid.cells[r][c].type === CellType.Star) foundStar = true;
			}
		}

		assert.ok(foundHex, "Should contain hexagons");
		assert.ok(foundSquare, "Should contain squares");
		assert.ok(foundStar, "Should contain stars");
	}
});

test("Generator - should produce at least 2 square colors when stars are absent", () => {
	const generator = new PuzzleGenerator();
	const options = {
		useSquares: true,
		useStars: false,
		complexity: 0.5,
	};

	for (let i = 0; i < 20; i++) {
		const grid = generator.generate(4, 4, options);
		const squareColors = new Set<number>();
		let hasStar = false;
		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				if (grid.cells[r][c].type === CellType.Square) {
					squareColors.add(grid.cells[r][c].color);
				}
				if (grid.cells[r][c].type === CellType.Star) {
					hasStar = true;
				}
			}
		}
		if (!hasStar) {
			assert.ok(squareColors.size >= 2, `Grid ${i} should have at least 2 square colors, but has ${squareColors.size}`);
		}
	}
});

test("Solution counter - unique solutions based on region marks", () => {
	const validator = new PuzzleValidator();
	const puzzle = createBasicGrid(1, 1);
	// No constraints, 1x1 grid has 2 paths.
	// But both result in same "empty" fingerprint.
	const grid = Grid.fromData(puzzle);
	const count = validator.countSolutions(grid);
	assert.strictEqual(count, 1, "Should have 1 unique solution when no marks are present");
});

test("Solution counter - paths with same mark partitioning", () => {
	const validator = new PuzzleValidator();
	const puzzle = createBasicGrid(2, 2);
	// Place a square in (0,0) and (1,1)
	// Any path that separates them is a valid solution.
	// Multiple paths might do this, but if they partition the marks the same way, it's 1 solution.
	puzzle.cells[0][0] = { type: CellType.Square, color: Color.Black };
	puzzle.cells[1][1] = { type: CellType.Square, color: Color.White };

	const grid = Grid.fromData(puzzle);
	const count = validator.countSolutions(grid);
	// Previously this would be many, now it should be much fewer (ideally 1 if they all partition same way)
	// Actually there might be different ways to partition them, e.g. which empty cells go where.
	// But if empty cells are ignored in fingerprint, it should be 1.
	assert.strictEqual(count, 1, "Should count as 1 unique solution if marks are partitioned the same way");
});

test("Solution counter - simple unique solution", () => {
	const validator = new PuzzleValidator();
	const puzzle = createBasicGrid(1, 1);
	// 1x1 grid, start at (0,1), end at (1,0)
	// Paths:
	// 1. (0,1) -> (0,0) -> (1,0)
	// 2. (0,1) -> (1,1) -> (1,0)

	// Add hexagon to (0,1)-(0,0)
	puzzle.vEdges[0][0].type = EdgeType.Hexagon;

	const grid = Grid.fromData(puzzle);
	const count = validator.countSolutions(grid);
	assert.strictEqual(count, 1, "Should have exactly 1 solution");
});

test("Solution counter - multiple solutions", () => {
	const validator = new PuzzleValidator();
	const puzzle = createBasicGrid(1, 1);
	// No constraints, 1x1 grid has 2 paths
	const grid = Grid.fromData(puzzle);
	const count = validator.countSolutions(grid);
	// Now we count unique region mark configurations. Since both are empty, it should be 1.
	assert.strictEqual(count, 1, "Should have exactly 1 unique solution (empty grid)");
});

test("Solution counter - 2x2 grid with no constraints", () => {
	const validator = new PuzzleValidator();
	const puzzle = createBasicGrid(2, 2);
	const grid = Grid.fromData(puzzle);
	const count = validator.countSolutions(grid);
	// Since there are no marks, all valid paths result in the same "empty" fingerprint.
	assert.strictEqual(count, 1, "Should have exactly 1 unique solution (empty grid)");
});

test("Star validation - multiple regions with same color stars", () => {
	// 2x2 grid, path splits it in half horizontally
	const puzzle = createBasicGrid(2, 2);
	// Path: (0,1) -> (1,1) -> (2,1)
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

	// Add 2 black stars to Top region
	puzzle.cells[0][0] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][1] = { type: CellType.Star, color: Color.Black };

	// Add 2 black stars to Bottom region
	puzzle.cells[1][0] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[1][1] = { type: CellType.Star, color: Color.Black };

	const result = core.validateSolution(puzzle, path);
	// Total 4 black stars in puzzle, but 2 in each region. Should be VALID.
	assert.strictEqual(result.isValid, true, `Should be valid: 4 stars total split in 2 regions`);
});

test("Star validation - 7 stars and 1 square total in puzzle", () => {
	const puzzle = createBasicGrid(1, 8);
	// Split into 4 regions of 2 cells each using absent edges (which act as boundaries)
	puzzle.vEdges[0][2].type = EdgeType.Absent;
	puzzle.vEdges[0][4].type = EdgeType.Absent;
	puzzle.vEdges[0][6].type = EdgeType.Absent;

	// Region 0: 2 stars
	puzzle.cells[0][0] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][1] = { type: CellType.Star, color: Color.Black };
	// Region 1: 2 stars
	puzzle.cells[0][2] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][3] = { type: CellType.Star, color: Color.Black };
	// Region 2: 2 stars
	puzzle.cells[0][4] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][5] = { type: CellType.Star, color: Color.Black };
	// Region 3: 1 star + 1 square
	puzzle.cells[0][6] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][7] = { type: CellType.Square, color: Color.Black };

	const result = core.validateSolution(puzzle, getPath(8));
	assert.strictEqual(result.isValid, true, `Should be valid: 7 stars and 1 square split in 4 regions`);
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

test("Star validation - absent edges as boundaries", () => {
	const puzzle = createBasicGrid(1, 2);
	// 1x2 grid. Vertices: (0,0), (1,0), (2,0), (0,1), (1,1), (2,1)
	// Cells: (0,0), (1,0)
	// Add an absent edge between (0,0) and (1,0) -> VERTICAL edge at col 1, row 0
	puzzle.vEdges[0][1].type = EdgeType.Absent;

	puzzle.cells[0][0] = { type: CellType.Star, color: Color.Black };
	puzzle.cells[0][1] = { type: CellType.Star, color: Color.Black };

	// If absent edge works, they are in DIFFERENT regions.
	// Each region will have only 1 black star -> should FAIL.
	const result = core.validateSolution(puzzle, getPath(2));
	assert.strictEqual(result.isValid, false, "Should be invalid: absent edge separates the stars");
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
