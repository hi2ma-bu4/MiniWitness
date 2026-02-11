import { type CellConstraint, CellType, Color, type EdgeConstraint, EdgeType, type NodeConstraint, NodeType, type PuzzleData } from "./types";

/**
 * パズルのグリッド構造と状態を管理するクラス
 */
export class Grid {
	/** 行数 */
	public readonly rows: number;
	/** 列数 */
	public readonly cols: number;

	/** セルの制約（記号）マトリクス */
	public cells: CellConstraint[][] = [];
	/** 水平エッジの制約マトリクス */
	public hEdges: EdgeConstraint[][] = [];
	/** 垂直エッジの制約マトリクス */
	public vEdges: EdgeConstraint[][] = [];
	/** ノードの制約マトリクス */
	public nodes: NodeConstraint[][] = [];
	/** 対称性の設定 (SymmetryType) */
	public symmetry: number = 0;
	/** パズル生成に使用された乱数シード (16進数文字列) */
	public seed?: string;

	/**
	 * 新しいグリッドを初期化する
	 * @param rows 行数
	 * @param cols 列数
	 */
	constructor(rows: number, cols: number) {
		this.rows = rows;
		this.cols = cols;
		this.initializeGrid();
	}

	/**
	 * グリッドの各要素を初期状態（制約なし）で生成する
	 */
	private initializeGrid() {
		// Cells: rows * cols
		this.cells = Array.from({ length: this.rows }, () => Array.from({ length: this.cols }, () => ({ type: CellType.None, color: Color.None })));

		// H-Edges: (rows + 1) * cols
		this.hEdges = Array.from({ length: this.rows + 1 }, () => Array.from({ length: this.cols }, () => ({ type: EdgeType.Normal })));

		// V-Edges: rows * (cols + 1)
		this.vEdges = Array.from({ length: this.rows }, () => Array.from({ length: this.cols + 1 }, () => ({ type: EdgeType.Normal })));

		// Nodes: (rows + 1) * (cols + 1)
		this.nodes = Array.from({ length: this.rows + 1 }, () => Array.from({ length: this.cols + 1 }, () => ({ type: NodeType.Normal })));
	}

	/**
	 * グリッドの状態を PuzzleData 形式でエクスポートする
	 * @returns パズルデータ
	 */
	public export(): PuzzleData {
		// データのディープコピーを返す
		return JSON.parse(
			JSON.stringify({
				rows: this.rows,
				cols: this.cols,
				cells: this.cells,
				vEdges: this.vEdges,
				hEdges: this.hEdges,
				nodes: this.nodes,
				symmetry: this.symmetry,
				seed: this.seed,
			}),
		);
	}

	/**
	 * PuzzleData から Grid インスタンスを生成する
	 * @param data パズルデータ
	 * @returns Grid インスタンス
	 */
	public static fromData(data: PuzzleData): Grid {
		const grid = new Grid(data.rows, data.cols);
		grid.cells = data.cells;
		grid.vEdges = data.vEdges;
		grid.hEdges = data.hEdges;
		grid.nodes = data.nodes;
		grid.symmetry = data.symmetry || 0;
		grid.seed = data.seed;
		return grid;
	}
}
