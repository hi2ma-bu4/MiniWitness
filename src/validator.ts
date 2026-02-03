import { Grid } from "./grid";
import { CellType, Color, EdgeType, NodeType, type Point, type SolutionPath, type ValidationResult } from "./types";

/**
 * パズルの回答を検証するクラス
 */
export class PuzzleValidator {
	/**
	 * 与えられたグリッドと回答パスが正当かどうかを検証する
	 * @param grid パズルのグリッドデータ
	 * @param solution 回答パス
	 * @returns 検証結果（正誤、エラー理由、無効化された記号など）
	 */
	public validate(grid: Grid, solution: SolutionPath): ValidationResult {
		const path = solution.points;
		if (path.length < 2) return { isValid: false, errorReason: "Path too short" };
		const start = path[0];
		const end = path[path.length - 1];

		// 開始ノードと終了ノードのチェック
		if (grid.nodes[start.y][start.x].type !== NodeType.Start) return { isValid: false, errorReason: "Must start at Start Node" };
		if (grid.nodes[end.y][end.x].type !== NodeType.End) return { isValid: false, errorReason: "Must end at End Node" };

		// パスの連続性と自己交差、断線チェック
		const visitedNodes = new Set<string>();
		visitedNodes.add(`${start.x},${start.y}`);
		for (let i = 0; i < path.length - 1; i++) {
			const p1 = path[i];
			const p2 = path[i + 1];
			const dist = Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
			if (dist !== 1) return { isValid: false, errorReason: "Invalid jump in path" };
			const key = `${p2.x},${p2.y}`;
			if (visitedNodes.has(key)) return { isValid: false, errorReason: "Self-intersecting path" };
			visitedNodes.add(key);
			if (this.isBrokenEdge(grid, p1, p2)) return { isValid: false, errorReason: "Passed through broken edge" };
		}

		// 区画の計算
		const regions = this.calculateRegions(grid, path);
		// 通過しなかった六角形の取得
		const missedHexagons = this.getMissedHexagons(grid, path);
		// エラー削除（テトラポッド）を考慮した制約検証
		return this.validateWithErasers(grid, regions, missedHexagons);
	}

	/**
	 * 二点間が断線（Broken or Absent）しているか確認する
	 */
	private isBrokenEdge(grid: Grid, p1: Point, p2: Point): boolean {
		let type: EdgeType;
		if (p1.x === p2.x) {
			const y = Math.min(p1.y, p2.y);
			type = grid.vEdges[y][p1.x].type;
		} else {
			const x = Math.min(p1.x, p2.x);
			type = grid.hEdges[p1.y][x].type;
		}
		return type === EdgeType.Broken || type === EdgeType.Absent;
	}

	/**
	 * 二点間が Absent（存在しない）エッジか確認する
	 */
	private isAbsentEdge(grid: Grid, p1: Point, p2: Point): boolean {
		if (p1.x === p2.x) {
			const y = Math.min(p1.y, p2.y);
			return grid.vEdges[y][p1.x].type === EdgeType.Absent;
		} else {
			const x = Math.min(p1.x, p2.x);
			return grid.hEdges[p1.y][x].type === EdgeType.Absent;
		}
	}

	/**
	 * 回答パスが通過しなかった六角形エッジをリストアップする
	 */
	private getMissedHexagons(grid: Grid, path: Point[]): { type: "h" | "v"; r: number; c: number }[] {
		const pathEdges = new Set<string>();
		for (let i = 0; i < path.length - 1; i++) {
			pathEdges.add(this.getEdgeKey(path[i], path[i + 1]));
		}
		const missed: { type: "h" | "v"; r: number; c: number }[] = [];
		for (let r = 0; r <= grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				if (grid.hEdges[r][c].type === EdgeType.Hexagon) {
					const key = this.getEdgeKey({ x: c, y: r }, { x: c + 1, y: r });
					if (!pathEdges.has(key)) missed.push({ type: "h", r, c });
				}
			}
		}
		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c <= grid.cols; c++) {
				if (grid.vEdges[r][c].type === EdgeType.Hexagon) {
					const key = this.getEdgeKey({ x: c, y: r }, { x: c, y: r + 1 });
					if (!pathEdges.has(key)) missed.push({ type: "v", r, c });
				}
			}
		}
		return missed;
	}

	/**
	 * テトラポッド（エラー削除）を考慮してパズルの各制約を検証する
	 */
	private validateWithErasers(grid: Grid, regions: Point[][], missedHexagons: { type: "h" | "v"; r: number; c: number }[]): ValidationResult {
		const regionResults: { invalidatedCells: Point[]; invalidatedHexagons: number[]; isValid: boolean }[][] = [];

		for (let i = 0; i < regions.length; i++) {
			const region = regions[i];
			const erasers = region.filter((p) => grid.cells[p.y][p.x].type === CellType.Eraser);
			const otherMarks = region.filter((p) => grid.cells[p.y][p.x].type !== CellType.None && grid.cells[p.y][p.x].type !== CellType.Eraser);
			const adjacentMissedHexagons: number[] = [];
			for (let j = 0; j < missedHexagons.length; j++) {
				if (this.isHexagonAdjacentToRegion(grid, missedHexagons[j], region)) adjacentMissedHexagons.push(j);
			}

			// 各区画でエラー削除の全組み合わせを試行
			const possible = this.getPossibleErasures(grid, region, erasers, otherMarks, adjacentMissedHexagons);
			if (possible.length === 0) return { isValid: false, errorReason: `Constraints failed in region ${i}` };
			// 最小の削除数を持つ解決策を優先する
			possible.sort((a, b) => {
				const costA = a.invalidatedCells.length + a.invalidatedHexagons.length;
				const costB = b.invalidatedCells.length + b.invalidatedHexagons.length;
				return costA - costB;
			});
			regionResults.push(possible);
		}

		// 複数の区画にまたがる六角形のエラー削除割り当てを決定
		const assignment = this.findGlobalAssignment(regionResults, missedHexagons.length);
		if (!assignment) return { isValid: false, errorReason: "Could not satisfy all constraints with available erasers" };
		return {
			isValid: true,
			invalidatedCells: assignment.invalidatedCells,
			invalidatedEdges: assignment.invalidatedHexIndices.map((idx) => missedHexagons[idx]),
		};
	}

	/**
	 * 指定されたエッジが特定の区画に隣接しているか確認する
	 */
	private isHexagonAdjacentToRegion(grid: Grid, hex: { type: "h" | "v"; r: number; c: number }, region: Point[]): boolean {
		const regionCells = new Set(region.map((p) => `${p.x},${p.y}`));
		if (hex.type === "h") {
			if (hex.r > 0 && regionCells.has(`${hex.c},${hex.r - 1}`)) return true;
			if (hex.r < grid.rows && regionCells.has(`${hex.c},${hex.r}`)) return true;
		} else {
			if (hex.c > 0 && regionCells.has(`${hex.c - 1},${hex.r}`)) return true;
			if (hex.c < grid.cols && regionCells.has(`${hex.c},${hex.r}`)) return true;
		}
		return false;
	}

	/**
	 * 区画内のエラー削除可能な全パターンを取得する
	 */
	private getPossibleErasures(grid: Grid, region: Point[], erasers: Point[], otherMarks: Point[], adjacentMissedHexagons: number[]): { invalidatedCells: Point[]; invalidatedHexagons: number[]; isValid: boolean }[] {
		const results: { invalidatedCells: Point[]; invalidatedHexagons: number[]; isValid: boolean }[] = [];
		const numErasers = erasers.length;
		if (numErasers === 0) {
			if (this.checkRegionValid(grid, region, [], [])) {
				results.push({ invalidatedCells: [], invalidatedHexagons: [], isValid: true });
			}
			return results;
		}

		const itemsToNegate = [...otherMarks.map((p) => ({ type: "cell" as const, pos: p })), ...adjacentMissedHexagons.map((idx) => ({ type: "hex" as const, index: idx }))];

		// 初期状態でエラーがあるか確認（テトラポッド自身のペア不成立は除外して判定）
		const initiallyValid = this.checkRegionValid(grid, region, [], []) && adjacentMissedHexagons.length === 0;

		// E: 全テトラポッド数, N: テトラポッド自身が削除される数, K: itemsToNegate から削除する数
		// 各 activeEraser (E-N個) は、1つの対象（N個のテトラポッド or K個の項目）を削除できる。
		// 余った activeEraser は、Starのペアなどの記号として機能し、それが必須でなければならない。
		for (let N = 0; N <= numErasers; N++) {
			const negatedEraserCombinations = this.getNCombinations(erasers, N);
			for (const negatedErasers of negatedEraserCombinations) {
				const negatedErasersSet = new Set(negatedErasers.map((e) => `${e.x},${e.y}`));
				const activeErasers = erasers.filter((e) => !negatedErasersSet.has(`${e.x},${e.y}`));

				for (let K = 0; K <= itemsToNegate.length; K++) {
					if (activeErasers.length !== N + K) continue; // すべてのテトラポッドは削除（N or K）に使用されなければならない

					const itemCombinations = this.getNCombinations(itemsToNegate, K);
					for (const negatedItems of itemCombinations) {
						const negatedCells = negatedItems.filter((it) => it.type === "cell").map((it) => it.pos as Point);
						const negatedHexIndices = negatedItems.filter((it) => it.type === "hex").map((it) => it.index as number);

						const isValid = this.checkRegionValid(grid, region, [...negatedCells, ...negatedErasers], activeErasers);
						if (isValid) {
							let isUseful = true;
							if (initiallyValid) {
								// 初期状態で有効なら、テトラポッド同士で完全に消し合うしかない（K=0、かつNによってすべて消える）
								if (K > 0) isUseful = false;
							} else {
								// 冗長な削除（natural なエラーに対するもの）のチェック
								for (let i = 0; i < negatedItems.length; i++) {
									const subset = [...negatedItems.slice(0, i), ...negatedItems.slice(i + 1)];
									const subsetCells = subset.filter((it) => it.type === "cell").map((it) => it.pos as Point);
									const subsetHexIndices = new Set(subset.filter((it) => it.type === "hex").map((it) => it.index as number));
									const allHexSatisfied = adjacentMissedHexagons.every((idx) => subsetHexIndices.has(idx));

									if (this.checkRegionValid(grid, region, subsetCells, activeErasers) && allHexSatisfied) {
										isUseful = false;
										break;
									}
								}
							}

							if (isUseful) {
								results.push({
									invalidatedCells: [...negatedCells, ...negatedErasers],
									invalidatedHexagons: negatedHexIndices,
									isValid: true,
								});
							}
						}
					}
				}
			}
		}
		return results;
	}

	/**
	 * 配列からN個選ぶ組み合わせを取得する
	 */
	private getNCombinations<T>(items: T[], n: number): T[][] {
		const results: T[][] = [];
		const backtrack = (start: number, current: T[]) => {
			if (current.length === n) {
				results.push([...current]);
				return;
			}
			for (let i = start; i < items.length; i++) {
				current.push(items[i]);
				backtrack(i + 1, current);
				current.pop();
			}
		};
		backtrack(0, []);
		return results;
	}

	/**
	 * 特定の削除・無効化を適用した状態で、区画内の制約が満たされているか検証する
	 */
	private checkRegionValid(grid: Grid, region: Point[], erasedCells: Point[], erasersAsMarks: Point[]): boolean {
		const erasedSet = new Set(erasedCells.map((p) => `${p.x},${p.y}`));
		const erasersAsMarksSet = new Set(erasersAsMarks.map((p) => `${p.x},${p.y}`));
		const colorCounts = new Map<number, number>();
		const starColors = new Set<number>();
		const squareColors = new Set<number>();
		const tetrisPieces: { shape: number[][]; rotatable: boolean }[] = [];

		for (const cell of region) {
			if (erasedSet.has(`${cell.x},${cell.y}`)) continue;
			const constraint = grid.cells[cell.y][cell.x];
			if (constraint.type === CellType.None) continue;

			const isEraserAsMark = constraint.type === CellType.Eraser && erasersAsMarksSet.has(`${cell.x},${cell.y}`);
			const isOtherMark = constraint.type !== CellType.Eraser;
			if (!isEraserAsMark && !isOtherMark) continue;

			const color = constraint.color;
			if (color !== Color.None) colorCounts.set(color, (colorCounts.get(color) || 0) + 1);

			if (constraint.type === CellType.Square) squareColors.add(color);
			else if (constraint.type === CellType.Star) starColors.add(color);
			else if (constraint.type === CellType.Tetris || constraint.type === CellType.TetrisRotated) {
				if (constraint.shape) tetrisPieces.push({ shape: constraint.shape, rotatable: constraint.type === CellType.TetrisRotated });
			}
		}

		// 四角形のルール：同区画内は同じ色
		if (squareColors.size > 1) return false;

		// 星のルール：同色の記号がちょうど2つ
		for (const color of starColors) if (colorCounts.get(color) !== 2) return false;

		// テトリスのルール：タイリング可能
		if (tetrisPieces.length > 0) {
			if (!this.checkTetrisConstraint(region, tetrisPieces)) return false;
		}
		return true;
	}

	/**
	 * グローバルな制約（六角形）の割り当てをバックトラッキングで探索する
	 */
	private findGlobalAssignment(regionResults: { invalidatedCells: Point[]; invalidatedHexagons: number[]; isValid: boolean }[][], totalMissedHexagons: number): { invalidatedCells: Point[]; invalidatedHexIndices: number[] } | null {
		const numRegions = regionResults.length;
		const currentHexErasures = new Array(totalMissedHexagons).fill(0);
		const allInvalidatedCells: Point[] = [];
		const allInvalidatedHexIndices: number[] = [];

		const backtrack = (regionIdx: number): boolean => {
			if (regionIdx === numRegions) return currentHexErasures.every((count) => count === 1);
			for (const option of regionResults[regionIdx]) {
				let possible = true;
				for (const hexIdx of option.invalidatedHexagons)
					if (currentHexErasures[hexIdx] > 0) {
						possible = false;
						break;
					}
				if (possible) {
					for (const hexIdx of option.invalidatedHexagons) {
						currentHexErasures[hexIdx]++;
						allInvalidatedHexIndices.push(hexIdx);
					}
					allInvalidatedCells.push(...option.invalidatedCells);
					if (backtrack(regionIdx + 1)) return true;
					for (const hexIdx of option.invalidatedHexagons) {
						currentHexErasures[hexIdx]--;
						allInvalidatedHexIndices.pop();
					}
					for (let i = 0; i < option.invalidatedCells.length; i++) allInvalidatedCells.pop();
				}
			}
			return false;
		};
		if (backtrack(0)) return { invalidatedCells: allInvalidatedCells, invalidatedHexIndices: allInvalidatedHexIndices };
		return null;
	}

	/**
	 * テトリス制約の検証（指定された領域をピースで埋め尽くせるか）
	 */
	private checkTetrisConstraint(region: Point[], pieces: { shape: number[][]; rotatable: boolean }[]): boolean {
		const totalTetrisArea = pieces.reduce((sum, p) => sum + this.getShapeArea(p.shape), 0);
		if (totalTetrisArea !== region.length) return false;

		const minX = Math.min(...region.map((p) => p.x));
		const minY = Math.min(...region.map((p) => p.y));
		const maxX = Math.max(...region.map((p) => p.x));
		const maxY = Math.max(...region.map((p) => p.y));
		const width = maxX - minX + 1;
		const height = maxY - minY + 1;

		const regionGrid = Array.from({ length: height }, () => Array(width).fill(false));
		for (const p of region) regionGrid[p.y - minY][p.x - minX] = true;

		return this.canTile(regionGrid, pieces);
	}

	private getShapeArea(shape: number[][]): number {
		let area = 0;
		for (const row of shape) for (const cell of row) if (cell) area++;
		return area;
	}

	/**
	 * 再帰的にタイリングを試みる
	 */
	private canTile(regionGrid: boolean[][], pieces: { shape: number[][]; rotatable: boolean }[]): boolean {
		let r0 = -1;
		let c0 = -1;
		for (let r = 0; r < regionGrid.length; r++) {
			for (let c = 0; c < regionGrid[0].length; c++) {
				if (regionGrid[r][c]) {
					r0 = r;
					c0 = c;
					break;
				}
			}
			if (r0 !== -1) break;
		}
		if (r0 === -1) return pieces.length === 0;
		if (pieces.length === 0) return false;

		for (let i = 0; i < pieces.length; i++) {
			const piece = pieces[i];
			const nextPieces = [...pieces.slice(0, i), ...pieces.slice(i + 1)];
			const rotations = piece.rotatable ? this.getAllRotations(piece.shape) : [piece.shape];

			for (const shape of rotations) {
				const blocks: { r: number; c: number }[] = [];
				for (let pr = 0; pr < shape.length; pr++) {
					for (let pc = 0; pc < shape[0].length; pc++) {
						if (shape[pr][pc]) blocks.push({ r: pr, c: pc });
					}
				}
				for (const anchor of blocks) {
					const dr = r0 - anchor.r;
					const dc = c0 - anchor.c;
					if (this.canPlace(regionGrid, shape, dr, dc)) {
						this.placePiece(regionGrid, shape, dr, dc, false);
						if (this.canTile(regionGrid, nextPieces)) return true;
						this.placePiece(regionGrid, shape, dr, dc, true);
					}
				}
			}
		}
		return false;
	}

	private canPlace(regionGrid: boolean[][], shape: number[][], r: number, c: number): boolean {
		for (let i = 0; i < shape.length; i++) {
			for (let j = 0; j < shape[0].length; j++) {
				if (shape[i][j]) {
					const nr = r + i;
					const nc = c + j;
					if (nr < 0 || nr >= regionGrid.length || nc < 0 || nc >= regionGrid[0].length || !regionGrid[nr][nc]) return false;
				}
			}
		}
		return true;
	}

	private placePiece(regionGrid: boolean[][], shape: number[][], r: number, c: number, value: boolean) {
		for (let i = 0; i < shape.length; i++) for (let j = 0; j < shape[0].length; j++) if (shape[i][j]) regionGrid[r + i][c + j] = value;
	}

	private getAllRotations(shape: number[][]): number[][][] {
		const results: number[][][] = [];
		const keys = new Set<string>();
		let curr = shape;
		for (let i = 0; i < 4; i++) {
			const key = JSON.stringify(curr);
			if (!keys.has(key)) {
				results.push(curr);
				keys.add(key);
			}
			curr = this.rotate90(curr);
		}
		return results;
	}

	private rotate90(shape: number[][]): number[][] {
		const rows = shape.length;
		const cols = shape[0].length;
		const newShape = Array.from({ length: cols }, () => Array(rows).fill(0));
		for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) newShape[c][rows - 1 - r] = shape[r][c];
		return newShape;
	}

	/**
	 * 回答パスによって分割された各区画のセルリストを取得する
	 */
	private calculateRegions(grid: Grid, path: Point[]): Point[][] {
		const regions: Point[][] = [];
		const visitedCells = new Set<string>();
		const pathEdges = new Set<string>();
		for (let i = 0; i < path.length - 1; i++) pathEdges.add(this.getEdgeKey(path[i], path[i + 1]));

		const externalCells = this.getExternalCells(grid);
		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				if (visitedCells.has(`${c},${r}`) || externalCells.has(`${c},${r}`)) continue;
				const region: Point[] = [];
				const queue: Point[] = [{ x: c, y: r }];
				visitedCells.add(`${c},${r}`);
				while (queue.length > 0) {
					const curr = queue.shift()!;
					region.push(curr);
					const neighbors = [
						{ nx: curr.x, ny: curr.y - 1, p1: { x: curr.x, y: curr.y }, p2: { x: curr.x + 1, y: curr.y } },
						{ nx: curr.x, ny: curr.y + 1, p1: { x: curr.x, y: curr.y + 1 }, p2: { x: curr.x + 1, y: curr.y + 1 } },
						{ nx: curr.x - 1, ny: curr.y, p1: { x: curr.x, y: curr.y }, p2: { x: curr.x, y: curr.y + 1 } },
						{ nx: curr.x + 1, ny: curr.y, p1: { x: curr.x + 1, y: curr.y }, p2: { x: curr.x + 1, y: curr.y + 1 } },
					];
					for (const n of neighbors) {
						if (n.nx >= 0 && n.nx < grid.cols && n.ny >= 0 && n.ny < grid.rows) {
							const neighborKey = `${n.nx},${n.ny}`;
							if (!visitedCells.has(neighborKey) && !externalCells.has(neighborKey)) {
								const edgeKey = this.getEdgeKey(n.p1, n.p2);
								if (!pathEdges.has(edgeKey) && !this.isAbsentEdge(grid, n.p1, n.p2)) {
									visitedCells.add(neighborKey);
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

	/**
	 * エッジ（Absent）によって外部に繋がっているセルを特定する
	 */
	private getExternalCells(grid: Grid): Set<string> {
		const external = new Set<string>();
		const queue: { x: number; y: number }[] = [];
		for (let c = 0; c < grid.cols; c++) {
			if (grid.hEdges[0][c].type === EdgeType.Absent) {
				if (!external.has(`${c},0`)) {
					external.add(`${c},0`);
					queue.push({ x: c, y: 0 });
				}
			}
			if (grid.hEdges[grid.rows][c].type === EdgeType.Absent) {
				if (!external.has(`${c},${grid.rows - 1}`)) {
					external.add(`${c},${grid.rows - 1}`);
					queue.push({ x: c, y: grid.rows - 1 });
				}
			}
		}
		for (let r = 0; r < grid.rows; r++) {
			if (grid.vEdges[r][0].type === EdgeType.Absent) {
				if (!external.has(`0,${r}`)) {
					external.add(`0,${r}`);
					queue.push({ x: 0, y: r });
				}
			}
			if (grid.vEdges[r][grid.cols].type === EdgeType.Absent) {
				if (!external.has(`${grid.cols - 1},${r}`)) {
					external.add(`${grid.cols - 1},${r}`);
					queue.push({ x: grid.cols - 1, y: r });
				}
			}
		}
		while (queue.length > 0) {
			const curr = queue.shift()!;
			const neighbors = [
				{ nx: curr.x, ny: curr.y - 1, edge: grid.hEdges[curr.y][curr.x] },
				{ nx: curr.x, ny: curr.y + 1, edge: grid.hEdges[curr.y + 1][curr.x] },
				{ nx: curr.x - 1, ny: curr.y, edge: grid.vEdges[curr.y][curr.x] },
				{ nx: curr.x + 1, ny: curr.y, edge: grid.vEdges[curr.y][curr.x + 1] },
			];
			for (const n of neighbors) {
				if (n.nx >= 0 && n.nx < grid.cols && n.ny >= 0 && n.ny < grid.rows) {
					if (!external.has(`${n.nx},${n.ny}`) && n.edge.type === EdgeType.Absent) {
						external.add(`${n.nx},${n.ny}`);
						queue.push({ x: n.nx, y: n.ny });
					}
				}
			}
		}
		return external;
	}

	private getEdgeKey(p1: Point, p2: Point): string {
		return p1.x < p2.x || (p1.x === p2.x && p1.y < p2.y) ? `${p1.x},${p1.y}-${p2.x},${p2.y}` : `${p2.x},${p2.y}-${p1.x},${p1.y}`;
	}

	/**
	 * パズルの難易度スコア(0.0-1.0)を算出する
	 */
	public calculateDifficulty(grid: Grid): number {
		const rows = grid.rows;
		const cols = grid.cols;
		const nodeCols = cols + 1;
		const nodeCount = (rows + 1) * nodeCols;
		const adj = Array.from({ length: nodeCount }, () => [] as { next: number; isHexagon: boolean; isBroken: boolean }[]);
		const startNodes: number[] = [];
		const endNodes: number[] = [];
		const hexagonEdges = new Set<string>();

		for (let r = 0; r <= rows; r++) {
			for (let c = 0; c <= cols; c++) {
				const u = r * nodeCols + c;
				if (grid.nodes[r][c].type === NodeType.Start) startNodes.push(u);
				if (grid.nodes[r][c].type === NodeType.End) endNodes.push(u);
				if (c < cols) {
					const v = u + 1;
					const type = grid.hEdges[r][c].type;
					const isHexagon = type === EdgeType.Hexagon;
					const isBroken = type === EdgeType.Broken || type === EdgeType.Absent;
					adj[u].push({ next: v, isHexagon, isBroken });
					adj[v].push({ next: u, isHexagon, isBroken });
					if (isHexagon) hexagonEdges.add(this.getEdgeKey({ x: c, y: r }, { x: c + 1, y: r }));
				}
				if (r < rows) {
					const v = u + nodeCols;
					const type = grid.vEdges[r][c].type;
					const isHexagon = type === EdgeType.Hexagon;
					const isBroken = type === EdgeType.Broken || type === EdgeType.Absent;
					adj[u].push({ next: v, isHexagon, isBroken });
					adj[v].push({ next: u, isHexagon, isBroken });
					if (isHexagon) hexagonEdges.add(this.getEdgeKey({ x: c, y: r }, { x: c, y: r + 1 }));
				}
			}
		}

		const stats = { totalNodesVisited: 0, branchingPoints: 0, solutions: 0, maxDepth: 0, backtracks: 0 };
		const totalHexagons = hexagonEdges.size;
		const fingerprints = new Set<string>();

		for (const startIdx of startNodes) {
			this.exploreSearchSpace(grid, startIdx, 1n << BigInt(startIdx), [startIdx], 0, totalHexagons, adj, endNodes, fingerprints, stats, 500);
		}

		if (stats.solutions === 0) return 0;

		let constraintCount = hexagonEdges.size;
		const constraintTypes = new Set<number>();
		if (hexagonEdges.size > 0) constraintTypes.add(999);

		let tetrisCount = 0;
		let rotatedTetrisCount = 0;
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const cell = grid.cells[r][c];
				if (cell.type !== CellType.None) {
					constraintCount++;
					constraintTypes.add(cell.type);
					if (cell.type === CellType.Tetris) tetrisCount++;
					else if (cell.type === CellType.TetrisRotated) {
						tetrisCount++;
						rotatedTetrisCount++;
					}
				}
			}
		}

		const branchingFactor = stats.branchingPoints / (stats.totalNodesVisited || 1);
		const searchComplexity = Math.log10(stats.totalNodesVisited + 1);
		let difficulty = (branchingFactor * 10 + searchComplexity * 1.0) / (Math.log2(stats.solutions + 1) + 1);

		if (tetrisCount > 0) {
			difficulty += rotatedTetrisCount * 0.5;
			difficulty += (tetrisCount - rotatedTetrisCount) * 0.2;
		}

		const cellCount = rows * cols;
		const density = constraintCount / cellCount;
		const densityFactor = density < 0.3 ? Math.pow(density / 0.3, 3) : 1.0;
		const typeFactor = constraintTypes.size <= 1 ? 0.4 : 1.0;

		difficulty *= densityFactor * typeFactor;
		const sizeFactor = Math.sqrt(cellCount) / 4;
		difficulty *= sizeFactor;

		return Math.max(0.01, Math.min(1.0, difficulty / 4));
	}

	/**
	 * 探索空間を走査して統計情報を収集する
	 */
	private exploreSearchSpace(grid: Grid, currIdx: number, visitedMask: bigint, path: number[], hexagonsOnPath: number, totalHexagons: number, adj: { next: number; isHexagon: boolean; isBroken: boolean }[][], endNodes: number[], fingerprints: Set<string>, stats: { totalNodesVisited: number; branchingPoints: number; solutions: number; maxDepth: number; backtracks: number }, limit: number): void {
		stats.totalNodesVisited++;
		stats.maxDepth = Math.max(stats.maxDepth, path.length);
		if (stats.totalNodesVisited > limit) return;

		if (endNodes.includes(currIdx)) {
			if (hexagonsOnPath === totalHexagons) {
				const solutionPath = { points: path.map((idx) => ({ x: idx % (grid.cols + 1), y: Math.floor(idx / (grid.cols + 1)) })) };
				if (this.validate(grid, solutionPath).isValid) {
					const fp = this.getFingerprint(grid, solutionPath.points);
					if (!fingerprints.has(fp)) {
						fingerprints.add(fp);
						stats.solutions++;
					}
				}
			}
			return;
		}

		if (!this.canReachEndOptimized(currIdx, visitedMask, adj, endNodes)) {
			stats.backtracks++;
			return;
		}

		const validMoves = [];
		for (const edge of adj[currIdx]) {
			if (edge.isBroken) continue;
			if (visitedMask & (1n << BigInt(edge.next))) continue;

			// 六角形の枝刈り（現在のノードから必須エッジが出ているが、それを選ばない場合は無効）
			let possible = true;
			for (const otherEdge of adj[currIdx]) {
				if (otherEdge.isHexagon) {
					const isAlreadyOnPath = path.length >= 2 && otherEdge.next === path[path.length - 2];
					const isNextMove = otherEdge.next === edge.next;
					if (!isAlreadyOnPath && !isNextMove) {
						possible = false;
						break;
					}
				}
			}
			if (possible) validMoves.push(edge);
		}

		if (validMoves.length > 1) stats.branchingPoints++;
		for (const move of validMoves) {
			path.push(move.next);
			this.exploreSearchSpace(grid, move.next, visitedMask | (1n << BigInt(move.next)), path, hexagonsOnPath + (move.isHexagon ? 1 : 0), totalHexagons, adj, endNodes, fingerprints, stats, limit);
			path.pop();
			if (stats.totalNodesVisited > limit) return;
		}
	}

	/**
	 * 正解数をカウントする
	 */
	public countSolutions(grid: Grid, limit: number = 100): number {
		const rows = grid.rows;
		const cols = grid.cols;
		const nodeCols = cols + 1;
		const nodeCount = (rows + 1) * nodeCols;
		const adj = Array.from({ length: nodeCount }, () => [] as { next: number; isHexagon: boolean; isBroken: boolean }[]);
		const startNodes: number[] = [];
		const endNodes: number[] = [];
		const hexagonEdges = new Set<string>();

		for (let r = 0; r <= rows; r++) {
			for (let c = 0; c <= cols; c++) {
				const u = r * nodeCols + c;
				if (grid.nodes[r][c].type === NodeType.Start) startNodes.push(u);
				if (grid.nodes[r][c].type === NodeType.End) endNodes.push(u);
				if (c < cols) {
					const v = u + 1;
					const type = grid.hEdges[r][c].type;
					const isHexagon = type === EdgeType.Hexagon;
					const isBroken = type === EdgeType.Broken || type === EdgeType.Absent;
					adj[u].push({ next: v, isHexagon, isBroken });
					adj[v].push({ next: u, isHexagon, isBroken });
					if (isHexagon) hexagonEdges.add(this.getEdgeKey({ x: c, y: r }, { x: c + 1, y: r }));
				}
				if (r < rows) {
					const v = u + nodeCols;
					const type = grid.vEdges[r][c].type;
					const isHexagon = type === EdgeType.Hexagon;
					const isBroken = type === EdgeType.Broken || type === EdgeType.Absent;
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
		}
		return fingerprints.size;
	}

	private findPathsOptimized(grid: Grid, currIdx: number, visitedMask: bigint, path: number[], hexagonsOnPath: number, totalHexagons: number, adj: { next: number; isHexagon: boolean; isBroken: boolean }[][], endNodes: number[], fingerprints: Set<string>, limit: number): void {
		if (fingerprints.size >= limit) return;
		if (endNodes.includes(currIdx)) {
			if (hexagonsOnPath === totalHexagons) {
				const solutionPath = { points: path.map((idx) => ({ x: idx % (grid.cols + 1), y: Math.floor(idx / (grid.cols + 1)) })) };
				if (this.validate(grid, solutionPath).isValid) fingerprints.add(this.getFingerprint(grid, solutionPath.points));
			}
			return;
		}
		if (!this.canReachEndOptimized(currIdx, visitedMask, adj, endNodes)) return;
		for (const edge of adj[currIdx]) {
			if (edge.isBroken) continue;
			if (visitedMask & (1n << BigInt(edge.next))) continue;

			let possible = true;
			for (const otherEdge of adj[currIdx]) {
				if (otherEdge.isHexagon) {
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

	/**
	 * 終端まで到達可能かビットマスクBFSで高速に確認する
	 */
	private canReachEndOptimized(curr: number, visitedMask: bigint, adj: { next: number; isBroken: boolean }[][], endNodes: number[]): boolean {
		let queue = [curr];
		let localVisited = visitedMask;
		let head = 0;
		while (head < queue.length) {
			const u = queue[head++];
			if (endNodes.includes(u)) return true;
			for (const edge of adj[u])
				if (!edge.isBroken && !(localVisited & (1n << BigInt(edge.next)))) {
					localVisited |= 1n << BigInt(edge.next);
					queue.push(edge.next);
				}
		}
		return false;
	}

	/**
	 * パスの論理的な指紋を取得する（区画分けに基づき、同一解を排除するため）
	 */
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
