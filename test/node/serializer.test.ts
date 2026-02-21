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

	test("serialize and deserialize", async () => {
		const options = {
			useSquares: true,
			difficulty: 0.5,
			symmetry: 0,
		};
		const serialized = await PuzzleSerializer.serialize({ puzzle: mockPuzzle as any, options });
		assert.strictEqual(typeof serialized, "string");

		const deserialized = await PuzzleSerializer.deserialize(serialized);
		assert.ok(deserialized.puzzle);
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

	test("single character deletion remains deserializable", async () => {
		const serialized = await PuzzleSerializer.serialize({ puzzle: mockPuzzle as any, parityMode: "recovery" });

		// Delete one character in the middle
		const pos = Math.floor(serialized.length / 2);
		const modified = serialized.slice(0, pos) + serialized.slice(pos + 1);

		const deserialized = await PuzzleSerializer.deserialize(modified);
		assert.ok(deserialized.puzzle);
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

	test("serialize and deserialize filter settings", async () => {
		const input = {
			filter: {
				enabled: true,
				mode: "custom" as const,
				customColor: "#12ab34",
				rgbColors: ["#111111", "#222222", "#333333"] as [string, string, string],
				rgbIndex: 2 as const,
				threshold: 77,
			},
		};
		const serialized = await PuzzleSerializer.serialize(input);
		const deserialized = await PuzzleSerializer.deserialize(serialized);
		assert.deepStrictEqual(deserialized.filter, input.filter);
	});

	test("share code should not have fixed prefix/suffix and should stay compact", async () => {
		const s1 = await PuzzleSerializer.serialize({ options: { rows: 4, cols: 4, difficulty: 0.2 } });
		const s2 = await PuzzleSerializer.serialize({ options: { rows: 10, cols: 10, difficulty: 0.9 } });
		assert.notStrictEqual(s1.slice(0, 4), s2.slice(0, 4));
		assert.notStrictEqual(s1.slice(-4), s2.slice(-4));
		assert.ok(s1.length < 80);
		assert.ok(s2.length < 80);
	});

	test("recovery mode can restore even if 5 chars are deleted", async () => {
		const serialized = await PuzzleSerializer.serialize({
			puzzle: mockPuzzle as any,
			options: { rows: 4, cols: 4, useSquares: true, difficulty: 0.7 },
			filter: { enabled: true, mode: "rgb", rgbIndex: 1, customColor: "#abcdef", rgbColors: ["#111111", "#222222", "#333333"], threshold: 100 },
			parityMode: "recovery",
		});

		const tokenStart = serialized.lastIndexOf(".", serialized.lastIndexOf(".") - 1) + 1;
		const removeIdx = [1, 5, 11, 17, 23].map((i) => tokenStart + i).filter((i) => i < serialized.length);
		let modified = serialized;
		for (let i = removeIdx.length - 1; i >= 0; i--) {
			const idx = removeIdx[i];
			modified = modified.slice(0, idx) + modified.slice(idx + 1);
		}

		assert.ok(/^r\.[0-9a-z]+-[0-9a-z]+\./.test(serialized));
		assert.ok(/^[A-Za-z0-9._-]+$/.test(serialized));
		assert.ok(serialized.length < 300);
		const deserialized = await PuzzleSerializer.deserialize(modified);
		assert.deepStrictEqual(deserialized.puzzle, mockPuzzle);
		assert.strictEqual(deserialized.options?.difficulty, 0.701);
		assert.deepStrictEqual(deserialized.filter?.rgbColors, ["#111111", "#222222", "#333333"]);
	});
});
