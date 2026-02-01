import { Grid } from "./grid";
import { CellType, Color, EdgeType, type GenerationOptions, NodeType, type Point } from "./types";
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

	private applyConstraintsBasedOnPath(grid: Grid, path: Point[], options: GenerationOptions) {
		const complexity = options.complexity ?? 0.5;
		const useHexagons = options.useHexagons ?? true;
		const useSquares = options.useSquares ?? true;
		const useStars = options.useStars ?? true;

		let hexagonsPlaced = 0;
		let squaresPlaced = 0;
		let starsPlaced = 0;

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
				const forceOne = (useSquares && squaresPlaced === 0) || (useStars && starsPlaced === 0);
				const isLastFew = idx === regionIndices[regionIndices.length - 1];

				if (!forceOne || !isLastFew) {
					if (Math.random() > skipProb + complexity * 0.5) continue;
				}

				const potentialCells = [...region];
				this.shuffleArray(potentialCells);

				// 1. この領域の四角形(Square)の色を決定 (1色のみ)
				const squareColor = availableColors[Math.floor(Math.random() * availableColors.length)];
				let numSquares = 0;

				// 四角形を配置するか決定
				let shouldPlaceSquare = useSquares && Math.random() < 0.5 + complexity * 0.3;
				if (useSquares && squaresPlaced === 0 && isLastFew) shouldPlaceSquare = true;

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

				// 2. 各色についてトゲ(Star)を配置するか決定
				if (useStars) {
					for (const color of availableColors) {
						if (potentialCells.length < 1) break;

						let shouldPlaceStar = Math.random() < 0.2 + complexity * 0.3;
						if (starsPlaced === 0 && isLastFew) shouldPlaceStar = true;

						if (!shouldPlaceStar) continue;

						if (color === squareColor) {
							if (numSquares === 1 && potentialCells.length >= 1) {
								const cell = potentialCells.pop()!;
								grid.cells[cell.y][cell.x].type = CellType.Star;
								grid.cells[cell.y][cell.x].color = color;
								starsPlaced++;
							} else if (numSquares === 0 && potentialCells.length >= 2) {
								for (let i = 0; i < 2; i++) {
									const cell = potentialCells.pop()!;
									grid.cells[cell.y][cell.x].type = CellType.Star;
									grid.cells[cell.y][cell.x].color = color;
									starsPlaced++;
								}
							}
						} else {
							if (potentialCells.length >= 2) {
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
								// パス（壁）で遮られていないかチェック
								const key = n.boundary.p1.x < n.boundary.p2.x || n.boundary.p1.y < n.boundary.p2.y ? `${n.boundary.p1.x},${n.boundary.p1.y}-${n.boundary.p2.x},${n.boundary.p2.y}` : `${n.boundary.p2.x},${n.boundary.p2.y}-${n.boundary.p1.x},${n.boundary.p1.y}`;

								if (!pathEdges.has(key)) {
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

		if (useSquares || useStars) {
			let foundSquare = false;
			let foundStar = false;
			for (let r = 0; r < grid.rows; r++) {
				for (let c = 0; c < grid.cols; c++) {
					if (grid.cells[r][c].type === CellType.Square) foundSquare = true;
					if (grid.cells[r][c].type === CellType.Star) foundStar = true;
				}
			}
			if (useSquares && !foundSquare) return false;
			if (useStars && !foundStar) return false;
		}

		return true;
	}

	private shuffleArray(array: any[]) {
		for (let i = array.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[array[i], array[j]] = [array[j], array[i]];
		}
	}
}
