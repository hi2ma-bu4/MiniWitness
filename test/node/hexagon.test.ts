import assert from "node:assert";
import { describe, test } from "node:test";
import { inspect } from "node:util";
import { CellType, Color, EdgeType, NodeType, type PuzzleData, PuzzleGenerator, SymmetryType, WitnessCore } from "../../dist/MiniWitness.js";

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
 * Node Hexagon Validation
 * ============================================================ */
describe("Node Hexagon validation", { concurrency: true }, () => {
	test("must pass through", () => {
		const puzzle = createBasicGrid(2, 2);
		puzzle.nodes[1][1].type = NodeType.Hexagon;

		const pathValid = {
			points: [
				{ x: 0, y: 2 },
				{ x: 1, y: 2 },
				{ x: 1, y: 1 },
				{ x: 1, y: 0 },
				{ x: 2, y: 0 },
			],
		};
		assert.strictEqual(core.validateSolution(puzzle, pathValid).isValid, true);

		const pathInvalid = {
			points: [
				{ x: 0, y: 2 },
				{ x: 0, y: 1 },
				{ x: 0, y: 0 },
				{ x: 1, y: 0 },
				{ x: 2, y: 0 },
			],
		};
		const result = core.validateSolution(puzzle, pathInvalid);
		assert.strictEqual(result.isValid, false);
		assert.ok(result.errorNodes?.some((p) => p.x === 1 && p.y === 1));
	});

	test("multiple hexagons", () => {
		const puzzle = createBasicGrid(2, 2);
		puzzle.nodes[1][1].type = NodeType.Hexagon;
		puzzle.nodes[1][2].type = NodeType.Hexagon;

		const path = {
			points: [
				{ x: 0, y: 2 },
				{ x: 1, y: 2 },
				{ x: 2, y: 2 },
				{ x: 2, y: 1 },
				{ x: 1, y: 1 },
				{ x: 1, y: 0 },
				{ x: 2, y: 0 },
			],
		};

		assert.strictEqual(core.validateSolution(puzzle, path).isValid, true);
	});
});

/* ============================================================
 * Eraser interaction with Node Hexagon
 * ============================================================ */
describe("Node Hexagon negation by Eraser", { concurrency: true }, () => {
	test("eraser can negate missed node hexagon", () => {
		const puzzle = createBasicGrid(2, 2);
		puzzle.nodes[1][1].type = NodeType.Hexagon;
		puzzle.cells[0][0] = { type: CellType.Eraser, color: Color.White };

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
		assert.ok(result.invalidatedNodes?.some((p) => p.x === 1 && p.y === 1));
	});
});

/* ============================================================
 * Difficulty bias rules
 * ============================================================ */
describe("Difficulty rules for Hexagons", { concurrency: true }, () => {
	test("edge vs node distribution", (t) => {
		const generator = new PuzzleGenerator();

		const gridEasy = generator.generate(4, 4, {
			difficulty: 0.1,
			useHexagons: true,
			useSquares: false,
			useStars: false,
		});

		const gridHard = generator.generate(4, 4, {
			difficulty: 0.9,
			useHexagons: true,
			useSquares: false,
			useStars: false,
		});

		const count = (grid: any) => {
			let edge = 0;
			let node = 0;
			for (let r = 0; r <= 4; r++) for (let c = 0; c < 4; c++) if (grid.hEdges[r][c].type === EdgeType.Hexagon) edge++;
			for (let r = 0; r < 4; r++) for (let c = 0; c <= 4; c++) if (grid.vEdges[r][c].type === EdgeType.Hexagon) edge++;
			for (let r = 0; r <= 4; r++) for (let c = 0; c <= 4; c++) if (grid.nodes[r][c].type === NodeType.Hexagon) node++;
			return { edge, node };
		};

		const easy = count(gridEasy);
		const hard = count(gridHard);

		t.diagnostic(
			inspect(
				{ easy, hard },
				{
					depth: null,
					colors: false,
				},
			),
		);

		assert.ok(hard.node >= easy.node, `node hexagon should increase: easy=${easy.node}, hard=${hard.node}`);
	});
});

/* ============================================================
 * Non-adjacency rules
 * ============================================================ */
describe("Non-adjacency between Edge and Node Hexagons", { concurrency: true }, () => {
	test("no adjacency", () => {
		const generator = new PuzzleGenerator();

		const isHexEdge = (t: EdgeType) => t === EdgeType.Hexagon || t === EdgeType.HexagonMain || t === EdgeType.HexagonSymmetry;
		const isHexNode = (t: NodeType) => t === NodeType.Hexagon || t === NodeType.HexagonMain || t === NodeType.HexagonSymmetry;

		for (let i = 0; i < 50; i++) {
			const grid = generator.generate(4, 4, {
				useHexagons: true,
				difficulty: 0.5,
				complexity: 1.0,
			});

			for (let r = 0; r <= grid.rows; r++) {
				for (let c = 0; c < grid.cols; c++) {
					if (isHexEdge(grid.hEdges[r][c].type)) {
						assert.ok(!isHexNode(grid.nodes[r][c].type));
						assert.ok(!isHexNode(grid.nodes[r][c + 1].type));
					}
				}
			}

			for (let r = 0; r < grid.rows; r++) {
				for (let c = 0; c <= grid.cols; c++) {
					if (isHexEdge(grid.vEdges[r][c].type)) {
						assert.ok(!isHexNode(grid.nodes[r][c].type));
						assert.ok(!isHexNode(grid.nodes[r + 1][c].type));
					}
				}
			}
		}
	});
});

/* ============================================================
 * Main / Symmetry Hexagon rules
 * ============================================================ */
describe("HexagonMain / HexagonSymmetry validation", { concurrency: true }, () => {
	test("path correctness", () => {
		const puzzle = createBasicGrid(2, 2);
		puzzle.symmetry = SymmetryType.Horizontal;
		puzzle.nodes[2][2].type = NodeType.Start;
		puzzle.nodes[0][0].type = NodeType.End;
		puzzle.nodes[0][2].type = NodeType.End;

		const solution = {
			points: [
				{ x: 0, y: 2 },
				{ x: 0, y: 1 },
				{ x: 0, y: 0 },
			],
		};

		puzzle.vEdges[1][0].type = EdgeType.HexagonMain;
		assert.strictEqual(core.validateSolution(puzzle, solution).isValid, true);

		puzzle.vEdges[1][0].type = EdgeType.Normal;
		puzzle.vEdges[1][2].type = EdgeType.HexagonMain;
		assert.strictEqual(core.validateSolution(puzzle, solution).isValid, false);

		puzzle.vEdges[1][2].type = EdgeType.HexagonSymmetry;
		assert.strictEqual(core.validateSolution(puzzle, solution).isValid, true);

		puzzle.vEdges[1][2].type = EdgeType.Normal;
		puzzle.vEdges[1][0].type = EdgeType.HexagonSymmetry;
		assert.strictEqual(core.validateSolution(puzzle, solution).isValid, false);
	});
});
