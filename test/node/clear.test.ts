import assert from "node:assert";
import { describe, test } from "node:test";
import { PuzzleGenerator, PuzzleValidator, SymmetryType } from "../../dist/MiniWitness.js";

describe("Generator solvability - ALL combinations", { concurrency: true, timeout: 1000 * 60 * 10 }, async (t) => {
	const generator = new PuzzleGenerator();
	const validator = new PuzzleValidator();

	const symmetryOpts = [SymmetryType.None, SymmetryType.Horizontal, SymmetryType.Vertical, SymmetryType.Rotational];
	const sizeOpts = [3, 4, 5];

	const cases = [
		{ useHexagons: true },
		{ useSquares: true },
		{ useStars: true },
		{ useTetris: true },
		{ useTetris: true, useTetrisNegative: true },
		{ useEraser: true },
		{ useBrokenEdges: true },
		{ useHexagons: true, useBrokenEdges: true },
		{ useHexagons: true, useEraser: true },
		{ useSquares: true, useStars: true },
		{ useStars: true, useTetris: true },
		{ useStars: true, useTetris: true, useTetrisNegative: true },
		{ useSquares: true, useEraser: true },
		{ useStars: true, useEraser: true },
		{ useTetris: true, useEraser: true },
		{ useTetris: true, useTetrisNegative: true, useEraser: true },
		{ useSquares: true, useStars: true, useEraser: true },
		{ useStars: true, useTetris: true, useEraser: true },
		{ useStars: true, useTetris: true, useTetrisNegative: true, useEraser: true, useBrokenEdges: true },
		{ useSquares: true, useStars: true, useTetris: true, useTetrisNegative: true, useEraser: true, useBrokenEdges: true },
	];

	for (const size of sizeOpts) {
		for (const symmetry of symmetryOpts) {
			test(`Size ${size}x${size}, Symmetry ${SymmetryType[symmetry]}`, () => {
				for (const c of cases) {
					const options = {
						...c,
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
