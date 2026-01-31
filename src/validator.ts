// validator.ts
import { Grid } from "./grid";
import { CellType, EdgeType, NodeType, Point, SolutionPath, ValidationResult } from "./types";

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
			// Note: The Witnessのルールではゴールは複数ある場合もあるが、ここでは簡略化
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

		// 4. ルール検証: Squares (色分け)
		if (!this.checkSquareConstraint(grid, path)) {
			return { isValid: false, errorReason: "Color segregation failed" };
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
			const p1 = path[i];
			const p2 = path[i + 1];
			pathEdges.add(this.getEdgeKey(p1, p2));
		}

		// グリッド上の全ヘキサゴンエッジを確認
		for (let r = 0; r <= grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				// Horizontal Check
				if (r < grid.rows + 1 && grid.hEdges[r][c].type === EdgeType.Hexagon) {
					const key = this.getEdgeKey({ x: c, y: r }, { x: c + 1, y: r });
					if (!pathEdges.has(key)) return false;
				}
			}
		}
		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c <= grid.cols; c++) {
				// Vertical Check
				if (grid.vEdges[r][c].type === EdgeType.Hexagon) {
					const key = this.getEdgeKey({ x: c, y: r }, { x: c, y: r + 1 });
					if (!pathEdges.has(key)) return false;
				}
			}
		}

		return true;
	}

	private checkSquareConstraint(grid: Grid, path: Point[]): boolean {
		// Generatorと同じロジックで領域分割を行う
		// ※GeneratorクラスのcalculateRegionsと共通化すべきだが、ここではValidator内に自己完結させる
		const regions = this.calculateRegions(grid, path);

		for (const region of regions) {
			let firstColor: number | null = null;

			for (const cell of region) {
				const constraint = grid.cells[cell.y][cell.x];
				if (constraint.type === CellType.Square) {
					if (firstColor === null) {
						firstColor = constraint.color;
					} else if (firstColor !== constraint.color) {
						// 同じ領域内に異なる色が混ざっている -> 違反
						return false;
					}
				}
			}
		}
		return true;
	}

	private calculateRegions(grid: Grid, path: Point[]): Point[][] {
		// Flood Fill (Generatorの実装と同等)
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
								if (!pathEdges.has(edgeKey)) {
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
}
