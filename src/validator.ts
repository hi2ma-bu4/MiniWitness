import { Grid } from "./grid";
import { CellType, Color, EdgeType, NodeType, SymmetryType, type Point, type SolutionPath, type ValidationResult } from "./types";

/**
 * パズルの回答を検証するクラス
 */
export class PuzzleValidator {
	private tetrisCache: Map<string, boolean> = new Map();

	/**
	 * 与えられたグリッドと回答パスが正当かどうかを検証する
	 * @param grid パズルのグリッドデータ
	 * @param solution 回答パス
	 * @param externalCellsPrecalculated 既知の外部セル（高速化用）
	 * @returns 検証結果（正誤、エラー理由、無効化された記号など）
	 */
	public validate(grid: Grid, solution: SolutionPath, externalCellsPrecalculated?: Set<string>): ValidationResult {
		const path = solution.points;
		if (path.length < 2) return { isValid: false, errorReason: "Path too short" };

		const symmetry = grid.symmetry || SymmetryType.None;
		const symPath: Point[] = [];
		if (symmetry !== SymmetryType.None) {
			for (const p of path) {
				symPath.push(this.getSymmetricalPoint(grid, p));
			}
		}

		const start = path[0];
		const end = path[path.length - 1];

		// 開始ノードと終了ノードのチェック
		if (grid.nodes[start.y][start.x].type !== NodeType.Start) return { isValid: false, errorReason: "Must start at Start Node" };
		if (grid.nodes[end.y][end.x].type !== NodeType.End) return { isValid: false, errorReason: "Must end at End Node" };

		if (symmetry !== SymmetryType.None) {
			const symStart = symPath[0];
			const symEnd = symPath[symPath.length - 1];
			if (grid.nodes[symStart.y][symStart.x].type !== NodeType.Start) return { isValid: false, errorReason: "Symmetrical path must start at Start Node" };
			if (grid.nodes[symEnd.y][symEnd.x].type !== NodeType.End) return { isValid: false, errorReason: "Symmetrical path must end at End Node" };
		}

		// パスの連続性と自己交差、断線チェック
		const visitedNodes = new Set<string>();
		const visitedEdges = new Set<string>();
		visitedNodes.add(`${start.x},${start.y}`);

		if (symmetry !== SymmetryType.None) {
			const symStart = symPath[0];
			if (visitedNodes.has(`${symStart.x},${symStart.y}`)) return { isValid: false, errorReason: "Paths collide at start" };
			visitedNodes.add(`${symStart.x},${symStart.y}`);
		}

		for (let i = 0; i < path.length - 1; i++) {
			const p1 = path[i];
			const p2 = path[i + 1];
			const dist = Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
			if (dist !== 1) return { isValid: false, errorReason: "Invalid jump in path" };

			const key = `${p2.x},${p2.y}`;
			if (visitedNodes.has(key)) return { isValid: false, errorReason: "Self-intersecting path or path collision" };
			visitedNodes.add(key);

			if (this.isBrokenEdge(grid, p1, p2)) return { isValid: false, errorReason: "Passed through broken edge" };
			visitedEdges.add(this.getEdgeKey(p1, p2));

			if (symmetry !== SymmetryType.None) {
				const sp1 = symPath[i];
				const sp2 = symPath[i + 1];
				const symKey = `${sp2.x},${sp2.y}`;

				if (visitedNodes.has(symKey)) return { isValid: false, errorReason: "Path collision" };
				visitedNodes.add(symKey);

				if (this.isBrokenEdge(grid, sp1, sp2)) return { isValid: false, errorReason: "Symmetrical path passed through broken edge" };

				const edgeKey = this.getEdgeKey(sp1, sp2);
				if (visitedEdges.has(edgeKey)) return { isValid: false, errorReason: "Paths cross the same edge" };
				visitedEdges.add(edgeKey);
			}
		}

		// 区画の計算
		const regions = this.calculateRegions(grid, path, symPath, externalCellsPrecalculated);
		// 通過しなかった六角形の取得
		const missed = this.getMissedHexagons(grid, path, symPath);
		// エラー削除（テトラポッド）を考慮した制約検証
		const result = this.validateWithErasers(grid, regions, missed.edges, missed.nodes);
		result.regions = regions;
		return result;
	}

	/**
	 * 高速化された検証（内部探索用）
	 * @param grid グリッド
	 * @param path メインパス
	 * @param symPath 対称パス
	 * @param externalCells 外部セルのキャッシュ
	 * @returns 検証結果
	 */
	private validateFast(grid: Grid, path: Point[], symPath: Point[], externalCells?: Set<string>): ValidationResult {
		const regions = this.calculateRegions(grid, path, symPath, externalCells);
		const missed = this.getMissedHexagons(grid, path, symPath);
		return this.validateWithErasers(grid, regions, missed.edges, missed.nodes);
	}

	/**
	 * 二点間が断線（Broken or Absent）しているか確認する
	 * @param grid グリッド
	 * @param p1 点1
	 * @param p2 点2
	 * @returns 断線しているかどうか
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
	 * @param grid グリッド
	 * @param p1 点1
	 * @param p2 点2
	 * @returns 存在しないかどうか
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
	 * 回答パスが通過しなかった六角形（エッジ・ノード）をリストアップする
	 * @param grid グリッド
	 * @param path メインパス
	 * @param symPath 対称パス
	 * @returns 通過しなかった六角形のリスト
	 */
	private getMissedHexagons(grid: Grid, path: Point[], symPath: Point[] = []): { edges: { type: "h" | "v"; r: number; c: number }[]; nodes: Point[] } {
		const mainPathEdges = new Set<string>();
		const mainPathNodes = new Set<string>();
		for (let i = 0; i < path.length; i++) {
			mainPathNodes.add(`${path[i].x},${path[i].y}`);
			if (i < path.length - 1) {
				mainPathEdges.add(this.getEdgeKey(path[i], path[i + 1]));
			}
		}

		const symPathEdges = new Set<string>();
		const symPathNodes = new Set<string>();
		for (let i = 0; i < symPath.length; i++) {
			symPathNodes.add(`${symPath[i].x},${symPath[i].y}`);
			if (i < symPath.length - 1) {
				symPathEdges.add(this.getEdgeKey(symPath[i], symPath[i + 1]));
			}
		}

		const missedEdges: { type: "h" | "v"; r: number; c: number }[] = [];
		for (let r = 0; r <= grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				const type = grid.hEdges[r][c].type;
				if (type === EdgeType.Hexagon || type === EdgeType.HexagonMain || type === EdgeType.HexagonSymmetry) {
					const key = this.getEdgeKey({ x: c, y: r }, { x: c + 1, y: r });
					let passed = false;
					if (type === EdgeType.Hexagon) passed = mainPathEdges.has(key) || symPathEdges.has(key);
					else if (type === EdgeType.HexagonMain) passed = mainPathEdges.has(key);
					else if (type === EdgeType.HexagonSymmetry) passed = symPathEdges.has(key);

					if (!passed) missedEdges.push({ type: "h", r, c });
				}
			}
		}
		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c <= grid.cols; c++) {
				const type = grid.vEdges[r][c].type;
				if (type === EdgeType.Hexagon || type === EdgeType.HexagonMain || type === EdgeType.HexagonSymmetry) {
					const key = this.getEdgeKey({ x: c, y: r }, { x: c, y: r + 1 });
					let passed = false;
					if (type === EdgeType.Hexagon) passed = mainPathEdges.has(key) || symPathEdges.has(key);
					else if (type === EdgeType.HexagonMain) passed = mainPathEdges.has(key);
					else if (type === EdgeType.HexagonSymmetry) passed = symPathEdges.has(key);

					if (!passed) missedEdges.push({ type: "v", r, c });
				}
			}
		}

		const missedNodes: Point[] = [];
		for (let r = 0; r <= grid.rows; r++) {
			for (let c = 0; c <= grid.cols; c++) {
				const type = grid.nodes[r][c].type;
				if (type === NodeType.Hexagon || type === NodeType.HexagonMain || type === NodeType.HexagonSymmetry) {
					const posKey = `${c},${r}`;
					let passed = false;
					if (type === NodeType.Hexagon) passed = mainPathNodes.has(posKey) || symPathNodes.has(posKey);
					else if (type === NodeType.HexagonMain) passed = mainPathNodes.has(posKey);
					else if (type === NodeType.HexagonSymmetry) passed = symPathNodes.has(posKey);

					if (!passed) missedNodes.push({ x: c, y: r });
				}
			}
		}

		return { edges: missedEdges, nodes: missedNodes };
	}

	/**
	 * テトラポッド（エラー削除）を考慮してパズルの各制約を検証する
	 * @param grid グリッド
	 * @param regions 区画リスト
	 * @param missedHexagons 通過しなかったエッジ六角形
	 * @param missedNodeHexagons 通過しなかったノード六角形
	 * @returns 検証結果
	 */
	private validateWithErasers(grid: Grid, regions: Point[][], missedHexagons: { type: "h" | "v"; r: number; c: number }[], missedNodeHexagons: Point[]): ValidationResult {
		const regionResults: { invalidatedCells: Point[]; invalidatedHexagons: number[]; invalidatedNodeHexagons: number[]; isValid: boolean; errorCells: Point[] }[][] = [];
		let allRegionsPossiblyValid = true;

		for (let i = 0; i < regions.length; i++) {
			const region = regions[i];
			const erasers = region.filter((p) => grid.cells[p.y][p.x].type === CellType.Eraser);
			const otherMarks = region.filter((p) => grid.cells[p.y][p.x].type !== CellType.None && grid.cells[p.y][p.x].type !== CellType.Eraser);

			const adjacentMissedHexagons: number[] = [];
			for (let j = 0; j < missedHexagons.length; j++) {
				if (this.isHexagonAdjacentToRegion(grid, missedHexagons[j], region)) adjacentMissedHexagons.push(j);
			}

			const adjacentMissedNodeHexagons: number[] = [];
			for (let j = 0; j < missedNodeHexagons.length; j++) {
				if (this.isNodeHexagonAdjacentToRegion(grid, missedNodeHexagons[j], region)) adjacentMissedNodeHexagons.push(j);
			}

			// 各区画でエラー削除の全組み合わせを試行
			const possible = this.getPossibleErasures(grid, region, erasers, otherMarks, adjacentMissedHexagons, adjacentMissedNodeHexagons);
			if (possible.length === 0) {
				allRegionsPossiblyValid = false;
				// エラー箇所を特定するためのベストエフォート（ランダムな削除）
				const bestEffort = this.getBestEffortErasures(grid, region, erasers, otherMarks, adjacentMissedHexagons, adjacentMissedNodeHexagons);
				regionResults.push([bestEffort]);
			} else {
				// 最小の削除数を持つ解決策を優先する
				possible.sort((a, b) => {
					const costA = a.invalidatedCells.length + a.invalidatedHexagons.length + a.invalidatedNodeHexagons.length;
					const costB = b.invalidatedCells.length + b.invalidatedHexagons.length + b.invalidatedNodeHexagons.length;
					return costA - costB;
				});
				regionResults.push(possible);
			}
		}

		if (allRegionsPossiblyValid) {
			// 複数の区画にまたがる六角形のエラー削除割り当てを決定
			const assignment = this.findGlobalAssignment(regionResults, missedHexagons.length, missedNodeHexagons.length);
			if (assignment) {
				return {
					isValid: true,
					invalidatedCells: assignment.invalidatedCells,
					invalidatedEdges: assignment.invalidatedHexIndices.map((idx) => missedHexagons[idx]),
					invalidatedNodes: assignment.invalidatedNodeHexIndices.map((idx) => missedNodeHexagons[idx]),
				};
			}
		}

		// 失敗時：エラー箇所の収集
		const errorCells: Point[] = [];
		const invalidatedCells: Point[] = [];
		const invalidatedHexIndices = new Set<number>();
		const invalidatedNodeHexIndices = new Set<number>();

		for (const options of regionResults) {
			const best = options[0]; // 最初の（最もコストの低い、またはベストエフォートな）ものを選択
			errorCells.push(...best.errorCells);
			invalidatedCells.push(...best.invalidatedCells);
			for (const idx of best.invalidatedHexagons) invalidatedHexIndices.add(idx);
			for (const idx of best.invalidatedNodeHexagons) invalidatedNodeHexIndices.add(idx);
		}

		// 無効化されなかった六角形もエラーとする
		const errorEdges: { type: "h" | "v"; r: number; c: number }[] = [];
		for (let i = 0; i < missedHexagons.length; i++) {
			if (!invalidatedHexIndices.has(i)) {
				errorEdges.push(missedHexagons[i]);
			}
		}
		const errorNodes: Point[] = [];
		for (let i = 0; i < missedNodeHexagons.length; i++) {
			if (!invalidatedNodeHexIndices.has(i)) {
				errorNodes.push(missedNodeHexagons[i]);
			}
		}

		return {
			isValid: false,
			errorReason: "Constraints failed",
			errorCells,
			errorEdges,
			errorNodes,
			invalidatedCells,
			invalidatedEdges: Array.from(invalidatedHexIndices).map((idx) => missedHexagons[idx]),
			invalidatedNodes: Array.from(invalidatedNodeHexIndices).map((idx) => missedNodeHexagons[idx]),
		};
	}

	/**
	 * 指定されたエッジが特定の区画に隣接しているか確認する
	 * @param grid グリッド
	 * @param hex 六角形エッジ
	 * @param region 区画
	 * @returns 隣接しているかどうか
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
	 * 指定されたノードが特定の区画に隣接しているか確認する
	 * @param grid グリッド
	 * @param node ノード座標
	 * @param region 区画
	 * @returns 隣接しているかどうか
	 */
	private isNodeHexagonAdjacentToRegion(grid: Grid, node: Point, region: Point[]): boolean {
		const regionCells = new Set(region.map((p) => `${p.x},${p.y}`));
		// ノードの周囲4つのセルのいずれかが区画に含まれていれば隣接
		const adjCells = [
			{ x: node.x - 1, y: node.y - 1 },
			{ x: node.x, y: node.y - 1 },
			{ x: node.x - 1, y: node.y },
			{ x: node.x, y: node.y },
		];
		for (const cell of adjCells) {
			if (cell.x >= 0 && cell.x < grid.cols && cell.y >= 0 && cell.y < grid.rows) {
				if (regionCells.has(`${cell.x},${cell.y}`)) return true;
			}
		}
		return false;
	}

	/**
	 * 区画内のエラー削除可能な全パターンを取得する
	 * @param grid グリッド
	 * @param region 区画
	 * @param erasers 消しゴムのリスト
	 * @param otherMarks 他の記号のリスト
	 * @param adjacentMissedHexagons 隣接する未通過エッジ六角形
	 * @param adjacentMissedNodeHexagons 隣接する未通過ノード六角形
	 * @returns 可能な削除パターンのリスト
	 */
	private getPossibleErasures(grid: Grid, region: Point[], erasers: Point[], otherMarks: Point[], adjacentMissedHexagons: number[], adjacentMissedNodeHexagons: number[]): { invalidatedCells: Point[]; invalidatedHexagons: number[]; invalidatedNodeHexagons: number[]; isValid: boolean; errorCells: Point[] }[] {
		const results: { invalidatedCells: Point[]; invalidatedHexagons: number[]; invalidatedNodeHexagons: number[]; isValid: boolean; errorCells: Point[] }[] = [];
		const numErasers = erasers.length;
		if (numErasers === 0) {
			const errorCells = this.getRegionErrors(grid, region, []);
			if (errorCells.length === 0 && adjacentMissedHexagons.length === 0 && adjacentMissedNodeHexagons.length === 0) {
				results.push({ invalidatedCells: [], invalidatedHexagons: [], invalidatedNodeHexagons: [], isValid: true, errorCells: [] });
			}
			return results;
		}

		const itemsToNegate = [...otherMarks.map((p) => ({ type: "cell" as const, pos: p })), ...adjacentMissedHexagons.map((idx) => ({ type: "hex" as const, index: idx })), ...adjacentMissedNodeHexagons.map((idx) => ({ type: "nodeHex" as const, index: idx }))];

		// 初期状態でエラーがあるか確認
		const initiallyValid = this.getRegionErrors(grid, region, []).length === 0 && adjacentMissedHexagons.length === 0 && adjacentMissedNodeHexagons.length === 0;

		for (let N = 0; N <= numErasers; N++) {
			const negatedEraserCombinations = this.getNCombinations(erasers, N);
			for (const negatedErasers of negatedEraserCombinations) {
				const negatedErasersSet = new Set(negatedErasers.map((e) => `${e.x},${e.y}`));
				const activeErasers = erasers.filter((e) => !negatedErasersSet.has(`${e.x},${e.y}`));

				for (let K = 0; K <= itemsToNegate.length; K++) {
					if (activeErasers.length !== N + K) continue;

					const itemCombinations = this.getNCombinations(itemsToNegate, K);
					for (const negatedItems of itemCombinations) {
						const negatedCells = negatedItems.filter((it) => it.type === "cell").map((it) => it.pos as Point);
						const negatedHexIndices = negatedItems.filter((it) => it.type === "hex").map((it) => it.index as number);
						const negatedNodeHexIndices = negatedItems.filter((it) => it.type === "nodeHex").map((it) => it.index as number);

						const errorCells = this.getRegionErrors(grid, region, [...negatedCells, ...negatedErasers]);
						const isValid = errorCells.length === 0;

						if (isValid) {
							let isUseful = true;
							if (initiallyValid) {
								if (K > 0) isUseful = false;
							} else {
								for (let i = 0; i < negatedItems.length; i++) {
									const subset = [...negatedItems.slice(0, i), ...negatedItems.slice(i + 1)];
									const subsetCells = subset.filter((it) => it.type === "cell").map((it) => it.pos as Point);
									const subsetHexIndices = new Set(subset.filter((it) => it.type === "hex").map((it) => it.index as number));
									const subsetNodeHexIndices = new Set(subset.filter((it) => it.type === "nodeHex").map((it) => it.index as number));

									const allHexSatisfied = adjacentMissedHexagons.every((idx) => subsetHexIndices.has(idx));
									const allNodeHexSatisfied = adjacentMissedNodeHexagons.every((idx) => subsetNodeHexIndices.has(idx));

									if (this.getRegionErrors(grid, region, subsetCells).length === 0 && allHexSatisfied && allNodeHexSatisfied) {
										isUseful = false;
										break;
									}
								}
							}

							if (isUseful) {
								results.push({
									invalidatedCells: [...negatedCells, ...negatedErasers],
									invalidatedHexagons: negatedHexIndices,
									invalidatedNodeHexagons: negatedNodeHexIndices,
									isValid: true,
									errorCells: [],
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
	 * エラーが解消できなかった場合のベストエフォートな削除（可能な限り消しゴムを適用）を取得する
	 * @param grid グリッド
	 * @param region 区画
	 * @param erasers 消しゴムのリスト
	 * @param otherMarks 他の記号のリスト
	 * @param adjacentMissedHexagons 隣接する未通過エッジ六角形
	 * @param adjacentMissedNodeHexagons 隣接する未通過ノード六角形
	 * @returns ベストエフォートな削除結果
	 */
	private getBestEffortErasures(grid: Grid, region: Point[], erasers: Point[], otherMarks: Point[], adjacentMissedHexagons: number[], adjacentMissedNodeHexagons: number[]): { invalidatedCells: Point[]; invalidatedHexagons: number[]; invalidatedNodeHexagons: number[]; isValid: boolean; errorCells: Point[] } {
		const naturalErrors = this.getRegionErrors(grid, region, []);
		const initiallyValid = naturalErrors.length === 0 && adjacentMissedHexagons.length === 0 && adjacentMissedNodeHexagons.length === 0;

		// 初期状態で有効なら、テトラポッド自体がエラー。
		if (initiallyValid) {
			return {
				invalidatedCells: [],
				invalidatedHexagons: [],
				invalidatedNodeHexagons: [],
				isValid: false,
				errorCells: [...erasers],
			};
		}

		if (erasers.length > 0) {
			const itemsToNegate = [...otherMarks.map((p) => ({ type: "cell" as const, pos: p })), ...adjacentMissedHexagons.map((idx) => ({ type: "hex" as const, index: idx })), ...adjacentMissedNodeHexagons.map((idx) => ({ type: "nodeHex" as const, index: idx }))];

			// エラー解消パターンをいくつか試し、最もエラーが少なくなるものを採用する
			let bestResult: { invalidatedCells: Point[]; invalidatedHexagons: number[]; invalidatedNodeHexagons: number[]; isValid: boolean; errorCells: Point[] } | null = null;
			let minErrorCount = Infinity;

			// 単純な優先順位に基づくパターン
			const tryNegate = (priorityItems: ({ type: "cell"; pos: Point } | { type: "hex"; index: number } | { type: "nodeHex"; index: number })[]) => {
				const toInvalidateCells: Point[] = [];
				const toInvalidateHexagons: number[] = [];
				const toInvalidateNodeHexagons: number[] = [];
				let usedErasersCount = 0;

				for (const item of priorityItems) {
					if (usedErasersCount < erasers.length) {
						if (item.type === "cell") toInvalidateCells.push(item.pos);
						else if (item.type === "hex") toInvalidateHexagons.push(item.index);
						else toInvalidateNodeHexagons.push(item.index);
						usedErasersCount++;
					}
				}

				// 残りの消しゴムはペアにして無効化を試みる
				const remainingForPairs = erasers.length - usedErasersCount;
				const N = Math.floor(remainingForPairs / 2);
				const negatedErasers = erasers.slice(usedErasersCount, usedErasersCount + N);
				usedErasersCount += N * 2;

				// 消しゴム自身がエラーかどうかを判定するため、getRegionErrorsを呼ぶ
				// 消しゴム自身は（消し合ったペアを除き）マークとして残る
				const errorCells = this.getRegionErrors(grid, region, [...toInvalidateCells, ...negatedErasers]);
				// 使われなかった消しゴムはエラー
				for (let i = usedErasersCount; i < erasers.length; i++) {
					errorCells.push(erasers[i]);
				}

				const errorCount = errorCells.length;
				if (errorCount < minErrorCount) {
					minErrorCount = errorCount;

					bestResult = {
						invalidatedCells: [...toInvalidateCells, ...negatedErasers],
						invalidatedHexagons: toInvalidateHexagons,
						invalidatedNodeHexagons: toInvalidateNodeHexagons,
						isValid: false,
						errorCells,
					};
				}
			};

			// パターン1: 自然発生したエラーを優先
			tryNegate([...naturalErrors.map((p) => ({ type: "cell" as const, pos: p })), ...adjacentMissedHexagons.map((idx) => ({ type: "hex" as const, index: idx })), ...adjacentMissedNodeHexagons.map((idx) => ({ type: "nodeHex" as const, index: idx }))]);
			// パターン2: 全てのアイテムを順番に
			tryNegate(itemsToNegate);
			// パターン3: 自然発生した各エラーを個別に1つずつ消してみる
			for (const errCell of naturalErrors) {
				tryNegate([{ type: "cell", pos: errCell }]);
			}

			if (bestResult) return bestResult;
		}

		const errorCells = [...naturalErrors, ...erasers];
		return {
			invalidatedCells: [],
			invalidatedHexagons: [],
			invalidatedNodeHexagons: [],
			isValid: false,
			errorCells,
		};
	}

	/**
	 * 配列からN個選ぶ組み合わせを取得する
	 * @param items 配列
	 * @param n 選択する数
	 * @returns 組み合わせのリスト
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
	 * @param grid グリッド
	 * @param region 区画
	 * @param erasedCells 無効化されたセルのリスト
	 * @returns 有効かどうか
	 */
	private checkRegionValid(grid: Grid, region: Point[], erasedCells: Point[]): boolean {
		return this.getRegionErrors(grid, region, erasedCells).length === 0;
	}

	/**
	 * 区画内のエラーとなっているセルを特定する
	 * @param grid グリッド
	 * @param region 区画
	 * @param erasedCells 無効化されたセルのリスト
	 * @returns エラーセルのリスト
	 */
	private getRegionErrors(grid: Grid, region: Point[], erasedCells: Point[]): Point[] {
		const erasedSet = new Set(erasedCells.map((p) => `${p.x},${p.y}`));
		const colorCounts = new Map<number, number>();
		const colorCells = new Map<number, Point[]>();
		const starColors = new Set<number>();
		const squareColors = new Set<number>();
		const tetrisPieces: { shape: number[][]; rotatable: boolean; pos: Point }[] = [];
		const tetrisNegativePieces: { shape: number[][]; rotatable: boolean; pos: Point }[] = [];

		for (const cell of region) {
			if (erasedSet.has(`${cell.x},${cell.y}`)) continue;
			const constraint = grid.cells[cell.y][cell.x];
			if (constraint.type === CellType.None) continue;

			const color = constraint.color;
			if (color !== Color.None) {
				colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
				if (!colorCells.has(color)) colorCells.set(color, []);
				colorCells.get(color)!.push(cell);
			}

			if (constraint.type === CellType.Square) squareColors.add(color);
			else if (constraint.type === CellType.Star) starColors.add(color);
			else if (constraint.type === CellType.Tetris || constraint.type === CellType.TetrisRotated) {
				if (constraint.shape) tetrisPieces.push({ shape: constraint.shape, rotatable: constraint.type === CellType.TetrisRotated, pos: cell });
			} else if (constraint.type === CellType.TetrisNegative || constraint.type === CellType.TetrisNegativeRotated) {
				if (constraint.shape) tetrisNegativePieces.push({ shape: constraint.shape, rotatable: constraint.type === CellType.TetrisNegativeRotated, pos: cell });
			}
		}

		const errorCells: Point[] = [];
		// 四角形のルール：同区画内は同じ色
		if (squareColors.size > 1) {
			for (const cell of region) {
				if (erasedSet.has(`${cell.x},${cell.y}`)) continue;
				if (grid.cells[cell.y][cell.x].type === CellType.Square) errorCells.push(cell);
			}
		}

		// 星のルール：同色の記号がちょうど2つ
		for (const color of starColors) {
			if (colorCounts.get(color) !== 2) {
				const cells = colorCells.get(color) || [];
				for (const p of cells) {
					const type = grid.cells[p.y][p.x].type;
					if (type === CellType.Star) {
						errorCells.push(p);
					}
				}
			}
		}

		// テトリスのルール：タイリング可能
		if (tetrisPieces.length > 0 || tetrisNegativePieces.length > 0) {
			if (
				!this.checkTetrisConstraint(
					grid,
					region,
					tetrisPieces.map((p) => ({ shape: p.shape, rotatable: p.rotatable })),
					tetrisNegativePieces.map((p) => ({ shape: p.shape, rotatable: p.rotatable })),
				)
			) {
				for (const p of tetrisPieces) errorCells.push(p.pos);
				for (const p of tetrisNegativePieces) errorCells.push(p.pos);
			}
		}
		return errorCells;
	}

	/**
	 * グローバルな制約（六角形）の割り当てをバックトラッキングで探索する
	 * @param regionResults 各区画の削除候補リスト
	 * @param totalMissedHexagons 合計未通過エッジ六角形数
	 * @param totalMissedNodeHexagons 合計未通過ノード六角形数
	 * @returns 成功した場合は割り当て結果、失敗した場合はnull
	 */
	private findGlobalAssignment(regionResults: { invalidatedCells: Point[]; invalidatedHexagons: number[]; invalidatedNodeHexagons: number[]; isValid: boolean }[][], totalMissedHexagons: number, totalMissedNodeHexagons: number): { invalidatedCells: Point[]; invalidatedHexIndices: number[]; invalidatedNodeHexIndices: number[] } | null {
		const numRegions = regionResults.length;
		const currentHexErasures = new Array(totalMissedHexagons).fill(0);
		const currentNodeHexErasures = new Array(totalMissedNodeHexagons).fill(0);
		const allInvalidatedCells: Point[] = [];
		const allInvalidatedHexIndices: number[] = [];
		const allInvalidatedNodeHexIndices: number[] = [];

		const backtrack = (regionIdx: number): boolean => {
			if (regionIdx === numRegions) return currentHexErasures.every((count) => count === 1) && currentNodeHexErasures.every((count) => count === 1);
			for (const option of regionResults[regionIdx]) {
				let possible = true;
				for (const hexIdx of option.invalidatedHexagons)
					if (currentHexErasures[hexIdx] > 0) {
						possible = false;
						break;
					}
				if (possible) {
					for (const hexIdx of option.invalidatedNodeHexagons)
						if (currentNodeHexErasures[hexIdx] > 0) {
							possible = false;
							break;
						}
				}

				if (possible) {
					for (const hexIdx of option.invalidatedHexagons) {
						currentHexErasures[hexIdx]++;
						allInvalidatedHexIndices.push(hexIdx);
					}
					for (const hexIdx of option.invalidatedNodeHexagons) {
						currentNodeHexErasures[hexIdx]++;
						allInvalidatedNodeHexIndices.push(hexIdx);
					}
					allInvalidatedCells.push(...option.invalidatedCells);
					if (backtrack(regionIdx + 1)) return true;

					for (const hexIdx of option.invalidatedHexagons) {
						currentHexErasures[hexIdx]--;
						allInvalidatedHexIndices.pop();
					}
					for (const hexIdx of option.invalidatedNodeHexagons) {
						currentNodeHexErasures[hexIdx]--;
						allInvalidatedNodeHexIndices.pop();
					}
					for (let i = 0; i < option.invalidatedCells.length; i++) allInvalidatedCells.pop();
				}
			}
			return false;
		};
		if (backtrack(0))
			return {
				invalidatedCells: allInvalidatedCells,
				invalidatedHexIndices: allInvalidatedHexIndices,
				invalidatedNodeHexIndices: allInvalidatedNodeHexIndices,
			};
		return null;
	}

	/**
	 * テトリス制約の検証
	 * 領域内の全てのテトリスピース（正・負）を盤面内に配置し、
	 * 各セルの合計値が「領域内なら1、領域外なら0」になる配置が存在するかを確認する。
	 * 重なりは許容されるが、最終的な合計がマイナスになることは許されない。
	 * また、全てのピースはパズル（グリッド）の範囲内に収まっている必要がある。
	 * @param gridObj グリッドオブジェクト
	 * @param region 区画
	 * @param pieces 正のテトリスピース
	 * @param negativePieces 負のテトリスピース
	 */
	private checkTetrisConstraint(gridObj: Grid, region: Point[], pieces: { shape: number[][]; rotatable: boolean }[], negativePieces: { shape: number[][]; rotatable: boolean }[] = []): boolean {
		const positiveArea = pieces.reduce((sum, p) => sum + this.getShapeArea(p.shape), 0);
		const negativeArea = negativePieces.reduce((sum, p) => sum + this.getShapeArea(p.shape), 0);
		const netArea = positiveArea - negativeArea;

		if (netArea < 0) return false;
		if (netArea === 0) return true;
		if (netArea !== region.length) return false;

		const rows = gridObj.rows;
		const cols = gridObj.cols;

		// キャッシュの確認 (メモリリーク防止のためサイズを制限)
		if (this.tetrisCache.size > 10000) this.tetrisCache.clear();

		const regionMask = new Uint8Array(rows * cols);
		for (const p of region) regionMask[p.y * cols + p.x] = 1;
		const pieceKey = (p: { shape: number[][]; rotatable: boolean }, sign: number) => `${this.getShapeKey(p.shape)}-${p.rotatable}-${sign}`;
		const piecesKey = [...pieces.map((p) => pieceKey(p, 1)), ...negativePieces.map((p) => pieceKey(p, -1))].sort().join("|");
		const cacheKey = `${rows}x${cols}:${regionMask.join("")}:${piecesKey}`;
		if (this.tetrisCache.has(cacheKey)) return this.tetrisCache.get(cacheKey)!;

		const target = new Int8Array(rows * cols);
		for (let i = 0; i < regionMask.length; i++) target[i] = regionMask[i];
		const current = new Int8Array(rows * cols);

		// 同一ピースのグループ化
		const pieceGroups: {
			rotations: { shape: number[][]; h: number; w: number }[];
			sign: number;
			area: number;
			count: number;
		}[] = [];

		const allPieces = [...pieces.map((p) => ({ ...p, sign: 1 })), ...negativePieces.map((p) => ({ ...p, sign: -1 }))];
		for (const p of allPieces) {
			const rotations = p.rotatable ? this.getAllRotations(p.shape) : [p.shape];
			const baseShapeKey = this.getShapeKey(rotations[0]);

			let group = pieceGroups.find((g) => g.sign === p.sign && (p.rotatable ? g.rotations.length > 1 : g.rotations.length === 1) && this.getShapeKey(g.rotations[0].shape) === baseShapeKey);

			if (group) {
				group.count++;
			} else {
				pieceGroups.push({
					rotations: rotations.map((r) => ({ shape: r, h: r.length, w: r[0].length })),
					sign: p.sign,
					area: this.getShapeArea(p.shape),
					count: 1,
				});
			}
		}

		// 正のピース、かつ面積が大きい順にソートして枝刈り効率を上げる
		pieceGroups.sort((a, b) => b.sign - a.sign || b.area - a.area);

		let posMismatch = region.length;
		let negMismatch = 0;
		let totalPositiveAreaLeft = positiveArea;
		let totalNegativeAreaLeft = negativeArea;

		const backtrack = (groupIdx: number, countInGroup: number, lastPos: number): boolean => {
			// 面積ベースの枝刈り
			if (posMismatch > totalPositiveAreaLeft || negMismatch > totalNegativeAreaLeft) return false;

			if (groupIdx === pieceGroups.length) {
				return posMismatch === 0 && negMismatch === 0;
			}

			const group = pieceGroups[groupIdx];
			const nextCount = countInGroup + 1;
			const isLastInGroup = nextCount === group.count;

			if (group.sign === 1) totalPositiveAreaLeft -= group.area;
			else totalNegativeAreaLeft -= group.area;

			for (const rot of group.rotations) {
				const h = rot.h;
				const w = rot.w;
				const startPos = countInGroup === 0 ? 0 : lastPos;

				for (let pos = startPos; pos <= rows * cols - (h > 0 ? (h - 1) * cols + w : 0); pos++) {
					const r = Math.floor(pos / cols);
					const c = pos % cols;
					if (r > rows - h || c > cols - w) continue;

					let possible = true;
					const placedIndices: number[] = [];

					for (let pr = 0; pr < h; pr++) {
						for (let pc = 0; pc < w; pc++) {
							if (rot.shape[pr][pc]) {
								const tidx = (r + pr) * cols + (c + pc);

								// Incremental mismatch update
								if (group.sign === 1) {
									if (current[tidx] < target[tidx]) posMismatch--;
									else negMismatch++;
								} else {
									if (current[tidx] <= target[tidx]) posMismatch++;
									else negMismatch--;
								}

								current[tidx] += group.sign;
								placedIndices.push(tidx);

								if (current[tidx] < 0) possible = false;
								if (group.sign === 1 && current[tidx] > 1 + negativeArea) possible = false;
							}
						}
						if (!possible) break;
					}

					if (possible) {
						if (isLastInGroup) {
							if (backtrack(groupIdx + 1, 0, 0)) {
								for (const tidx of placedIndices) {
									current[tidx] -= group.sign;
									if (group.sign === 1) {
										if (current[tidx] < target[tidx]) posMismatch++;
										else negMismatch--;
									} else {
										if (current[tidx] <= target[tidx]) posMismatch--;
										else negMismatch++;
									}
								}
								if (group.sign === 1) totalPositiveAreaLeft += group.area;
								else totalNegativeAreaLeft += group.area;
								return true;
							}
						} else {
							if (backtrack(groupIdx, nextCount, pos)) {
								for (const tidx of placedIndices) {
									current[tidx] -= group.sign;
									if (group.sign === 1) {
										if (current[tidx] < target[tidx]) posMismatch++;
										else negMismatch--;
									} else {
										if (current[tidx] <= target[tidx]) posMismatch--;
										else negMismatch++;
									}
								}
								if (group.sign === 1) totalPositiveAreaLeft += group.area;
								else totalNegativeAreaLeft += group.area;
								return true;
							}
						}
					}

					for (const tidx of placedIndices) {
						current[tidx] -= group.sign;
						if (group.sign === 1) {
							if (current[tidx] < target[tidx]) posMismatch++;
							else negMismatch--;
						} else {
							if (current[tidx] <= target[tidx]) posMismatch--;
							else negMismatch++;
						}
					}
				}
			}

			if (group.sign === 1) totalPositiveAreaLeft += group.area;
			else totalNegativeAreaLeft += group.area;
			return false;
		};

		const res = backtrack(0, 0, 0);
		this.tetrisCache.set(cacheKey, res);
		return res;
	}

	private getShapeArea(shape: number[][]): number {
		let area = 0;
		for (const row of shape) for (const cell of row) if (cell) area++;
		return area;
	}

	private getShapeKey(shape: number[][]): string {
		return JSON.stringify(shape);
	}

	/**
	 * 再帰的にタイリングを試みる
	 * @param regionGrid 領域のグリッド表現
	 * @param pieces 残りのピース
	 * @returns タイリング可能かどうか
	 */

	private getAllRotations(shape: number[][]): number[][][] {
		const results: number[][][] = [];
		const keys = new Set<string>();
		let curr = shape;
		for (let i = 0; i < 4; i++) {
			const key = this.getShapeKey(curr);
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
	 * @param grid グリッド
	 * @param path メインパス
	 * @param symPath 対称パス
	 * @param externalCellsPrecalculated 外部セルのキャッシュ
	 * @returns 区画リスト
	 */
	private calculateRegions(grid: Grid, path: Point[], symPath: Point[] = [], externalCellsPrecalculated?: Set<string>): Point[][] {
		const regions: Point[][] = [];
		const rows = grid.rows;
		const cols = grid.cols;
		const visitedCells = new Uint8Array(rows * cols);

		// エッジのマスク作成 (高速化)
		const hEdgesMask = new Uint8Array((rows + 1) * cols);
		const vEdgesMask = new Uint8Array(rows * (cols + 1));

		const setEdge = (p1: Point, p2: Point) => {
			if (p1.x === p2.x) {
				vEdgesMask[Math.min(p1.y, p2.y) * (cols + 1) + p1.x] = 1;
			} else {
				hEdgesMask[p1.y * cols + Math.min(p1.x, p2.x)] = 1;
			}
		};

		for (let i = 0; i < path.length - 1; i++) setEdge(path[i], path[i + 1]);
		for (let i = 0; i < symPath.length - 1; i++) setEdge(symPath[i], symPath[i + 1]);

		// Absentエッジもマスクに追加
		for (let r = 0; r <= rows; r++) {
			for (let c = 0; c < cols; c++) {
				if (grid.hEdges[r][c].type === EdgeType.Absent) hEdgesMask[r * cols + c] = 1;
			}
		}
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c <= cols; c++) {
				if (grid.vEdges[r][c].type === EdgeType.Absent) vEdgesMask[r * (cols + 1) + c] = 1;
			}
		}

		const externalCells = externalCellsPrecalculated || this.getExternalCells(grid);
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const idx = r * cols + c;
				if (visitedCells[idx] || (externalCells && externalCells.has(`${c},${r}`))) continue;

				const region: Point[] = [];
				const queue: number[] = [idx];
				visitedCells[idx] = 1;

				let head = 0;
				while (head < queue.length) {
					const currIdx = queue[head++];
					const cx = currIdx % cols;
					const cy = Math.floor(currIdx / cols);
					region.push({ x: cx, y: cy });

					// Neighbors: Up, Down, Left, Right
					// Up
					if (cy > 0 && !hEdgesMask[cy * cols + cx]) {
						const nIdx = (cy - 1) * cols + cx;
						if (!visitedCells[nIdx] && (!externalCells || !externalCells.has(`${cx},${cy - 1}`))) {
							visitedCells[nIdx] = 1;
							queue.push(nIdx);
						}
					}
					// Down
					if (cy < rows - 1 && !hEdgesMask[(cy + 1) * cols + cx]) {
						const nIdx = (cy + 1) * cols + cx;
						if (!visitedCells[nIdx] && (!externalCells || !externalCells.has(`${cx},${cy + 1}`))) {
							visitedCells[nIdx] = 1;
							queue.push(nIdx);
						}
					}
					// Left
					if (cx > 0 && !vEdgesMask[cy * (cols + 1) + cx]) {
						const nIdx = cy * cols + (cx - 1);
						if (!visitedCells[nIdx] && (!externalCells || !externalCells.has(`${cx - 1},${cy}`))) {
							visitedCells[nIdx] = 1;
							queue.push(nIdx);
						}
					}
					// Right
					if (cx < cols - 1 && !vEdgesMask[cy * (cols + 1) + (cx + 1)]) {
						const nIdx = cy * cols + (cx + 1);
						if (!visitedCells[nIdx] && (!externalCells || !externalCells.has(`${cx + 1},${cy}`))) {
							visitedCells[nIdx] = 1;
							queue.push(nIdx);
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
	 * @param grid グリッド
	 * @returns 外部セルのセット
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

	private getSymmetricalPoint(grid: Grid, p: Point): Point {
		const symmetry = grid.symmetry || SymmetryType.None;
		if (symmetry === SymmetryType.Horizontal) {
			return { x: grid.cols - p.x, y: p.y };
		} else if (symmetry === SymmetryType.Vertical) {
			return { x: p.x, y: grid.rows - p.y };
		} else if (symmetry === SymmetryType.Rotational) {
			return { x: grid.cols - p.x, y: grid.rows - p.y };
		}
		return { ...p };
	}

	private getSymmetricalPointIndex(grid: Grid, idx: number): number {
		const nodeCols = grid.cols + 1;
		const r = Math.floor(idx / nodeCols);
		const c = idx % nodeCols;
		const symmetry = grid.symmetry || SymmetryType.None;
		let sr = r,
			sc = c;
		if (symmetry === SymmetryType.Horizontal) {
			sc = grid.cols - c;
		} else if (symmetry === SymmetryType.Vertical) {
			sr = grid.rows - r;
		} else if (symmetry === SymmetryType.Rotational) {
			sc = grid.cols - c;
			sr = grid.rows - r;
		}
		return sr * nodeCols + sc;
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
		const adj = Array.from({ length: nodeCount }, () => [] as { next: number; hexType: EdgeType; isBroken: boolean }[]);
		const startNodes: number[] = [];
		const endNodes: number[] = [];
		const hexIdMap = new Map<string, number>();
		let nextHexId = 0;
		const hexagonEdges = new Set<string>();
		const hexagonNodes = new Set<number>();

		for (let r = 0; r <= rows; r++) {
			for (let c = 0; c <= cols; c++) {
				const u = r * nodeCols + c;
				if (grid.nodes[r][c].type === NodeType.Start) startNodes.push(u);
				if (grid.nodes[r][c].type === NodeType.End) endNodes.push(u);
				if (grid.nodes[r][c].type === NodeType.Hexagon || grid.nodes[r][c].type === NodeType.HexagonMain || grid.nodes[r][c].type === NodeType.HexagonSymmetry) {
					hexIdMap.set(`n${c},${r}`, nextHexId++);
					hexagonNodes.add(u);
				}

				if (c < cols) {
					const v = u + 1;
					const type = grid.hEdges[r][c].type;
					const isHexagon = type === EdgeType.Hexagon || type === EdgeType.HexagonMain || type === EdgeType.HexagonSymmetry;
					const isBroken = type === EdgeType.Broken || type === EdgeType.Absent;
					adj[u].push({ next: v, hexType: type, isBroken });
					adj[v].push({ next: u, hexType: type, isBroken });
					if (isHexagon) {
						hexIdMap.set(`eh${c},${r}`, nextHexId++);
						hexagonEdges.add(this.getEdgeKey({ x: c, y: r }, { x: c + 1, y: r }));
					}
				}
				if (r < rows) {
					const v = u + nodeCols;
					const type = grid.vEdges[r][c].type;
					const isHexagon = type === EdgeType.Hexagon || type === EdgeType.HexagonMain || type === EdgeType.HexagonSymmetry;
					const isBroken = type === EdgeType.Broken || type === EdgeType.Absent;
					adj[u].push({ next: v, hexType: type, isBroken });
					adj[v].push({ next: u, hexType: type, isBroken });
					if (isHexagon) {
						hexIdMap.set(`ev${c},${r}`, nextHexId++);
						hexagonEdges.add(this.getEdgeKey({ x: c, y: r }, { x: c, y: r + 1 }));
					}
				}
			}
		}

		const stats = { totalNodesVisited: 0, branchingPoints: 0, solutions: 0, maxDepth: 0, backtracks: 0 };
		const totalHexagons = nextHexId;
		const fingerprints = new Set<string>();

		// 盤面の大きさに合わせて探索リミットを調整
		const searchLimit = Math.max(1000, rows * cols * 200);
		const externalCells = this.getExternalCells(grid);

		// セルマーク（四角、星、テトリス、消しゴム）があるか事前にチェック
		let hasCellMarks = false;
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				if (grid.cells[r][c].type !== CellType.None) {
					hasCellMarks = true;
					break;
				}
			}
			if (hasCellMarks) break;
		}

		this.tetrisCache.clear();

		for (const startIdx of startNodes) {
			const nodeCols = grid.cols + 1;
			const r = Math.floor(startIdx / nodeCols);
			const c = startIdx % nodeCols;
			let startHexMask = 0n;
			const nodeType = grid.nodes[r][c].type;
			if (nodeType === NodeType.Hexagon || nodeType === NodeType.HexagonMain) {
				startHexMask |= 1n << BigInt(hexIdMap.get(`n${c},${r}`)!);
			}

			const symmetry = grid.symmetry || SymmetryType.None;
			if (symmetry !== SymmetryType.None) {
				const snStart = this.getSymmetricalPointIndex(grid, startIdx);
				const snR = Math.floor(snStart / nodeCols);
				const snC = snStart % nodeCols;
				const snNodeType = grid.nodes[snR][snC].type;
				if (snNodeType === NodeType.Hexagon || snNodeType === NodeType.HexagonSymmetry) {
					startHexMask |= 1n << BigInt(hexIdMap.get(`n${snC},${snR}`)!);
				}
			}

			let visitedMask = 1n << BigInt(startIdx);
			if (symmetry !== SymmetryType.None) {
				const snStart = this.getSymmetricalPointIndex(grid, startIdx);
				if (snStart === startIdx) continue;
				visitedMask |= 1n << BigInt(snStart);
			}

			this.exploreSearchSpace(grid, startIdx, visitedMask, [startIdx], startHexMask, totalHexagons, adj, endNodes, fingerprints, stats, searchLimit, externalCells, hasCellMarks, hexIdMap);
		}

		if (stats.solutions === 0) return 0;

		let constraintCount = hexagonEdges.size + hexagonNodes.size;
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
		// 解の数が多いほど難易度を下げる。スケールを調整
		let difficulty = (branchingFactor * 10 + searchComplexity * 1.5) / (Math.log2(stats.solutions + 1) * 0.5 + 1);

		// エッジの六角形が多いほど簡単になる（ガイドになるため）
		difficulty -= hexagonEdges.size * 0.05;
		// ノードの六角形は難易度を上げる（通過が強制されるため）
		difficulty += hexagonNodes.size * 0.12;

		if (tetrisCount > 0) {
			// 回転不可が多いほど難しく、回転可能が多いほど簡単
			difficulty += (tetrisCount - rotatedTetrisCount) * 0.5;
			difficulty += rotatedTetrisCount * 0.2;
		}

		// 減算テトリス（枠）の難易度評価
		let negTetrisCount = 0;
		let rotatedNegTetrisCount = 0;
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const cell = grid.cells[r][c];
				if (cell.type === CellType.TetrisNegative) negTetrisCount++;
				else if (cell.type === CellType.TetrisNegativeRotated) {
					negTetrisCount++;
					rotatedNegTetrisCount++;
				}
			}
		}
		if (negTetrisCount > 0) {
			difficulty += (negTetrisCount - rotatedNegTetrisCount) * 0.6; // 減算は配置がよりシビアなため少し高めに設定
			difficulty += rotatedNegTetrisCount * 0.3;
		}

		const cellCount = rows * cols;
		const density = constraintCount / cellCount;
		// 密度が低すぎると急激に難易度が下がるように調整。より厳しく。
		const densityFactor = density < 0.25 ? Math.pow(density / 0.25, 4) : 1.0;
		const typeFactor = constraintTypes.size <= 1 ? 0.5 : 1.0;

		difficulty *= densityFactor * typeFactor;
		// 盤面サイズによる補正を緩やかに
		const sizeFactor = Math.log2(cellCount) / 5;
		difficulty *= sizeFactor;

		return Math.max(0.01, Math.min(1.0, difficulty / 4));
	}

	/**
	 * 探索空間を走査して統計情報を収集する
	 */
	private exploreSearchSpace(grid: Grid, currIdx: number, visitedMask: bigint, path: number[], hexMask: bigint, totalHexagons: number, adj: { next: number; hexType: EdgeType; isBroken: boolean }[][], endNodes: number[], fingerprints: Set<string>, stats: { totalNodesVisited: number; branchingPoints: number; solutions: number; maxDepth: number; backtracks: number }, limit: number, externalCells?: Set<string>, hasCellMarks: boolean = true, hexIdMap?: Map<string, number>): void {
		stats.totalNodesVisited++;
		stats.maxDepth = Math.max(stats.maxDepth, path.length);
		if (stats.totalNodesVisited > limit) return;

		const symmetry = grid.symmetry || SymmetryType.None;

		if (endNodes.includes(currIdx)) {
			let setBits = 0;
			let temp = hexMask;
			while (temp > 0n) {
				if (temp & 1n) setBits++;
				temp >>= 1n;
			}

			if (setBits === totalHexagons) {
				const points = path.map((idx) => ({ x: idx % (grid.cols + 1), y: Math.floor(idx / (grid.cols + 1)) }));
				const solutionPath = { points };
				// symmetryモードの際、もう一方もEndNodeにいる必要がある
				if (symmetry !== SymmetryType.None) {
					const snEnd = this.getSymmetricalPointIndex(grid, currIdx);
					const nodeCols = grid.cols + 1;
					if (grid.nodes[Math.floor(snEnd / nodeCols)][snEnd % nodeCols].type !== NodeType.End) return;
				}

				const symPathPoints = symmetry !== SymmetryType.None ? points.map((p) => this.getSymmetricalPoint(grid, p)) : [];
				// セルマークがない場合は、この時点で有効な解として確定できる（DFSによりパスの正当性と全六角形通過は保証済み）
				if (!hasCellMarks) {
					const fp = this.getFingerprint(grid, points, symPathPoints, undefined, externalCells);
					if (!fingerprints.has(fp)) {
						fingerprints.add(fp);
						stats.solutions++;
					}
				} else {
					// セルマークがある場合は詳細な検証を行う
					const result = this.validateFast(grid, points, symPathPoints, externalCells);
					if (result.isValid) {
						const fp = this.getFingerprint(grid, points, symPathPoints, result.regions, externalCells);
						if (!fingerprints.has(fp)) {
							fingerprints.add(fp);
							stats.solutions++;
						}
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

			if (symmetry !== SymmetryType.None) {
				const snCurr = this.getSymmetricalPointIndex(grid, currIdx);
				const snNext = this.getSymmetricalPointIndex(grid, edge.next);

				// 対称点との衝突チェック
				if (edge.next === snNext) continue; // ノード衝突
				if (currIdx === snNext && edge.next === snCurr) continue; // エッジ衝突（反対向き）
			}

			// 六角形の枝刈り
			let possible = true;
			for (const otherEdge of adj[currIdx]) {
				const isMandatoryForMain = otherEdge.hexType === EdgeType.Hexagon || otherEdge.hexType === EdgeType.HexagonMain;
				if (isMandatoryForMain) {
					const isAlreadyOnPath = path.length >= 2 && otherEdge.next === path[path.length - 2];
					const isNextMove = otherEdge.next === edge.next;
					if (!isAlreadyOnPath && !isNextMove) {
						possible = false;
						break;
					}
				}
			}
			if (!possible) continue;

			if (symmetry !== SymmetryType.None) {
				const snCurr = this.getSymmetricalPointIndex(grid, currIdx);
				const snNext = this.getSymmetricalPointIndex(grid, edge.next);
				for (const otherEdge of adj[snCurr]) {
					const isMandatoryForSym = otherEdge.hexType === EdgeType.Hexagon || otherEdge.hexType === EdgeType.HexagonSymmetry;
					if (isMandatoryForSym) {
						const snPrev = path.length >= 2 ? this.getSymmetricalPointIndex(grid, path[path.length - 2]) : -1;
						const isAlreadyOnSymPath = otherEdge.next === snPrev;
						const isSymNextMove = otherEdge.next === snNext;
						if (!isAlreadyOnSymPath && !isSymNextMove) {
							possible = false;
							break;
						}
					}
				}
			}

			if (possible) validMoves.push(edge);
		}

		if (validMoves.length > 1) stats.branchingPoints++;

		// 大きな盤面では探索がリミットに達しやすいため、探索順序をランダム化して
		// 少なくともいくつかの解を見つけやすくする
		if (grid.rows * grid.cols > 30) {
			for (let i = validMoves.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[validMoves[i], validMoves[j]] = [validMoves[j], validMoves[i]];
			}
		}

		const nodeCols = grid.cols + 1;
		for (const move of validMoves) {
			let nextHexMask = hexMask;
			const r = Math.floor(move.next / nodeCols);
			const c = move.next % nodeCols;
			const nodeType = grid.nodes[r][c].type;

			if (nodeType === NodeType.Hexagon || nodeType === NodeType.HexagonMain) {
				nextHexMask |= 1n << BigInt(hexIdMap!.get(`n${c},${r}`)!);
			}

			// エッジのチェック
			const prevIdx = path[path.length - 1];
			const pr = Math.floor(prevIdx / nodeCols);
			const pc = prevIdx % nodeCols;
			if (pr === r) {
				const ec = Math.min(pc, c);
				if (move.hexType === EdgeType.Hexagon || move.hexType === EdgeType.HexagonMain) {
					nextHexMask |= 1n << BigInt(hexIdMap!.get(`eh${ec},${r}`)!);
				}
			} else {
				const er = Math.min(pr, r);
				if (move.hexType === EdgeType.Hexagon || move.hexType === EdgeType.HexagonMain) {
					nextHexMask |= 1n << BigInt(hexIdMap!.get(`ev${c},${er}`)!);
				}
			}

			if (symmetry !== SymmetryType.None) {
				const snNext = this.getSymmetricalPointIndex(grid, move.next);
				const snR = Math.floor(snNext / nodeCols);
				const snC = snNext % nodeCols;
				const snNodeType = grid.nodes[snR][snC].type;
				if (snNodeType === NodeType.Hexagon || snNodeType === NodeType.HexagonSymmetry) {
					nextHexMask |= 1n << BigInt(hexIdMap!.get(`n${snC},${snR}`)!);
				}

				const snPrev = this.getSymmetricalPointIndex(grid, prevIdx);
				const spr = Math.floor(snPrev / nodeCols);
				const spc = snPrev % nodeCols;
				if (spr === snR) {
					const ec = Math.min(spc, snC);
					const et = grid.hEdges[snR][ec].type;
					if (et === EdgeType.Hexagon || et === EdgeType.HexagonSymmetry) {
						nextHexMask |= 1n << BigInt(hexIdMap!.get(`eh${ec},${snR}`)!);
					}
				} else {
					const er = Math.min(spr, snR);
					const et = grid.vEdges[er][snC].type;
					if (et === EdgeType.Hexagon || et === EdgeType.HexagonSymmetry) {
						nextHexMask |= 1n << BigInt(hexIdMap!.get(`ev${snC},${er}`)!);
					}
				}
			}

			path.push(move.next);

			let nextVisitedMask = visitedMask | (1n << BigInt(move.next));
			if (symmetry !== SymmetryType.None) {
				const snNext = this.getSymmetricalPointIndex(grid, move.next);
				nextVisitedMask |= 1n << BigInt(snNext);
			}

			this.exploreSearchSpace(grid, move.next, nextVisitedMask, path, nextHexMask, totalHexagons, adj, endNodes, fingerprints, stats, limit, externalCells, hasCellMarks, hexIdMap);
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
		const adj = Array.from({ length: nodeCount }, () => [] as { next: number; hexType: EdgeType; isBroken: boolean }[]);
		const startNodes: number[] = [];
		const endNodes: number[] = [];
		const hexIdMap = new Map<string, number>();
		let nextHexId = 0;

		for (let r = 0; r <= rows; r++) {
			for (let c = 0; c <= cols; c++) {
				const u = r * nodeCols + c;
				if (grid.nodes[r][c].type === NodeType.Start) startNodes.push(u);
				if (grid.nodes[r][c].type === NodeType.End) endNodes.push(u);
				if (grid.nodes[r][c].type === NodeType.Hexagon || grid.nodes[r][c].type === NodeType.HexagonMain || grid.nodes[r][c].type === NodeType.HexagonSymmetry) {
					hexIdMap.set(`n${c},${r}`, nextHexId++);
				}

				if (c < cols) {
					const v = u + 1;
					const type = grid.hEdges[r][c].type;
					const isHexagon = type === EdgeType.Hexagon || type === EdgeType.HexagonMain || type === EdgeType.HexagonSymmetry;
					const isBroken = type === EdgeType.Broken || type === EdgeType.Absent;
					adj[u].push({ next: v, hexType: type, isBroken });
					adj[v].push({ next: u, hexType: type, isBroken });
					if (isHexagon) hexIdMap.set(`eh${c},${r}`, nextHexId++);
				}
				if (r < rows) {
					const v = u + nodeCols;
					const type = grid.vEdges[r][c].type;
					const isHexagon = type === EdgeType.Hexagon || type === EdgeType.HexagonMain || type === EdgeType.HexagonSymmetry;
					const isBroken = type === EdgeType.Broken || type === EdgeType.Absent;
					adj[u].push({ next: v, hexType: type, isBroken });
					adj[v].push({ next: u, hexType: type, isBroken });
					if (isHexagon) hexIdMap.set(`ev${c},${r}`, nextHexId++);
				}
			}
		}

		const fingerprints = new Set<string>();
		const totalHexagons = nextHexId;
		const externalCells = this.getExternalCells(grid);

		// セルマーク（四角、星、テトリス、消しゴム）があるか事前にチェック
		let hasCellMarks = false;
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				if (grid.cells[r][c].type !== CellType.None) {
					hasCellMarks = true;
					break;
				}
			}
			if (hasCellMarks) break;
		}

		this.tetrisCache.clear();

		for (const startIdx of startNodes) {
			const nodeCols = grid.cols + 1;
			const r = Math.floor(startIdx / nodeCols);
			const c = startIdx % nodeCols;
			let startHexMask = 0n;
			const nodeType = grid.nodes[r][c].type;
			if (nodeType === NodeType.Hexagon || nodeType === NodeType.HexagonMain) {
				startHexMask |= 1n << BigInt(hexIdMap.get(`n${c},${r}`)!);
			}

			const symmetry = grid.symmetry || SymmetryType.None;
			if (symmetry !== SymmetryType.None) {
				const snStart = this.getSymmetricalPointIndex(grid, startIdx);
				const snR = Math.floor(snStart / nodeCols);
				const snC = snStart % nodeCols;
				const snNodeType = grid.nodes[snR][snC].type;
				if (snNodeType === NodeType.Hexagon || snNodeType === NodeType.HexagonSymmetry) {
					startHexMask |= 1n << BigInt(hexIdMap.get(`n${snC},${snR}`)!);
				}
			}
			let visitedMask = 1n << BigInt(startIdx);
			if (symmetry !== SymmetryType.None) {
				const snStart = this.getSymmetricalPointIndex(grid, startIdx);
				if (snStart === startIdx) continue;
				visitedMask |= 1n << BigInt(snStart);
			}
			this.findPathsOptimized(grid, startIdx, visitedMask, [startIdx], startHexMask, totalHexagons, adj, endNodes, fingerprints, limit, externalCells, hasCellMarks, hexIdMap);
		}
		return fingerprints.size;
	}

	private findPathsOptimized(grid: Grid, currIdx: number, visitedMask: bigint, path: number[], hexMask: bigint, totalHexagons: number, adj: { next: number; hexType: EdgeType; isBroken: boolean }[][], endNodes: number[], fingerprints: Set<string>, limit: number, externalCells?: Set<string>, hasCellMarks: boolean = true, hexIdMap?: Map<string, number>): void {
		if (fingerprints.size >= limit) return;
		const symmetry = grid.symmetry || SymmetryType.None;

		if (endNodes.includes(currIdx)) {
			let setBits = 0;
			let temp = hexMask;
			while (temp > 0n) {
				if (temp & 1n) setBits++;
				temp >>= 1n;
			}
			if (setBits === totalHexagons) {
				const points = path.map((idx) => ({ x: idx % (grid.cols + 1), y: Math.floor(idx / (grid.cols + 1)) }));
				if (symmetry !== SymmetryType.None) {
					const snEnd = this.getSymmetricalPointIndex(grid, currIdx);
					const nodeCols = grid.cols + 1;
					if (grid.nodes[Math.floor(snEnd / nodeCols)][snEnd % nodeCols].type !== NodeType.End) return;
				}

				const symPathPoints = symmetry !== SymmetryType.None ? points.map((p) => this.getSymmetricalPoint(grid, p)) : [];
				if (!hasCellMarks) {
					fingerprints.add(this.getFingerprint(grid, points, symPathPoints, undefined, externalCells));
				} else {
					const result = this.validateFast(grid, points, symPathPoints, externalCells);
					if (result.isValid) {
						fingerprints.add(this.getFingerprint(grid, points, symPathPoints, result.regions, externalCells));
					}
				}
			}
			return;
		}
		if (!this.canReachEndOptimized(currIdx, visitedMask, adj, endNodes)) return;
		for (const edge of adj[currIdx]) {
			if (edge.isBroken) continue;
			if (visitedMask & (1n << BigInt(edge.next))) continue;

			if (symmetry !== SymmetryType.None) {
				const snCurr = this.getSymmetricalPointIndex(grid, currIdx);
				const snNext = this.getSymmetricalPointIndex(grid, edge.next);
				if (edge.next === snNext) continue;
				if (currIdx === snNext && edge.next === snCurr) continue;
			}

			let possible = true;
			for (const otherEdge of adj[currIdx]) {
				const isMandatoryForMain = otherEdge.hexType === EdgeType.Hexagon || otherEdge.hexType === EdgeType.HexagonMain;
				if (isMandatoryForMain) {
					const isAlreadyOnPath = path.length >= 2 && otherEdge.next === path[path.length - 2];
					const isNextMove = otherEdge.next === edge.next;
					if (!isAlreadyOnPath && !isNextMove) {
						possible = false;
						break;
					}
				}
			}
			if (!possible) continue;

			if (symmetry !== SymmetryType.None) {
				const snCurr = this.getSymmetricalPointIndex(grid, currIdx);
				const snNext = this.getSymmetricalPointIndex(grid, edge.next);
				for (const otherEdge of adj[snCurr]) {
					const isMandatoryForSym = otherEdge.hexType === EdgeType.Hexagon || otherEdge.hexType === EdgeType.HexagonSymmetry;
					if (isMandatoryForSym) {
						const snPrev = path.length >= 2 ? this.getSymmetricalPointIndex(grid, path[path.length - 2]) : -1;
						const isAlreadyOnSymPath = otherEdge.next === snPrev;
						const isSymNextMove = otherEdge.next === snNext;
						if (!isAlreadyOnSymPath && !isSymNextMove) {
							possible = false;
							break;
						}
					}
				}
			}
			if (!possible) continue;

			const nodeCols = grid.cols + 1;
			let nextHexMask = hexMask;
			const r = Math.floor(edge.next / nodeCols);
			const c = edge.next % nodeCols;
			const nodeType = grid.nodes[r][c].type;

			if (nodeType === NodeType.Hexagon || nodeType === NodeType.HexagonMain) {
				nextHexMask |= 1n << BigInt(hexIdMap!.get(`n${c},${r}`)!);
			}

			// エッジのチェック
			const pr = Math.floor(currIdx / nodeCols);
			const pc = currIdx % nodeCols;
			if (pr === r) {
				const ec = Math.min(pc, c);
				if (edge.hexType === EdgeType.Hexagon || edge.hexType === EdgeType.HexagonMain) {
					nextHexMask |= 1n << BigInt(hexIdMap!.get(`eh${ec},${r}`)!);
				}
			} else {
				const er = Math.min(pr, r);
				if (edge.hexType === EdgeType.Hexagon || edge.hexType === EdgeType.HexagonMain) {
					nextHexMask |= 1n << BigInt(hexIdMap!.get(`ev${c},${er}`)!);
				}
			}

			if (symmetry !== SymmetryType.None) {
				const snNext = this.getSymmetricalPointIndex(grid, edge.next);
				const snR = Math.floor(snNext / nodeCols);
				const snC = snNext % nodeCols;
				const snNodeType = grid.nodes[snR][snC].type;
				if (snNodeType === NodeType.Hexagon || snNodeType === NodeType.HexagonSymmetry) {
					nextHexMask |= 1n << BigInt(hexIdMap!.get(`n${snC},${snR}`)!);
				}

				const snCurr = this.getSymmetricalPointIndex(grid, currIdx);
				const spr = Math.floor(snCurr / nodeCols);
				const spc = snCurr % nodeCols;
				if (spr === snR) {
					const ec = Math.min(spc, snC);
					const et = grid.hEdges[snR][ec].type;
					if (et === EdgeType.Hexagon || et === EdgeType.HexagonSymmetry) {
						nextHexMask |= 1n << BigInt(hexIdMap!.get(`eh${ec},${snR}`)!);
					}
				} else {
					const er = Math.min(spr, snR);
					const et = grid.vEdges[er][snC].type;
					if (et === EdgeType.Hexagon || et === EdgeType.HexagonSymmetry) {
						nextHexMask |= 1n << BigInt(hexIdMap!.get(`ev${snC},${er}`)!);
					}
				}
			}

			path.push(edge.next);

			let nextVisitedMask = visitedMask | (1n << BigInt(edge.next));
			if (symmetry !== SymmetryType.None) {
				const snNext = this.getSymmetricalPointIndex(grid, edge.next);
				nextVisitedMask |= 1n << BigInt(snNext);
			}

			this.findPathsOptimized(grid, edge.next, nextVisitedMask, path, nextHexMask, totalHexagons, adj, endNodes, fingerprints, limit, externalCells, hasCellMarks, hexIdMap);
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
	private getFingerprint(grid: Grid, path: Point[], symPath: Point[], precalculatedRegions?: Point[][], externalCells?: Set<string>): string {
		const regions = precalculatedRegions || this.calculateRegions(grid, path, symPath, externalCells);
		const regionFingerprints = regions
			.map((region) => {
				let regionStr = "";
				const marks = [];
				for (const p of region) {
					const c = grid.cells[p.y][p.x];
					if (c.type !== CellType.None) {
						marks.push((c.type << 8) | c.color);
					}
				}
				marks.sort((a, b) => a - b);
				for (const m of marks) regionStr += m.toString(36) + ",";
				return regionStr;
			})
			.sort();

		let finalFp = "";
		for (const rf of regionFingerprints) {
			if (rf.length > 0) finalFp += rf + "|";
		}
		return finalFp || "empty";
	}
}
