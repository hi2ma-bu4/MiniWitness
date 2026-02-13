import assert from "node:assert";
import { describe, test } from "node:test";
import { CellType, Color, NodeType, type PuzzleData, type SolutionPath, WitnessCore } from "../../dist/MiniWitness.js";

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

describe("Triangle validation", { concurrency: true }, () => {
	test("single triangle - 1 edge passed", () => {
		const puzzle = createBasicGrid(1, 1);
		puzzle.cells[0][0] = { type: CellType.Triangle, color: Color.None, count: 1 };
		// Path: (0,1) -> (1,1) -> (1,0)
		// Edges for cell (0,0):
		// - Top (0,0)-(1,0): NO
		// - Bottom (0,1)-(1,1): YES
		// - Left (0,0)-(0,1): NO
		// - Right (1,0)-(1,1): YES
		// Wait, (0,1)->(1,1)->(1,0) has TWO edges for cell (0,0).

		// Let's try (0,1) -> (0,0) -> (1,0)
		// Edges for cell (0,0):
		// - Top (0,0)-(1,0): YES
		// - Bottom (0,1)-(1,1): NO
		// - Left (0,0)-(0,1): YES
		// Still two edges.

		// Actually, any path that goes from one node of a cell to an adjacent node of the SAME cell
		// uses exactly 1 edge of that cell.
		// For a 1x1 grid, (0,1) -> (1,1) -> (1,0) uses TWO edges.
		// Wait, nodes are (0,0), (1,0), (0,1), (1,1).
		// Edges are:
		// H(0,0): (0,0)-(1,0) [Top]
		// H(1,0): (0,1)-(1,1) [Bottom]
		// V(0,0): (0,0)-(0,1) [Left]
		// V(0,1): (1,0)-(1,1) [Right]

		// Path (0,1) -> (1,1) -> (1,0) uses:
		// 1. Bottom: H(1,0)
		// 2. Right: V(0,1)
		// Total 2 edges.

		// To use only 1 edge, we need a path that doesn't use other edges of this cell.
		// This is only possible if the grid is larger than 1x1.
		const puzzle2 = createBasicGrid(2, 2);
		puzzle2.cells[0][0] = { type: CellType.Triangle, color: Color.None, count: 1 };
		// Path: (0,2) -> (0,1) -> (0,0) -> (1,0) -> (2,0)
		// Cell (0,0) edges:
		// - Top (0,0)-(1,0): YES
		// - Bottom (0,1)-(1,1): NO
		// - Left (0,0)-(0,1): YES
		// - Right (1,0)-(1,1): NO
		// Still two.

		// Wait, if the path enters the cell's perimeter and leaves it, it must use at least 2 nodes, so at least 1 edge?
		// If it just passes along ONE side of the cell.
		// Path: (0,2) -> (1,2) -> (2,2) -> (2,1) -> (2,0)
		// Cell (0,0) edges:
		// - Top (0,0)-(1,0): NO
		// - Bottom (0,1)-(1,1): NO
		// - Left (0,0)-(0,1): NO
		// - Right (1,0)-(1,1): NO
		// 0 edges.

		// If path: (0,1) -> (1,1) -> (2,1) -> (2,0)
		// Cell (0,0) edges:
		// - Bottom (0,1)-(1,1): YES
		// Total 1 edge.
		const path1: SolutionPath = {
			points: [
				{ x: 0, y: 2 },
				{ x: 0, y: 1 },
				{ x: 1, y: 1 },
				{ x: 2, y: 1 },
				{ x: 2, y: 0 },
			],
		};
		const result = core.validateSolution(puzzle2, path1);
		assert.strictEqual(result.isValid, true, `Should be valid: 1 triangle, 1 edge. ${result.errorReason}`);
	});

	test("two triangles - 2 edges passed", () => {
		const puzzle = createBasicGrid(1, 1);
		puzzle.cells[0][0] = { type: CellType.Triangle, color: Color.None, count: 2 };
		const path: SolutionPath = {
			points: [
				{ x: 0, y: 1 },
				{ x: 1, y: 1 },
				{ x: 1, y: 0 },
			],
		};
		const result = core.validateSolution(puzzle, path);
		assert.strictEqual(result.isValid, true, `Should be valid: 2 triangles, 2 edges. ${result.errorReason}`);
	});

	test("three triangles - 3 edges passed", () => {
		const puzzle = createBasicGrid(1, 1);
		puzzle.cells[0][0] = { type: CellType.Triangle, color: Color.None, count: 3 };
		const path: SolutionPath = {
			points: [
				{ x: 0, y: 1 },
				{ x: 0, y: 0 },
				{ x: 1, y: 0 },
				{ x: 1, y: 1 },
			],
		};
		// Wait, Start is (0,1), End is (1,0).
		// Path must end at (1,0).
		const pathCorrect: SolutionPath = {
			points: [
				{ x: 0, y: 1 },
				{ x: 1, y: 1 },
				{ x: 1, y: 0 },
				{ x: 0, y: 0 },
				// Wait, can't go back to (0,0) then (1,0) because of self-intersection.
			],
		};
		// Let's use 2x1 grid.
		const puzzle2 = createBasicGrid(1, 2);
		puzzle2.nodes[1][0].type = NodeType.Start;
		puzzle2.nodes[0][2].type = NodeType.End;
		puzzle2.cells[0][0] = { type: CellType.Triangle, color: Color.None, count: 3 };
		// Cell (0,0) nodes: (0,0), (1,0), (0,1), (1,1)
		// Path: (0,1) -> (0,0) -> (1,0) -> (1,1) -> (2,1) -> (2,0)
		// Edges for (0,0):
		// - Left (0,0)-(0,1): YES
		// - Top (0,0)-(1,0): YES
		// - Right (1,0)-(1,1): YES
		// - Bottom (0,1)-(1,1): NO
		// Total 3.
		const path3: SolutionPath = {
			points: [
				{ x: 0, y: 1 },
				{ x: 0, y: 0 },
				{ x: 1, y: 0 },
				{ x: 1, y: 1 },
				{ x: 1, y: 2 },
				{ x: 0, y: 2 },
			],
		};
		// Wait, I messed up the start/end again.
		const p3 = createBasicGrid(2, 2);
		p3.nodes[2][0].type = NodeType.Start;
		p3.nodes[0][2].type = NodeType.End;
		p3.cells[0][0] = { type: CellType.Triangle, color: Color.None, count: 3 };
		// Path: (0,2) -> (0,1) -> (0,0) -> (1,0) -> (1,1) -> (2,1) -> (2,2) -> (2,1) -> NO
		const path3_real: SolutionPath = {
			points: [
				{ x: 0, y: 2 },
				{ x: 0, y: 1 },
				{ x: 0, y: 0 },
				{ x: 1, y: 0 },
				{ x: 1, y: 1 },
				{ x: 2, y: 1 },
				{ x: 2, y: 0 },
			],
		};
		// Edges for (0,0):
		// - Left (0,0)-(0,1): YES
		// - Top (0,0)-(1,0): YES
		// - Right (1,0)-(1,1): YES
		// - Bottom (0,1)-(1,1): NO
		// Total 3.
		const result3 = core.validateSolution(p3, path3_real);
		assert.strictEqual(result3.isValid, true, `Should be valid: 3 triangles, 3 edges. ${result3.errorReason}`);
	});

	test("triangle invalid count", () => {
		const puzzle = createBasicGrid(1, 1);
		puzzle.cells[0][0] = { type: CellType.Triangle, color: Color.None, count: 1 };
		const path: SolutionPath = {
			points: [
				{ x: 0, y: 1 },
				{ x: 1, y: 1 },
				{ x: 1, y: 0 },
			],
		};
		// 2 edges passed, but count is 1.
		const result = core.validateSolution(puzzle, path);
		assert.strictEqual(result.isValid, false, "Should be invalid: 1 triangle but 2 edges passed");
	});

	test("triangle with colored star", () => {
		const puzzle = createBasicGrid(1, 2);
		puzzle.cells[0][0] = { type: CellType.Triangle, color: Color.Red, count: 2 };
		puzzle.cells[0][1] = { type: CellType.Star, color: Color.Red };
		// Path: (0,0) -> (1,0) -> (2,0) -> (2,1) -> (1,1) -> (0,1)
		// Cell (0,0) edges: Top (0,0)-(1,0) and Bottom (0,1)-(1,1). Total 2.
		// Edge between (0,0) and (1,0) (col 1, row 0/1) is NOT in path, so they are in SAME region.
		puzzle.nodes[0][0].type = NodeType.Start;
		puzzle.nodes[1][0].type = NodeType.End; // Just to make it a valid node, but we'll end at (0,1)
		puzzle.nodes[1][0].type = NodeType.Normal;
		puzzle.nodes[1][0].type = NodeType.Start; // Resetting

		const p = createBasicGrid(1, 2);
		p.cells[0][0] = { type: CellType.Triangle, color: Color.Red, count: 2 };
		p.cells[0][1] = { type: CellType.Star, color: Color.Red };
		// All nodes normal first
		for (let r = 0; r <= p.rows; r++) for (let c = 0; c <= p.cols; c++) p.nodes[r][c].type = NodeType.Normal;
		p.nodes[0][0].type = NodeType.Start;
		p.nodes[0][1].type = NodeType.End;

		const path: SolutionPath = {
			points: [
				{ x: 0, y: 0 },
				{ x: 0, y: 1 },
				{ x: 1, y: 1 },
				{ x: 2, y: 1 },
				{ x: 2, y: 0 },
				{ x: 1, y: 0 },
			],
		};
		// Cell (0,0) edges: Left, Bottom, Right, Top.
		// Path uses:
		// 1. (0,0)-(0,1) [Left]
		// 2. (0,1)-(1,1) [Bottom]
		// 3. (1,1)-(2,1) [Bottom of C1]
		// 4. (2,1)-(2,0) [Right of C1]
		// 5. (2,0)-(1,0) [Top of C1]
		// Cell C0 has Left and Bottom edges. Total 2. OK.
		// C0 and C1 are connected by V(0,1) which is NOT in path. So SAME region.
		const result = core.validateSolution(p, path);
		assert.strictEqual(result.isValid, true, `Should be valid: colored triangle paired with star. ${result.errorReason}`);
	});

	test("triangle with eraser", () => {
		const puzzle = createBasicGrid(1, 2);
		puzzle.cells[0][0] = { type: CellType.Triangle, color: Color.None, count: 1 };
		puzzle.cells[0][1] = { type: CellType.Eraser, color: Color.White };
		for (let r = 0; r <= puzzle.rows; r++) for (let c = 0; c <= puzzle.cols; c++) puzzle.nodes[r][c].type = NodeType.Normal;
		puzzle.nodes[0][0].type = NodeType.Start;
		puzzle.nodes[0][1].type = NodeType.End;

		const path: SolutionPath = {
			points: [
				{ x: 0, y: 0 },
				{ x: 0, y: 1 },
				{ x: 1, y: 1 },
				{ x: 2, y: 1 },
				{ x: 2, y: 0 },
				{ x: 1, y: 0 },
			],
		};
		// Cell C0 has 2 edges in path (Left, Bottom). Triangle count is 1. Should be ERROR.
		// But Eraser is in the same region.
		const result = core.validateSolution(puzzle, path);
		assert.strictEqual(result.isValid, true, `Should be valid: triangle error negated by eraser. ${result.errorReason}`);
	});
});
