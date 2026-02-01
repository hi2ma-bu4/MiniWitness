import { Grid } from "./grid";
import { CellType, EdgeType, NodeType, type Point, type SolutionPath, type ValidationResult } from "./types";

export class PuzzleValidator {
	public validate(grid: Grid, solution: SolutionPath): ValidationResult {
		const path = solution.points;

		// 1. 基本的なパスの有効性チェック (連続性、始点終点)
		if (path.length < 2) return { isValid: false, errorReason: "Path too short" };

		const start = path[0];
		const end = path[path.length - 1];

		if (grid.nodes[start.y][start.x].type !== NodeType.Start) {
			return { isValid: false, errorReason: "Must start at Start Node" };
		}
		if (grid.nodes[end.y][end.x].type !== NodeType.End) {
			return { isValid: false, errorReason: "Must end at End Node" };
		}

		// 2. パスの連続性と自己交差のチェック
		const visitedNodes = new Set<string>();
		visitedNodes.add(`${start.x},${start.y}`);

		for (let i = 0; i < path.length - 1; i++) {
			const p1 = path[i];
			const p2 = path[i + 1];

			// 距離が1であること
			const dist = Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
			if (dist !== 1) return { isValid: false, errorReason: "Invalid jump in path" };

			// 既に通ったノードではないこと (自己交差禁止)
			const key = `${p2.x},${p2.y}`;
			if (visitedNodes.has(key)) return { isValid: false, errorReason: "Self-intersecting path" };
			visitedNodes.add(key);

			// 通行不可エッジ(Broken)でないかチェック
			if (this.isBrokenEdge(grid, p1, p2)) {
				return { isValid: false, errorReason: "Passed through broken edge" };
			}
		}

		// 3. ルール検証: Hexagon (通過必須)
		if (!this.checkHexagonConstraint(grid, path)) {
			return { isValid: false, errorReason: "Missed hexagon constraint" };
		}

		// 4. ルール検証: セル制約 (Squares & Stars)
		if (!this.checkCellConstraints(grid, path)) {
			return { isValid: false, errorReason: "Cell constraints failed" };
		}

		return { isValid: true };
	}

	private isBrokenEdge(grid: Grid, p1: Point, p2: Point): boolean {
		if (p1.x === p2.x) {
			const y = Math.min(p1.y, p2.y);
			return grid.vEdges[y][p1.x].type === EdgeType.Broken;
		} else {
			const x = Math.min(p1.x, p2.x);
			return grid.hEdges[p1.y][x].type === EdgeType.Broken;
		}
	}

	private checkHexagonConstraint(grid: Grid, path: Point[]): boolean {
		// パス上のエッジキー集合を作成
		const pathEdges = new Set<string>();
		for (let i = 0; i < path.length - 1; i++) {
			pathEdges.add(this.getEdgeKey(path[i], path[i + 1]));
		}

		// グリッド上の全ヘキサゴンエッジを確認
		for (let r = 0; r <= grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				if (grid.hEdges[r][c].type === EdgeType.Hexagon) {
					const key = this.getEdgeKey({ x: c, y: r }, { x: c + 1, y: r });
					if (!pathEdges.has(key)) return false;
				}
			}
		}
		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c <= grid.cols; c++) {
				if (grid.vEdges[r][c].type === EdgeType.Hexagon) {
					const key = this.getEdgeKey({ x: c, y: r }, { x: c, y: r + 1 });
					if (!pathEdges.has(key)) return false;
				}
			}
		}
		return true;
	}

	private checkCellConstraints(grid: Grid, path: Point[]): boolean {
		const regions = this.calculateRegions(grid, path);

		for (const region of regions) {
			const colorCounts = new Map<number, number>();
			const starColors = new Set<number>();
			const squareColors = new Set<number>();

			for (const cell of region) {
				const constraint = grid.cells[cell.y][cell.x];
				if (constraint.type === CellType.None) continue;

				const color = constraint.color;
				colorCounts.set(color, (colorCounts.get(color) || 0) + 1);

				if (constraint.type === CellType.Square) {
					squareColors.add(color);
				} else if (constraint.type === CellType.Star) {
					starColors.add(color);
				}
				// Squares: All squares in a region must be the same color
				if (squareColors.size > 1) return false;
			}
			// Stars: For each color that has a star, there must be exactly 2 marks of that color
			for (const color of starColors) {
				if (colorCounts.get(color) !== 2) return false;
			}
		}
		return true;
	}

	private calculateRegions(grid: Grid, path: Point[]): Point[][] {
		const regions: Point[][] = [];
		const visitedCells = new Set<string>();
		const pathEdges = new Set<string>();
		for (let i = 0; i < path.length - 1; i++) {
			pathEdges.add(this.getEdgeKey(path[i], path[i + 1]));
		}

		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				if (visitedCells.has(`${c},${r}`)) continue;

				const region: Point[] = [];
				const queue: Point[] = [{ x: c, y: r }];
				visitedCells.add(`${c},${r}`);

				while (queue.length > 0) {
					const curr = queue.shift()!;
					region.push(curr);

					const neighbors = [
						{ nx: curr.x, ny: curr.y - 1, p1: { x: curr.x, y: curr.y }, p2: { x: curr.x + 1, y: curr.y } }, // Up
						{ nx: curr.x, ny: curr.y + 1, p1: { x: curr.x, y: curr.y + 1 }, p2: { x: curr.x + 1, y: curr.y + 1 } }, // Down
						{ nx: curr.x - 1, ny: curr.y, p1: { x: curr.x, y: curr.y }, p2: { x: curr.x, y: curr.y + 1 } }, // Left
						{ nx: curr.x + 1, ny: curr.y, p1: { x: curr.x + 1, y: curr.y }, p2: { x: curr.x + 1, y: curr.y + 1 } }, // Right
					];

					for (const n of neighbors) {
						if (n.nx >= 0 && n.nx < grid.cols && n.ny >= 0 && n.ny < grid.rows) {
							if (!visitedCells.has(`${n.nx},${n.ny}`)) {
								const edgeKey = this.getEdgeKey(n.p1, n.p2);
								const isBroken = this.isBrokenEdge(grid, n.p1, n.p2);
								if (!pathEdges.has(edgeKey) && !isBroken) {
									visitedCells.add(`${n.nx},${n.ny}`);
									queue.push({ x: n.nx, y: n.ny });
								}
							}
						}
					}
				}
				regions.push(region);
			}
		}
		return regions;
	}

	private getEdgeKey(p1: Point, p2: Point): string {
		return p1.x < p2.x || (p1.x === p2.x && p1.y < p2.y) ? `${p1.x},${p1.y}-${p2.x},${p2.y}` : `${p2.x},${p2.y}-${p1.x},${p1.y}`;
	}

	/**
	 * 全ての有効な解答パスの個数をカウントする
	 */
	public countSolutions(grid: Grid, limit: number = 100): number {
		const rows = grid.rows;
		const cols = grid.cols;
		const nodeCols = cols + 1;
		const nodeCount = (rows + 1) * nodeCols;

		// ノード情報の事前計算
		const adj = Array.from({ length: nodeCount }, () => [] as { next: number; isHexagon: boolean; isBroken: boolean }[]);
		const startNodes: number[] = [];
		const endNodes: number[] = [];
		const hexagonEdges = new Set<string>();

		for (let r = 0; r <= rows; r++) {
			for (let c = 0; c <= cols; c++) {
				const u = r * nodeCols + c;
				if (grid.nodes[r][c].type === NodeType.Start) startNodes.push(u);
				if (grid.nodes[r][c].type === NodeType.End) endNodes.push(u);

				// Right
				if (c < cols) {
					const v = u + 1;
					const isHexagon = grid.hEdges[r][c].type === EdgeType.Hexagon;
					const isBroken = grid.hEdges[r][c].type === EdgeType.Broken;
					adj[u].push({ next: v, isHexagon, isBroken });
					adj[v].push({ next: u, isHexagon, isBroken });
					if (isHexagon) hexagonEdges.add(this.getEdgeKey({ x: c, y: r }, { x: c + 1, y: r }));
				}
				// Down
				if (r < rows) {
					const v = u + nodeCols;
					const isHexagon = grid.vEdges[r][c].type === EdgeType.Hexagon;
					const isBroken = grid.vEdges[r][c].type === EdgeType.Broken;
					adj[u].push({ next: v, isHexagon, isBroken });
					adj[v].push({ next: u, isHexagon, isBroken });
					if (isHexagon) hexagonEdges.add(this.getEdgeKey({ x: c, y: r }, { x: c, y: r + 1 }));
				}
			}
		}

		const fingerprints = new Set<string>();
		const totalHexagons = hexagonEdges.size;

		for (const startIdx of startNodes) {
			this.findPathsOptimized(grid, startIdx, 1n << BigInt(startIdx), [startIdx], 0, totalHexagons, adj, endNodes, fingerprints, limit);
			if (fingerprints.size >= limit) break;
		}

		return fingerprints.size;
	}

	private findPathsOptimized(grid: Grid, currIdx: number, visitedMask: bigint, path: number[], hexagonsOnPath: number, totalHexagons: number, adj: { next: number; isHexagon: boolean; isBroken: boolean }[][], endNodes: number[], fingerprints: Set<string>, limit: number): void {
		if (fingerprints.size >= limit) return;

		// 終点に到達した場合
		if (endNodes.includes(currIdx)) {
			if (hexagonsOnPath === totalHexagons) {
				const solutionPath = {
					points: path.map((idx) => ({
						x: idx % (grid.cols + 1),
						y: Math.floor(idx / (grid.cols + 1)),
					})),
				};
				if (this.validate(grid, solutionPath).isValid) {
					fingerprints.add(this.getFingerprint(grid, solutionPath.points));
				}
			}
			// Note: The Witnessのルール上、終点からさらに進むことはできない
			return;
		}

		// 枝刈り: 終点への到達可能性
		if (!this.canReachEndOptimized(currIdx, visitedMask, adj, endNodes)) return;

		for (const edge of adj[currIdx]) {
			if (edge.isBroken) continue;
			if (visitedMask & (1n << BigInt(edge.next))) continue;

			// Hexagon pruning:
			// 現在のノード(currIdx)に接続されているヘキサゴンエッジのうち、
			// まだ使っておらず、かつ次の移動(next)でも使わないものは、もう二度と使えない。
			let possible = true;
			for (const otherEdge of adj[currIdx]) {
				if (otherEdge.isHexagon) {
					// このヘキサゴンエッジがパスに含まれていないかチェック
					// パスに含まれているなら otherEdge.next は path[path.length-2] のはず
					const isAlreadyOnPath = path.length >= 2 && otherEdge.next === path[path.length - 2];
					const isNextMove = otherEdge.next === edge.next;
					if (!isAlreadyOnPath && !isNextMove) {
						possible = false;
						break;
					}
				}
			}
			if (!possible) continue;

			path.push(edge.next);
			this.findPathsOptimized(grid, edge.next, visitedMask | (1n << BigInt(edge.next)), path, hexagonsOnPath + (edge.isHexagon ? 1 : 0), totalHexagons, adj, endNodes, fingerprints, limit);
			path.pop();
			if (fingerprints.size >= limit) return;
		}
	}

	private canReachEndOptimized(curr: number, visitedMask: bigint, adj: { next: number; isBroken: boolean }[][], endNodes: number[]): boolean {
		let queue = [curr];
		let localVisited = visitedMask;

		let head = 0;
		while (head < queue.length) {
			const u = queue[head++];
			if (endNodes.includes(u)) return true;

			for (const edge of adj[u]) {
				if (!edge.isBroken && !(localVisited & (1n << BigInt(edge.next)))) {
					localVisited |= 1n << BigInt(edge.next);
					queue.push(edge.next);
				}
			}
		}
		return false;
	}

	private getFingerprint(grid: Grid, path: Point[]): string {
		const regions = this.calculateRegions(grid, path);
		const regionFingerprints = regions
			.map((region) => {
				const marks = region
					.map((p) => grid.cells[p.y][p.x])
					.filter((c) => c.type !== CellType.None)
					.map((c) => `${c.type}:${c.color}`)
					.sort();
				return marks.join(",");
			})
			.sort();
		return regionFingerprints.filter((f) => f.length > 0).join("|") || "empty";
	}
}
