import assert from "node:assert";
import { test } from "node:test";
import { CellType, EdgeType, PuzzleGenerator } from "../../dist/MiniWitness.js";

test("Generator - Absent edges propagation logic", () => {
	const generator = new PuzzleGenerator();
	const options = {
		useBrokenEdges: true,
		complexity: 1.0, // High complexity to ensure many edges are placed
	};

	// Perform multiple trials
	for (let i = 0; i < 20; i++) {
		const grid = generator.generate(4, 4, options);

		// Helper to check if an edge is on the outer boundary
		const isOnBoundary = (type: "h" | "v", r: number, c: number) => {
			if (type === "h") return r === 0 || r === grid.rows;
			return c === 0 || c === grid.cols;
		};

		// Collect all Absent edges
		const absentEdges: { type: "h" | "v"; r: number; c: number }[] = [];
		for (let r = 0; r <= grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				if (grid.hEdges[r][c].type === EdgeType.Absent) absentEdges.push({ type: "h", r, c });
			}
		}
		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c <= grid.cols; c++) {
				if (grid.vEdges[r][c].type === EdgeType.Absent) absentEdges.push({ type: "v", r, c });
			}
		}

		// For each Absent edge, it must either be on the boundary OR touch another Absent edge
		// (Actually, by induction, every Absent edge must be connected to the boundary via other Absent edges)
		for (const edge of absentEdges) {
			// Rule: Absent edges must not be adjacent to marks
			const hasMarkNearby = edge.type === "h" ? (edge.r > 0 && grid.cells[edge.r - 1][edge.c].type !== CellType.None) || (edge.r < grid.rows && grid.cells[edge.r][edge.c].type !== CellType.None) : (edge.c > 0 && grid.cells[edge.r][edge.c - 1].type !== CellType.None) || (edge.c < grid.cols && grid.cells[edge.r][edge.c].type !== CellType.None);

			assert.strictEqual(hasMarkNearby, false, `Absent edge at ${edge.type}(${edge.r},${edge.c}) is adjacent to a mark`);

			// Connectivity check: find a path of Absent edges to the boundary
			const visited = new Set<string>();
			const queue = [edge];
			visited.add(`${edge.type},${edge.r},${edge.c}`);
			let reachesBoundary = false;

			while (queue.length > 0) {
				const curr = queue.shift()!;
				if (isOnBoundary(curr.type, curr.r, curr.c)) {
					reachesBoundary = true;
					break;
				}

				// Get nodes for current edge
				const nodes =
					curr.type === "h"
						? [
								{ x: curr.c, y: curr.r },
								{ x: curr.c + 1, y: curr.r },
							]
						: [
								{ x: curr.c, y: curr.r },
								{ x: curr.c, y: curr.r + 1 },
							];

				for (const node of nodes) {
					const neighbors = [
						{ type: "h", r: node.y, c: node.x - 1 },
						{ type: "h", r: node.y, c: node.x },
						{ type: "v", r: node.y - 1, c: node.x },
						{ type: "v", r: node.y, c: node.x },
					];
					for (const n of neighbors as { type: "h" | "v"; r: number; c: number }[]) {
						if (n.c >= 0 && (n.type === "h" ? n.c < grid.cols : n.c <= grid.cols) && n.r >= 0 && (n.type === "v" ? n.r < grid.rows : n.r <= grid.rows)) {
							const key = `${n.type},${n.r},${n.c}`;
							if (!visited.has(key)) {
								const edgeType = n.type === "h" ? grid.hEdges[n.r][n.c].type : grid.vEdges[n.r][n.c].type;
								if (edgeType === EdgeType.Absent) {
									visited.add(key);
									queue.push(n);
								}
							}
						}
					}
				}
			}

			assert.ok(reachesBoundary, `Absent edge at ${edge.type}(${edge.r},${edge.c}) is not connected to the boundary`);
		}
	}
});
