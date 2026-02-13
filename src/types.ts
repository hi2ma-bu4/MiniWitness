export enum Direction {
	Up = 0,
	Right = 1,
	Down = 2,
	Left = 3,
}

export enum CellType {
	None = 0,
	/** 色分けが必要なブロック */
	Square = 1,
	/** 同じ色のペア作成 (星) */
	Star = 2,
	/** テトリス */
	Tetris = 3,
	/** テトリス（回転可能） */
	TetrisRotated = 4,
	/** テトリス (減算) */
	TetrisNegative = 5,
	/** テトリス (減算・回転可能) */
	TetrisNegativeRotated = 6,
	/** テトラポッド (エラー削除) */
	Eraser = 7,
	/** 三角形 (通過辺数指定) */
	Triangle = 8,
}

export enum EdgeType {
	Normal = 0,
	/** 線の真ん中で断線 (通行不可) */
	Broken = 1,
	/** そもそも分岐もなし (通行不可) */
	Absent = 2,
	/** 通過必須 (ワイルドカード) */
	Hexagon = 3,
	/** メイン線のみ通過必須 */
	HexagonMain = 4,
	/** 対称線のみ通過必須 */
	HexagonSymmetry = 5,
}

export enum NodeType {
	Normal = 0,
	Start = 1,
	End = 2,
	/** 通過必須 (ワイルドカード) */
	Hexagon = 3,
	/** メイン線のみ通過必須 */
	HexagonMain = 4,
	/** 対称線のみ通過必須 */
	HexagonSymmetry = 5,
}

export enum SymmetryType {
	None = 0,
	/** 左右対称 */
	Horizontal = 1,
	/** 上下対称 */
	Vertical = 2,
	/** 点対称 */
	Rotational = 3,
}

/**
 * 使用可能色
 * Core内部では数値で管理し、UIで実際の色（文字列）と紐付ける
 */
export type Color = number;
export const Color = {
	None: 0 as Color,
	Black: 1 as Color,
	White: 2 as Color,
	Red: 3 as Color,
	Blue: 4 as Color,
} as const;

export interface Point {
	x: number;
	y: number;
}

export interface CellConstraint {
	type: CellType;
	color: Color;
	shape?: number[][]; // [row][col] 0 or 1
	count?: number; // Triangle count (1-3)
}

export interface EdgeConstraint {
	type: EdgeType;
}

export interface NodeConstraint {
	type: NodeType;
}

/**
 * パズルの静的な定義データ
 */
export interface PuzzleData {
	rows: number;
	cols: number;
	cells: CellConstraint[][]; // [row][col]
	vEdges: EdgeConstraint[][]; // Vertical edges [row][col] (row: 0..rows-1, col: 0..cols)
	hEdges: EdgeConstraint[][]; // Horizontal edges [row][col] (row: 0..rows, col: 0..cols-1)
	nodes: NodeConstraint[][]; // [row][col]
	symmetry?: SymmetryType;
	/** パズル生成に使用された乱数シード (16進数文字列) */
	seed?: string;
}

/**
 * ユーザーの入力（回答パス）
 */
export interface SolutionPath {
	points: Point[]; // 通過したノードの座標配列
}

export interface ValidationResult {
	isValid: boolean;
	errorReason?: string;
	invalidatedCells?: Point[];
	invalidatedEdges?: { type: "h" | "v"; r: number; c: number }[];
	invalidatedNodes?: Point[];
	errorCells?: Point[];
	errorEdges?: { type: "h" | "v"; r: number; c: number }[];
	errorNodes?: Point[];
	regions?: Point[][];
}

/**
 * パズル生成のオプション
 */
export interface GenerationOptions {
	useHexagons?: boolean;
	useSquares?: boolean;
	useStars?: boolean;
	useTetris?: boolean;
	useTetrisNegative?: boolean;
	useEraser?: boolean;
	useTriangles?: boolean;
	useBrokenEdges?: boolean;
	complexity?: number; // 0.0 - 1.0 (制約の密度)
	difficulty?: number; // 0.0 (Easy) - 1.0 (Hard) (解パターンの数に基づく)
	pathLength?: number; // 0.0 (Shortest) - 1.0 (Longest)
	symmetry?: SymmetryType;
	/** 四角形や星などの記号に使用可能な色のリスト。指定がない場合はデフォルト（黒・白・赤・青）が使用される。 */
	availableColors?: Color[];
	/** 各記号タイプのデフォルトカラー。指定がない場合はそれぞれの記号の標準色が使用される。
	 * キーには CellType の数値、または "Square", "Tetris" などの文字列が使用可能です。
	 */
	defaultColors?: Partial<Record<CellType | keyof typeof CellType, Color>>;
	/** パズル生成に使用する乱数シード (16進数文字列) */
	seed?: string;
	/** 使用する乱数アルゴリズム */
	rngType?: RngType;
}

export enum RngType {
	Mulberry32 = 0,
	XorShift128Plus = 1,
	MathRandom = 2,
}
