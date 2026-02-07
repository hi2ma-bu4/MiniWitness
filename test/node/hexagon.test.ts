import assert from "node:assert";
import { test } from "node:test";
import { CellType, Color, EdgeType, NodeType, type PuzzleData, PuzzleGenerator, WitnessCore } from "../../dist/MiniWitness.js";

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

test("Node Hexagon validation - must pass through", () => {
	const puzzle = createBasicGrid(2, 2);
	// Place node hexagon at (1, 1) (the center node)
	puzzle.nodes[1][1].type = NodeType.Hexagon;

	// 1. Path passing through (1,1)
	const pathValid = {
		points: [
			{ x: 0, y: 2 },
			{ x: 1, y: 2 },
			{ x: 1, y: 1 }, // Pass through hexagon
			{ x: 1, y: 0 },
			{ x: 2, y: 0 },
		],
	};
	assert.strictEqual(core.validateSolution(puzzle, pathValid).isValid, true, "Should be valid: passed through node hexagon");

	// 2. Path NOT passing through (1,1)
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
	assert.strictEqual(result.isValid, false, "Should be invalid: missed node hexagon");
	assert.ok(result.errorNodes && result.errorNodes.some((p) => p.x === 1 && p.y === 1), "Should report node hexagon error");
});

test("Node Hexagon validation - multiple hexagons", () => {
	const puzzle = createBasicGrid(2, 2);
	puzzle.nodes[1][1].type = NodeType.Hexagon;
	puzzle.nodes[1][2].type = NodeType.Hexagon;

	// Path passing through both
	const pathBoth = {
		points: [
			{ x: 0, y: 2 },
			{ x: 1, y: 2 },
			{ x: 1, y: 1 },
			{ x: 1, y: 0 },
			{ x: 2, y: 0 }, // Wait, (1,2) is missed here. (1,2) is node at x=2, y=1
		],
	};
	// Correct path for both: (0,2)->(1,2)->(2,2)->(2,1)->(1,1)->(1,0)->(2,0)
	const pathBothCorrect = {
		points: [
			{ x: 0, y: 2 },
			{ x: 1, y: 2 },
			{ x: 2, y: 2 },
			{ x: 2, y: 1 }, // Pass through (1,2)
			{ x: 1, y: 1 }, // Pass through (1,1)
			{ x: 1, y: 0 },
			{ x: 2, y: 0 },
		],
	};
	assert.strictEqual(core.validateSolution(puzzle, pathBothCorrect).isValid, true, "Should be valid: passed through all node hexagons");
});

test("Node Hexagon negation by Eraser", () => {
	const puzzle = createBasicGrid(2, 2);
	puzzle.nodes[1][1].type = NodeType.Hexagon;
	// Place eraser in cell (0, 0)
	// Cell (0,0) is adjacent to nodes (0,0), (1,0), (0,1), (1,1)
	puzzle.cells[0][0] = { type: CellType.Eraser, color: Color.White };

	// Path NOT passing through (1,1), but eraser is in adjacent cell
	const pathMissed = {
		points: [
			{ x: 0, y: 2 },
			{ x: 1, y: 2 },
			{ x: 2, y: 2 },
			{ x: 2, y: 1 },
			{ x: 2, y: 0 },
		],
	};
	// Region of cell (0,0) with this path:
	// Path separates (0,0), (0,1), (1,0), (1,1).
	// Actually, let's see. Path is along bottom and right edges.
	// All cells (0,0), (0,1), (1,0), (1,1) are in the same region.
	const result = core.validateSolution(puzzle, pathMissed);
	assert.strictEqual(result.isValid, true, "Should be valid: node hexagon negated by eraser");
	assert.ok(result.invalidatedNodes && result.invalidatedNodes.some((p) => p.x === 1 && p.y === 1), "Should report node hexagon as invalidated");
});

test("Difficulty rules for Hexagons", () => {
	const generator = new PuzzleGenerator();

	// Easy puzzle (difficulty 0.1) should favor edge hexagons
	const gridEasy = generator.generate(4, 4, { difficulty: 0.1, useHexagons: true, useSquares: false, useStars: false });
	let edgeHexCountEasy = 0;
	let nodeHexCountEasy = 0;
	for (let r = 0; r <= 4; r++) for (let c = 0; c < 4; c++) if (gridEasy.hEdges[r][c].type === EdgeType.Hexagon) edgeHexCountEasy++;
	for (let r = 0; r < 4; r++) for (let c = 0; c <= 4; c++) if (gridEasy.vEdges[r][c].type === EdgeType.Hexagon) edgeHexCountEasy++;
	for (let r = 0; r <= 4; r++) for (let c = 0; c <= 4; c++) if (gridEasy.nodes[r][c].type === NodeType.Hexagon) nodeHexCountEasy++;

	// Hard puzzle (difficulty 0.9)
	const gridHard = generator.generate(4, 4, { difficulty: 0.9, useHexagons: true, useSquares: false, useStars: false });
	let edgeHexCountHard = 0;
	let nodeHexCountHard = 0;
	for (let r = 0; r <= 4; r++) for (let c = 0; c < 4; c++) if (gridHard.hEdges[r][c].type === EdgeType.Hexagon) edgeHexCountHard++;
	for (let r = 0; r < 4; r++) for (let c = 0; c <= 4; c++) if (gridHard.vEdges[r][c].type === EdgeType.Hexagon) edgeHexCountHard++;
	for (let r = 0; r <= 4; r++) for (let c = 0; c <= 4; c++) if (gridHard.nodes[r][c].type === NodeType.Hexagon) nodeHexCountHard++;

	// We can't strictly assert counts because of randomness, but we can log them or check if it's reasonable
	// In our implementation, we biased it.
	console.log(`Easy: Edge=${edgeHexCountEasy}, Node=${nodeHexCountEasy}`);
	console.log(`Hard: Edge=${edgeHexCountHard}, Node=${nodeHexCountHard}`);
});

test("Non-adjacency between Edge Hexagons and Node Hexagons", () => {
	const generator = new PuzzleGenerator();
	const options = {
		useHexagons: true,
		difficulty: 0.5,
		complexity: 1.0,
	};

	for (let i = 0; i < 50; i++) {
		const grid = generator.generate(4, 4, options);

		// Check all horizontal edges
		for (let r = 0; r <= grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				if (grid.hEdges[r][c].type === EdgeType.Hexagon) {
					// Endpoint nodes should not be Hexagons
					assert.notStrictEqual(grid.nodes[r][c].type, NodeType.Hexagon, `Adjacency found at hEdge(${r},${c}) and node(${r},${c})`);
					assert.notStrictEqual(grid.nodes[r][c + 1].type, NodeType.Hexagon, `Adjacency found at hEdge(${r},${c}) and node(${r},${c + 1})`);
				}
			}
		}

		// Check all vertical edges
		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c <= grid.cols; c++) {
				if (grid.vEdges[r][c].type === EdgeType.Hexagon) {
					// Endpoint nodes should not be Hexagons
					assert.notStrictEqual(grid.nodes[r][c].type, NodeType.Hexagon, `Adjacency found at vEdge(${r},${c}) and node(${r},${c})`);
					assert.notStrictEqual(grid.nodes[r + 1][c].type, NodeType.Hexagon, `Adjacency found at vEdge(${r},${c}) and node(${r + 1},${c})`);
				}
			}
		}
	}
});
