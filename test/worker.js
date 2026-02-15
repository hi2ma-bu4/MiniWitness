import { WitnessCore, WitnessUI } from "../dist/MiniWitness.js";

let ui = null;
let core = new WitnessCore();
let currentPuzzle = null;

self.onmessage = async (e) => {
	const { type, payload } = e.data;

	switch (type) {
		case "init":
			const { canvas, options } = payload;
			ui = new WitnessUI(canvas, null, {
				...options,
				onPathComplete: (path) => {
					self.postMessage({ type: "drawingEnded" });
					// Always send pathComplete to allow the main thread to track the current path
					self.postMessage({ type: "pathComplete", payload: path });

					if (options.autoValidate && currentPuzzle) {
						const result = core.validateSolution(currentPuzzle, { points: path });
						ui.setValidationResult(result.isValid, result.invalidatedCells, result.invalidatedEdges, result.errorCells, result.errorEdges, result.invalidatedNodes, result.errorNodes);
						self.postMessage({ type: "validationResult", payload: result });
					}
				},
			});
			break;

		case "createPuzzle":
			const { rows, cols, genOptions } = payload;
			const puzzle = core.createPuzzle(rows, cols, genOptions);
			self.postMessage({ type: "puzzleCreated", payload: { puzzle, genOptions } });
			break;

		case "setPuzzle":
			currentPuzzle = payload.puzzle;
			ui.setPuzzle(payload.puzzle);
			if (payload.options) {
				ui.setOptions(payload.options);
			}
			break;

		case "setOptions":
			ui.setOptions(payload);
			break;

		case "setPath":
			ui.setPath(payload.path);
			break;

		case "setValidationResult":
			if (ui) {
				ui.setValidationResult(payload.isValid, payload.invalidatedCells, payload.invalidatedEdges, payload.errorCells, payload.errorEdges, payload.invalidatedNodes, payload.errorNodes);
			}
			break;

		case "setCanvasRect":
			ui.setCanvasRect(payload);
			break;

		case "validate":
			if (currentPuzzle) {
				const result = core.validateSolution(currentPuzzle, { points: payload.path });
				ui.setValidationResult(result.isValid, result.invalidatedCells, result.invalidatedEdges, result.errorCells, result.errorEdges, result.invalidatedNodes, result.errorNodes);
				self.postMessage({ type: "validationResult", payload: result });
			}
			break;

		case "event":
			const { eventType, eventData } = payload;
			if (ui) {
				if (eventType === "mousedown" || eventType === "touchstart") {
					const started = ui.handleStart(eventData);
					self.postMessage({ type: "drawingStarted", payload: started });
				} else if (eventType === "mousemove" || eventType === "touchmove") {
					ui.handleMove(eventData);
				} else if (eventType === "mouseup" || eventType === "touchend") {
					ui.handleEnd(eventData);
					self.postMessage({ type: "drawingEnded" });
				}
			}
			break;
	}
};
