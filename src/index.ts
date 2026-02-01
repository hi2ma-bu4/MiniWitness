import { PuzzleGenerator } from "./generator";
import { Grid } from "./grid";
import type { GenerationOptions, PuzzleData, SolutionPath, ValidationResult } from "./types";
import { PuzzleValidator } from "./validator";

// ライブラリのファサードクラス
export { PuzzleGenerator } from "./generator";
export { Grid } from "./grid";
export { PuzzleValidator } from "./validator";

export class WitnessCore {
	private generator: PuzzleGenerator;
	private validator: PuzzleValidator;

	constructor() {
		this.generator = new PuzzleGenerator();
		this.validator = new PuzzleValidator();
	}

	/**
	 * 新しいパズルを生成してデータを返す
	 */
	public createPuzzle(rows: number, cols: number, options: GenerationOptions = {}): PuzzleData {
		const grid = this.generator.generate(rows, cols, options);
		return grid.export();
	}

	/**
	 * 解答を検証する
	 */
	public validateSolution(puzzleData: PuzzleData, solution: SolutionPath): ValidationResult {
		const grid = Grid.fromData(puzzleData);
		return this.validator.validate(grid, solution);
	}
}

// ブラウザ/Node.js環境両対応のためのエクスポート
export * from "./types";
