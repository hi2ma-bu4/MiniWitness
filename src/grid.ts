import { type CellConstraint, CellType, Color, type EdgeConstraint, EdgeType, type NodeConstraint, NodeType, type PuzzleData } from "./types";

export class Grid {
	public readonly rows: number;
	public readonly cols: number;

	// データマトリクス
	public cells: CellConstraint[][] = [];
	public hEdges: EdgeConstraint[][] = []; // 横棒
	public vEdges: EdgeConstraint[][] = []; // 縦棒
	public nodes: NodeConstraint[][] = [];

	constructor(rows: number, cols: number) {
		this.rows = rows;
		this.cols = cols;
		this.initializeGrid();
	}

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
			}),
		);
	}

	public static fromData(data: PuzzleData): Grid {
		const grid = new Grid(data.rows, data.cols);
		grid.cells = data.cells;
		grid.vEdges = data.vEdges;
		grid.hEdges = data.hEdges;
		grid.nodes = data.nodes;
		return grid;
	}
}
