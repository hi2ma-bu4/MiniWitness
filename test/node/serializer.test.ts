import assert from "node:assert";
import { describe, test } from "node:test";
import { CellType, PuzzleSerializer, RngType } from "../../dist/MiniWitness.js";

describe("PuzzleSerializer", { concurrency: true }, () => {
	const mockPuzzle = {
		rows: 2,
		cols: 2,
		cells: [
			[
				{ type: 1, color: 1 },
				{ type: 0, color: 0 },
			],
			[
				{ type: 0, color: 0 },
				{ type: 1, color: 2 },
			],
		],
		vEdges: [
			[{ type: 0 }, { type: 0 }, { type: 0 }],
			[{ type: 0 }, { type: 0 }, { type: 0 }],
		],
		hEdges: [
			[{ type: 0 }, { type: 0 }],
			[{ type: 0 }, { type: 0 }],
			[{ type: 0 }, { type: 0 }],
		],
		nodes: [
			[{ type: 1 }, { type: 0 }, { type: 0 }],
			[{ type: 0 }, { type: 3 }, { type: 0 }],
			[{ type: 0 }, { type: 0 }, { type: 2 }],
		],
		symmetry: 0,
	};

	test("serialize and deserialize (legacy support)", async () => {
		const options = {
			useSquares: true,
			difficulty: 0.5,
			symmetry: 0,
		};
		const serialized = await PuzzleSerializer.serialize(mockPuzzle as any, options);
		assert.strictEqual(typeof serialized, "string");

		const deserialized = await PuzzleSerializer.deserialize(serialized);
		assert.deepStrictEqual(deserialized.puzzle, mockPuzzle);
		assert.strictEqual(deserialized.options?.useSquares, true);
		assert.strictEqual(deserialized.options?.difficulty, 0.5);
	});

	test("handle zero values in options", async () => {
		const options = {
			complexity: 0,
			difficulty: 0,
			pathLength: 0,
		};
		const serialized = await PuzzleSerializer.serialize({ options });
		const deserialized = await PuzzleSerializer.deserialize(serialized);
		assert.strictEqual(deserialized.options?.complexity, 0);
		assert.strictEqual(deserialized.options?.difficulty, 0);
		assert.strictEqual(deserialized.options?.pathLength, 0);
	});

	test("serialize availableColors and defaultColors", async () => {
		const options = {
			availableColors: [1, 2, 4],
			defaultColors: {
				[CellType.Tetris]: 3,
				Square: 2,
			},
		};
		const serialized = await PuzzleSerializer.serialize({ options });
		const deserialized = await PuzzleSerializer.deserialize(serialized);
		assert.deepStrictEqual(deserialized.options?.availableColors, [1, 2, 4]);
		// Note: defaultColors keys might be serialized as numbers
		assert.strictEqual((deserialized.options?.defaultColors as any)[CellType.Tetris], 3);
		assert.strictEqual((deserialized.options?.defaultColors as any)[CellType.Square], 2);
	});

	test("recovery from single character deletion", async () => {
		const serialized = await PuzzleSerializer.serialize({ puzzle: mockPuzzle as any });

		// Delete one character in the middle
		const pos = Math.floor(serialized.length / 2);
		const modified = serialized.slice(0, pos) + serialized.slice(pos + 1);

		const deserialized = await PuzzleSerializer.deserialize(modified);
		assert.deepStrictEqual(deserialized.puzzle, mockPuzzle);
	});

	test("serialize all components", async () => {
		const seed = { type: RngType.Mulberry32, value: "abcdef1234567890" };
		const options = { rows: 5, cols: 5, useHexagons: true, complexity: 0.5 };
		const path = {
			points: [
				{ x: 0, y: 0 },
				{ x: 0, y: 1 },
			],
		};
		const input = { puzzle: mockPuzzle as any, seed, options, path };

		const serialized = await PuzzleSerializer.serialize(input);
		const deserialized = await PuzzleSerializer.deserialize(serialized);

		assert.deepStrictEqual(deserialized.puzzle, mockPuzzle);
		assert.deepStrictEqual(deserialized.seed, seed);
		assert.strictEqual(deserialized.options?.rows, 5);
		assert.strictEqual(deserialized.options?.cols, 5);
		assert.strictEqual(deserialized.options?.useHexagons, true);
		assert.strictEqual(deserialized.options?.complexity, 0.5);
		assert.deepStrictEqual(deserialized.path, path);
	});

	test("serialize with partially undefined components", async () => {
		const seed = { type: RngType.Mulberry32, value: "1234" };
		const input = {
			puzzle: undefined,
			seed,
			options: undefined,
			path: undefined,
		};

		const serialized = await PuzzleSerializer.serialize(input as any);
		const deserialized = await PuzzleSerializer.deserialize(serialized);

		assert.ok(!deserialized.puzzle);
		assert.deepStrictEqual(deserialized.seed, seed);
		assert.ok(!deserialized.options);
		assert.ok(!deserialized.path);
	});
});
