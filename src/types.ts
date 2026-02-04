export enum Direction {
	Up = 0,
	Right = 1,
	Down = 2,
	Left = 3,
}

export enum CellType {
	None = 0,
	Square = 1, // 色分けが必要なブロック
	Star = 2, // 同じ色のペア作成 (星)
	Tetris = 3, // テトリス
	TetrisRotated = 4, // テトリス（回転可能）
	Eraser = 5, // テトラポッド (エラー削除)
}

export enum EdgeType {
	Normal = 0,
	Broken = 1, // 線の真ん中で断線 (通行不可)
	Absent = 2, // そもそも分岐もなし (通行不可)
	Hexagon = 3, // 通過必須
}

export enum NodeType {
	Normal = 0,
	Start = 1,
	End = 2,
}

/**
 * 使用可能色
 */
export enum Color {
	None = 0,
	Black = 1,
	White = 2,
	Red = 3,
	Blue = 4,
	// 拡張可能
}

export interface Point {
	x: number;
	y: number;
}

export interface CellConstraint {
	type: CellType;
	color: Color;
	shape?: number[][]; // [row][col] 0 or 1
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
}

/**
 * パズル生成のオプション
 */
export interface GenerationOptions {
	useHexagons?: boolean;
	useSquares?: boolean;
	useStars?: boolean;
	useTetris?: boolean;
	useEraser?: boolean;
	useBrokenEdges?: boolean;
	complexity?: number; // 0.0 - 1.0 (制約の密度)
	difficulty?: number; // 0.0 (Easy) - 1.0 (Hard) (解パターンの数に基づく)
	pathLength?: number; // 0.0 (Shortest) - 1.0 (Longest)
}
