import assert from "node:assert";
import { test } from "node:test";
import { CellType, Color, EdgeType, NodeType, type PuzzleData, PuzzleGenerator, PuzzleValidator, type SolutionPath, SymmetryType, WitnessCore } from "../../dist/MiniWitness.js";

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

test("Symmetry - basic horizontal symmetry valid path", () => {
	const puzzle = createBasicGrid(2, 2);
	puzzle.symmetry = SymmetryType.Horizontal;
	// Main start: (0, 2), End: (2, 0)
	// Symmetrical start: (2, 2), End: (0, 0)
	puzzle.nodes[2][2].type = NodeType.Start;
	puzzle.nodes[0][0].type = NodeType.End;

	const path: SolutionPath = {
		points: [
			{ x: 0, y: 2 },
			{ x: 0, y: 1 },
			{ x: 1, y: 1 },
			{ x: 2, y: 1 },
			{ x: 2, y: 0 },
		],
	};
	// Symmetrical path:
	// (2, 2) -> (2, 1) -> (1, 1) -> (0, 1) -> (0, 0)
	// Collisions:
	// Node (1, 1) is shared by both paths.
	// In the validator, if both paths reach (1, 1) at the same step, it's a collision.
	// Wait, in The Witness, they cannot share a node.

	const result = core.validateSolution(puzzle, path);
	assert.strictEqual(result.isValid, false, "Should be invalid: collision at (1, 1)");
	assert.strictEqual(result.errorReason, "Path collision");
});

test("Symmetry - basic horizontal symmetry valid path without collision", () => {
	const puzzle = createBasicGrid(2, 2);
	puzzle.symmetry = SymmetryType.Horizontal;
	// Main start: (0, 2), End: (2, 2) - Wait, end should be symmetrical too
	puzzle.nodes[2][0].type = NodeType.Start;
	puzzle.nodes[2][2].type = NodeType.Start;
	puzzle.nodes[0][0].type = NodeType.End;
	puzzle.nodes[0][2].type = NodeType.End;

	const path: SolutionPath = {
		points: [
			{ x: 0, y: 2 },
			{ x: 0, y: 1 },
			{ x: 0, y: 0 },
		],
	};
	// Symmetrical path: (2, 2) -> (2, 1) -> (2, 0)
	const result = core.validateSolution(puzzle, path);
	assert.strictEqual(result.isValid, true, `Should be valid: ${result.errorReason}`);
});

test("Symmetry - broken edge on symmetrical path", () => {
	const puzzle = createBasicGrid(2, 2);
	puzzle.symmetry = SymmetryType.Horizontal;
	puzzle.nodes[2][0].type = NodeType.Start;
	puzzle.nodes[2][2].type = NodeType.Start;
	puzzle.nodes[0][0].type = NodeType.End;
	puzzle.nodes[0][2].type = NodeType.End;

	// Broken edge on the symmetrical side: V(1, 2) (between (2,1) and (2,2))
	puzzle.vEdges[1][2].type = EdgeType.Broken;

	const path: SolutionPath = {
		points: [
			{ x: 0, y: 2 },
			{ x: 0, y: 1 },
			{ x: 0, y: 0 },
		],
	};
	// Symmetrical path: (2, 2) -> (2, 1) -> (2, 0)
	// It crosses V(1, 2) which is broken.
	const result = core.validateSolution(puzzle, path);
	assert.strictEqual(result.isValid, false, "Should be invalid: symmetrical path crosses broken edge");
	assert.strictEqual(result.errorReason, "Symmetrical path passed through broken edge");
});

test("Symmetry - rotational symmetry collision", () => {
	const puzzle = createBasicGrid(2, 2);
	puzzle.symmetry = SymmetryType.Rotational;
	// Center is (1, 1)
	// Main start: (0, 2), End: (2, 0)
	// Sym start: (2, 0), End: (0, 2)
	// They share starts and ends.

	const path: SolutionPath = {
		points: [
			{ x: 0, y: 2 },
			{ x: 1, y: 2 },
			{ x: 1, y: 1 }, // Both reach (1, 1) here
			{ x: 1, y: 0 },
			{ x: 2, y: 0 },
		],
	};
	const result = core.validateSolution(puzzle, path);
	assert.strictEqual(result.isValid, false, "Should be invalid: collision at (1, 1)");
});

test("Symmetry - regions separated by both paths", () => {
	const puzzle = createBasicGrid(2, 2);
	puzzle.symmetry = SymmetryType.Horizontal;
	puzzle.nodes[2][0].type = NodeType.Start;
	puzzle.nodes[2][2].type = NodeType.Start;
	puzzle.nodes[0][0].type = NodeType.End;
	puzzle.nodes[0][2].type = NodeType.End;

	// Path: (0,2)-(0,1)-(0,0)
	// SymPath: (2,2)-(2,1)-(2,0)
	// Cells are (0,0), (1,0) [top row] and (0,1), (1,1) [bottom row]
	// Path is on the left edge, SymPath is on the right edge.
	// They don't divide the grid further than the boundary unless they go inside.

	// If path: (0,2)-(1,2)-(1,1)-(1,0)-(0,0)
	// SymPath: (2,2)-(1,2)-(1,1)-(1,0)-(2,0)
	// COLLISION at (1,2)
	const pathColliding: SolutionPath = {
		points: [
			{ x: 0, y: 2 },
			{ x: 1, y: 2 },
		],
	};
	assert.strictEqual(core.validateSolution(puzzle, pathColliding).isValid, false, "Collision at (1,2)");
});

test("Generator - supports symmetry", () => {
	const generator = new PuzzleGenerator();
	const options = {
		symmetry: SymmetryType.Rotational,
		difficulty: 0.5,
	};
	const grid = generator.generate(4, 4, options);
	assert.strictEqual(grid.symmetry, SymmetryType.Rotational);

	// Check if there are at least 2 starts and 2 ends (unless they coincide)
	let startCount = 0;
	let endCount = 0;
	for (let r = 0; r <= grid.rows; r++) {
		for (let c = 0; c <= grid.cols; c++) {
			if (grid.nodes[r][c].type === NodeType.Start) startCount++;
			if (grid.nodes[r][c].type === NodeType.End) endCount++;
		}
	}
	assert.ok(startCount >= 2, "Should have 2 start nodes for rotational symmetry");
	assert.ok(endCount >= 2, "Should have 2 end nodes for rotational symmetry");
});

test("Generator - supports horizontal symmetry solvability", () => {
	const generator = new PuzzleGenerator();
	const validator = new PuzzleValidator();
	const options = {
		symmetry: SymmetryType.Horizontal,
		useSquares: true,
		difficulty: 0.5,
	};
	// Try 10 times to be sure
	for (let i = 0; i < 10; i++) {
		const grid = generator.generate(4, 4, options);
		const solutions = validator.countSolutions(grid);
		assert.ok(solutions >= 1, `Generated horizontal symmetry puzzle should be solvable (attempt ${i})`);
	}
});

test("Generator - supports rotational symmetry solvability", () => {
	const generator = new PuzzleGenerator();
	const validator = new PuzzleValidator();
	const options = {
		symmetry: SymmetryType.Rotational,
		useStars: true,
		difficulty: 0.5,
	};
	for (let i = 0; i < 10; i++) {
		const grid = generator.generate(4, 4, options);
		const solutions = validator.countSolutions(grid);
		assert.ok(solutions >= 1, `Generated rotational symmetry puzzle should be solvable (attempt ${i})`);
	}
});
