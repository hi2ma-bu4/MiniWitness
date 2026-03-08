import assert from "node:assert";
import { describe, test } from "node:test";
import { PuzzleGenerator, PuzzleValidator, SymmetryType } from "../../dist/MiniWitness.js";

describe("Generator solvability - ALL combinations", { concurrency: true, timeout: 1000 * 60 * 10 }, async (t) => {
	const generator = new PuzzleGenerator();
	const validator = new PuzzleValidator();

	const symmetryOpts = [SymmetryType.None, SymmetryType.Horizontal, SymmetryType.Vertical, SymmetryType.Rotational];
	const sizeOpts = [3, 4, 5];

	const cases = [
		{ ratios: { hexagonEdge: 0.1 } },
		{ ratios: { square: 0.1 } },
		{ ratios: { star: 0.1 } },
		{ ratios: { tetris: 0.1 } },
		{ ratios: { tetris: 0.1, tetrisNegative: 0.1 } },
		{ ratios: { triangle: 0.1 } },
		{ ratios: { eraser: 0.1 } },
		{ useBrokenEdges: true },
		{ ratios: { hexagonEdge: 0.1 }, useBrokenEdges: true },
		{ ratios: { hexagonEdge: 0.1, eraser: 0.1 } },
		{ ratios: { square: 0.1, star: 0.1 } },
		{ ratios: { star: 0.1, tetris: 0.1 } },
		{ ratios: { star: 0.1, tetris: 0.1, tetrisNegative: 0.1 } },
		{ ratios: { square: 0.1, eraser: 0.1 } },
		{ ratios: { star: 0.1, eraser: 0.1 } },
		{ ratios: { tetris: 0.1, eraser: 0.1 } },
		{ ratios: { tetris: 0.1, tetrisNegative: 0.1, eraser: 0.1 } },
		{ ratios: { square: 0.1, star: 0.1, eraser: 0.1 } },
		{ ratios: { star: 0.1, tetris: 0.1, eraser: 0.1 } },
		{ ratios: { star: 0.1, tetris: 0.1, tetrisNegative: 0.1, eraser: 0.1 }, useBrokenEdges: true },
		{ ratios: { square: 0.1, star: 0.1, tetris: 0.1, tetrisNegative: 0.1, triangle: 0.1, eraser: 0.1 }, useBrokenEdges: true },
	];

	for (const size of sizeOpts) {
		for (const symmetry of symmetryOpts) {
			test(`Size ${size}x${size}, Symmetry ${SymmetryType[symmetry]}`, () => {
				const failedCases: string[] = [];
				for (const c of cases) {
					const options = {
						...c,
						symmetry,
						difficulty: 0.5,
						complexity: 0.5,
					};

					const grid = generator.generate(size, size, options);
					const difficulty = validator.calculateDifficulty(grid);
					if (difficulty <= 0) {
						failedCases.push(JSON.stringify(options));
					}
				}
				assert.ok(failedCases.length <= 5, `Too many unsolved puzzles (allowed up to 5) (${failedCases.length}) for ${size}x${size} ${SymmetryType[symmetry]}: ${failedCases.join(" | ")}`);
			});
		}
	}
});
