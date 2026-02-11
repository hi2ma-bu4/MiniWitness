import assert from "node:assert";
import { describe, test } from "node:test";
import { PuzzleGenerator, RngType } from "../../dist/MiniWitness.js";

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
});
