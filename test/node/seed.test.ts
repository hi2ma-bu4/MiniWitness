import assert from "node:assert";
import { describe, test } from "node:test";
import { PuzzleGenerator, PuzzleValidator, RngType } from "../../dist/MiniWitness.js";

describe("PuzzleGenerator Seed Tests", { concurrency: true }, () => {
	test("Seed reproducibility (Mulberry32)", () => {
		const generator = new PuzzleGenerator();
		const options = {
			seed: "abcd1234",
			rngType: RngType.Mulberry32,
			useSquares: true,
			useStars: true,
		};

		const grid1 = generator.generate(4, 4, options);
		const grid2 = generator.generate(4, 4, options);

		assert.deepStrictEqual(grid1.export(), grid2.export());
	});

	test("Seed reproducibility (XorShift128+)", () => {
		const generator = new PuzzleGenerator();
		const options = {
			seed: "deadbeef",
			rngType: RngType.XorShift128Plus,
			useSquares: true,
			useStars: true,
		};

		const grid1 = generator.generate(4, 4, options);
		const grid2 = generator.generate(4, 4, options);

		assert.deepStrictEqual(grid1.export(), grid2.export());
	});

	test("Different seeds produce different puzzles", () => {
		const generator = new PuzzleGenerator();
		const options1 = {
			seed: "1111",
			rngType: RngType.Mulberry32,
			useSquares: true,
		};
		const options2 = {
			seed: "2222",
			rngType: RngType.Mulberry32,
			useSquares: true,
		};

		const grid1 = generator.generate(4, 4, options1);
		const grid2 = generator.generate(4, 4, options2);

		assert.notDeepStrictEqual(grid1.export(), grid2.export());
	});

	test("Invalid seed handling", () => {
		const generator = new PuzzleGenerator();
		const options1 = {
			seed: "not-a-hex",
			rngType: RngType.Mulberry32,
		};
		const options2 = {
			seed: "not-a-hex",
			rngType: RngType.Mulberry32,
		};

		const grid1 = generator.generate(3, 3, options1);
		const grid2 = generator.generate(3, 3, options2);

		assert.deepStrictEqual(grid1.export(), grid2.export());
		assert.ok(grid1.seed);
	});

	test("Route seed reproducibility with 'apple'", () => {
		const generator = new PuzzleGenerator();
		const initialSeed = "apple";

		// 1. Generate with 'apple'
		const options1 = {
			seed: initialSeed,
			rngType: RngType.Mulberry32,
			useSquares: true,
			useStars: true,
		};
		const grid1 = generator.generate(4, 4, options1);
		const reportedSeed = grid1.seed;

		// 2. Generate with reported seed
		const options2 = {
			seed: reportedSeed,
			rngType: RngType.Mulberry32,
			useSquares: true,
			useStars: true,
		};
		const grid2 = generator.generate(4, 4, options2);

		// Verification
		assert.strictEqual(grid2.seed, reportedSeed, "Reported seed should match when reused");
		assert.deepStrictEqual(grid1.export(), grid2.export(), "Puzzles should be identical when using the reported route seed");
	});

	test("Route seed reproducibility with '637eeb1a'", () => {
		const generator = new PuzzleGenerator();
		const initialSeed = "637eeb1a";

		// 1. Generate with '637eeb1a'
		const options1 = {
			seed: initialSeed,
			rngType: RngType.Mulberry32,
			useSquares: true,
			useStars: true,
		};
		const grid1 = generator.generate(4, 4, options1);
		const reportedSeed = grid1.seed;

		// 2. Generate with reported seed
		const options2 = {
			seed: reportedSeed,
			rngType: RngType.Mulberry32,
			useSquares: true,
			useStars: true,
		};
		const grid2 = generator.generate(4, 4, options2);

		// Verification
		assert.strictEqual(grid2.seed, reportedSeed, "Reported seed should match when reused");
		assert.deepStrictEqual(grid1.export(), grid2.export(), "Puzzles should be identical when using the reported route seed");
	});

	test("Difficulty profile parity against Math.random", () => {
		const generator = new PuzzleGenerator();
		const validator = new PuzzleValidator();
		const coreOptions = {
			useSquares: true,
			useStars: true,
			useTetris: true,
			useTetrisNegative: true,
			useEraser: true,
			difficulty: 0.5,
			complexity: 0.5,
		};

		const sampleCount = 15;
		const measure = (rngType: RngType) => {
			const values: number[] = [];
			for (let i = 0; i < sampleCount; i++) {
				const grid = generator.generate(3, 3, {
					...coreOptions,
					rngType,
					seed: rngType === RngType.MathRandom ? undefined : `rng-parity-${i}`,
				});
				values.push(validator.calculateDifficulty(grid));
			}
			return values.reduce((a, b) => a + b, 0) / values.length;
		};

		const mathAvg = measure(RngType.MathRandom);
		const mulberryAvg = measure(RngType.Mulberry32);
		const xorShiftAvg = measure(RngType.XorShift128Plus);

		assert.ok(mulberryAvg > 0.1, `Mulberry32 average difficulty should stay above trivial: ${mulberryAvg}`);
		assert.ok(xorShiftAvg > 0.1, `XorShift128+ average difficulty should stay above trivial: ${xorShiftAvg}`);
		assert.ok(Math.abs(mulberryAvg - mathAvg) < 0.3, `Mulberry32 average (${mulberryAvg}) should stay close to Math.random (${mathAvg})`);
		assert.ok(Math.abs(xorShiftAvg - mathAvg) < 0.3, `XorShift128+ average (${xorShiftAvg}) should stay close to Math.random (${mathAvg})`);
	});
});
