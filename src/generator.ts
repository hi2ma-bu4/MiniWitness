import { Grid } from "./grid";
import { CellType, Color, type EdgeConstraint, EdgeType, type GenerationOptions, NodeType, type Point } from "./types";
import { PuzzleValidator } from "./validator";

export class PuzzleGenerator {
	/**
	 * パズルを生成する
	 * @param rows 行数
	 * @param cols 列数
	 * @param options 生成オプション
	 */
	public generate(rows: number, cols: number, options: GenerationOptions = {}): Grid {
		const targetDifficulty = options.difficulty ?? 0.5;
		const validator = new PuzzleValidator();

		let bestGrid: Grid | null = null;
		let bestScore = -1;

		// グリッドサイズに応じて試行回数を調整
		const maxAttempts = rows * cols > 30 ? 30 : 60;

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const grid = this.generateOnce(rows, cols, options);

			// 全ての要求された制約タイプが含まれているかチェック
			if (!this.checkAllRequestedConstraintsPresent(grid, options)) {
				continue;
			}

			const difficulty = validator.calculateDifficulty(grid);

			if (difficulty === 0) continue;

			const diffFromTarget = Math.abs(difficulty - targetDifficulty);

			// より目標に近いものを採用
			if (bestGrid === null || diffFromTarget < Math.abs(bestScore - targetDifficulty)) {
				bestScore = difficulty;
				bestGrid = grid;
			}

			// 非常に高い難易度が求められていて、十分なスコアが得られたら終了
			if (targetDifficulty > 0.8 && difficulty > 0.8) break;
			// 十分に近いものが得られたら終了
			if (diffFromTarget < 0.05) break;
		}

		return bestGrid || this.generateOnce(rows, cols, options);
	}

	private generateOnce(rows: number, cols: number, options: GenerationOptions): Grid {
		const grid = new Grid(rows, cols);

		// 1. スタートとゴールの設定 (通常は左下スタート、右上ゴールなど)
		const startPoint: Point = { x: 0, y: rows }; // 左下
		const endPoint: Point = { x: cols, y: 0 }; // 右上

		grid.nodes[startPoint.y][startPoint.x].type = NodeType.Start;
		grid.nodes[endPoint.y][endPoint.x].type = NodeType.End;

		// 2. 正解パスを生成 (ランダムウォーク / DFS)
		const solutionPath = this.generateRandomPath(grid, startPoint, endPoint);

		// 3. パスに基づいて制約（ルール）を配置
		// パスが通過するエッジにヘキサゴンを置いたり、分割された領域に色を塗る
		this.applyConstraintsBasedOnPath(grid, solutionPath, options);

		// 4. 切断（Broken/Absent）を配置
		if (options.useBrokenEdges) {
			this.applyBrokenEdges(grid, solutionPath, options);
		}

		// 5. 浮島の削除と外周の調整
		this.cleanGrid(grid);

		return grid;
	}

	/**
	 * Randomized DFSを用いてStartからEndへの一本道を生成する
	 */
	private generateRandomPath(grid: Grid, start: Point, end: Point): Point[] {
		const visited = new Set<string>();
		const path: Point[] = [];

		const stack: Point[] = [start];
		const parentMap = new Map<string, Point | null>();
		parentMap.set(`${start.x},${start.y}`, null);

		// 完全なランダムではなく、ゴール方向へ向かうバイアスをかけることも可能だが
		// ここでは単純なバックトラッキング付きDFSで探索する

		const findPath = (current: Point): boolean => {
			visited.add(`${current.x},${current.y}`);
			path.push(current);

			if (current.x === end.x && current.y === end.y) {
				return true;
			}

			// 次の候補を取得
			const neighbors = this.getValidNeighbors(grid, current, visited);
			// ランダムにシャッフル
			this.shuffleArray(neighbors);

			for (const next of neighbors) {
				if (findPath(next)) {
					return true;
				}
			}

			// 行き止まりならバックトラック
			path.pop();
			return false;
		};

		// 確実にパスを見つけるため、簡易的な実装としています。
		// 本格的なWitnessパズルでは「長く蛇行するパス」が好ましいため、
		// 実際にはPrim法などで全域木を作ってからパスを切り出す手法が推奨されます。
		// ここでは基本的なDFS探索を行います。
		findPath(start);

		return path;
	}

	private getValidNeighbors(grid: Grid, p: Point, visited: Set<string>): Point[] {
		const candidates: Point[] = [];
		const directions = [
			{ x: 0, y: -1 }, // Up
			{ x: 1, y: 0 }, // Right
			{ x: 0, y: 1 }, // Down
			{ x: -1, y: 0 }, // Left
		];

		for (const d of directions) {
			const nx = p.x + d.x;
			const ny = p.y + d.y;

			if (nx >= 0 && nx <= grid.cols && ny >= 0 && ny <= grid.rows) {
				if (!visited.has(`${nx},${ny}`)) {
					candidates.push({ x: nx, y: ny });
				}
			}
		}
		return candidates;
	}

	private applyBrokenEdges(grid: Grid, path: Point[], options: GenerationOptions) {
		const complexity = options.complexity ?? 0.5;
		const pathEdges = new Set<string>();
		for (let i = 0; i < path.length - 1; i++) {
			pathEdges.add(this.getEdgeKey(path[i], path[i + 1]));
		}

		// パスに使われていないエッジを収集
		const unusedEdges: { type: "h" | "v"; r: number; c: number; p1: Point; p2: Point }[] = [];
		for (let r = 0; r <= grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				const p1 = { x: c, y: r };
				const p2 = { x: c + 1, y: r };
				if (!pathEdges.has(this.getEdgeKey(p1, p2))) {
					unusedEdges.push({ type: "h", r, c, p1, p2 });
				}
			}
		}
		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c <= grid.cols; c++) {
				const p1 = { x: c, y: r };
				const p2 = { x: c, y: r + 1 };
				if (!pathEdges.has(this.getEdgeKey(p1, p2))) {
					unusedEdges.push({ type: "v", r, c, p1, p2 });
				}
			}
		}

		this.shuffleArray(unusedEdges);

		// 最小限の設置 (1〜3個程度、または複雑度に応じて)
		const targetCount = Math.max(1, Math.floor(complexity * 4));
		let placed = 0;

		for (const edge of unusedEdges) {
			if (placed >= targetCount) break;

			// 80%の確率でBroken(1), 20%の確率でAbsent(2)
			let type = Math.random() < 0.8 ? EdgeType.Broken : EdgeType.Absent;

			// マークが含まれるマスの外周でAbsentは禁止
			if (type === EdgeType.Absent && this.isAdjacentToMark(grid, edge)) {
				type = EdgeType.Broken;
			}

			if (edge.type === "h") {
				grid.hEdges[edge.r][edge.c].type = type;
			} else {
				grid.vEdges[edge.r][edge.c].type = type;
			}
			placed++;
		}

		// 十字部分で4方向（または隅の全方向）全てがBroken,Absentの場合はその4方向はAbsentにする
		// ただし、マークの周囲はAbsent禁止
		for (let r = 0; r <= grid.rows; r++) {
			for (let c = 0; c <= grid.cols; c++) {
				const edgesWithMeta: { e: EdgeConstraint; type: "h" | "v"; r: number; c: number }[] = [];
				if (c > 0) edgesWithMeta.push({ e: grid.hEdges[r][c - 1], type: "h", r, c: c - 1 });
				if (c < grid.cols) edgesWithMeta.push({ e: grid.hEdges[r][c], type: "h", r, c });
				if (r > 0) edgesWithMeta.push({ e: grid.vEdges[r - 1][c], type: "v", r: r - 1, c });
				if (r < grid.rows) edgesWithMeta.push({ e: grid.vEdges[r][c], type: "v", r, c });

				const allCuts = edgesWithMeta.every((m) => m.e.type === EdgeType.Broken || m.e.type === EdgeType.Absent);
				if (allCuts) {
					// マークの周囲でないか確認
					const noneNearMark = edgesWithMeta.every((m) => !this.isAdjacentToMark(grid, m));
					if (noneNearMark) {
						for (const m of edgesWithMeta) {
							m.e.type = EdgeType.Absent;
						}
					}
				}
			}
		}
	}

	private cleanGrid(grid: Grid) {
		// 1. 浮島（スタートから辿れないノード・エッジ）をAbsentに変換
		const startNodes: { x: number; y: number }[] = [];
		for (let r = 0; r <= grid.rows; r++) {
			for (let c = 0; c <= grid.cols; c++) {
				if (grid.nodes[r][c].type === NodeType.Start) {
					startNodes.push({ x: c, y: r });
				}
			}
		}

		const reachableNodes = new Set<string>();
		const queue: { x: number; y: number }[] = [...startNodes];
		for (const p of startNodes) reachableNodes.add(`${p.x},${p.y}`);

		while (queue.length > 0) {
			const curr = queue.shift()!;
			const neighbors = [
				{ nx: curr.x, ny: curr.y - 1, edge: grid.vEdges[curr.y - 1]?.[curr.x] }, // Up
				{ nx: curr.x, ny: curr.y + 1, edge: grid.vEdges[curr.y]?.[curr.x] }, // Down
				{ nx: curr.x - 1, ny: curr.y, edge: grid.hEdges[curr.y]?.[curr.x - 1] }, // Left
				{ nx: curr.x + 1, ny: curr.y, edge: grid.hEdges[curr.y]?.[curr.x] }, // Right
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

		// 辿れないエッジをAbsentに
		for (let r = 0; r <= grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				if (!reachableNodes.has(`${c},${r}`) || !reachableNodes.has(`${c + 1},${r}`)) {
					grid.hEdges[r][c].type = EdgeType.Absent;
				}
			}
		}
		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c <= grid.cols; c++) {
				if (!reachableNodes.has(`${c},${r}`) || !reachableNodes.has(`${c},${r + 1}`)) {
					grid.vEdges[r][c].type = EdgeType.Absent;
				}
			}
		}

		// 2. 外周からリークしているセルのマークを削除
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
			// 上のセル
			if (edge.r > 0 && grid.cells[edge.r - 1][edge.c].type !== CellType.None) return true;
			// 下のセル
			if (edge.r < grid.rows && grid.cells[edge.r][edge.c].type !== CellType.None) return true;
		} else {
			// 左のセル
			if (edge.c > 0 && grid.cells[edge.r][edge.c - 1].type !== CellType.None) return true;
			// 右のセル
			if (edge.c < grid.cols && grid.cells[edge.r][edge.c].type !== CellType.None) return true;
		}
		return false;
	}

	private hasIsolatedMark(grid: Grid): boolean {
		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				if (grid.cells[r][c].type === CellType.None) continue;

				// Check 4 edges of this cell
				const edges = [
					grid.hEdges[r][c], // Top
					grid.hEdges[r + 1][c], // Bottom
					grid.vEdges[r][c], // Left
					grid.vEdges[r][c + 1], // Right
				];

				const passableCount = edges.filter((e) => e.type === EdgeType.Normal || e.type === EdgeType.Hexagon).length;
				if (passableCount === 0) return true;
			}
		}
		return false;
	}

	private getEdgeKey(p1: Point, p2: Point): string {
		return p1.x < p2.x || (p1.x === p2.x && p1.y < p2.y) ? `${p1.x},${p1.y}-${p2.x},${p2.y}` : `${p2.x},${p2.y}-${p1.x},${p1.y}`;
	}

	private TETRIS_SHAPES = [
		[[1]], // 1x1
		[[1, 1]], // 1x2
		[[1, 1, 1]], // 1x3
		[
			[1, 1],
			[1, 0],
		], // L-3
		[
			[0, 1],
			[1, 0],
		], // 斜め2x2
		[[1, 1, 1, 1]], // I
		[
			[1, 1],
			[1, 1],
		], // O
		[
			[1, 1, 1],
			[0, 1, 0],
		], // T-2
		[
			[1, 1, 0],
			[0, 1, 1],
		], // Z-2
		[
			[1, 1, 1],
			[1, 0, 0],
		], // L
		[
			[1, 1, 1],
			[0, 0, 1],
		], // L-i
		[
			[1, 1, 1],
			[1, 0, 1],
		], // コ
		[
			[0, 1, 0],
			[1, 0, 1],
		], // 斜め2x3
		[
			[1, 0, 0, 1],
			[1, 0, 0, 1],
		], // サンドイッチ
		[
			[1, 1, 1],
			[0, 1, 0],
			[0, 1, 0],
		], // T
		[
			[1, 1, 0],
			[0, 1, 0],
			[0, 1, 1],
		], // Z
		[
			[0, 1, 1],
			[0, 1, 0],
			[1, 1, 0],
		], // Z-i
		[
			[1, 1, 1],
			[1, 0, 1],
			[1, 1, 1],
		], // ロ
	];

	private applyConstraintsBasedOnPath(grid: Grid, path: Point[], options: GenerationOptions) {
		const complexity = options.complexity ?? 0.5;
		const useHexagons = options.useHexagons ?? true;
		const useSquares = options.useSquares ?? true;
		const useStars = options.useStars ?? true;
		const useTetris = options.useTetris ?? false;

		let hexagonsPlaced = 0;
		let squaresPlaced = 0;
		let starsPlaced = 0;
		let tetrisPlaced = 0;
		let totalTetrisArea = 0;
		const maxTotalTetrisArea = Math.floor(grid.rows * grid.cols * 0.45); // グリッド全体の最大45%まで

		// A. パス上のヘキサゴン (Hexagon) 配置
		if (useHexagons) {
			const targetDifficulty = options.difficulty ?? 0.5;
			for (let i = 0; i < path.length - 1; i++) {
				const p1 = path[i];
				const p2 = path[i + 1];

				const neighbors = this.getValidNeighbors(grid, p1, new Set());
				const isBranching = neighbors.length > 2;

				let prob = complexity * 0.4;
				if (isBranching) {
					prob = targetDifficulty < 0.4 ? prob * 1.0 : prob * 0.5;
				}

				if (Math.random() < prob) {
					this.setEdgeHexagon(grid, p1, p2);
					hexagonsPlaced++;
				}
			}

			// 強制配置：一つも置かれなかった場合
			if (hexagonsPlaced === 0 && path.length >= 2) {
				const idx = Math.floor(Math.random() * (path.length - 1));
				this.setEdgeHexagon(grid, path[idx], path[idx + 1]);
			}
		}

		// B. 領域ごとの制約配置 (Squares & Stars)

		if (useSquares || useStars) {
			const regions = this.calculateRegions(grid, path);
			const availableColors = [Color.Black, Color.White, Color.Red, Color.Blue];

			// シャッフルして、強制配置が必要な場合に備える
			const regionIndices = Array.from({ length: regions.length }, (_, i) => i);
			this.shuffleArray(regionIndices);

			for (const idx of regionIndices) {
				const region = regions[idx];
				// 難易度が高い場合は制約をスキップしにくくする
				const skipProb = (options.difficulty ?? 0.5) > 0.7 ? 0.4 : 0.2;

				// 強制配置が必要な場合（最後の方の領域でまだ何も置かれていない場合）はスキップしない
				const forceOne = (useSquares && squaresPlaced === 0) || (useStars && starsPlaced === 0) || (useTetris && tetrisPlaced === 0);
				const isLastFew = idx === regionIndices[regionIndices.length - 1];

				if (!forceOne || !isLastFew) {
					if (Math.random() > skipProb + complexity * 0.5) continue;
				}

				const potentialCells = [...region];
				this.shuffleArray(potentialCells);

				// 1. この領域の四角形(Square)の色を決定 (1色のみ)
				let squareColor = availableColors[Math.floor(Math.random() * availableColors.length)];

				// トゲがなく2色目が必要な場合、違う色を選ぶ
				if (useSquares && !useStars && isLastFew) {
					const currentColors = new Set<number>();
					for (let r = 0; r < grid.rows; r++) {
						for (let c = 0; c < grid.cols; c++) {
							if (grid.cells[r][c].type === CellType.Square) currentColors.add(grid.cells[r][c].color);
						}
					}
					if (currentColors.size === 1) {
						const otherColors = availableColors.filter((c) => !currentColors.has(c));
						if (otherColors.length > 0) {
							squareColor = otherColors[Math.floor(Math.random() * otherColors.length)];
						}
					}
				}

				let numSquares = 0;

				// 四角形を配置するか決定
				let shouldPlaceSquare = useSquares && Math.random() < 0.5 + complexity * 0.3;
				if (useSquares && squaresPlaced === 0 && isLastFew) shouldPlaceSquare = true;

				// トゲがなく四角が必要な場合、最低でも2つの領域に四角を置くように誘導
				if (useSquares && !useStars && isLastFew) {
					const currentColors = new Set<number>();
					for (let r = 0; r < grid.rows; r++) {
						for (let c = 0; c < grid.cols; c++) {
							if (grid.cells[r][c].type === CellType.Square) currentColors.add(grid.cells[r][c].color);
						}
					}
					if (currentColors.size < 2 && squaresPlaced > 0) {
						shouldPlaceSquare = true;
					}
				}

				if (shouldPlaceSquare) {
					const maxSquares = Math.min(potentialCells.length, 4);
					numSquares = Math.floor(Math.random() * maxSquares);
					if (numSquares === 0 && squaresPlaced === 0) numSquares = 1;

					for (let i = 0; i < numSquares; i++) {
						if (potentialCells.length === 0) break;
						const cell = potentialCells.pop()!;
						grid.cells[cell.y][cell.x].type = CellType.Square;
						grid.cells[cell.y][cell.x].color = squareColor;
						squaresPlaced++;
					}
				}

				// 2. テトリス(Tetris)を配置するか決定
				if (useTetris && totalTetrisArea < maxTotalTetrisArea) {
					// 複雑度が高いほどテトリスが配置されやすくなる
					let shouldPlaceTetris = Math.random() < 0.1 + complexity * 0.4;
					if (tetrisPlaced === 0 && isLastFew) shouldPlaceTetris = true;

					// あまりに大きい領域はテトリスで埋めるのが大変、かつ解答が自明になりやすいため制限
					// ただし、一つも置かれていない場合は少し制限を緩める
					const maxTetrisPerRegion = tetrisPlaced === 0 && isLastFew ? 6 : 4;
					if (shouldPlaceTetris && potentialCells.length > 0 && region.length <= maxTetrisPerRegion * 4 && totalTetrisArea + region.length <= maxTotalTetrisArea) {
						// 領域全体をテトリスで埋める必要がある
						// 実際にタイリング可能か試行しながらピースを選ぶ
						const tiledPieces = this.generateTiling(region, maxTetrisPerRegion, options);

						if (tiledPieces) {
							for (const p of tiledPieces) {
								if (potentialCells.length === 0) break;
								const cell = potentialCells.pop()!;
								grid.cells[cell.y][cell.x].type = p.isRotated ? CellType.TetrisRotated : CellType.Tetris;
								// 回転可能な場合は初期状態（baseShape）を、固定の場合は使用された形状を表示する
								grid.cells[cell.y][cell.x].shape = p.isRotated ? p.displayShape : p.shape;
								grid.cells[cell.y][cell.x].color = Color.None;
								tetrisPlaced++;
							}
							totalTetrisArea += region.length;
						}
					}
				}

				// 3. 各色についてトゲ(Star)を配置するか決定
				if (useStars) {
					for (const color of availableColors) {
						if (potentialCells.length < 1) break;

						let shouldPlaceStar = Math.random() < 0.2 + complexity * 0.3;
						if (starsPlaced === 0 && isLastFew) shouldPlaceStar = true;

						if (!shouldPlaceStar) continue;

						// 星のペア判定にテトリスもカウントする
						const tetrisInRegion = region.map((p) => grid.cells[p.y][p.x]).filter((c) => c.type === CellType.Tetris || c.type === CellType.TetrisRotated);
						let existingColorCount = 0;
						if (color === squareColor) existingColorCount += numSquares;
						existingColorCount += tetrisInRegion.filter((c) => c.color === color).length;

						if (existingColorCount === 1) {
							const cell = potentialCells.pop()!;
							grid.cells[cell.y][cell.x].type = CellType.Star;
							grid.cells[cell.y][cell.x].color = color;
							starsPlaced++;
						} else if (existingColorCount === 0) {
							// まだペア対象がない場合、50%の確率でテトリスの一つに色を付けてペアにする
							// ただし、テトリスは青色禁止 (減算用)
							const uncoloredTetris = tetrisInRegion.filter((c) => c.color === Color.None);
							if (color !== Color.Blue && Math.random() < 0.5 && uncoloredTetris.length > 0) {
								const t = uncoloredTetris[Math.floor(Math.random() * uncoloredTetris.length)];
								t.color = color;
								const cell = potentialCells.pop()!;
								grid.cells[cell.y][cell.x].type = CellType.Star;
								grid.cells[cell.y][cell.x].color = color;
								starsPlaced++;
							} else if (potentialCells.length >= 2) {
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

			// まだ足りない場合の最終手段 (1x1領域などで星が置けなかった場合など)
			if (useStars && starsPlaced === 0) {
				for (const region of regions) {
					if (region.length >= 2) {
						const potentialCells = [...region].filter((p) => grid.cells[p.y][p.x].type === CellType.None);
						if (potentialCells.length >= 2) {
							const color = availableColors[Math.floor(Math.random() * availableColors.length)];
							for (let i = 0; i < 2; i++) {
								const cell = potentialCells.pop()!;
								grid.cells[cell.y][cell.x].type = CellType.Star;
								grid.cells[cell.y][cell.x].color = color;
								starsPlaced++;
							}
							break;
						}
					}
				}
			}
		}
	}

	/**
	 * パスを壁と見なして、セル（Block）の領域分割を行う (Flood Fill)
	 */
	private calculateRegions(grid: Grid, path: Point[]): Point[][] {
		const regions: Point[][] = [];
		const visitedCells = new Set<string>();

		// パスを検索しやすい形式に変換 (エッジ集合)
		const pathEdges = new Set<string>();
		for (let i = 0; i < path.length - 1; i++) {
			const p1 = path[i];
			const p2 = path[i + 1];
			// エッジを一意なキーにする (小さい座標 -> 大きい座標)
			const k = p1.x < p2.x || p1.y < p2.y ? `${p1.x},${p1.y}-${p2.x},${p2.y}` : `${p2.x},${p2.y}-${p1.x},${p1.y}`;
			pathEdges.add(k);
		}

		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				if (visitedCells.has(`${c},${r}`)) continue;

				const currentRegion: Point[] = [];
				const queue: Point[] = [{ x: c, y: r }];
				visitedCells.add(`${c},${r}`);

				while (queue.length > 0) {
					const cell = queue.shift()!;
					currentRegion.push(cell);

					// 4方向の隣接セルを確認
					const neighbors = [
						{ dx: 0, dy: -1, boundary: { p1: { x: cell.x, y: cell.y }, p2: { x: cell.x + 1, y: cell.y } } }, // Up (Boundary is Top edge)
						{ dx: 0, dy: 1, boundary: { p1: { x: cell.x, y: cell.y + 1 }, p2: { x: cell.x + 1, y: cell.y + 1 } } }, // Down (Boundary is Bottom edge)
						{ dx: -1, dy: 0, boundary: { p1: { x: cell.x, y: cell.y }, p2: { x: cell.x, y: cell.y + 1 } } }, // Left (Boundary is Left edge)
						{ dx: 1, dy: 0, boundary: { p1: { x: cell.x + 1, y: cell.y }, p2: { x: cell.x + 1, y: cell.y + 1 } } }, // Right (Boundary is Right edge)
					];

					for (const n of neighbors) {
						const nx = cell.x + n.dx;
						const ny = cell.y + n.dy;

						// 盤面内か
						if (nx >= 0 && nx < grid.cols && ny >= 0 && ny < grid.rows) {
							if (!visitedCells.has(`${nx},${ny}`)) {
								// パス（壁）またはAbsentエッジで遮られていないかチェック
								const key = n.boundary.p1.x < n.boundary.p2.x || n.boundary.p1.y < n.boundary.p2.y ? `${n.boundary.p1.x},${n.boundary.p1.y}-${n.boundary.p2.x},${n.boundary.p2.y}` : `${n.boundary.p2.x},${n.boundary.p2.y}-${n.boundary.p1.x},${n.boundary.p1.y}`;

								if (!pathEdges.has(key) && !this.isAbsentEdge(grid, n.boundary.p1, n.boundary.p2)) {
									visitedCells.add(`${nx},${ny}`);
									queue.push({ x: nx, y: ny });
								}
							}
						}
					}
				}
				regions.push(currentRegion);
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

	private setEdgeHexagon(grid: Grid, p1: Point, p2: Point) {
		if (p1.x === p2.x) {
			// Vertical
			const y = Math.min(p1.y, p2.y);
			grid.vEdges[y][p1.x].type = EdgeType.Hexagon;
		} else {
			// Horizontal
			const x = Math.min(p1.x, p2.x);
			grid.hEdges[p1.y][x].type = EdgeType.Hexagon;
		}
	}

	private checkAllRequestedConstraintsPresent(grid: Grid, options: GenerationOptions): boolean {
		const useHexagons = options.useHexagons ?? true;
		const useSquares = options.useSquares ?? true;
		const useStars = options.useStars ?? true;
		const useTetris = options.useTetris ?? false;
		const useBrokenEdges = options.useBrokenEdges ?? false;

		if (useBrokenEdges) {
			let found = false;
			for (let r = 0; r <= grid.rows; r++) {
				for (let c = 0; c < grid.cols; c++) {
					if (grid.hEdges[r][c].type === EdgeType.Broken || grid.hEdges[r][c].type === EdgeType.Absent) {
						found = true;
						break;
					}
				}
				if (found) break;
			}
			if (!found) {
				for (let r = 0; r < grid.rows; r++) {
					for (let c = 0; c <= grid.cols; c++) {
						if (grid.vEdges[r][c].type === EdgeType.Broken || grid.vEdges[r][c].type === EdgeType.Absent) {
							found = true;
							break;
						}
					}
					if (found) break;
				}
			}
			if (!found) return false;
		}

		if (useHexagons) {
			let found = false;
			for (let r = 0; r <= grid.rows; r++) {
				for (let c = 0; c < grid.cols; c++) {
					if (grid.hEdges[r][c].type === EdgeType.Hexagon) {
						found = true;
						break;
					}
				}
				if (found) break;
			}
			if (!found) {
				for (let r = 0; r < grid.rows; r++) {
					for (let c = 0; c <= grid.cols; c++) {
						if (grid.vEdges[r][c].type === EdgeType.Hexagon) {
							found = true;
							break;
						}
					}
					if (found) break;
				}
			}
			if (!found) return false;
		}

		if (useSquares || useStars || useTetris) {
			let foundSquare = false;
			let foundStar = false;
			let foundTetris = false;
			const squareColors = new Set<number>();

			for (let r = 0; r < grid.rows; r++) {
				for (let c = 0; c < grid.cols; c++) {
					if (grid.cells[r][c].type === CellType.Square) {
						foundSquare = true;
						squareColors.add(grid.cells[r][c].color);
					}
					if (grid.cells[r][c].type === CellType.Star) foundStar = true;
					if (grid.cells[r][c].type === CellType.Tetris || grid.cells[r][c].type === CellType.TetrisRotated) {
						foundTetris = true;
					}
				}
			}
			if (useSquares && !foundSquare) return false;
			if (useStars && !foundStar) return false;
			if (useTetris && !foundTetris) return false;

			// トゲが存在する場合を除き、四角が1色のみで生成されるのはパズルとして破綻しているので2色以上必要
			if (foundSquare && !foundStar && squareColors.size < 2) {
				return false;
			}
		}

		// マークの周囲全てが通行不可の盤面は非推奨
		if (this.hasIsolatedMark(grid)) return false;

		return true;
	}

	/**
	 * 領域を指定されたピース数以内でタイリングする。成功すればピースのリストを返す。
	 */
	private generateTiling(region: Point[], maxPieces: number, options: GenerationOptions): { shape: number[][]; displayShape: number[][]; isRotated: boolean }[] | null {
		const minX = Math.min(...region.map((p) => p.x));
		const minY = Math.min(...region.map((p) => p.y));
		const maxX = Math.max(...region.map((p) => p.x));
		const maxY = Math.max(...region.map((p) => p.y));
		const width = maxX - minX + 1;
		const height = maxY - minY + 1;

		const regionGrid = Array.from({ length: height }, () => Array(width).fill(false));
		for (const p of region) {
			regionGrid[p.y - minY][p.x - minX] = true;
		}

		return this.tilingDfs(regionGrid, [], maxPieces, options);
	}

	private tilingDfs(regionGrid: boolean[][], currentPieces: { shape: number[][]; displayShape: number[][]; isRotated: boolean }[], maxPieces: number, options: GenerationOptions): { shape: number[][]; displayShape: number[][]; isRotated: boolean }[] | null {
		// 見つかっていない最初のマスを探す
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

		// 全て埋まった
		if (r0 === -1) return currentPieces;

		// ピース上限
		if (currentPieces.length >= maxPieces) return null;

		const difficulty = options.difficulty ?? 0.5;

		// シャッフルした形状リストで試す
		let shapes = [...this.TETRIS_SHAPES];
		this.shuffleArray(shapes);

		// 難易度が高い場合、小さいピース（面積1や2）の優先度を下げる
		if (difficulty > 0.6) {
			shapes.sort((a, b) => {
				const areaA = this.getShapeArea(a);
				const areaB = this.getShapeArea(b);
				if (areaA <= 2 && areaB > 2) return 1;
				if (areaB <= 2 && areaA > 2) return -1;
				return 0;
			});
		}

		for (const baseShape of shapes) {
			// 回転パターンを生成
			const isInvariant = this.isRotationallyInvariant(baseShape);
			const rotations = isInvariant ? [baseShape] : this.getAllRotations(baseShape);
			this.shuffleArray(rotations);

			for (const shape of rotations) {
				// ピース内の各ブロックを (r0, c0) に合わせてみる
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

						// 難易度が高いほど回転可能なピースが出現しやすくなる
						const rotProb = 0.3 + difficulty * 0.6;
						const isRotated = !isInvariant && Math.random() < rotProb;

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
		for (const row of shape) {
			for (const cell of row) {
				if (cell) area++;
			}
		}
		return area;
	}

	private isRotationallyInvariant(shape: number[][]): boolean {
		const area = this.getShapeArea(shape);
		// 1x1 or 2x2 full square
		return area === 1 || (area === 4 && shape.length === 2 && shape[0].length === 2);
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
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				newShape[c][rows - 1 - r] = shape[r][c];
			}
		}
		return newShape;
	}

	private canPlace(regionGrid: boolean[][], shape: number[][], r: number, c: number): boolean {
		for (let i = 0; i < shape.length; i++) {
			for (let j = 0; j < shape[0].length; j++) {
				if (shape[i][j]) {
					const nr = r + i;
					const nc = c + j;
					if (nr < 0 || nr >= regionGrid.length || nc < 0 || nc >= regionGrid[0].length || !regionGrid[nr][nc]) {
						return false;
					}
				}
			}
		}
		return true;
	}

	private placePiece(regionGrid: boolean[][], shape: number[][], r: number, c: number, value: boolean) {
		for (let i = 0; i < shape.length; i++) {
			for (let j = 0; j < shape[0].length; j++) {
				if (shape[i][j]) {
					regionGrid[r + i][c + j] = value;
				}
			}
		}
	}

	private shuffleArray(array: any[]) {
		for (let i = array.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[array[i], array[j]] = [array[j], array[i]];
		}
	}
}
