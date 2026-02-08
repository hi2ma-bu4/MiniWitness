import { PuzzleGenerator } from "./generator";
import { Grid } from "./grid";
import type { GenerationOptions, PuzzleData, SolutionPath, ValidationResult } from "./types";
import { PuzzleValidator } from "./validator";

// ライブラリのファサードクラス
export { PuzzleGenerator } from "./generator";
export { Grid } from "./grid";
export { PuzzleSerializer } from "./serializer";
export { WitnessUI } from "./ui";
export { PuzzleValidator } from "./validator";

/**
 * the witnessパズルのコア機能（生成・検証・難易度計算）を提供するメインクラス
 */
export class WitnessCore {
	private generator: PuzzleGenerator;
	private validator: PuzzleValidator;

	/**
	 * インスタンスを生成する
	 */
	constructor() {
		this.generator = new PuzzleGenerator();
		this.validator = new PuzzleValidator();
	}

	/**
	 * 指定されたサイズとオプションで新しいパズルを生成する
	 * @param rows 行数
	 * @param cols 列数
	 * @param options 生成オプション
	 * @returns 生成されたパズルデータ
	 */
	public createPuzzle(rows: number, cols: number, options: GenerationOptions = {}): PuzzleData {
		const grid = this.generator.generate(rows, cols, options);
		return grid.export();
	}

	/**
	 * 与えられたパズルデータに対して解答パスを検証する
	 * @param puzzleData パズルデータ
	 * @param solution 解答パス
	 * @returns 検証結果
	 */
	public validateSolution(puzzleData: PuzzleData, solution: SolutionPath): ValidationResult {
		const grid = Grid.fromData(puzzleData);
		return this.validator.validate(grid, solution);
	}

	/**
	 * パズルデータの難易度を算出する
	 * @param puzzleData パズルデータ
	 * @returns 難易度スコア (0.0 - 1.0)
	 */
	public calculateDifficulty(puzzleData: PuzzleData): number {
		const grid = Grid.fromData(puzzleData);
		return this.validator.calculateDifficulty(grid);
	}
}

// ブラウザ/Node.js環境両対応のためのエクスポート
export * from "./types";
