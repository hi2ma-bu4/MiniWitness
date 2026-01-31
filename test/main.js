// example_usage.ts
import { WitnessCore } from "../dist/MiniWitness.js";

const core = new WitnessCore();

// 1. パズル生成 (4x4)
const puzzleData = core.createPuzzle(4, 4, 0.7);

console.log("Generated Puzzle:", puzzleData);
// ここで puzzleData を元に Canvas等で描画を行う
// puzzleData.vEdges, puzzleData.cells などを見て記号を描画する

// 2. ユーザー操作のエミュレーション（UIから座標配列を受け取る）
const userSolution = {
	points: [
		{ x: 0, y: 4 }, // Start (左下)
		{ x: 0, y: 3 },
		{ x: 1, y: 3 },
		// ... 中略 ...
		{ x: 4, y: 0 }, // End
	],
};

// 3. 検証
const result = core.validateSolution(puzzleData, userSolution);

if (result.isValid) {
	console.log("Correct! Flash the screen white.");
} else {
	console.log("Incorrect:", result.errorReason);
	// エラー時のアニメーションなどをトリガー
}
