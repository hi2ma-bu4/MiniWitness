import type { CellConstraint, GenerationOptions, PuzzleData } from "./types";

/* ================= Bit IO ================= */

class BitWriter {
	private bytes: number[] = [];
	private cur = 0;
	private bit = 0;

	write(value: number, bits: number) {
		for (let i = 0; i < bits; i++) {
			if (value & (1 << i)) this.cur |= 1 << this.bit;
			this.bit++;
			if (this.bit === 8) {
				this.bytes.push(this.cur);
				this.cur = 0;
				this.bit = 0;
			}
		}
	}

	finish(): Uint8Array {
		if (this.bit > 0) this.bytes.push(this.cur);
		return new Uint8Array(this.bytes);
	}
}

class BitReader {
	private i = 0;
	private bit = 0;
	constructor(private buf: Uint8Array) {}

	read(bits: number): number {
		let v = 0;
		for (let i = 0; i < bits; i++) {
			if (this.buf[this.i] & (1 << this.bit)) v |= 1 << i;
			this.bit++;
			if (this.bit === 8) {
				this.bit = 0;
				this.i++;
			}
		}
		return v;
	}
}

/* ================= Utils ================= */

function collectShapes(cells: CellConstraint[][]): number[][][] {
	const map = new Map<string, number[][]>();
	for (const row of cells) {
		for (const c of row) {
			if (c.shape) {
				const key = JSON.stringify(c.shape);
				if (!map.has(key)) map.set(key, c.shape);
			}
		}
	}
	return [...map.values()];
}

/* ================= Serializer ================= */

export class PuzzleSerializer {
	static async serialize(puzzle: PuzzleData, options: GenerationOptions): Promise<string> {
		const bw = new BitWriter();

		bw.write(puzzle.rows, 6);
		bw.write(puzzle.cols, 6);

		/* ---- shapes ---- */
		const shapes = collectShapes(puzzle.cells);
		bw.write(shapes.length, 5);

		for (const s of shapes) {
			bw.write(s.length, 4);
			bw.write(s[0].length, 4);
			for (const r of s) for (const v of r) bw.write(v, 1);
		}

		const shapeIndex = new Map<string, number>();
		shapes.forEach((s, i) => shapeIndex.set(JSON.stringify(s), i));

		/* ---- cells ---- */
		for (const row of puzzle.cells) {
			for (const c of row) {
				bw.write(c.type, 3);
				bw.write(c.color, 3);
				if (c.shape) {
					bw.write(1, 1);
					bw.write(shapeIndex.get(JSON.stringify(c.shape))!, 5);
				} else {
					bw.write(0, 1);
				}
			}
		}

		/* ---- edges & nodes（サイズ厳密） ---- */
		for (let y = 0; y < puzzle.rows; y++) for (let x = 0; x < puzzle.cols + 1; x++) bw.write(puzzle.vEdges[y][x].type, 2);

		for (let y = 0; y < puzzle.rows + 1; y++) for (let x = 0; x < puzzle.cols; x++) bw.write(puzzle.hEdges[y][x].type, 2);

		for (let y = 0; y < puzzle.rows + 1; y++) for (let x = 0; x < puzzle.cols + 1; x++) bw.write(puzzle.nodes[y][x].type, 2);

		/* ---- options ---- */
		bw.write(+!!options.useHexagons, 1);
		bw.write(+!!options.useSquares, 1);
		bw.write(+!!options.useStars, 1);
		bw.write(+!!options.useTetris, 1);
		bw.write(+!!options.useEraser, 1);
		bw.write(+!!options.useBrokenEdges, 1);

		bw.write(Math.round((options.complexity ?? 0) * 254), 8);
		bw.write(Math.round((options.difficulty ?? 0) * 254), 8);
		bw.write(Math.round((options.pathLength ?? 0) * 254), 8);

		const raw = bw.finish();

		const gz = new Uint8Array(await new Response(new Blob([raw.buffer as ArrayBuffer]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());

		let parity = 0;
		for (const b of gz) parity ^= b;

		const final = new Uint8Array(gz.length + 1);
		final.set(gz);
		final[gz.length] = parity;

		return btoa(String.fromCharCode(...final))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");
	}

	static async deserialize(str: string): Promise<{ puzzle: PuzzleData; options: GenerationOptions }> {
		let s = str.replace(/-/g, "+").replace(/_/g, "/");
		while (s.length % 4) s += "=";

		const bin = atob(s);
		const buf = Uint8Array.from(bin, (c) => c.charCodeAt(0));

		let parity = 0;
		for (let i = 0; i < buf.length - 1; i++) parity ^= buf[i];
		if (parity !== buf.at(-1)) throw new Error("Invalid parity data");

		const raw = new Uint8Array(await new Response(new Blob([buf.slice(0, -1).buffer]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());

		const br = new BitReader(raw);

		const rows = br.read(6);
		const cols = br.read(6);

		/* ---- shapes ---- */
		const shapeCount = br.read(5);
		const shapes: number[][][] = [];

		for (let i = 0; i < shapeCount; i++) {
			const h = br.read(4);
			const w = br.read(4);
			const s: number[][] = [];
			for (let y = 0; y < h; y++) {
				const r: number[] = [];
				for (let x = 0; x < w; x++) r.push(br.read(1));
				s.push(r);
			}
			shapes.push(s);
		}

		/* ---- cells ---- */
		const cells: CellConstraint[][] = [];
		for (let y = 0; y < rows; y++) {
			const row: CellConstraint[] = [];
			for (let x = 0; x < cols; x++) {
				const type = br.read(3);
				const color = br.read(3);
				const hasShape = br.read(1);

				const cell: CellConstraint = { type, color };
				if (hasShape) cell.shape = shapes[br.read(5)].map((r) => r.slice());

				row.push(cell);
			}
			cells.push(row);
		}

		/* ---- edges & nodes ---- */
		const vEdges = Array.from({ length: rows }, () => Array.from({ length: cols + 1 }, () => ({ type: br.read(2) })));

		const hEdges = Array.from({ length: rows + 1 }, () => Array.from({ length: cols }, () => ({ type: br.read(2) })));

		const nodes = Array.from({ length: rows + 1 }, () => Array.from({ length: cols + 1 }, () => ({ type: br.read(2) })));

		const readRatio = () => {
			const v = br.read(8);
			return Math.round((v / 254) * 1000) / 1000;
		};

		const options: GenerationOptions = {};

		const useHexagons = !!br.read(1);
		const useSquares = !!br.read(1);
		const useStars = !!br.read(1);
		const useTetris = !!br.read(1);
		const useEraser = !!br.read(1);
		const useBroken = !!br.read(1);

		if (useHexagons) options.useHexagons = true;
		if (useSquares) options.useSquares = true;
		if (useStars) options.useStars = true;
		if (useTetris) options.useTetris = true;
		if (useEraser) options.useEraser = true;
		if (useBroken) options.useBrokenEdges = true;

		const complexity = readRatio();
		const difficulty = readRatio();
		const pathLength = readRatio();

		if (complexity !== 0) options.complexity = complexity;
		if (difficulty !== 0) options.difficulty = difficulty;
		if (pathLength !== 0) options.pathLength = pathLength;

		return { puzzle: { rows, cols, cells, vEdges, hEdges, nodes }, options };
	}
}
