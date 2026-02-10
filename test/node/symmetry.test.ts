import assert from "node:assert";
import { describe, test } from "node:test";
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

/* ============================================================
 * Symmetry Validation (Core)
 * ============================================================ */
describe("Symmetry - Core validation", { concurrency: true }, () => {
	test("basic horizontal symmetry collision", () => {
		const puzzle = createBasicGrid(2, 2);
		puzzle.symmetry = SymmetryType.Horizontal;

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

		const result = core.validateSolution(puzzle, path);
		assert.strictEqual(result.isValid, false);
		assert.strictEqual(result.errorReason, "Path collision");
	});

	test("basic horizontal symmetry without collision", () => {
		const puzzle = createBasicGrid(2, 2);
		puzzle.symmetry = SymmetryType.Horizontal;

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

		const result = core.validateSolution(puzzle, path);
		assert.strictEqual(result.isValid, true);
	});

	test("broken edge on symmetrical path", () => {
		const puzzle = createBasicGrid(2, 2);
		puzzle.symmetry = SymmetryType.Horizontal;

		puzzle.nodes[2][0].type = NodeType.Start;
		puzzle.nodes[2][2].type = NodeType.Start;
		puzzle.nodes[0][0].type = NodeType.End;
		puzzle.nodes[0][2].type = NodeType.End;

		puzzle.vEdges[1][2].type = EdgeType.Broken;

		const path: SolutionPath = {
			points: [
				{ x: 0, y: 2 },
				{ x: 0, y: 1 },
				{ x: 0, y: 0 },
			],
		};

		const result = core.validateSolution(puzzle, path);
		assert.strictEqual(result.isValid, false);
		assert.strictEqual(result.errorReason, "Symmetrical path passed through broken edge");
	});

	test("rotational symmetry collision", () => {
		const puzzle = createBasicGrid(2, 2);
		puzzle.symmetry = SymmetryType.Rotational;

		const path: SolutionPath = {
			points: [
				{ x: 0, y: 2 },
				{ x: 1, y: 2 },
				{ x: 1, y: 1 },
				{ x: 1, y: 0 },
				{ x: 2, y: 0 },
			],
		};

		const result = core.validateSolution(puzzle, path);
		assert.strictEqual(result.isValid, false);
	});

	test("regions separated by both paths collision", () => {
		const puzzle = createBasicGrid(2, 2);
		puzzle.symmetry = SymmetryType.Horizontal;

		puzzle.nodes[2][0].type = NodeType.Start;
		puzzle.nodes[2][2].type = NodeType.Start;
		puzzle.nodes[0][0].type = NodeType.End;
		puzzle.nodes[0][2].type = NodeType.End;

		const pathColliding: SolutionPath = {
			points: [
				{ x: 0, y: 2 },
				{ x: 1, y: 2 },
			],
		};

		assert.strictEqual(core.validateSolution(puzzle, pathColliding).isValid, false);
	});
});

/* ============================================================
 * Generator - Symmetry Support
 * ============================================================ */
describe("Generator - symmetry support", { concurrency: true }, () => {
	test("supports symmetry (structure)", () => {
		const generator = new PuzzleGenerator();

		const options = {
			symmetry: SymmetryType.Rotational,
			difficulty: 0.5,
		};

		const grid = generator.generate(4, 4, options);
		assert.strictEqual(grid.symmetry, SymmetryType.Rotational);

		let startCount = 0;
		let endCount = 0;

		for (let r = 0; r <= grid.rows; r++) {
			for (let c = 0; c <= grid.cols; c++) {
				if (grid.nodes[r][c].type === NodeType.Start) startCount++;
				if (grid.nodes[r][c].type === NodeType.End) endCount++;
			}
		}

		assert.ok(startCount >= 2);
		assert.ok(endCount >= 2);
	});
});

/* ============================================================
 * Generator - Solvability under Symmetry
 * ============================================================ */
describe("Generator - symmetry solvability", { concurrency: true }, () => {
	test("horizontal symmetry solvable", () => {
		const generator = new PuzzleGenerator();
		const validator = new PuzzleValidator();

		const options = {
			symmetry: SymmetryType.Horizontal,
			useSquares: true,
			difficulty: 0.5,
		};

		for (let i = 0; i < 10; i++) {
			const grid = generator.generate(4, 4, options);
			const solutions = validator.countSolutions(grid);
			assert.ok(solutions >= 1);
		}
	});

	test("rotational symmetry solvable", () => {
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
			assert.ok(solutions >= 1);
		}
	});
});

/* ============================================================
 * Generator - Symmetry + Broken Edges
 * ============================================================ */
describe("Generator - symmetry with broken edges", { concurrency: true }, () => {
	test("asymmetrical cuts solvable", () => {
		const generator = new PuzzleGenerator();
		const validator = new PuzzleValidator();

		const rows = 4;
		const cols = 4;

		const symmetries = [SymmetryType.Horizontal, SymmetryType.Vertical, SymmetryType.Rotational];

		for (const symmetry of symmetries) {
			for (let i = 0; i < 5; i++) {
				const options = {
					useBrokenEdges: true,
					symmetry,
					difficulty: 0.5,
					complexity: 0.8,
				};

				const grid = generator.generate(rows, cols, options);
				const solutions = validator.countSolutions(grid, 1);
				assert.ok(solutions > 0);
			}
		}
	});
});
