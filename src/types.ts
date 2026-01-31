// types.ts

export enum Direction {
	Up = 0,
	Right = 1,
	Down = 2,
	Left = 3,
}

export enum CellType {
	None = 0,
	Square = 1, // 色分けが必要なブロック
	// 必要に応じてStar, Tetris型などを追加可能
}

export enum EdgeType {
	Normal = 0,
	Hexagon = 1, // 通過必須
	Broken = 2, // 通過不可
}

export enum NodeType {
	Normal = 0,
	Start = 1,
	End = 2,
}

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
}
