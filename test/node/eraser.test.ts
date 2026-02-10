import assert from "node:assert";
import { describe, test } from "node:test";
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

/* =========================
 * Eraser 基本挙動
 * ========================= */
describe("Eraser validation - basic behavior", { concurrency: true }, () => {
	test("erase star violation", () => {
		const puzzle = createBasicGrid(1, 4);
		puzzle.cells[0][0] = { type: CellType.Star, color: Color.Black };
		puzzle.cells[0][1] = { type: CellType.Star, color: Color.Black };
		puzzle.cells[0][2] = { type: CellType.Star, color: Color.Black };
		puzzle.cells[0][3] = { type: CellType.Eraser, color: Color.White };

		const result = core.validateSolution(puzzle, getPath(4));
		assert.strictEqual(result.isValid, true);
	});

	test("eraser in already valid region", () => {
		const puzzle = createBasicGrid(1, 3);
		puzzle.cells[0][0] = { type: CellType.Star, color: Color.Black };
		puzzle.cells[0][1] = { type: CellType.Star, color: Color.Black };
		puzzle.cells[0][2] = { type: CellType.Eraser, color: Color.White };

		const result = core.validateSolution(puzzle, getPath(3));
		assert.strictEqual(result.isValid, false);
	});

	test("erase square violation", () => {
		const puzzle = createBasicGrid(1, 3);
		puzzle.cells[0][0] = { type: CellType.Square, color: Color.Black };
		puzzle.cells[0][1] = { type: CellType.Square, color: Color.White };
		puzzle.cells[0][2] = { type: CellType.Eraser, color: Color.White };

		const result = core.validateSolution(puzzle, getPath(3));
		assert.strictEqual(result.isValid, true);
	});

	test("two erasers erasing each other", () => {
		const puzzle = createBasicGrid(1, 2);
		puzzle.cells[0][0] = { type: CellType.Eraser, color: Color.White };
		puzzle.cells[0][1] = { type: CellType.Eraser, color: Color.White };

		const result = core.validateSolution(puzzle, getPath(2));
		assert.strictEqual(result.isValid, true);
	});
});

/* =========================
 * Eraser × Star 組み合わせ
 * ========================= */
describe("Eraser validation - star combinations", { concurrency: true }, () => {
	test("one star and two erasers (invalid)", () => {
		const puzzle = createBasicGrid(1, 3);
		puzzle.cells[0][0] = { type: CellType.Star, color: Color.Black };
		puzzle.cells[0][1] = { type: CellType.Eraser, color: Color.White };
		puzzle.cells[0][2] = { type: CellType.Eraser, color: Color.White };

		const result = core.validateSolution(puzzle, getPath(3));
		assert.strictEqual(result.isValid, false);
	});

	test("colored eraser completing star pair (invalid)", () => {
		const puzzle = createBasicGrid(1, 2);
		puzzle.cells[0][0] = { type: CellType.Star, color: Color.Black };
		puzzle.cells[0][1] = { type: CellType.Eraser, color: Color.Black };

		const result = core.validateSolution(puzzle, getPath(2));
		assert.strictEqual(result.isValid, false);
	});

	test("colored eraser redundant pair", () => {
		const puzzle = createBasicGrid(1, 3);
		puzzle.cells[0][0] = { type: CellType.Star, color: Color.Black };
		puzzle.cells[0][1] = { type: CellType.Star, color: Color.Black };
		puzzle.cells[0][2] = { type: CellType.Eraser, color: Color.Black };

		const result = core.validateSolution(puzzle, getPath(3));
		assert.strictEqual(result.isValid, true);
	});

	test("white eraser completing white star pair (valid if error exists)", () => {
		const puzzle = createBasicGrid(1, 3);
		puzzle.cells[0][0] = { type: CellType.Star, color: Color.White };
		puzzle.cells[0][1] = { type: CellType.Eraser, color: Color.White };
		puzzle.cells[0][2] = { type: CellType.Star, color: Color.Black };

		const result = core.validateSolution(puzzle, getPath(3));
		assert.strictEqual(result.isValid, true);
	});
});

/* =========================
 * 複合・特殊ケース
 * ========================= */
describe("Eraser validation - complex / special cases", { concurrency: true }, () => {
	test("complex mixed colors", () => {
		const puzzle = createBasicGrid(1, 5);
		puzzle.cells[0][0] = { type: CellType.Square, color: Color.White };
		puzzle.cells[0][1] = { type: CellType.Square, color: Color.White };
		puzzle.cells[0][2] = { type: CellType.Star, color: Color.White };
		puzzle.cells[0][3] = { type: CellType.Star, color: Color.Black };
		puzzle.cells[0][4] = { type: CellType.Eraser, color: Color.Black };

		const result = core.validateSolution(puzzle, getPath(5));
		assert.strictEqual(result.isValid, true);
	});

	test("erase hexagon violation", () => {
		const puzzle = createBasicGrid(1, 2);
		puzzle.hEdges[0][0].type = EdgeType.Hexagon;
		puzzle.cells[0][0] = { type: CellType.Eraser, color: Color.White };

		const path: SolutionPath = {
			points: [
				{ x: 0, y: 1 },
				{ x: 1, y: 1 },
				{ x: 2, y: 1 },
				{ x: 2, y: 0 },
			],
		};

		const result = core.validateSolution(puzzle, path);
		assert.strictEqual(result.isValid, true);
	});
});

/* =========================
 * バグ再現テスト
 * ========================= */
describe("Eraser validation - bug reproduction", { concurrency: true }, () => {
	test("1 Star + 1 Eraser of same color", () => {
		const puzzle = createBasicGrid(1, 2);
		puzzle.cells[0][0] = { type: CellType.Star, color: Color.White };
		puzzle.cells[0][1] = { type: CellType.Eraser, color: Color.White };

		const result = core.validateSolution(puzzle, getPath(2));
		assert.strictEqual(result.isValid, false);
	});

	test("3 Star + 1 Eraser of same color", () => {
		const puzzle = createBasicGrid(1, 4);
		puzzle.cells[0][0] = { type: CellType.Star, color: Color.White };
		puzzle.cells[0][1] = { type: CellType.Star, color: Color.White };
		puzzle.cells[0][2] = { type: CellType.Star, color: Color.White };
		puzzle.cells[0][3] = { type: CellType.Eraser, color: Color.White };

		const result = core.validateSolution(puzzle, getPath(4));
		assert.strictEqual(result.isValid, false);
	});
});

/* =========================
 * Generator 独立性
 * ========================= */
describe("Generation independence", { concurrency: true }, () => {
	test("Tetris and Eraser without Squares/Stars", () => {
		const generator = new PuzzleGenerator();
		const grid = generator.generate(4, 4, {
			useHexagons: false,
			useSquares: false,
			useStars: false,
			useTetris: true,
			useEraser: true,
			complexity: 1.0,
		});

		let hasTetris = false;
		let hasEraser = false;
		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				if (grid.cells[r][c].type === CellType.Tetris || grid.cells[r][c].type === CellType.TetrisRotated) hasTetris = true;
				if (grid.cells[r][c].type === CellType.Eraser) hasEraser = true;
			}
		}

		assert.ok(hasTetris);
		assert.ok(hasEraser);
	});
});
