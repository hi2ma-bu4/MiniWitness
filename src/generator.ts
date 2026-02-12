import { Grid } from "./grid";
import { IRng, createRng } from "./rng";
import { CellType, Color, type EdgeConstraint, EdgeType, type GenerationOptions, NodeType, type Point, RngType, SymmetryType } from "./types";
import { PuzzleValidator } from "./validator";

interface TiledPiece {
	shape: number[][];
	displayShape: number[][];
	isRotated: boolean;
	isNegative?: boolean;
}

/**
 * パズルを自動生成するクラス
 */
export class PuzzleGenerator {
	private isWorker: boolean;
	private TETRIS_SHAPES_WITH_ROTATIONS: number[][][][] = [];
	private rng: IRng | null = null;

	constructor() {
		this.isWorker = typeof self !== "undefined" && "postMessage" in self && !("document" in self);
		// テトリスピースの全回転パターンを事前に計算しておく
		for (const shape of this.TETRIS_SHAPES) {
			this.TETRIS_SHAPES_WITH_ROTATIONS.push(this.getAllRotations(shape));
		}
	}

	private stringToSeed(seedStr: string): bigint {
		try {
			if (/^[0-9a-fA-F]+$/.test(seedStr)) {
				return BigInt("0x" + seedStr);
			}
		} catch (e) {
			// ignore
		}
		// 文字コード変換
		let seed = 0n;
		for (let i = 0; i < seedStr.length; i++) {
			seed = (seed << 5n) - seed + BigInt(seedStr.charCodeAt(i));
		}
		return seed;
	}

	/**
	 * パズルを生成する
	 * @param rows 行数
	 * @param cols 列数
	 * @param options 生成オプション
	 * @returns 生成されたグリッド
	 */
	public generate(rows: number, cols: number, options: GenerationOptions = {}): Grid {
		const rngType = options.rngType ?? RngType.Mulberry32;
		let currentSeedStr = options.seed;
		if (!currentSeedStr) {
			currentSeedStr = Math.floor(Math.random() * 0xffffffff).toString(16);
		}
		const initialSeedStr = currentSeedStr;
		let currentSeed = this.stringToSeed(currentSeedStr);

		const targetDifficulty = options.difficulty ?? 0.5;
		const validator = new PuzzleValidator();
		let bestGrid: Grid | null = null;
		let bestScore = -1;

		// 試行回数の設定
		// Worker時は、メインスレッドを止めないため、より多くの試行を高速に行う
		// 小さな盤面や制約が多い場合は失敗しやすいため、試行回数を調整
		const isSmall = rows * cols <= 16;
		const maxAttempts = this.isWorker ? (rows * cols > 30 ? 120 : isSmall ? 250 : 150) : rows * cols > 30 ? 80 : isSmall ? 200 : 100;
		const markAttemptsPerPath = this.isWorker ? 8 : isSmall ? 12 : 6;

		const symmetry = options.symmetry || SymmetryType.None;
		let startPoint: Point = { x: 0, y: rows };
		let endPoint: Point = { x: cols, y: 0 };

		if (symmetry === SymmetryType.Horizontal) {
			// 左右対称：スタートと同じ側（左側）にゴールを置くことで、軸を跨ぐ必要をなくす
			endPoint = { x: 0, y: 0 };
		} else if (symmetry === SymmetryType.Vertical) {
			// 上下対称：スタートと同じ側（下側）にゴールを置く
			endPoint = { x: cols, y: rows };
		} else if (symmetry === SymmetryType.Rotational) {
			// 点対称：点対称なスタートとゴールが重ならないように配置
			endPoint = { x: cols, y: rows };
		}

		let currentPath: Point[] | null = null;
		let precalculatedRegions: Point[][] | null = null;
		let precalculatedBoundaryEdges: { type: "h" | "v"; r: number; c: number }[][] | null = null;

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const nextSeed = (currentSeed ^ 0x5deece66dn) + 0xbn;
			this.rng = createRng(rngType, currentSeed ^ 0x5deece66dn);
			validator.setRng(this.rng);
			// 一定回数ごとに新しいパスを生成する
			if (attempt % markAttemptsPerPath === 0) {
				currentPath = this.generateRandomPath(new Grid(rows, cols), startPoint, endPoint, options.pathLength, symmetry);

				// パスが決まった時点で、区画と境界エッジを計算しておく（マーク生成で流用）
				const tempGrid = new Grid(rows, cols);
				const symPath = symmetry !== SymmetryType.None ? currentPath.map((p) => this.getSymmetricalPoint(tempGrid, p, symmetry)) : [];
				precalculatedRegions = this.calculateRegions(tempGrid, currentPath, symPath);
				precalculatedBoundaryEdges = precalculatedRegions.map((region) => this.getRegionBoundaryEdges(tempGrid, region, currentPath!, symPath));
			}

			const grid = this.generateFromPath(rows, cols, currentPath!, options, precalculatedRegions!, precalculatedBoundaryEdges!);

			// 意図したパスでクリア可能か検証
			const validation = validator.validate(grid, { points: currentPath! });
			if (!validation.isValid) {
				currentSeed = nextSeed;
				continue;
			}

			// 必須制約が含まれているか確認
			if (!this.checkAllRequestedConstraintsPresent(grid, options)) {
				currentSeed = nextSeed;
				continue;
			}

			// 難易度の算出
			const difficulty = validator.calculateDifficulty(grid);
			if (difficulty === 0) {
				currentSeed = nextSeed;
				continue;
			}

			const diffFromTarget = Math.abs(difficulty - targetDifficulty);
			if (bestGrid === null || diffFromTarget < Math.abs(bestScore - targetDifficulty)) {
				bestScore = difficulty;
				bestGrid = grid;
				bestGrid.seed = initialSeedStr;
			}

			// ターゲットに近い場合は早期終了
			if (targetDifficulty > 0.8 && difficulty > 0.8) {
				bestGrid.seed = initialSeedStr;
				break;
			}
			if (diffFromTarget < 0.01) {
				bestGrid.seed = initialSeedStr;
				break; // より厳しく早期終了判定
			}

			// 次の試行へ向けてシードを更新
			currentSeed = nextSeed;
		}

		// 見つからなかった場合は最後に生成に成功したものを返す
		if (!bestGrid) {
			// 最低1回は成功するまでループ（通常は数回で終わる）
			for (let i = 0; i < 50; i++) {
				this.rng = createRng(rngType, currentSeed);
				validator.setRng(this.rng);
				const path = this.generateRandomPath(new Grid(rows, cols), startPoint, endPoint, options.pathLength, symmetry);
				const grid = this.generateFromPath(rows, cols, path, options);
				if (validator.validate(grid, { points: path }).isValid) {
					grid.seed = initialSeedStr;
					return grid;
				}
				currentSeed = (currentSeed ^ 0x5deece66dn) + 0xbn;
			}
			// それでもダメな場合はそれっぽい盤面を返す
			this.rng = createRng(rngType, currentSeed);
			validator.setRng(this.rng);
			const path = this.generateRandomPath(new Grid(rows, cols), startPoint, endPoint, options.pathLength, symmetry);
			const grid = this.generateFromPath(rows, cols, path, options);
			grid.seed = initialSeedStr;
			return grid;
		}
		return bestGrid;
	}

	/**
	 * 指定されたパスに基づいてパズルを構築する
	 * @param rows 行数
	 * @param cols 列数
	 * @param solutionPath 解答パス
	 * @param options 生成オプション
	 * @param precalculatedRegions 事前計算された区画
	 * @param precalculatedBoundaryEdges 事前計算された境界エッジ
	 * @returns 構築されたグリッド
	 */
	private generateFromPath(rows: number, cols: number, solutionPath: Point[], options: GenerationOptions, precalculatedRegions?: Point[][], precalculatedBoundaryEdges?: { type: "h" | "v"; r: number; c: number }[][]): Grid {
		const grid = new Grid(rows, cols);
		const symmetry = options.symmetry || SymmetryType.None;
		grid.symmetry = symmetry;

		let startPoint: Point = { x: 0, y: rows };
		let endPoint: Point = { x: cols, y: 0 };

		if (symmetry === SymmetryType.Horizontal) {
			endPoint = { x: 0, y: 0 };
		} else if (symmetry === SymmetryType.Vertical) {
			endPoint = { x: cols, y: rows };
		} else if (symmetry === SymmetryType.Rotational) {
			endPoint = { x: cols, y: rows };
		}

		grid.nodes[startPoint.y][startPoint.x].type = NodeType.Start;
		grid.nodes[endPoint.y][endPoint.x].type = NodeType.End;

		if (symmetry !== SymmetryType.None) {
			const symStart = this.getSymmetricalPoint(grid, startPoint, symmetry);
			const symEnd = this.getSymmetricalPoint(grid, endPoint, symmetry);
			grid.nodes[symStart.y][symStart.x].type = NodeType.Start;
			grid.nodes[symEnd.y][symEnd.x].type = NodeType.End;
		}

		// パスに基づいて制約（記号）を配置
		const symPath = symmetry !== SymmetryType.None ? solutionPath.map((p) => this.getSymmetricalPoint(grid, p, symmetry)) : [];
		this.applyConstraintsBasedOnPath(grid, solutionPath, options, symPath, precalculatedRegions, precalculatedBoundaryEdges);

		// 断線エッジの適用
		if (options.useBrokenEdges) {
			this.applyBrokenEdges(grid, solutionPath, options);
		}

		// 不要なエッジの削除（Absent化）とクリーニング
		this.cleanGrid(grid);
		return grid;
	}

	/**
	 * ランダムな正解パスを生成する
	 * @param targetLengthFactor 0.0 (最短) - 1.0 (最長)
	 */
	private generateRandomPath(grid: Grid, start: Point, end: Point, targetLengthFactor?: number, symmetry: SymmetryType = SymmetryType.None): Point[] {
		if (targetLengthFactor === undefined) {
			return this.generateSingleRandomPath(grid, start, end, undefined, symmetry);
		}

		// 指定された長さに近いパスを探す
		const minLen = grid.rows + grid.cols;
		const maxLen = (grid.rows + 1) * (grid.cols + 1) - 1;
		const targetLen = minLen + targetLengthFactor * (maxLen - minLen);

		let bestPath: Point[] = [];
		let bestDiff = Infinity;

		const attempts = grid.rows * grid.cols > 30 ? 30 : 50;
		for (let i = 0; i < attempts; i++) {
			// 最初の方の試行はバイアスを強めにかける
			const currentPath = this.generateSingleRandomPath(grid, start, end, targetLengthFactor, symmetry);
			if (currentPath.length === 0) continue;

			const currentLen = currentPath.length - 1;
			const diff = Math.abs(currentLen - targetLen);

			if (diff < bestDiff) {
				bestDiff = diff;
				bestPath = currentPath;
			}

			// 十分に近いパスが見つかったら終了
			if (bestDiff <= 2) break;
		}

		return bestPath;
	}

	/**
	 * 1本のランダムパスを生成する
	 * @param grid グリッド
	 * @param start 開始点
	 * @param end 終了点
	 * @param biasFactor 長さのバイアス
	 * @param symmetry 対称性
	 * @returns 生成されたパス
	 */
	private generateSingleRandomPath(grid: Grid, start: Point, end: Point, biasFactor?: number, symmetry: SymmetryType = SymmetryType.None): Point[] {
		const visited = new Set<string>();
		const path: Point[] = [];
		let nodesVisited = 0;
		// 探索リミットを大幅に引き上げ、特に対称パズルでの到達可能性を高める
		const limit = grid.rows * grid.cols * 200;

		const findPath = (current: Point): boolean => {
			nodesVisited++;
			if (nodesVisited > limit) return false;

			visited.add(`${current.x},${current.y}`);
			const snCurrent = this.getSymmetricalPoint(grid, current, symmetry);
			visited.add(`${snCurrent.x},${snCurrent.y}`);

			path.push(current);
			if (current.x === end.x && current.y === end.y) return true;

			let neighbors = this.getValidNeighbors(grid, current, visited);

			if (symmetry !== SymmetryType.None) {
				neighbors = neighbors.filter((n) => {
					const sn = this.getSymmetricalPoint(grid, n, symmetry);
					if (sn.x < 0 || sn.x > grid.cols || sn.y < 0 || sn.y > grid.rows) return false;
					if (visited.has(`${sn.x},${sn.y}`)) return false;
					// ノード衝突（現在の移動先が自分自身の対称点である場合もNG）
					if (n.x === sn.x && n.y === sn.y) return false;
					// エッジ衝突
					const edgeKey = this.getEdgeKey(current, n);
					const symEdgeKey = this.getEdgeKey(snCurrent, sn);
					if (edgeKey === symEdgeKey) return false;
					return true;
				});
			}
			if (biasFactor !== undefined) {
				neighbors.sort((a, b) => {
					const da = Math.abs(a.x - end.x) + Math.abs(a.y - end.y);
					const db = Math.abs(b.x - end.x) + Math.abs(b.y - end.y);
					const score = (da - db) * (1 - biasFactor * 2);
					return score + (this.rng!.next() - 0.5) * 1.5;
				});
			} else {
				this.shuffleArray(neighbors);
			}

			for (const next of neighbors) {
				if (findPath(next)) return true;
			}

			path.pop();
			visited.delete(`${current.x},${current.y}`);
			visited.delete(`${snCurrent.x},${snCurrent.y}`);
			return false;
		};
		findPath(start);
		return path;
	}

	private getValidNeighbors(grid: Grid, p: Point, visited: Set<string>): Point[] {
		const candidates: Point[] = [];
		const directions = [
			{ x: 0, y: -1 },
			{ x: 1, y: 0 },
			{ x: 0, y: 1 },
			{ x: -1, y: 0 },
		];
		for (const d of directions) {
			const nx = p.x + d.x;
			const ny = p.y + d.y;
			if (nx >= 0 && nx <= grid.cols && ny >= 0 && ny <= grid.rows) {
				if (!visited.has(`${nx},${ny}`)) candidates.push({ x: nx, y: ny });
			}
		}
		return candidates;
	}

	/**
	 * 解パスが通っていない場所にランダムに断線（Broken/Absent）を配置する
	 * @param grid グリッド
	 * @param path 解答パス
	 * @param options 生成オプション
	 */
	private applyBrokenEdges(grid: Grid, path: Point[], options: GenerationOptions) {
		const complexity = options.complexity ?? 0.5;
		const symmetry = options.symmetry ?? SymmetryType.None;
		const pathEdges = new Set<string>();

		// メインパスと対称パスの両方のエッジを禁止リストに入れる
		for (let i = 0; i < path.length - 1; i++) {
			pathEdges.add(this.getEdgeKey(path[i], path[i + 1]));
			if (symmetry !== SymmetryType.None) {
				const p1 = this.getSymmetricalPoint(grid, path[i], symmetry);
				const p2 = this.getSymmetricalPoint(grid, path[i + 1], symmetry);
				pathEdges.add(this.getEdgeKey(p1, p2));
			}
		}

		const unusedEdges: { type: "h" | "v"; r: number; c: number; p1: Point; p2: Point }[] = [];
		for (let r = 0; r <= grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				const p1 = { x: c, y: r };
				const p2 = { x: c + 1, y: r };
				if (!pathEdges.has(this.getEdgeKey(p1, p2))) unusedEdges.push({ type: "h", r, c, p1, p2 });
			}
		}
		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c <= grid.cols; c++) {
				const p1 = { x: c, y: r };
				const p2 = { x: c, y: r + 1 };
				if (!pathEdges.has(this.getEdgeKey(p1, p2))) unusedEdges.push({ type: "v", r, c, p1, p2 });
			}
		}

		this.shuffleArray(unusedEdges);
		// 盤面サイズに応じて断線数をスケールさせる
		const targetCount = Math.max(1, Math.floor((complexity * (grid.rows * grid.cols)) / 4));
		let placed = 0;
		for (const edge of unusedEdges) {
			if (placed >= targetCount) break;
			// まずはBrokenとして配置
			if (edge.type === "h") grid.hEdges[edge.r][edge.c].type = EdgeType.Broken;
			else grid.vEdges[edge.r][edge.c].type = EdgeType.Broken;
			placed++;
		}

		// 外周またはAbsentに接触しているBrokenをAbsentに置き換える（伝播）
		let changed = true;
		while (changed) {
			changed = false;
			// Horizontal edges
			for (let r = 0; r <= grid.rows; r++) {
				for (let c = 0; c < grid.cols; c++) {
					if (grid.hEdges[r][c].type === EdgeType.Broken) {
						if (this.canBecomeAbsent(grid, { type: "h", r, c })) {
							grid.hEdges[r][c].type = EdgeType.Absent;
							changed = true;
						}
					}
				}
			}
			// Vertical edges
			for (let r = 0; r < grid.rows; r++) {
				for (let c = 0; c <= grid.cols; c++) {
					if (grid.vEdges[r][c].type === EdgeType.Broken) {
						if (this.canBecomeAbsent(grid, { type: "v", r, c })) {
							grid.vEdges[r][c].type = EdgeType.Absent;
							changed = true;
						}
					}
				}
			}
		}

		// 周囲が全て断線しているノードの全エッジをAbsent化する（既存ロジックの維持）
		for (let r = 0; r <= grid.rows; r++) {
			for (let c = 0; c <= grid.cols; c++) {
				const edgesWithMeta: { e: EdgeConstraint; type: "h" | "v"; r: number; c: number }[] = [];
				if (c > 0) edgesWithMeta.push({ e: grid.hEdges[r][c - 1], type: "h", r, c: c - 1 });
				if (c < grid.cols) edgesWithMeta.push({ e: grid.hEdges[r][c], type: "h", r, c });
				if (r > 0) edgesWithMeta.push({ e: grid.vEdges[r - 1][c], type: "v", r: r - 1, c });
				if (r < grid.rows) edgesWithMeta.push({ e: grid.vEdges[r][c], type: "v", r, c });

				if (edgesWithMeta.length > 0 && edgesWithMeta.every((m) => m.e.type === EdgeType.Broken || m.e.type === EdgeType.Absent)) {
					if (edgesWithMeta.every((m) => !this.isAdjacentToMark(grid, m))) {
						for (const m of edgesWithMeta) m.e.type = EdgeType.Absent;
					}
				}
			}
		}
	}

	/**
	 * エッジがAbsentに変換可能か判定する
	 * @param grid グリッド
	 * @param edge 判定対象のエッジ
	 * @returns 変換可能かどうか
	 */
	private canBecomeAbsent(grid: Grid, edge: { type: "h" | "v"; r: number; c: number }): boolean {
		// マークに隣接している場合はAbsent禁止
		if (this.isAdjacentToMark(grid, edge)) return false;

		// 1. 外周にあるか
		if (edge.type === "h") {
			if (edge.r === 0 || edge.r === grid.rows) return true;
		} else {
			if (edge.c === 0 || edge.c === grid.cols) return true;
		}

		// 2. 他のAbsentエッジに接触（ノードを共有）しているか
		const nodes =
			edge.type === "h"
				? [
						{ x: edge.c, y: edge.r },
						{ x: edge.c + 1, y: edge.r },
					]
				: [
						{ x: edge.c, y: edge.r },
						{ x: edge.c, y: edge.r + 1 },
					];

		for (const node of nodes) {
			const adjEdges = [
				{ type: "h", r: node.y, c: node.x - 1 },
				{ type: "h", r: node.y, c: node.x },
				{ type: "v", r: node.y - 1, c: node.x },
				{ type: "v", r: node.y, c: node.x },
			];
			for (const adj of adjEdges) {
				if (adj.c >= 0 && adj.c <= grid.cols && adj.r >= 0 && adj.r <= grid.rows) {
					if (adj.type === "h" && adj.c < grid.cols) {
						if (grid.hEdges[adj.r][adj.c].type === EdgeType.Absent) return true;
					} else if (adj.type === "v" && adj.r < grid.rows) {
						if (grid.vEdges[adj.r][adj.c].type === EdgeType.Absent) return true;
					}
				}
			}
		}

		return false;
	}

	/**
	 * 到達不可能なエリアをAbsent化し、外部に漏れたセルをクリアする
	 * @param grid グリッド
	 */
	private cleanGrid(grid: Grid) {
		const startNodes: { x: number; y: number }[] = [];
		for (let r = 0; r <= grid.rows; r++) {
			for (let c = 0; c <= grid.cols; c++) if (grid.nodes[r][c].type === NodeType.Start) startNodes.push({ x: c, y: r });
		}

		const reachableNodes = new Set<string>();
		const queue: { x: number; y: number }[] = [...startNodes];
		for (const p of startNodes) reachableNodes.add(`${p.x},${p.y}`);

		while (queue.length > 0) {
			const curr = queue.shift()!;
			const neighbors = [
				{ nx: curr.x, ny: curr.y - 1, edge: grid.vEdges[curr.y - 1]?.[curr.x] },
				{ nx: curr.x, ny: curr.y + 1, edge: grid.vEdges[curr.y]?.[curr.x] },
				{ nx: curr.x - 1, ny: curr.y, edge: grid.hEdges[curr.y]?.[curr.x - 1] },
				{ nx: curr.x + 1, ny: curr.y, edge: grid.hEdges[curr.y]?.[curr.x] },
			];
			for (const n of neighbors) {
				if (n.edge && n.edge.type !== EdgeType.Absent) {
					if (!reachableNodes.has(`${n.nx},${n.ny}`)) {
						reachableNodes.add(`${n.nx},${n.ny}`);
						queue.push({ x: n.nx, y: n.ny });
					}
				}
			}
		}

		for (let r = 0; r <= grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) if (!reachableNodes.has(`${c},${r}`) || !reachableNodes.has(`${c + 1},${r}`)) grid.hEdges[r][c].type = EdgeType.Absent;
		}
		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c <= grid.cols; c++) if (!reachableNodes.has(`${c},${r}`) || !reachableNodes.has(`${c},${r + 1}`)) grid.vEdges[r][c].type = EdgeType.Absent;
		}

		const external = this.getExternalCells(grid);
		for (const cellKey of external) {
			const [c, r] = cellKey.split(",").map(Number);
			grid.cells[r][c].type = CellType.None;
		}
	}

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

	private isAdjacentToMark(grid: Grid, edge: { type: "h" | "v"; r: number; c: number }): boolean {
		if (edge.type === "h") {
			if (edge.r > 0 && grid.cells[edge.r - 1][edge.c].type !== CellType.None) return true;
			if (edge.r < grid.rows && grid.cells[edge.r][edge.c].type !== CellType.None) return true;
		} else {
			if (edge.c > 0 && grid.cells[edge.r][edge.c - 1].type !== CellType.None) return true;
			if (edge.c < grid.cols && grid.cells[edge.r][edge.c].type !== CellType.None) return true;
		}
		return false;
	}

	/**
	 * マークが完全に断絶されたセルにいないか確認する
	 * @param grid グリッド
	 * @returns 孤立したマークがあるかどうか
	 */
	private hasIsolatedMark(grid: Grid): boolean {
		for (let r = 0; r < grid.rows; r++)
			for (let c = 0; c < grid.cols; c++) {
				if (grid.cells[r][c].type === CellType.None) continue;
				const edges = [grid.hEdges[r][c], grid.hEdges[r + 1][c], grid.vEdges[r][c], grid.vEdges[r][c + 1]];
				if (edges.every((e) => e.type === EdgeType.Broken || e.type === EdgeType.Absent)) return true;
			}
		return false;
	}

	private getSymmetricalPoint(grid: Grid, p: Point, symmetry: SymmetryType): Point {
		if (symmetry === SymmetryType.Horizontal) {
			return { x: grid.cols - p.x, y: p.y };
		} else if (symmetry === SymmetryType.Vertical) {
			return { x: p.x, y: grid.rows - p.y };
		} else if (symmetry === SymmetryType.Rotational) {
			return { x: grid.cols - p.x, y: grid.rows - p.y };
		}
		return { ...p };
	}

	private getEdgeKey(p1: Point, p2: Point): string {
		return p1.x < p2.x || (p1.x === p2.x && p1.y < p2.y) ? `${p1.x},${p1.y}-${p2.x},${p2.y}` : `${p2.x},${p2.y}-${p1.x},${p1.y}`;
	}

	private TETRIS_SHAPES = [
		[[1]],
		[[1, 1]],
		[[1, 1, 1]],
		[[1, 1, 1, 1]],
		[[1, 1, 1, 1, 1]],
		[
			[1, 1],
			[1, 1],
		],
		[
			[1, 1],
			[1, 0],
		],
		[
			[1, 1, 1],
			[1, 0, 0],
		],
		[
			[1, 1, 1],
			[0, 0, 1],
		],
		[
			[0, 1],
			[1, 0],
		],
		[
			[1, 1, 1],
			[0, 1, 0],
		],
		[
			[1, 1, 1],
			[0, 1, 0],
			[0, 1, 0],
		],
		[
			[1, 1, 0],
			[0, 1, 1],
		],
		[
			[0, 1, 1],
			[1, 1, 0],
		],
		[
			[1, 1, 0],
			[0, 1, 0],
			[0, 1, 1],
		],
		[
			[0, 1, 1],
			[0, 1, 0],
			[1, 1, 0],
		],
		[
			[1, 1, 1],
			[1, 0, 1],
		],
		[
			[0, 1, 0],
			[1, 0, 1],
		],
		[
			[1, 0, 0, 1],
			[1, 0, 0, 1],
		],
		[
			[1, 1, 1],
			[1, 0, 1],
			[1, 1, 1],
		],
	];

	/**
	 * 解パスに基づいて各区画にルールを配置する
	 * @param grid グリッド
	 * @param path 解答パス
	 * @param options 生成オプション
	 * @param symPath 対称パス
	 * @param precalculatedRegions 事前計算された区画
	 * @param precalculatedBoundaryEdges 事前計算された境界エッジ
	 */
	private applyConstraintsBasedOnPath(grid: Grid, path: Point[], options: GenerationOptions, symPath: Point[] = [], precalculatedRegions?: Point[][], precalculatedBoundaryEdges?: { type: "h" | "v"; r: number; c: number }[][]) {
		const complexity = options.complexity ?? 0.5;
		const useHexagons = options.useHexagons ?? true;
		const useSquares = options.useSquares ?? true;
		const useStars = options.useStars ?? true;
		const useTetris = options.useTetris ?? false;
		const useTetrisNegative = options.useTetrisNegative ?? false;
		const useEraser = options.useEraser ?? false;

		let hexagonsPlaced = 0;
		let squaresPlaced = 0;
		let starsPlaced = 0;
		let tetrisPlaced = 0;
		let erasersPlaced = 0;
		let totalTetrisArea = 0;
		const maxTotalTetrisArea = Math.floor(grid.rows * grid.cols * 0.6);

		// 六角形の配置
		if (useHexagons) {
			const targetDifficulty = options.difficulty ?? 0.5;
			const symmetry = options.symmetry || SymmetryType.None;

			// エッジ六角形 (線上・中心)
			for (let i = 0; i < path.length - 1; i++) {
				const neighbors = this.getValidNeighbors(grid, path[i], new Set());
				const isBranching = neighbors.length > 2;
				// 難易度が低いときはエッジ六角形を多くしてガイドにする
				let prob = complexity * (targetDifficulty < 0.4 ? 0.6 : 0.3);
				if (isBranching) prob = targetDifficulty < 0.4 ? prob * 1.0 : prob * 0.5;
				if (this.rng!.next() < prob) {
					let type = EdgeType.Hexagon;
					let p1 = path[i];
					let p2 = path[i + 1];

					if (symmetry !== SymmetryType.None) {
						const r = this.rng!.next();
						if (r < 0.3) type = EdgeType.HexagonMain;
						else if (r < 0.6) {
							type = EdgeType.HexagonSymmetry;
							p1 = this.getSymmetricalPoint(grid, path[i], symmetry);
							p2 = this.getSymmetricalPoint(grid, path[i + 1], symmetry);
						}
					}

					this.setEdgeHexagon(grid, p1, p2, type);
					hexagonsPlaced++;
				}
			}
			// ノード六角形 (線上・交点)
			for (let i = 0; i < path.length; i++) {
				const node = path[i];
				if (grid.nodes[node.y][node.x].type !== NodeType.Normal) continue;
				// EdgeのHexagonと隣接している場合はスキップ
				if (this.hasIncidentHexagonEdge(grid, node)) continue;

				// 難易度が高いときにノード六角形を配置
				let prob = complexity * (targetDifficulty > 0.6 ? 0.15 : 0.05);
				if (this.rng!.next() < prob) {
					let type = NodeType.Hexagon;
					let targetNode = node;

					if (symmetry !== SymmetryType.None) {
						const r = this.rng!.next();
						if (r < 0.3) type = NodeType.HexagonMain;
						else if (r < 0.6) {
							type = NodeType.HexagonSymmetry;
							targetNode = this.getSymmetricalPoint(grid, node, symmetry);
						}
					}

					grid.nodes[targetNode.y][targetNode.x].type = type;
					hexagonsPlaced++;
				}
			}

			if (hexagonsPlaced === 0 && path.length >= 2) {
				const idx = Math.floor(this.rng!.next() * (path.length - 1));
				const symmetry = options.symmetry || SymmetryType.None;
				let type = EdgeType.Hexagon;
				let p1 = path[idx];
				let p2 = path[idx + 1];

				if (symmetry !== SymmetryType.None) {
					const r = this.rng!.next();
					if (r < 0.3) type = EdgeType.HexagonMain;
					else if (r < 0.6) {
						type = EdgeType.HexagonSymmetry;
						p1 = this.getSymmetricalPoint(grid, path[idx], symmetry);
						p2 = this.getSymmetricalPoint(grid, path[idx + 1], symmetry);
					}
				}
				this.setEdgeHexagon(grid, p1, p2, type);
			}
		}

		// 区画ルールの配置
		if (useSquares || useStars || useTetris || useEraser) {
			const regions = precalculatedRegions || this.calculateRegions(grid, path, symPath);
			const availableColors = options.availableColors ?? [Color.Black, Color.White, Color.Red, Color.Blue];
			const defaultColors = options.defaultColors ?? {};
			const getDefColor = (type: CellType, fallback: Color): Color => {
				if (defaultColors[type] !== undefined) return defaultColors[type] as Color;
				const name = CellType[type] as keyof typeof CellType;
				if (name && defaultColors[name] !== undefined) return defaultColors[name] as Color;
				return fallback;
			};
			const regionIndices = Array.from({ length: regions.length }, (_, i) => i);
			this.shuffleArray(regionIndices);
			const squareColorsUsed = new Set<number>();

			// 必要な最小限の制約を分散して配置するためのフラグ
			const needs = {
				square: useSquares,
				star: useStars,
				tetris: useTetris,
				tetrisNegative: useTetrisNegative,
				eraser: useEraser,
			};

			let tetrisNegativePlaced = 0;

			for (let rIdx = 0; rIdx < regionIndices.length; rIdx++) {
				const idx = regionIndices[rIdx];
				const region = regions[idx];

				// 盤面が大きく区画が多い場合、後半に偏るのを防ぐため確率を調整
				const remainingRegions = regionIndices.length - rIdx;
				const forceOne = (needs.square && squaresPlaced === 0) || (needs.star && starsPlaced === 0) || (needs.tetris && tetrisPlaced === 0) || (needs.tetrisNegative && tetrisNegativePlaced === 0) || (needs.eraser && erasersPlaced === 0);

				// 必須なものがまだ配置されていない場合、残り区画数が少なくなってきたら確率を上げる
				let placementProb = 0.2 + complexity * 0.6;
				if (forceOne && remainingRegions <= 3) placementProb = 1.0;
				else if (forceOne && remainingRegions <= 6) placementProb = 0.7;

				if (this.rng!.next() > placementProb) continue;

				const potentialCells = [...region];
				this.shuffleArray(potentialCells);
				// この区画内で意図的に（トゲとのペアリング等のために）割り当てられた非デフォルト色
				const intendedColors = new Set<number>();

				// 四角形の配置
				let squareColor = availableColors[Math.floor(this.rng!.next() * availableColors.length)];
				// 必須かつ未配置の場合は、まだ使っていない色を優先的に選ぶ
				if (useSquares && squareColorsUsed.size < 2) {
					const unusedColors = availableColors.filter((c) => !squareColorsUsed.has(c));
					if (unusedColors.length > 0) {
						squareColor = unusedColors[Math.floor(this.rng!.next() * unusedColors.length)];
					}
				}

				let shouldPlaceSquare = useSquares && this.rng!.next() < 0.5 + complexity * 0.3;
				if (useSquares && squaresPlaced === 0 && remainingRegions <= 2) shouldPlaceSquare = true;
				if (useSquares && !useStars && remainingRegions <= 2 && squareColorsUsed.size < 2 && squaresPlaced > 0) shouldPlaceSquare = true;

				if (shouldPlaceSquare && potentialCells.length > 0) {
					// 区域の大きさに応じて配置する数を増やす
					const maxSquares = Math.min(potentialCells.length, Math.max(4, Math.floor(region.length / 4)));
					const numSquares = Math.floor(this.rng!.next() * (maxSquares / 2)) + Math.ceil(maxSquares / 2);
					for (let i = 0; i < numSquares; i++) {
						if (potentialCells.length === 0) break;
						const cell = potentialCells.pop()!;
						grid.cells[cell.y][cell.x].type = CellType.Square;
						grid.cells[cell.y][cell.x].color = squareColor;
						squaresPlaced++;
						squareColorsUsed.add(squareColor);
						intendedColors.add(squareColor);
					}
				}

				// テトリスの配置
				if (useTetris || useTetrisNegative) {
					let shouldPlaceTetris = this.rng!.next() < 0.1 + complexity * 0.4;
					// 未配置の場合は確率を上げる
					if (tetrisPlaced === 0 && remainingRegions <= 3) shouldPlaceTetris = true;
					if (useTetrisNegative && tetrisNegativePlaced === 0 && remainingRegions <= 2) shouldPlaceTetris = true;

					const maxTetrisPerRegion = tetrisPlaced === 0 && remainingRegions <= 2 ? 6 : 4;

					// 面積制限の緩和: 必須かつ未配置の場合は制限を無視する。ただし探索爆発を防ぐため最大30セル程度に制限
					const isAreaOk = totalTetrisArea + region.length <= maxTotalTetrisArea || (forceOne && useTetris && tetrisPlaced === 0 && region.length <= 30) || (forceOne && useTetrisNegative && tetrisNegativePlaced === 0 && region.length <= 30);

					if (shouldPlaceTetris && potentialCells.length > 0 && isAreaOk) {
						// 巨大な領域でのタイリング探索は非常に重いため、制限をかける
						let tiledPieces = region.length <= 25 ? (this.generateTiling(region, maxTetrisPerRegion, options) as TiledPiece[] | null) : null;
						if (tiledPieces) {
							// 減算テトリスの適用
							const negativePiecesToPlace: TiledPiece[] = [];
							// 未配置の場合は確率を上げる
							let negProb = 0.2 + complexity * 0.3;
							if (useTetrisNegative && tetrisNegativePlaced === 0 && remainingRegions <= 3) negProb = 0.9;

							if (useTetrisNegative && this.rng!.next() < negProb) {
								const difficulty = options.difficulty ?? 0.5;
								const prob0 = 0.1; // area-0 case probability
								if (this.rng!.next() < prob0 && potentialCells.length >= 2) {
									// Case: Net area 0.
									let complexFound = false;
									if (potentialCells.length >= 3 && this.rng!.next() < 0.8) {
										// Try 2:1 or 1:2 complex cancellation
										const is2pos1neg = this.rng!.next() < 0.5;
										const baseArea = 1 + Math.floor(this.rng!.next() * 2); // 1 or 2
										const baseShapes = this.TETRIS_SHAPES.filter((s) => this.getShapeArea(s) === baseArea);
										const base = baseShapes[Math.floor(this.rng!.next() * baseShapes.length)];

										const triple = this.findStandardTriple(base);
										if (triple) {
											if (is2pos1neg) {
												// P1(base) + P2(triple.n) = N(triple.p)
												tiledPieces.push({ shape: base, displayShape: base, isRotated: !this.isRotationallyInvariant(base) && this.rng!.next() < difficulty * 0.7, isNegative: false });
												tiledPieces.push({ shape: triple.n, displayShape: triple.n, isRotated: !this.isRotationallyInvariant(triple.n) && this.rng!.next() < difficulty * 0.7, isNegative: false });
												negativePiecesToPlace.push({ shape: triple.p, displayShape: triple.p, isRotated: !this.isRotationallyInvariant(triple.p) && this.rng!.next() < difficulty * 0.7, isNegative: true });
											} else {
												// P(triple.p) = N1(base) + N2(triple.n)
												tiledPieces.push({ shape: triple.p, displayShape: triple.p, isRotated: !this.isRotationallyInvariant(triple.p) && this.rng!.next() < difficulty * 0.7, isNegative: false });
												negativePiecesToPlace.push({ shape: base, displayShape: base, isRotated: !this.isRotationallyInvariant(base) && this.rng!.next() < difficulty * 0.7, isNegative: true });
												negativePiecesToPlace.push({ shape: triple.n, displayShape: triple.n, isRotated: !this.isRotationallyInvariant(triple.n) && this.rng!.next() < difficulty * 0.7, isNegative: true });
											}
											complexFound = true;
										}
									}

									if (!complexFound) {
										// Case: 1:1 Net area 0.
										// To cancel to zero, combined shapes must match.
										const area = 3 + Math.floor(this.rng!.next() * 2); // area 3 or 4
										const candidates = this.TETRIS_SHAPES.filter((s) => this.getShapeArea(s) === area);
										this.shuffleArray(candidates);

										if (candidates.length > 0) {
											const pShape = candidates[0];
											const nShape = candidates[0];
											tiledPieces.push({ shape: pShape, displayShape: pShape, isRotated: !this.isRotationallyInvariant(pShape) && this.rng!.next() < difficulty * 0.7, isNegative: false });
											negativePiecesToPlace.push({ shape: nShape, displayShape: nShape, isRotated: !this.isRotationallyInvariant(nShape) && this.rng!.next() < difficulty * 0.7, isNegative: true });
										}
									}
								} else if (tiledPieces.length > 0) {
									// Case: Net area > 0 using standard triples
									const numSubtractions = this.rng!.next() < 0.3 ? 2 : 1;
									for (let i = 0; i < numSubtractions; i++) {
										if (potentialCells.length < 1) break;
										const targetIdx = Math.floor(this.rng!.next() * tiledPieces.length);
										const original = tiledPieces[targetIdx];
										if (original.isNegative) continue;

										// Occasionally try a 1:2 subtraction (P = T + N1 + N2)
										let complexSubtraction = false;
										if (potentialCells.length >= 2 && this.rng!.next() < 0.2) {
											const triple1 = this.findStandardTriple(original.shape);
											if (triple1) {
												const triple2 = this.findStandardTriple(triple1.p);
												if (triple2) {
													// T(orig) + N1(triple1.n) + N2(triple2.n) = P(triple2.p)
													// So P - N1 - N2 = T
													tiledPieces[targetIdx] = { shape: triple2.p, displayShape: triple2.p, isRotated: !this.isRotationallyInvariant(triple2.p) && this.rng!.next() < difficulty * 0.7, isNegative: false };
													negativePiecesToPlace.push({ shape: triple1.n, displayShape: triple1.n, isRotated: !this.isRotationallyInvariant(triple1.n) && this.rng!.next() < difficulty * 0.7, isNegative: true });
													negativePiecesToPlace.push({ shape: triple2.n, displayShape: triple2.n, isRotated: !this.isRotationallyInvariant(triple2.n) && this.rng!.next() < difficulty * 0.7, isNegative: true });
													complexSubtraction = true;
												}
											}
										}

										if (!complexSubtraction) {
											const triple = this.findStandardTriple(original.shape);
											if (triple) {
												// Check if triple.n matches any existing positive piece in tiledPieces to avoid triviality
												const isDuplicate = tiledPieces.some((tp) => !tp.isNegative && this.isSameShape(tp.shape, triple.n));
												if (!isDuplicate) {
													tiledPieces[targetIdx] = {
														shape: triple.p,
														displayShape: triple.p,
														isRotated: !this.isRotationallyInvariant(triple.p) && this.rng!.next() < difficulty * 0.7,
														isNegative: false,
													};
													negativePiecesToPlace.push({
														shape: triple.n,
														displayShape: triple.n,
														isRotated: !this.isRotationallyInvariant(triple.n) && this.rng!.next() < difficulty * 0.7,
														isNegative: true,
													});
												}
											}
										}
									}
								}
							}

							const allPieces: TiledPiece[] = [...tiledPieces, ...negativePiecesToPlace];
							if (allPieces.length > potentialCells.length) continue;
							for (const p of allPieces) {
								if (potentialCells.length === 0) break;
								const cell = potentialCells.pop()!;
								const isNeg = p.isNegative;

								if (isNeg) {
									grid.cells[cell.y][cell.x].type = p.isRotated ? CellType.TetrisNegativeRotated : CellType.TetrisNegative;
									grid.cells[cell.y][cell.x].color = getDefColor(CellType.TetrisNegative, Color.Cyan);
									tetrisNegativePlaced++;
								} else {
									grid.cells[cell.y][cell.x].type = p.isRotated ? CellType.TetrisRotated : CellType.Tetris;
									const defColor = getDefColor(CellType.Tetris, Color.None);
									let tetrisColor = defColor;
									// トゲ(Star)とのペアリングを意図する場合のみ色を付ける
									if (useStars && this.rng!.next() < 0.3) {
										const candidates = availableColors.filter((c) => c !== defColor && !intendedColors.has(c));
										if (candidates.length > 0) {
											tetrisColor = candidates[Math.floor(this.rng!.next() * candidates.length)];
											intendedColors.add(tetrisColor);
										}
									}
									grid.cells[cell.y][cell.x].color = tetrisColor;
								}
								grid.cells[cell.y][cell.x].shape = p.isRotated ? p.displayShape : p.shape;
								tetrisPlaced++;
							}

							totalTetrisArea += region.length;
						}
					}
				}

				// テトラポッド（エラー削除）の配置
				if (useEraser && erasersPlaced < 1) {
					const prob = 0.05 + complexity * 0.2;
					let shouldPlaceEraser = this.rng!.next() < prob;
					if (remainingRegions <= 2) shouldPlaceEraser = true;

					if (shouldPlaceEraser && potentialCells.length >= 1) {
						let errorTypes: string[] = [];
						if (useStars) errorTypes.push("star");
						if (useSquares) errorTypes.push("square");
						let boundaryEdges: { type: "h" | "v"; r: number; c: number }[] = [];
						if (useHexagons) {
							boundaryEdges = precalculatedBoundaryEdges ? precalculatedBoundaryEdges[idx] : this.getRegionBoundaryEdges(grid, region, path, symPath);
							if (boundaryEdges.length > 0) errorTypes.push("hexagon");
						}
						if (useTetris) errorTypes.push("tetris");
						if (useTetrisNegative) errorTypes.push("tetrisNegative");

						this.shuffleArray(errorTypes);
						if (potentialCells.length >= 2) errorTypes.push("eraser");

						let errorPlaced = false;

						for (const errorType of errorTypes) {
							if (errorPlaced) break;

							if (errorType === "hexagon") {
								const validEdges = boundaryEdges.filter((e) => !this.isEdgeAdjacentToHexagonNode(grid, e));
								if (validEdges.length > 0) {
									const edge = validEdges[Math.floor(this.rng!.next() * validEdges.length)];
									if (edge.type === "h") grid.hEdges[edge.r][edge.c].type = EdgeType.Hexagon;
									else grid.vEdges[edge.r][edge.c].type = EdgeType.Hexagon;
									hexagonsPlaced++;
									errorPlaced = true;
								}
							} else if (errorType === "square" && potentialCells.length >= 2) {
								const errCell = potentialCells.pop()!;
								grid.cells[errCell.y][errCell.x].type = CellType.Square;
								const existingSquare = region.find((p) => grid.cells[p.y][p.x].type === CellType.Square);
								const existingSquareColor = existingSquare ? grid.cells[existingSquare.y][existingSquare.x].color : undefined;
								grid.cells[errCell.y][errCell.x].color = availableColors.find((c) => c !== existingSquareColor) || Color.Red;
								squaresPlaced++;
								errorPlaced = true;
							} else if (errorType === "star" && potentialCells.length >= 2) {
								const errCell = potentialCells.pop()!;
								grid.cells[errCell.y][errCell.x].type = CellType.Star;
								grid.cells[errCell.y][errCell.x].color = availableColors[Math.floor(this.rng!.next() * availableColors.length)];
								starsPlaced++;
								errorPlaced = true;
							} else if (errorType === "tetris" && potentialCells.length >= 2) {
								const tiledPieces = this.generateTiling(region, 4, options);
								let piecesToPlace = [];
								if (tiledPieces && tiledPieces.length > 0) {
									let currentArea = 0;
									for (const p of tiledPieces) {
										const area = this.getShapeArea(p.shape);
										if (currentArea + area < region.length) {
											piecesToPlace.push(p);
											currentArea += area;
										} else break;
									}
								}
								if (piecesToPlace.length === 0 && region.length > 1) {
									piecesToPlace = [{ shape: [[1]], displayShape: [[1]], isRotated: false }];
								}

								if (piecesToPlace.length > 0) {
									for (const p of piecesToPlace) {
										if (potentialCells.length < 2) break;
										const cell = potentialCells.pop()!;
										grid.cells[cell.y][cell.x].type = p.isRotated ? CellType.TetrisRotated : CellType.Tetris;
										grid.cells[cell.y][cell.x].shape = p.isRotated ? p.displayShape : p.shape;
										grid.cells[cell.y][cell.x].color = Color.None;
										tetrisPlaced++;
									}
									errorPlaced = true;
								}
							} else if (errorType === "tetrisNegative" && this.canPlaceGeneratedTetrisNegative(grid, region, potentialCells)) {
								if (!this.hasRegionTetrisSymbol(grid, region)) {
									const posCell = potentialCells.pop()!;
									grid.cells[posCell.y][posCell.x].type = CellType.Tetris;
									grid.cells[posCell.y][posCell.x].shape = [[1]];
									grid.cells[posCell.y][posCell.x].color = getDefColor(CellType.Tetris, Color.None);
									tetrisPlaced++;
								}
								const cell = potentialCells.pop()!;
								grid.cells[cell.y][cell.x].type = CellType.TetrisNegative;
								grid.cells[cell.y][cell.x].shape = [[1]];
								grid.cells[cell.y][cell.x].color = getDefColor(CellType.TetrisNegative, Color.Cyan);
								tetrisNegativePlaced++;
							} else if (errorType === "eraser" && this.canPlaceGeneratedEraser(grid, region, potentialCells)) {
								const errCell = potentialCells.pop()!;
								grid.cells[errCell.y][errCell.x].type = CellType.Eraser;
								grid.cells[errCell.y][errCell.x].color = getDefColor(CellType.Eraser, Color.White);
								erasersPlaced++;
								errorPlaced = true;
							}
						}

						if (errorPlaced && this.canPlaceGeneratedEraser(grid, region, potentialCells)) {
							const cell = potentialCells.pop()!;
							grid.cells[cell.y][cell.x].type = CellType.Eraser;
							const defColor = getDefColor(CellType.Eraser, Color.White);
							let eraserColor = defColor;
							// トゲ(Star)とのペアリングを意図する場合のみ色を付ける
							if (useStars && this.rng!.next() < 0.3) {
								const candidates = availableColors.filter((c) => c !== defColor && !intendedColors.has(c));
								if (candidates.length > 0) {
									eraserColor = candidates[Math.floor(this.rng!.next() * candidates.length)];
									intendedColors.add(eraserColor);
								}
							}
							grid.cells[cell.y][cell.x].color = eraserColor;
							erasersPlaced++;
						}
					}
				}

				// 星の配置
				if (useStars) {
					// 1. まず非デフォルト色の記号、または意図的に色付けされた記号をトゲでペアリングする（必須）
					for (const color of availableColors) {
						if (potentialCells.length < 1) break;
						const colorCount = region.filter((p) => grid.cells[p.y][p.x].color === color).length;
						// 非デフォルト色、または意図的に割り当てられた色が1つだけある場合、トゲを追加してペアにする
						if (colorCount === 1 && (color !== Color.White || intendedColors.has(color))) {
							const cell = potentialCells.pop()!;
							grid.cells[cell.y][cell.x].type = CellType.Star;
							grid.cells[cell.y][cell.x].color = color;
							starsPlaced++;
						}
					}

					// 2. 追加でトゲのペアを配置する（ランダム）
					const maxPairs = Math.max(1, Math.floor(region.length / 8));
					for (let p = 0; p < maxPairs; p++) {
						if (potentialCells.length < 2) break;
						for (const color of availableColors) {
							if (potentialCells.length < 2) break;
							if (this.rng!.next() > 0.3 + complexity * 0.4) continue;

							const colorCount = region.filter((p) => grid.cells[p.y][p.x].color === color).length;
							if (colorCount === 0) {
								for (let i = 0; i < 2; i++) {
									const cell = potentialCells.pop()!;
									grid.cells[cell.y][cell.x].type = CellType.Star;
									grid.cells[cell.y][cell.x].color = color;
									starsPlaced++;
								}
							}
						}
					}
				}
			}

			// 四角形の色が1色しか使われなかった場合の補正
			if (useSquares && squareColorsUsed.size < 2) {
				const onlyColor = squareColorsUsed.values().next().value;
				const hasMatchingStar =
					onlyColor !== undefined &&
					starsPlaced > 0 &&
					Array.from({ length: grid.rows * grid.cols }).some((_, i) => {
						const r = Math.floor(i / grid.cols);
						const c = i % grid.cols;
						return grid.cells[r][c].type === CellType.Star && grid.cells[r][c].color === onlyColor;
					});

				if (!hasMatchingStar) {
					for (const region of regions) {
						if (squareColorsUsed.size >= 2) break;
						if (region.some((p) => grid.cells[p.y][p.x].type === CellType.Square)) continue;

						const availableCells = region.filter((p) => grid.cells[p.y][p.x].type === CellType.None);
						if (availableCells.length > 0) {
							const otherColor = availableColors.find((c) => !squareColorsUsed.has(c)) || Color.White;
							const cell = availableCells[Math.floor(this.rng!.next() * availableCells.length)];
							grid.cells[cell.y][cell.x].type = CellType.Square;
							grid.cells[cell.y][cell.x].color = otherColor;
							squareColorsUsed.add(otherColor);
							squaresPlaced++;
						}
					}
					// まだ1色の場合は、同色の星を無理やり置く
					if (squareColorsUsed.size < 2 && useStars && onlyColor !== undefined) {
						for (const region of regions) {
							const availableCells = region.filter((p) => grid.cells[p.y][p.x].type === CellType.None);
							if (availableCells.length > 0) {
								const cell = availableCells[Math.floor(this.rng!.next() * availableCells.length)];
								grid.cells[cell.y][cell.x].type = CellType.Star;
								grid.cells[cell.y][cell.x].color = onlyColor;
								starsPlaced++;
								break;
							}
						}
					}
				}
			}
		}
	}

	/**
	 * 区画分けを行う
	 * @param grid グリッド
	 * @param path 解答パス
	 * @param symPath 対称パス
	 * @returns 区画リスト
	 */
	private calculateRegions(grid: Grid, path: Point[], symPath: Point[] = []): Point[][] {
		const regions: Point[][] = [];
		const rows = grid.rows;
		const cols = grid.cols;
		const visitedCells = new Uint8Array(rows * cols);

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

		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const idx = r * cols + c;
				if (visitedCells[idx]) continue;

				const region: Point[] = [];
				const queue: number[] = [idx];
				visitedCells[idx] = 1;

				let head = 0;
				while (head < queue.length) {
					const currIdx = queue[head++];
					const cx = currIdx % cols;
					const cy = Math.floor(currIdx / cols);
					region.push({ x: cx, y: cy });

					if (cy > 0 && !hEdgesMask[cy * cols + cx]) {
						const nIdx = (cy - 1) * cols + cx;
						if (!visitedCells[nIdx]) {
							visitedCells[nIdx] = 1;
							queue.push(nIdx);
						}
					}
					if (cy < rows - 1 && !hEdgesMask[(cy + 1) * cols + cx]) {
						const nIdx = (cy + 1) * cols + cx;
						if (!visitedCells[nIdx]) {
							visitedCells[nIdx] = 1;
							queue.push(nIdx);
						}
					}
					if (cx > 0 && !vEdgesMask[cy * (cols + 1) + cx]) {
						const nIdx = cy * cols + (cx - 1);
						if (!visitedCells[nIdx]) {
							visitedCells[nIdx] = 1;
							queue.push(nIdx);
						}
					}
					if (cx < cols - 1 && !vEdgesMask[cy * (cols + 1) + (cx + 1)]) {
						const nIdx = cy * cols + (cx + 1);
						if (!visitedCells[nIdx]) {
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
	 * 区画の境界エッジのうち、解パスが通っていないものを取得する
	 * @param grid グリッド
	 * @param region 区画
	 * @param path 解答パス
	 * @param symPath 対称パス
	 * @returns 境界エッジのリスト
	 */
	private getRegionBoundaryEdges(grid: Grid, region: Point[], path: Point[], symPath: Point[] = []): { type: "h" | "v"; r: number; c: number }[] {
		const pathEdges = new Set<string>();
		for (let i = 0; i < path.length - 1; i++) pathEdges.add(this.getEdgeKey(path[i], path[i + 1]));
		for (let i = 0; i < symPath.length - 1; i++) pathEdges.add(this.getEdgeKey(symPath[i], symPath[i + 1]));

		const boundary: { type: "h" | "v"; r: number; c: number }[] = [];
		for (const cell of region) {
			const edges = [
				{ type: "h" as const, r: cell.y, c: cell.x },
				{ type: "h" as const, r: cell.y + 1, c: cell.x },
				{ type: "v" as const, r: cell.y, c: cell.x },
				{ type: "v" as const, r: cell.y, c: cell.x + 1 },
			];
			for (const e of edges) {
				const p1 = e.type === "h" ? { x: e.c, y: e.r } : { x: e.c, y: e.r };
				const p2 = e.type === "h" ? { x: e.c + 1, y: e.r } : { x: e.c, y: e.r + 1 };
				const key = this.getEdgeKey(p1, p2);
				if (!pathEdges.has(key) && !this.isAbsentEdge(grid, p1, p2)) {
					boundary.push(e);
				}
			}
		}
		// 重複を削除
		const unique = new Map<string, { type: "h" | "v"; r: number; c: number }>();
		for (const e of boundary) unique.set(`${e.type},${e.r},${e.c}`, e);
		return Array.from(unique.values());
	}

	private setEdgeHexagon(grid: Grid, p1: Point, p2: Point, type: EdgeType = EdgeType.Hexagon) {
		if (p1.x === p2.x) grid.vEdges[Math.min(p1.y, p2.y)][p1.x].type = type;
		else grid.hEdges[p1.y][Math.min(p1.x, p2.x)].type = type;
	}

	private hasIncidentHexagonEdge(grid: Grid, p: Point): boolean {
		const isHex = (t: EdgeType) => t === EdgeType.Hexagon || t === EdgeType.HexagonMain || t === EdgeType.HexagonSymmetry;
		if (p.x > 0 && isHex(grid.hEdges[p.y][p.x - 1].type)) return true;
		if (p.x < grid.cols && isHex(grid.hEdges[p.y][p.x].type)) return true;
		if (p.y > 0 && isHex(grid.vEdges[p.y - 1][p.x].type)) return true;
		if (p.y < grid.rows && isHex(grid.vEdges[p.y][p.x].type)) return true;
		return false;
	}

	private isEdgeAdjacentToHexagonNode(grid: Grid, edge: { type: "h" | "v"; r: number; c: number }): boolean {
		const isHex = (t: NodeType) => t === NodeType.Hexagon || t === NodeType.HexagonMain || t === NodeType.HexagonSymmetry;
		if (edge.type === "h") {
			return isHex(grid.nodes[edge.r][edge.c].type) || isHex(grid.nodes[edge.r][edge.c + 1].type);
		} else {
			return isHex(grid.nodes[edge.r][edge.c].type) || isHex(grid.nodes[edge.r + 1][edge.c].type);
		}
	}

	/**
	 * 要求された制約が全て含まれているか確認する
	 * @param grid グリッド
	 * @param options 生成オプション
	 * @returns 全ての要求された制約が含まれているか
	 */
	private checkAllRequestedConstraintsPresent(grid: Grid, options: GenerationOptions): boolean {
		const useHexagons = options.useHexagons ?? true;
		const useSquares = options.useSquares ?? true;
		const useStars = options.useStars ?? true;
		const useTetris = options.useTetris ?? false;
		const useTetrisNegative = options.useTetrisNegative ?? false;
		const useEraser = options.useEraser ?? false;
		const useBrokenEdges = options.useBrokenEdges ?? false;

		if (useBrokenEdges) {
			let found = false;
			for (let r = 0; r <= grid.rows; r++)
				for (let c = 0; c < grid.cols; c++)
					if (grid.hEdges[r][c].type === EdgeType.Broken || grid.hEdges[r][c].type === EdgeType.Absent) {
						found = true;
						break;
					}
			if (!found)
				for (let r = 0; r < grid.rows; r++)
					for (let c = 0; c <= grid.cols; c++)
						if (grid.vEdges[r][c].type === EdgeType.Broken || grid.vEdges[r][c].type === EdgeType.Absent) {
							found = true;
							break;
						}
			if (!found) return false;
		}
		if (useHexagons) {
			let found = false;
			const isHexEdge = (t: EdgeType) => t === EdgeType.Hexagon || t === EdgeType.HexagonMain || t === EdgeType.HexagonSymmetry;
			const isHexNode = (t: NodeType) => t === NodeType.Hexagon || t === NodeType.HexagonMain || t === NodeType.HexagonSymmetry;

			for (let r = 0; r <= grid.rows; r++)
				for (let c = 0; c < grid.cols; c++)
					if (isHexEdge(grid.hEdges[r][c].type)) {
						found = true;
						break;
					}
			if (!found)
				for (let r = 0; r < grid.rows; r++)
					for (let c = 0; c <= grid.cols; c++)
						if (isHexEdge(grid.vEdges[r][c].type)) {
							found = true;
							break;
						}
			if (!found)
				for (let r = 0; r <= grid.rows; r++)
					for (let c = 0; c <= grid.cols; c++)
						if (isHexNode(grid.nodes[r][c].type)) {
							found = true;
							break;
						}
			if (!found) return false;
		}
		if (useSquares || useStars || useTetris || useEraser) {
			let fSq = false;
			let fSt = false;
			let fT = false;
			let fTN = false;
			let fE = false;
			const sqC = new Set<number>();
			const stC = new Set<number>();
			for (let r = 0; r < grid.rows; r++)
				for (let c = 0; c < grid.cols; c++) {
					const type = grid.cells[r][c].type;
					if (type === CellType.Square) {
						fSq = true;
						sqC.add(grid.cells[r][c].color);
					}
					if (type === CellType.Star) {
						fSt = true;
						stC.add(grid.cells[r][c].color);
					}
					if (type === CellType.Tetris || type === CellType.TetrisRotated) fT = true;
					if (type === CellType.TetrisNegative || type === CellType.TetrisNegativeRotated) fTN = true;
					if (type === CellType.Eraser) fE = true;
				}
			if (useSquares && !fSq) return false;
			if (useStars && !fSt) return false;
			if (useTetris && !fT) return false;
			if (useTetrisNegative && !fTN) return false;
			if (useEraser && !fE) return false;

			// 四角形の追加制約: 他の色の四角形、または同色の星が存在しない場合は2色以上必要
			if (useSquares && fSq) {
				if (sqC.size < 2) {
					const onlyColor = sqC.values().next().value;
					if (onlyColor === undefined || !stC.has(onlyColor)) return false;
				}
			}
		}
		if (this.hasIsolatedMark(grid)) return false;
		return true;
	}

	/**
	 * 指定された区画をピースで埋め尽くすタイリングを生成する
	 * @param region 区画
	 * @param maxPieces 最大ピース数
	 * @param options 生成オプション
	 * @returns タイリング結果
	 */
	private generateTiling(region: Point[], maxPieces: number, options: GenerationOptions): { shape: number[][]; displayShape: number[][]; isRotated: boolean }[] | null {
		const minX = Math.min(...region.map((p) => p.x));
		const minY = Math.min(...region.map((p) => p.y));
		const maxX = Math.max(...region.map((p) => p.x));
		const maxY = Math.max(...region.map((p) => p.y));
		const width = maxX - minX + 1;
		const height = maxY - minY + 1;
		const regionGrid = Array.from({ length: height }, () => Array(width).fill(false));
		for (const p of region) regionGrid[p.y - minY][p.x - minX] = true;
		return this.tilingDfs(regionGrid, [], maxPieces, options);
	}

	/**
	 * タイリングを深さ優先探索で生成する
	 * @param regionGrid 領域のグリッド表現
	 * @param currentPieces 現在配置済みのピース
	 * @param maxPieces 最大ピース数
	 * @param options 生成オプション
	 * @returns 成功した場合はピースのリスト、失敗した場合はnull
	 */
	private tilingDfs(regionGrid: boolean[][], currentPieces: { shape: number[][]; displayShape: number[][]; isRotated: boolean }[], maxPieces: number, options: GenerationOptions): { shape: number[][]; displayShape: number[][]; isRotated: boolean }[] | null {
		let r0 = -1;
		let c0 = -1;
		for (let r = 0; r < regionGrid.length; r++) {
			for (let c = 0; c < regionGrid[0].length; c++)
				if (regionGrid[r][c]) {
					r0 = r;
					c0 = c;
					break;
				}
			if (r0 !== -1) break;
		}
		if (r0 === -1) return currentPieces;
		if (currentPieces.length >= maxPieces) return null;

		const difficulty = options.difficulty ?? 0.5;
		const indices = Array.from({ length: this.TETRIS_SHAPES.length }, (_, i) => i);
		this.shuffleArray(indices);
		if (difficulty > 0.6) indices.sort((a, b) => this.getShapeArea(this.TETRIS_SHAPES[b]) - this.getShapeArea(this.TETRIS_SHAPES[a]));

		for (const idx of indices) {
			const baseShape = this.TETRIS_SHAPES[idx];
			const rotations = this.TETRIS_SHAPES_WITH_ROTATIONS[idx];
			const rotIndices = Array.from({ length: rotations.length }, (_, i) => i);
			this.shuffleArray(rotIndices);

			for (const rotIdx of rotIndices) {
				const shape = rotations[rotIdx];
				const blocks: { r: number; c: number }[] = [];
				for (let pr = 0; pr < shape.length; pr++) for (let pc = 0; pc < shape[0].length; pc++) if (shape[pr][pc]) blocks.push({ r: pr, c: pc });
				for (const anchor of blocks) {
					const dr = r0 - anchor.r;
					const dc = c0 - anchor.c;
					if (this.canPlace(regionGrid, shape, dr, dc)) {
						this.placePiece(regionGrid, shape, dr, dc, false);
						const isRotated = rotations.length > 1 && this.rng!.next() < 0.3 + difficulty * 0.6;
						const result = this.tilingDfs(regionGrid, [...currentPieces, { shape, displayShape: baseShape, isRotated }], maxPieces, options);
						if (result) return result;
						this.placePiece(regionGrid, shape, dr, dc, true);
					}
				}
			}
		}
		return null;
	}

	private getShapeArea(shape: number[][]): number {
		let area = 0;
		for (const row of shape) for (const cell of row) if (cell) area++;
		return area;
	}
	private isRotationallyInvariant(shape: number[][]): boolean {
		return this.getAllRotations(shape).length === 1;
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
	private canPlace(regionGrid: boolean[][], shape: number[][], r: number, c: number): boolean {
		for (let i = 0; i < shape.length; i++)
			for (let j = 0; j < shape[0].length; j++)
				if (shape[i][j]) {
					const nr = r + i,
						nc = c + j;
					if (nr < 0 || nr >= regionGrid.length || nc < 0 || nc >= regionGrid[0].length || !regionGrid[nr][nc]) return false;
				}
		return true;
	}
	private placePiece(regionGrid: boolean[][], shape: number[][], r: number, c: number, value: boolean) {
		for (let i = 0; i < shape.length; i++) for (let j = 0; j < shape[0].length; j++) if (shape[i][j]) regionGrid[r + i][c + j] = value;
	}
	private isSameShape(s1: number[][], s2: number[][]): boolean {
		const rotations = this.getAllRotations(s1);
		const s2Str = JSON.stringify(s2);
		return rotations.some((r) => JSON.stringify(r) === s2Str);
	}
	private countRegionNonEraserSymbols(grid: Grid, region: Point[]): number {
		let count = 0;
		for (const cell of region) {
			const type = grid.cells[cell.y][cell.x].type;
			if (type !== CellType.None && type !== CellType.Eraser) count++;
		}
		return count;
	}

	private hasRegionTetrisSymbol(grid: Grid, region: Point[]): boolean {
		for (const cell of region) {
			const type = grid.cells[cell.y][cell.x].type;
			if (type === CellType.Tetris || type === CellType.TetrisRotated) return true;
		}
		return false;
	}

	private canPlaceGeneratedTetrisNegative(grid: Grid, region: Point[], potentialCells: Point[]): boolean {
		if (potentialCells.length < 1) return false;
		if (this.hasRegionTetrisSymbol(grid, region)) return true;
		// 既存テトリスが無い場合は、対応するテトリスを別セルに置ける空きが必要
		return potentialCells.length >= 2;
	}

	private canPlaceGeneratedEraser(grid: Grid, region: Point[], potentialCells: Point[]): boolean {
		if (potentialCells.length < 1) return false;
		if (this.countRegionNonEraserSymbols(grid, region) > 0) return true;
		// 既存の消去対象が無い場合は、対応要素を置くための空きを最低1セル確保する
		return potentialCells.length >= 2;
	}
	private canTilePieceWith(p: number[][], t: number[][], n: number[][]): boolean {
		const areaP = this.getShapeArea(p);
		const areaT = this.getShapeArea(t);
		const areaN = this.getShapeArea(n);
		if (areaP !== areaT + areaN) return false;

		const rotationsT = this.getAllRotations(t);
		const rotationsN = this.getAllRotations(n);
		const hP = p.length,
			wP = p[0].length;

		for (const rt of rotationsT) {
			for (const rn of rotationsN) {
				const hT = rt.length,
					wT = rt[0].length;
				const hN = rn.length,
					wN = rn[0].length;
				for (let rT = 0; rT <= hP - hT; rT++) {
					for (let cT = 0; cT <= wP - wT; cT++) {
						for (let rN = 0; rN <= hP - hN; rN++) {
							for (let cN = 0; cN <= wP - wN; cN++) {
								const grid = Array.from({ length: hP }, () => Array(wP).fill(0));
								let possible = true;
								// Place T
								for (let r = 0; r < hT; r++) {
									for (let c = 0; c < wT; c++) {
										if (rt[r][c]) grid[rT + r][cT + c] = 1;
									}
								}
								// Place N
								for (let r = 0; r < hN; r++) {
									for (let c = 0; c < wN; c++) {
										if (rn[r][c]) {
											if (grid[rN + r][cN + c]) {
												possible = false;
												break;
											}
											grid[rN + r][cN + c] = 1;
										}
									}
									if (!possible) break;
								}
								if (possible) {
									// Check if matches P
									let matches = true;
									for (let r = 0; r < hP; r++) {
										for (let c = 0; c < wP; c++) {
											if (grid[r][c] !== p[r][c]) {
												matches = false;
												break;
											}
										}
										if (!matches) break;
									}
									if (matches) return true;
								}
							}
						}
					}
				}
			}
		}
		return false;
	}
	private findStandardTriple(t: number[][]): { p: number[][]; n: number[][] } | null {
		const areaT = this.getShapeArea(t);
		const nCandidates = [...this.TETRIS_SHAPES];
		this.shuffleArray(nCandidates);

		for (const n of nCandidates) {
			const areaN = this.getShapeArea(n);
			const areaP = areaT + areaN;
			if (areaP > 5) continue;
			const pCandidates = this.TETRIS_SHAPES.filter((s) => this.getShapeArea(s) === areaP);
			for (const p of pCandidates) {
				if (this.canTilePieceWith(p, t, n)) return { p, n };
			}
		}
		return null;
	}
	private shuffleArray<T>(array: T[]) {
		for (let i = array.length - 1; i > 0; i--) {
			const j = Math.floor(this.rng!.next() * (i + 1));
			[array[i], array[j]] = [array[j], array[i]];
		}
	}
}
