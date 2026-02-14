import { PuzzleGenerator } from "./generator";
import { Grid } from "./grid";
import { type GenerationOptions, type Point, type PuzzleData, type SolutionPath, type ValidationResult } from "./types";
import { WitnessUI } from "./ui";
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

/**
 * Worker環境での自動セットアップ
 * MiniWitness自体をWorkerとして指定した場合（new Worker("MiniWitness.js")）に
 * メッセージをハンドルしてパズル生成やUI管理を自動で行う機能
 */
if (typeof self !== "undefined" && "postMessage" in self && !("document" in self)) {
	const core = new WitnessCore();
	let ui: WitnessUI | null = null;
	let currentPuzzle: PuzzleData | null = null;

	(self as any).addEventListener("message", (e: MessageEvent) => {
		const { type, payload } = e.data;

		switch (type) {
			case "init": {
				const { canvas, options } = payload;
				ui = new WitnessUI(canvas, undefined, {
					...options,
					onPathComplete: (path: Point[]) => {
						(self as any).postMessage({ type: "drawingEnded" });
						if (options.autoValidate && currentPuzzle) {
							const result = core.validateSolution(currentPuzzle, { points: path });
							ui!.setValidationResult(result.isValid, result.invalidatedCells, result.invalidatedEdges, result.errorCells, result.errorEdges, result.invalidatedNodes, result.errorNodes);
							(self as any).postMessage({ type: "validationResult", payload: result });
						} else {
							(self as any).postMessage({ type: "pathComplete", payload: path });
						}
					},
				});
				break;
			}

			case "createPuzzle": {
				const { rows, cols, genOptions } = payload;
				const puzzle = core.createPuzzle(rows, cols, genOptions);
				self.postMessage({ type: "puzzleCreated", payload: { puzzle, genOptions } });
				break;
			}

			case "setPuzzle": {
				currentPuzzle = payload.puzzle;
				if (ui && currentPuzzle) {
					ui.setPuzzle(currentPuzzle);
					if (payload.options) {
						ui.setOptions(payload.options);
					}
				}
				break;
			}

			case "setOptions": {
				if (ui) ui.setOptions(payload);
				break;
			}

			case "setCanvasRect": {
				if (ui) ui.setCanvasRect(payload);
				break;
			}

			case "validate": {
				if (currentPuzzle) {
					const result = core.validateSolution(currentPuzzle, { points: payload.path });
					if (ui) {
						ui.setValidationResult(result.isValid, result.invalidatedCells, result.invalidatedEdges, result.errorCells, result.errorEdges, result.invalidatedNodes, result.errorNodes);
					}
					self.postMessage({ type: "validationResult", payload: result });
				}
				break;
			}

			case "event": {
				const { eventType, eventData } = payload;
				if (ui) {
					if (eventType === "mousedown" || eventType === "touchstart") {
						const started = ui.handleStart(eventData);
						(self as any).postMessage({ type: "drawingStarted", payload: started });
					} else if (eventType === "mousemove" || eventType === "touchmove") {
						ui.handleMove(eventData);
					} else if (eventType === "mouseup" || eventType === "touchend") {
						ui.handleEnd(eventData);
						(self as any).postMessage({ type: "drawingEnded" });
					}
				}
				break;
			}
		}
	});
}
