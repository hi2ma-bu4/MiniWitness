import assert from "node:assert";
import { after, before, describe, test } from "node:test";

describe("Worker Internal Setup", () => {
	let capturedListener: any = null;
	const sentMessages: any[] = [];

	const originalSelf = (global as any).self;

	before(async () => {
		// Mock global self for worker detection
		(global as any).self = {
			postMessage: (msg: any) => sentMessages.push(msg),
			addEventListener: (type: string, handler: any) => {
				if (type === "message") capturedListener = handler;
			},
		};
		// Ensure 'document' is NOT in self to trigger the worker logic
		delete (global as any).self.document;

		// Dynamically import to trigger top-level code in index.ts
		// Use a timestamp to avoid module caching if this is run multiple times
		await import(`../../src/index.ts?t=${Date.now()}`);
	});

	after(() => {
		(global as any).self = originalSelf;
	});

	test("should register message listener in worker environment", () => {
		assert.ok(capturedListener, "Message listener should be registered");
	});

	test("should handle 'createPuzzle' message", () => {
		if (!capturedListener) {
			assert.fail("Listener not captured");
			return;
		}

		sentMessages.length = 0;
		capturedListener({
			data: {
				type: "createPuzzle",
				payload: { rows: 2, cols: 2, genOptions: { seed: "1234" } },
			},
		});

		assert.strictEqual(sentMessages.length, 1);
		assert.strictEqual(sentMessages[0].type, "puzzleCreated");
		assert.strictEqual(sentMessages[0].payload.puzzle.rows, 2);
	});

	test("should support 'autoValidate' in 'init' message", () => {
		if (!capturedListener) return;

		const mockCanvas = {
			getContext: () => ({
				imageSmoothingEnabled: true,
				clearRect: () => {},
				save: () => {},
				restore: () => {},
				beginPath: () => {},
				moveTo: () => {},
				lineTo: () => {},
				stroke: () => {},
				fill: () => {},
				arc: () => {},
				fillRect: () => {},
				translate: () => {},
				rotate: () => {},
				closePath: () => {},
				quadraticCurveTo: () => {},
				drawImage: () => {},
			}),
			width: 100,
			height: 100,
		};

		// 1. Initialize with autoValidate: true
		capturedListener({
			data: {
				type: "init",
				payload: { canvas: mockCanvas, options: { autoValidate: true } },
			},
		});

		// 2. Set a puzzle
		const puzzle = {
			rows: 1,
			cols: 1,
			cells: [[{ type: 0, color: 0 }]],
			hEdges: [[{ type: 0 }], [{ type: 0 }]],
			vEdges: [[{ type: 0 }, { type: 0 }]],
			nodes: [
				[{ type: 1 }, { type: 0 }],
				[{ type: 0 }, { type: 2 }],
			],
		};
		capturedListener({
			data: {
				type: "setPuzzle",
				payload: { puzzle },
			},
		});

		// 3. Complete a path (trigger onPathComplete in Worker)
		// We can't easily trigger the internal onPathComplete, but we can verify the logic in index.ts
		// if we could access the 'ui' instance.
		// For now, this is a smoke test to ensure no crashes.
	});

	test("should handle 'init' and other messages (smoke test)", () => {
		if (!capturedListener) return;

		// Mock Canvas for WitnessUI
		const mockCanvas = {
			getContext: () => ({
				imageSmoothingEnabled: true,
				clearRect: () => {},
				save: () => {},
				restore: () => {},
				beginPath: () => {},
				moveTo: () => {},
				lineTo: () => {},
				stroke: () => {},
				fill: () => {},
				arc: () => {},
				fillRect: () => {},
				translate: () => {},
				rotate: () => {},
				closePath: () => {},
				quadraticCurveTo: () => {},
				drawImage: () => {},
			}),
			width: 100,
			height: 100,
		};

		capturedListener({
			data: {
				type: "init",
				payload: { canvas: mockCanvas, options: {} },
			},
		});

		// Check if it handles setPuzzle
		capturedListener({
			data: {
				type: "setPuzzle",
				payload: {
					puzzle: {
						rows: 2,
						cols: 2,
						cells: [
							[{}, {}],
							[{}, {}],
						],
						hEdges: [
							[{}, {}],
							[{}, {}],
							[{}, {}],
						],
						vEdges: [
							[{}, {}, {}],
							[{}, {}, {}],
						],
						nodes: [
							[{}, {}, {}],
							[{}, {}, {}],
							[{}, {}, {}],
						],
					},
				},
			},
		});

		// No crash means success for this smoke test
	});

	test("should handle 'event' message and notify drawing state", () => {
		if (!capturedListener) return;

		sentMessages.length = 0;
		// 1. Send mousedown event
		capturedListener({
			data: {
				type: "event",
				payload: {
					eventType: "mousedown",
					eventData: { clientX: 0, clientY: 0 },
				},
			},
		});

		// drawingStarted should be sent
		const startMsg = sentMessages.find((m) => m.type === "drawingStarted");
		assert.ok(startMsg, "drawingStarted message should be sent");

		// 2. Send mouseup event
		capturedListener({
			data: {
				type: "event",
				payload: {
					eventType: "mouseup",
					eventData: { clientX: 0, clientY: 0 },
				},
			},
		});

		// drawingEnded should be sent
		const endMsg = sentMessages.find((m) => m.type === "drawingEnded");
		assert.ok(endMsg, "drawingEnded message should be sent");
	});
});
