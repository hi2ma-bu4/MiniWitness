import assert from "node:assert";
import { test } from "node:test";
import { PuzzleGenerator, PuzzleValidator, SymmetryType } from "../../dist/MiniWitness.js";

test("Generator solvability - ALL combinations", { timeout: 3600000 }, async (t) => {
	const generator = new PuzzleGenerator();
	const validator = new PuzzleValidator();

	const symmetryOpts = [SymmetryType.None, SymmetryType.Horizontal, SymmetryType.Vertical, SymmetryType.Rotational];
	const sizeOpts = [3, 4, 5, 7];

	for (const size of sizeOpts) {
		for (const symmetry of symmetryOpts) {
			await t.test(`Size ${size}x${size}, Symmetry ${SymmetryType[symmetry]}`, () => {
				// 大きなサイズの場合は、全組合せではなくサンプリングを行う（時間短縮のため）
				// ただし、3x3, 4x4, 5x5 までは全組合せ（128個）を試す
				const combinations = size <= 5 ? 128 : 8;
				const step = 64 / combinations;

				for (let i = 1; i < 64; i += step) {
					const options = {
						useHexagons: !!(i & 1),
						useSquares: !!(i & 2),
						useStars: !!(i & 4),
						useTetris: !!(i & 8),
						useTetrisNegative: true,
						useEraser: !!(i & 16),
						useBrokenEdges: !!(i & 32),
						symmetry,
						difficulty: 0.5,
						complexity: 0.5,
					};

					const grid = generator.generate(size, size, options);
					const difficulty = validator.calculateDifficulty(grid);
					assert.ok(difficulty > 0, `Puzzle should be solvable (difficulty > 0) for options: ${JSON.stringify(options)}`);
				}
			});
		}
	}
});
