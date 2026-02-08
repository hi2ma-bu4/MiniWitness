import assert from "node:assert";
import { test } from "node:test";
import { PuzzleSerializer } from "../../dist/MiniWitness.js";

test("PuzzleSerializer: serialize and deserialize", async () => {
	const puzzle = {
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

	const options = {
		useSquares: true,
		difficulty: 0.5,
		symmetry: 0,
	};

	const serialized = await PuzzleSerializer.serialize(puzzle as any, options);
	assert.strictEqual(typeof serialized, "string");
	assert.ok(serialized.length > 0);

	const deserialized = await PuzzleSerializer.deserialize(serialized);
	assert.deepStrictEqual(deserialized.puzzle, puzzle);
	assert.deepStrictEqual(deserialized.options, options);
});

test("PuzzleSerializer: serialize and deserialize with TetrisNegative", async () => {
	const puzzle = {
		rows: 1,
		cols: 1,
		cells: [[{ type: 6, color: 5, shape: [[1]] }]], // TetrisNegative, Cyan
		vEdges: [[{ type: 0 }, { type: 0 }]],
		hEdges: [[{ type: 0 }], [{ type: 0 }]],
		nodes: [
			[{ type: 1 }, { type: 0 }],
			[{ type: 0 }, { type: 2 }],
		],
	};
	const options = { useTetrisNegative: true };
	const serialized = await PuzzleSerializer.serialize(puzzle as any, options as any);
	const deserialized = await PuzzleSerializer.deserialize(serialized);
	assert.deepStrictEqual(deserialized.puzzle.cells[0][0].type, 6);
	assert.deepStrictEqual(deserialized.puzzle.cells[0][0].color, 5);
	assert.deepStrictEqual((deserialized.options as any).useTetrisNegative, true);
});

test("PuzzleSerializer: parity error detection", async () => {
	const puzzle = {
		rows: 1,
		cols: 1,
		cells: [[{ type: 0, color: 0 }]],
		vEdges: [[{ type: 0 }, { type: 0 }]],
		hEdges: [[{ type: 0 }], [{ type: 0 }]],
		nodes: [
			[{ type: 0 }, { type: 0 }],
			[{ type: 0 }, { type: 0 }],
		],
	};
	const options = {};

	const serialized = await PuzzleSerializer.serialize(puzzle as any, options);

	// Modify one character in the base64 string (excluding padding)
	const modified = serialized.slice(0, -1) + (serialized.endsWith("a") ? "b" : "a");

	await assert.rejects(async () => {
		await PuzzleSerializer.deserialize(modified);
	}, /Invalid parity data/);
});
