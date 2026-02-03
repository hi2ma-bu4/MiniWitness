import { Grid } from "./grid";
import { CellType, Color, type EdgeConstraint, EdgeType, type GenerationOptions, NodeType, type Point } from "./types";
import { PuzzleValidator } from "./validator";

/**
 * パズルを自動生成するクラス
 */
export class PuzzleGenerator {
	/**
	 * パズルを生成する
	 * @param rows 行数
	 * @param cols 列数
	 * @param options 生成オプション
	 * @returns 生成されたグリッド
	 */
	public generate(rows: number, cols: number, options: GenerationOptions = {}): Grid {
		const targetDifficulty = options.difficulty ?? 0.5;
		const validator = new PuzzleValidator();
		let bestGrid: Grid | null = null;
		let bestScore = -1;

		// 試行回数の設定
		const maxAttempts = rows * cols > 30 ? 50 : 80;

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const grid = this.generateOnce(rows, cols, options);

			// 必須制約が含まれているか確認
			if (!this.checkAllRequestedConstraintsPresent(grid, options)) continue;

			// 難易度の算出
			const difficulty = validator.calculateDifficulty(grid);
			if (difficulty === 0) continue;

			const diffFromTarget = Math.abs(difficulty - targetDifficulty);
			if (bestGrid === null || diffFromTarget < Math.abs(bestScore - targetDifficulty)) {
				bestScore = difficulty;
				bestGrid = grid;
			}

			// ターゲットに近い場合は早期終了
			if (targetDifficulty > 0.8 && difficulty > 0.8) break;
			if (diffFromTarget < 0.05) break;
		}

		// 見つからなかった場合は最後に生成したものを返す（通常はありえない）
		if (!bestGrid) {
			return this.generateOnce(rows, cols, options);
		}
		return bestGrid;
	}

	/**
	 * 1回の試行でパズルを構築する
	 */
	private generateOnce(rows: number, cols: number, options: GenerationOptions): Grid {
		const grid = new Grid(rows, cols);
		const startPoint: Point = { x: 0, y: rows };
		const endPoint: Point = { x: cols, y: 0 };

		grid.nodes[startPoint.y][startPoint.x].type = NodeType.Start;
		grid.nodes[endPoint.y][endPoint.x].type = NodeType.End;

		// 正解パスの生成
		const solutionPath = this.generateRandomPath(grid, startPoint, endPoint);
		// パスに基づいて制約（記号）を配置
		this.applyConstraintsBasedOnPath(grid, solutionPath, options);

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
	 */
	private generateRandomPath(grid: Grid, start: Point, end: Point): Point[] {
		const visited = new Set<string>();
		const path: Point[] = [];
		const findPath = (current: Point): boolean => {
			visited.add(`${current.x},${current.y}`);
			path.push(current);
			if (current.x === end.x && current.y === end.y) return true;

			const neighbors = this.getValidNeighbors(grid, current, visited);
			this.shuffleArray(neighbors);
			for (const next of neighbors) if (findPath(next)) return true;

			path.pop();
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
	 */
	private applyBrokenEdges(grid: Grid, path: Point[], options: GenerationOptions) {
		const complexity = options.complexity ?? 0.5;
		const pathEdges = new Set<string>();
		for (let i = 0; i < path.length - 1; i++) pathEdges.add(this.getEdgeKey(path[i], path[i + 1]));

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
			let type = Math.random() < 0.8 ? EdgeType.Broken : EdgeType.Absent;
			if (type === EdgeType.Absent && this.isAdjacentToMark(grid, edge)) type = EdgeType.Broken;

			if (edge.type === "h") grid.hEdges[edge.r][edge.c].type = type;
			else grid.vEdges[edge.r][edge.c].type = type;
			placed++;
		}

		// 周囲が全て断線しているノードの全エッジをAbsent化する
		for (let r = 0; r <= grid.rows; r++) {
			for (let c = 0; c <= grid.cols; c++) {
				const edgesWithMeta: { e: EdgeConstraint; type: "h" | "v"; r: number; c: number }[] = [];
				if (c > 0) edgesWithMeta.push({ e: grid.hEdges[r][c - 1], type: "h", r, c: c - 1 });
				if (c < grid.cols) edgesWithMeta.push({ e: grid.hEdges[r][c], type: "h", r, c });
				if (r > 0) edgesWithMeta.push({ e: grid.vEdges[r - 1][c], type: "v", r: r - 1, c });
				if (r < grid.rows) edgesWithMeta.push({ e: grid.vEdges[r][c], type: "v", r, c });

				if (edgesWithMeta.every((m) => m.e.type === EdgeType.Broken || m.e.type === EdgeType.Absent)) {
					if (edgesWithMeta.every((m) => !this.isAdjacentToMark(grid, m))) {
						for (const m of edgesWithMeta) m.e.type = EdgeType.Absent;
					}
				}
			}
		}
	}

	/**
	 * 到達不可能なエリアをAbsent化し、外部に漏れたセルをクリアする
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
	 */
	private applyConstraintsBasedOnPath(grid: Grid, path: Point[], options: GenerationOptions) {
		const complexity = options.complexity ?? 0.5;
		const useHexagons = options.useHexagons ?? true;
		const useSquares = options.useSquares ?? true;
		const useStars = options.useStars ?? true;
		const useTetris = options.useTetris ?? false;
		const useEraser = options.useEraser ?? false;

		let hexagonsPlaced = 0;
		let squaresPlaced = 0;
		let starsPlaced = 0;
		let tetrisPlaced = 0;
		let erasersPlaced = 0;
		let totalTetrisArea = 0;
		const maxTotalTetrisArea = Math.floor(grid.rows * grid.cols * 0.45);

		// 六角形の配置
		if (useHexagons) {
			const targetDifficulty = options.difficulty ?? 0.5;
			for (let i = 0; i < path.length - 1; i++) {
				const neighbors = this.getValidNeighbors(grid, path[i], new Set());
				const isBranching = neighbors.length > 2;
				let prob = complexity * 0.4;
				if (isBranching) prob = targetDifficulty < 0.4 ? prob * 1.0 : prob * 0.5;
				if (Math.random() < prob) {
					this.setEdgeHexagon(grid, path[i], path[i + 1]);
					hexagonsPlaced++;
				}
			}
			if (hexagonsPlaced === 0 && path.length >= 2) {
				const idx = Math.floor(Math.random() * (path.length - 1));
				this.setEdgeHexagon(grid, path[idx], path[idx + 1]);
			}
		}

		// 区画ルールの配置
		if (useSquares || useStars || useTetris || useEraser) {
			const regions = this.calculateRegions(grid, path);
			const availableColors = [Color.Black, Color.White, Color.Red, Color.Blue];
			const regionIndices = Array.from({ length: regions.length }, (_, i) => i);
			this.shuffleArray(regionIndices);
			const squareColorsUsed = new Set<number>();

			// 必要な最小限の制約を分散して配置するためのフラグ
			const needs = {
				square: useSquares,
				star: useStars,
				tetris: useTetris,
				eraser: useEraser,
			};

			for (let rIdx = 0; rIdx < regionIndices.length; rIdx++) {
				const idx = regionIndices[rIdx];
				const region = regions[idx];

				// 盤面が大きく区画が多い場合、後半に偏るのを防ぐため確率を調整
				const remainingRegions = regionIndices.length - rIdx;
				const forceOne = (needs.square && squaresPlaced === 0) || (needs.star && starsPlaced === 0) || (needs.tetris && tetrisPlaced === 0) || (needs.eraser && erasersPlaced === 0);

				// 必須なものがまだ配置されていない場合、残り区画数が少なくなってきたら確率を上げる
				let placementProb = 0.2 + complexity * 0.6;
				if (forceOne && remainingRegions <= 3) placementProb = 1.0;
				else if (forceOne && remainingRegions <= 6) placementProb = 0.7;

				if (Math.random() > placementProb) continue;

				const potentialCells = [...region];
				this.shuffleArray(potentialCells);

				// 四角形の配置
				let squareColor = availableColors[Math.floor(Math.random() * availableColors.length)];
				if (useSquares && !useStars && remainingRegions <= 2 && squareColorsUsed.size === 1) {
					const otherColors = availableColors.filter((c) => !squareColorsUsed.has(c));
					if (otherColors.length > 0) squareColor = otherColors[Math.floor(Math.random() * otherColors.length)];
				}

				let shouldPlaceSquare = useSquares && Math.random() < 0.5 + complexity * 0.3;
				if (useSquares && squaresPlaced === 0 && remainingRegions <= 2) shouldPlaceSquare = true;
				if (useSquares && !useStars && remainingRegions <= 2 && squareColorsUsed.size < 2 && squaresPlaced > 0) shouldPlaceSquare = true;

				if (shouldPlaceSquare && potentialCells.length > 0) {
					// 区域の大きさに応じて配置する数を増やす
					const maxSquares = Math.min(potentialCells.length, Math.max(4, Math.floor(region.length / 4)));
					const numSquares = Math.floor(Math.random() * (maxSquares / 2)) + Math.ceil(maxSquares / 2);
					for (let i = 0; i < numSquares; i++) {
						if (potentialCells.length === 0) break;
						const cell = potentialCells.pop()!;
						grid.cells[cell.y][cell.x].type = CellType.Square;
						grid.cells[cell.y][cell.x].color = squareColor;
						squaresPlaced++;
						squareColorsUsed.add(squareColor);
					}
				}

				// テトリスの配置
				if (useTetris && totalTetrisArea < maxTotalTetrisArea) {
					let shouldPlaceTetris = Math.random() < 0.1 + complexity * 0.4;
					if (tetrisPlaced === 0 && remainingRegions <= 2) shouldPlaceTetris = true;
					const maxTetrisPerRegion = tetrisPlaced === 0 && remainingRegions <= 2 ? 6 : 4;
					if (shouldPlaceTetris && potentialCells.length > 0 && region.length <= maxTetrisPerRegion * 4 && totalTetrisArea + region.length <= maxTotalTetrisArea) {
						const tiledPieces = this.generateTiling(region, maxTetrisPerRegion, options);
						if (tiledPieces) {
							for (const p of tiledPieces) {
								if (potentialCells.length === 0) break;
								const cell = potentialCells.pop()!;
								grid.cells[cell.y][cell.x].type = p.isRotated ? CellType.TetrisRotated : CellType.Tetris;
								grid.cells[cell.y][cell.x].shape = p.isRotated ? p.displayShape : p.shape;

								let tetrisColor = Color.None;
								if (useStars && Math.random() < 0.5) {
									const colors = availableColors.filter((c) => c !== Color.Blue);
									tetrisColor = colors[Math.floor(Math.random() * colors.length)];
								}
								grid.cells[cell.y][cell.x].color = tetrisColor;
								tetrisPlaced++;
							}
							totalTetrisArea += region.length;
						}
					}
				}

				// テトラポッド（エラー削除）の配置
				if (useEraser && erasersPlaced < 1) {
					const prob = 0.05 + complexity * 0.2;
					let shouldPlaceEraser = Math.random() < prob;
					if (remainingRegions <= 2) shouldPlaceEraser = true;

					if (shouldPlaceEraser && potentialCells.length >= 1) {
						const errorTypes: string[] = [];
						if (useStars) errorTypes.push("star");
						if (useSquares) errorTypes.push("square");
						let boundaryEdges: { type: "h" | "v"; r: number; c: number }[] = [];
						if (useHexagons) {
							boundaryEdges = this.getRegionBoundaryEdges(grid, region, path);
							if (boundaryEdges.length > 0) errorTypes.push("hexagon");
						}
						if (useTetris) errorTypes.push("tetris");

						let errorType = errorTypes.length > 0 ? errorTypes[Math.floor(Math.random() * errorTypes.length)] : null;

						// eraser同士の打ち消し合いは超低確率にする
						if (potentialCells.length >= 2 && (!errorType || Math.random() < 0.01)) errorType = "eraser";

						let errorPlaced = false;

						if (errorType === "hexagon") {
							const edge = boundaryEdges[Math.floor(Math.random() * boundaryEdges.length)];
							if (edge.type === "h") grid.hEdges[edge.r][edge.c].type = EdgeType.Hexagon;
							else grid.vEdges[edge.r][edge.c].type = EdgeType.Hexagon;
							hexagonsPlaced++;
							errorPlaced = true;
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
							grid.cells[errCell.y][errCell.x].color = availableColors[Math.floor(Math.random() * availableColors.length)];
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
								// 面積不一致のエラーを確実に作成
								piecesToPlace = [{ shape: [[1]], displayShape: [[1]], isRotated: false }];
							}

							if (piecesToPlace.length > 0) {
								for (const p of piecesToPlace) {
									if (potentialCells.length < 2) break;
									const cell = potentialCells.pop()!;
									grid.cells[cell.y][cell.x].type = p.isRotated ? CellType.TetrisRotated : CellType.Tetris;
									grid.cells[cell.y][cell.x].shape = p.isRotated ? p.displayShape : p.shape;

									let tetrisColor = Color.None;
									if (useStars && Math.random() < 0.3) {
										const colors = availableColors.filter((c) => c !== Color.Blue);
										tetrisColor = colors[Math.floor(Math.random() * colors.length)];
									}
									grid.cells[cell.y][cell.x].color = tetrisColor;
									tetrisPlaced++;
								}
								errorPlaced = true;
							}
						} else if (errorType === "eraser" && potentialCells.length >= 2) {
							const errCell = potentialCells.pop()!;
							grid.cells[errCell.y][errCell.x].type = CellType.Eraser;
							grid.cells[errCell.y][errCell.x].color = Color.None;
							erasersPlaced++;
							errorPlaced = true;
						}

						// それでもエラーが配置できなかった場合はテトラポッド同士の打ち消しを試みる
						if (!errorPlaced && potentialCells.length >= 2) {
							const errCell = potentialCells.pop()!;
							grid.cells[errCell.y][errCell.x].type = CellType.Eraser;
							grid.cells[errCell.y][errCell.x].color = Color.None;
							erasersPlaced++;
							errorPlaced = true;
						}

						if (errorPlaced) {
							const cell = potentialCells.pop()!;
							grid.cells[cell.y][cell.x].type = CellType.Eraser;
							let eraserColor = Color.None;
							if (useStars && Math.random() < 0.4) eraserColor = availableColors[Math.floor(Math.random() * availableColors.length)];
							grid.cells[cell.y][cell.x].color = eraserColor;
							erasersPlaced++;
						}
					}
				}

				// 星の配置
				if (useStars) {
					// 区域が十分に大きければ、複数ペアの配置を検討する
					const maxPairs = Math.max(1, Math.floor(region.length / 8));
					for (let p = 0; p < maxPairs; p++) {
						for (const color of availableColors) {
							if (potentialCells.length < 1) break;
							if (Math.random() > 0.3 + complexity * 0.4) continue;
							const colorCount = region.filter((p) => grid.cells[p.y][p.x].color === color).length;
							if (colorCount === 1) {
								const cell = potentialCells.pop()!;
								grid.cells[cell.y][cell.x].type = CellType.Star;
								grid.cells[cell.y][cell.x].color = color;
								starsPlaced++;
							} else if (colorCount === 0 && potentialCells.length >= 2) {
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
			if (useSquares && !useStars && squareColorsUsed.size < 2) {
				for (const region of regions) {
					if (region.every((p) => grid.cells[p.y][p.x].type === CellType.None)) {
						const otherColor = availableColors.find((c) => !squareColorsUsed.has(c)) || Color.White;
						const cell = region[Math.floor(Math.random() * region.length)];
						grid.cells[cell.y][cell.x].type = CellType.Square;
						grid.cells[cell.y][cell.x].color = otherColor;
						squareColorsUsed.add(otherColor);
						squaresPlaced++;
						break;
					}
				}
			}
		}
	}

	/**
	 * 区画分けを行う
	 */
	private calculateRegions(grid: Grid, path: Point[]): Point[][] {
		const regions: Point[][] = [];
		const visitedCells = new Set<string>();
		const pathEdges = new Set<string>();
		for (let i = 0; i < path.length - 1; i++) pathEdges.add(this.getEdgeKey(path[i], path[i + 1]));
		for (let r = 0; r < grid.rows; r++) {
			for (let c = 0; c < grid.cols; c++) {
				if (visitedCells.has(`${c},${r}`)) continue;
				const currentRegion: Point[] = [];
				const queue: Point[] = [{ x: c, y: r }];
				visitedCells.add(`${c},${r}`);
				while (queue.length > 0) {
					const cell = queue.shift()!;
					currentRegion.push(cell);
					const neighbors = [
						{ dx: 0, dy: -1, p1: { x: cell.x, y: cell.y }, p2: { x: cell.x + 1, y: cell.y } },
						{ dx: 0, dy: 1, p1: { x: cell.x, y: cell.y + 1 }, p2: { x: cell.x + 1, y: cell.y + 1 } },
						{ dx: -1, dy: 0, p1: { x: cell.x, y: cell.y }, p2: { x: cell.x, y: cell.y + 1 } },
						{ dx: 1, dy: 0, p1: { x: cell.x + 1, y: cell.y }, p2: { x: cell.x + 1, y: cell.y + 1 } },
					];
					for (const n of neighbors) {
						const nx = cell.x + n.dx;
						const ny = cell.y + n.dy;
						if (nx >= 0 && nx < grid.cols && ny >= 0 && ny < grid.rows) {
							if (!visitedCells.has(`${nx},${ny}`) && !pathEdges.has(this.getEdgeKey(n.p1, n.p2)) && !this.isAbsentEdge(grid, n.p1, n.p2)) {
								visitedCells.add(`${nx},${ny}`);
								queue.push({ x: nx, y: ny });
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

	/**
	 * 区画の境界エッジのうち、解パスが通っていないものを取得する
	 */
	private getRegionBoundaryEdges(grid: Grid, region: Point[], path: Point[]): { type: "h" | "v"; r: number; c: number }[] {
		const pathEdges = new Set<string>();
		for (let i = 0; i < path.length - 1; i++) pathEdges.add(this.getEdgeKey(path[i], path[i + 1]));

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

	private setEdgeHexagon(grid: Grid, p1: Point, p2: Point) {
		if (p1.x === p2.x) grid.vEdges[Math.min(p1.y, p2.y)][p1.x].type = EdgeType.Hexagon;
		else grid.hEdges[p1.y][Math.min(p1.x, p2.x)].type = EdgeType.Hexagon;
	}

	/**
	 * 要求された制約が全て含まれているか確認する
	 */
	private checkAllRequestedConstraintsPresent(grid: Grid, options: GenerationOptions): boolean {
		const useHexagons = options.useHexagons ?? true;
		const useSquares = options.useSquares ?? true;
		const useStars = options.useStars ?? true;
		const useTetris = options.useTetris ?? false;
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
			for (let r = 0; r <= grid.rows; r++)
				for (let c = 0; c < grid.cols; c++)
					if (grid.hEdges[r][c].type === EdgeType.Hexagon) {
						found = true;
						break;
					}
			if (!found)
				for (let r = 0; r < grid.rows; r++)
					for (let c = 0; c <= grid.cols; c++)
						if (grid.vEdges[r][c].type === EdgeType.Hexagon) {
							found = true;
							break;
						}
			if (!found) return false;
		}
		if (useSquares || useStars || useTetris || useEraser) {
			let fSq = false;
			let fSt = false;
			let fT = false;
			let fE = false;
			const sqC = new Set<number>();
			for (let r = 0; r < grid.rows; r++)
				for (let c = 0; c < grid.cols; c++) {
					const type = grid.cells[r][c].type;
					if (type === CellType.Square) {
						fSq = true;
						sqC.add(grid.cells[r][c].color);
					}
					if (type === CellType.Star) fSt = true;
					if (type === CellType.Tetris || type === CellType.TetrisRotated) fT = true;
					if (type === CellType.Eraser) fE = true;
				}
			if (useSquares && !fSq) return false;
			if (useStars && !fSt) return false;
			if (useTetris && !fT) return false;
			if (useEraser && !fE) return false;
			if (useSquares && fSq && !fSt && sqC.size < 2) return false;
		}
		if (this.hasIsolatedMark(grid)) return false;
		return true;
	}

	/**
	 * 指定された区画をピースで埋め尽くすタイリングを生成する
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
		let shapes = [...this.TETRIS_SHAPES];
		this.shuffleArray(shapes);
		if (difficulty > 0.6) shapes.sort((a, b) => this.getShapeArea(b) - this.getShapeArea(a));

		for (const baseShape of shapes) {
			const isInv = this.isRotationallyInvariant(baseShape);
			const rotations = isInv ? [baseShape] : this.getAllRotations(baseShape);
			this.shuffleArray(rotations);
			for (const shape of rotations) {
				const blocks: { r: number; c: number }[] = [];
				for (let pr = 0; pr < shape.length; pr++) for (let pc = 0; pc < shape[0].length; pc++) if (shape[pr][pc]) blocks.push({ r: pr, c: pc });
				for (const anchor of blocks) {
					const dr = r0 - anchor.r;
					const dc = c0 - anchor.c;
					if (this.canPlace(regionGrid, shape, dr, dc)) {
						this.placePiece(regionGrid, shape, dr, dc, false);
						const result = this.tilingDfs(regionGrid, [...currentPieces, { shape, displayShape: baseShape, isRotated: !isInv && Math.random() < 0.3 + difficulty * 0.6 }], maxPieces, options);
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
		const area = this.getShapeArea(shape);
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
	private shuffleArray(array: any[]) {
		for (let i = array.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[array[i], array[j]] = [array[j], array[i]];
		}
	}
}
