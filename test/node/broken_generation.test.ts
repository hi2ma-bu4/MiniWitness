import assert from "node:assert";
import { test } from "node:test";
import { EdgeType, PuzzleGenerator } from "../../dist/MiniWitness.js";

test("Generator - Absent edges propagation logic", () => {
	const generator = new PuzzleGenerator();
	const options = {
		useBrokenEdges: true,
		complexity: 1.0, // High complexity to ensure many edges are placed
	};

	// Perform multiple trials
	for (let i = 0; i < 4; i++) {
		const grid = generator.generate(4, 4, options);
		// Collect Absent edges
		const absentSet = new Set<string>();
		const boundaryQueue: { type: "h" | "v"; r: number; c: number }[] = [];

		const keyOf = (e: { type: "h" | "v"; r: number; c: number }) => `${e.type},${e.r},${e.c}`;

		// collect + boundary detection
		for (let r = 0; r <= grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				if (grid.hEdges[r][c].type === EdgeType.Absent) {
					const e = { type: "h", r, c } as const;
					absentSet.add(keyOf(e));
					if (r === 0 || r === grid.rows) boundaryQueue.push(e);
				}
			}
		}
		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c <= grid.cols; c++) {
				if (grid.vEdges[r][c].type === EdgeType.Absent) {
					const e = { type: "v", r, c } as const;
					absentSet.add(keyOf(e));
					if (c === 0 || c === grid.cols) boundaryQueue.push(e);
				}
			}
		}

		// BFS once
		const reachable = new Set<string>();
		let qi = 0;
		while (qi < boundaryQueue.length) {
			const curr = boundaryQueue[qi++];
			const k = keyOf(curr);
			if (reachable.has(k)) continue;
			reachable.add(k);

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
				] as const;

				for (const n of neighbors) {
					if (n.c >= 0 && (n.type === "h" ? n.c < grid.cols : n.c <= grid.cols) && n.r >= 0 && (n.type === "v" ? n.r < grid.rows : n.r <= grid.rows)) {
						const nk = keyOf(n);
						if (absentSet.has(nk) && !reachable.has(nk)) {
							boundaryQueue.push(n);
						}
					}
				}
			}
		}

		// All absent edges must be reachable
		for (const k of absentSet) {
			assert.ok(reachable.has(k), `Absent edge ${k} is not connected to boundary`);
		}
	}
});
