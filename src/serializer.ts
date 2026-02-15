import { CellType, RngType, type CellConstraint, type DeserializedData, type GenerationOptions, type Point, type PuzzleData, type SerializationOptions, type SolutionPath } from "./types";

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

	get hasMore(): boolean {
		return this.i < this.buf.length;
	}
}

/* ================= ECC (Reed-Solomon lite) ================= */

const GF256_EXP = new Uint8Array(512);
const GF256_LOG = new Uint8Array(256);
{
	let x = 1;
	for (let i = 0; i < 255; i++) {
		GF256_EXP[i] = x;
		GF256_EXP[i + 255] = x;
		GF256_LOG[x] = i;
		x <<= 1;
		if (x & 0x100) x ^= 0x11d; // x^8 + x^4 + x^3 + x^2 + 1
	}
}

function gf_mul(a: number, b: number): number {
	if (a === 0 || b === 0) return 0;
	return GF256_EXP[GF256_LOG[a] + GF256_LOG[b]];
}

function rs_encode(data: Uint8Array, nsym: number): Uint8Array {
	let gen = new Uint8Array([1]);
	for (let i = 0; i < nsym; i++) {
		const next = new Uint8Array(gen.length + 1);
		const root = GF256_EXP[i];
		for (let j = 0; j < gen.length; j++) {
			next[j] ^= gf_mul(gen[j], root);
			next[j + 1] ^= gen[j];
		}
		gen = next;
	}
	const poly = gen.slice(0, nsym + 1).reverse();

	const res = new Uint8Array(nsym);
	for (let i = 0; i < data.length; i++) {
		const m = data[i] ^ res[0];
		for (let j = 0; j < nsym - 1; j++) res[j] = res[j + 1] ^ gf_mul(m, poly[j + 1]);
		res[nsym - 1] = gf_mul(m, poly[nsym]);
	}
	return res;
}

// Simple syndrome check
function rs_check(data: Uint8Array, parity: Uint8Array): boolean {
	const msg = new Uint8Array(data.length + parity.length);
	msg.set(data);
	msg.set(parity, data.length);
	for (let i = 0; i < parity.length; i++) {
		let s = 0;
		const x = GF256_EXP[i];
		for (let j = 0; j < msg.length; j++) s = gf_mul(s, x) ^ msg[j];
		if (s !== 0) return false;
	}
	return true;
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

/**
 * パズルデータ、設定、シード、経路などをシリアライズ/デシリアライズするクラス
 */
export class PuzzleSerializer {
	/**
	 * データを圧縮されたBase64文字列に変換する
	 */
	static async serialize(data: SerializationOptions | PuzzleData, legacyOptions?: GenerationOptions): Promise<string> {
		let input: SerializationOptions;
		// Detect legacy call: data is PuzzleData if it has rows/cols/cells and no puzzle/options keys (unless they are from PuzzleData properties, which they aren't)
		const d = data as any;
		const isLegacy = typeof d === "object" && d !== null && "rows" in d && "cells" in d && !("puzzle" in d) && !("options" in d) && !("path" in d) && !("seed" in d);

		if (isLegacy) {
			input = { puzzle: data as PuzzleData, options: legacyOptions };
		} else {
			input = data as SerializationOptions;
		}

		const bw = new BitWriter();

		// Header: Flags (8 bits)
		let flags = 0;
		if (input.puzzle) flags |= 1 << 0;
		if (input.seed) flags |= 1 << 1;
		if (input.options) flags |= 1 << 2;
		if (input.path) flags |= 1 << 3;
		const recovery = input.parityMode === "recovery";
		if (recovery) flags |= 1 << 4;

		bw.write(flags, 8);

		if (input.puzzle) this.writePuzzle(bw, input.puzzle);
		if (input.seed) this.writeSeed(bw, input.seed);
		if (input.options) this.writeOptions(bw, input.options);
		if (input.path) this.writePath(bw, input.path);

		const raw = bw.finish();
		const gz = new Uint8Array(await new Response(new Blob([raw.buffer as ArrayBuffer]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());

		let final: Uint8Array;
		if (recovery) {
			// Strong recovery: Reed-Solomon (nsym=10)
			const parity = rs_encode(gz, 10);
			final = new Uint8Array(gz.length + 10 + 2);
			final.set(gz);
			final.set(parity, gz.length);
			final[final.length - 2] = gz.length & 0xff;
			final[final.length - 1] = (gz.length >> 8) & 0xff;
		} else {
			// Detection mode: simple XOR parity
			let p = 0;
			for (const b of gz) p ^= b;
			final = new Uint8Array(gz.length + 1);
			final.set(gz);
			final[gz.length] = p;
		}

		return btoa(String.fromCharCode(...final))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");
	}

	/**
	 * シリアライズされた文字列からデータを復元する
	 */
	static async deserialize(str: string): Promise<DeserializedData> {
		const tryDecode = async (s: string): Promise<Uint8Array | null> => {
			try {
				let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
				while (b64.length % 4) b64 += "=";
				const bin = atob(b64);
				return Uint8Array.from(bin, (c) => c.charCodeAt(0));
			} catch {
				return null;
			}
		};

		const attemptRecovery = async (data: Uint8Array): Promise<Uint8Array | null> => {
			if (data.length === 0) return null;
			// 1. Detection mode check
			let p = 0;
			for (let i = 0; i < data.length - 1; i++) p ^= data[i];
			if (p === data[data.length - 1]) return data.slice(0, -1);

			// 2. Strong recovery mode check
			if (data.length > 12) {
				const gzLen = data[data.length - 2] | (data[data.length - 1] << 8);
				if (gzLen + 12 === data.length) {
					const gz = data.slice(0, gzLen);
					const parity = data.slice(gzLen, gzLen + 10);
					if (rs_check(gz, parity)) return gz;
				}
			}
			return null;
		};

		let buf = await tryDecode(str);
		let gz: Uint8Array | null = buf ? await attemptRecovery(buf) : null;

		// 3. Handle deletion (heuristic)
		if (!gz && str.length < 1000) {
			const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
			for (let i = 0; i <= str.length; i++) {
				for (let j = 0; j < chars.length; j++) {
					const s = str.slice(0, i) + chars[j] + str.slice(i);
					const b = await tryDecode(s);
					if (b) {
						const g = await attemptRecovery(b);
						if (g) {
							try {
								return await this.finalizeDeserialize(g);
							} catch {
								/* continue */
							}
						}
					}
				}
			}
		}

		if (!gz) throw new Error("Invalid parity data or unrecoverable corruption");
		return this.finalizeDeserialize(gz);
	}

	private static async finalizeDeserialize(gz: Uint8Array): Promise<DeserializedData> {
		const raw = new Uint8Array(await new Response(new Blob([gz.buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
		const br = new BitReader(raw);

		const flags = br.read(8);
		const result: DeserializedData = {};

		if (flags & (1 << 0)) result.puzzle = this.readPuzzle(br);
		if (flags & (1 << 1)) result.seed = this.readSeed(br);
		if (flags & (1 << 2)) result.options = this.readOptions(br);
		if (flags & (1 << 3)) result.path = this.readPath(br);

		return result;
	}

	private static writePuzzle(bw: BitWriter, puzzle: PuzzleData) {
		bw.write(puzzle.rows, 6);
		bw.write(puzzle.cols, 6);
		bw.write(puzzle.symmetry ?? 0, 2);

		const shapes = collectShapes(puzzle.cells);
		bw.write(shapes.length, 5);
		for (const s of shapes) {
			bw.write(s.length, 4);
			bw.write(s[0].length, 4);
			for (const r of s) for (const v of r) bw.write(v, 1);
		}

		const shapeIndex = new Map<string, number>();
		shapes.forEach((s, i) => shapeIndex.set(JSON.stringify(s), i));

		for (const row of puzzle.cells) {
			for (const c of row) {
				bw.write(c.type, 4);
				bw.write(c.color, 3);
				if (c.type === CellType.Triangle) {
					bw.write(c.count || 0, 2);
				} else if (c.shape) {
					bw.write(1, 1);
					bw.write(shapeIndex.get(JSON.stringify(c.shape))!, 5);
				} else {
					bw.write(0, 1);
				}
			}
		}

		for (let y = 0; y < puzzle.rows; y++) for (let x = 0; x < puzzle.cols + 1; x++) bw.write(puzzle.vEdges[y][x].type, 3);
		for (let y = 0; y < puzzle.rows + 1; y++) for (let x = 0; x < puzzle.cols; x++) bw.write(puzzle.hEdges[y][x].type, 3);
		for (let y = 0; y < puzzle.rows + 1; y++) for (let x = 0; x < puzzle.cols + 1; x++) bw.write(puzzle.nodes[y][x].type, 3);
	}

	private static readPuzzle(br: BitReader): PuzzleData {
		const rows = br.read(6);
		const cols = br.read(6);
		const symmetry = br.read(2);

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

		const cells: CellConstraint[][] = [];
		for (let y = 0; y < rows; y++) {
			const row: CellConstraint[] = [];
			for (let x = 0; x < cols; x++) {
				const type = br.read(4) as CellType;
				const color = br.read(3);
				const cell: CellConstraint = { type, color };
				if (type === CellType.Triangle) {
					cell.count = br.read(2);
				} else {
					if (br.read(1)) cell.shape = shapes[br.read(5)].map((r) => r.slice());
				}
				row.push(cell);
			}
			cells.push(row);
		}

		const vEdges = Array.from({ length: rows }, () => Array.from({ length: cols + 1 }, () => ({ type: br.read(3) })));
		const hEdges = Array.from({ length: rows + 1 }, () => Array.from({ length: cols }, () => ({ type: br.read(3) })));
		const nodes = Array.from({ length: rows + 1 }, () => Array.from({ length: cols + 1 }, () => ({ type: br.read(3) })));

		return { rows, cols, cells, vEdges, hEdges, nodes, symmetry };
	}

	private static writeSeed(bw: BitWriter, seed: { type: RngType; value: string }) {
		bw.write(seed.type, 2);
		bw.write(seed.value.length, 8);
		for (let i = 0; i < seed.value.length; i++) {
			bw.write(parseInt(seed.value[i], 16), 4);
		}
	}

	private static readSeed(br: BitReader): { type: RngType; value: string } {
		const type = br.read(2) as RngType;
		const len = br.read(8);
		let value = "";
		for (let i = 0; i < len; i++) {
			value += br.read(4).toString(16);
		}
		return { type, value };
	}

	private static writeOptions(bw: BitWriter, options: GenerationOptions) {
		bw.write(options.rows ?? 0, 6);
		bw.write(options.cols ?? 0, 6);
		bw.write(+!!options.useHexagons, 1);
		bw.write(+!!options.useSquares, 1);
		bw.write(+!!options.useStars, 1);
		bw.write(+!!options.useTetris, 1);
		bw.write(+!!options.useTetrisNegative, 1);
		bw.write(+!!options.useEraser, 1);
		bw.write(+!!options.useTriangles, 1);
		bw.write(+!!options.useBrokenEdges, 1);
		bw.write(options.symmetry ?? 0, 2);
		bw.write(Math.round((options.complexity ?? 0) * 254), 8);
		bw.write(Math.round((options.difficulty ?? 0) * 254), 8);
		bw.write(Math.round((options.pathLength ?? 0) * 254), 8);

		if (options.availableColors && options.availableColors.length > 0) {
			bw.write(1, 1);
			bw.write(options.availableColors.length, 4);
			for (const c of options.availableColors) bw.write(c, 3);
		} else {
			bw.write(0, 1);
		}

		if (options.defaultColors) {
			const entries = Object.entries(options.defaultColors);
			bw.write(entries.length, 4);
			for (const [key, val] of entries) {
				const type = isNaN(Number(key)) ? (CellType as any)[key] : Number(key);
				bw.write(type, 4);
				bw.write(val as number, 3);
			}
		} else {
			bw.write(0, 4);
		}
	}

	private static readOptions(br: BitReader): GenerationOptions {
		const options: GenerationOptions = {};
		const rows = br.read(6);
		const cols = br.read(6);
		if (rows > 0) options.rows = rows;
		if (cols > 0) options.cols = cols;

		if (br.read(1)) options.useHexagons = true;
		if (br.read(1)) options.useSquares = true;
		if (br.read(1)) options.useStars = true;
		if (br.read(1)) options.useTetris = true;
		if (br.read(1)) options.useTetrisNegative = true;
		if (br.read(1)) options.useEraser = true;
		if (br.read(1)) options.useTriangles = true;
		if (br.read(1)) options.useBrokenEdges = true;
		options.symmetry = br.read(2);

		const readRatio = () => Math.round((br.read(8) / 254) * 1000) / 1000;
		options.complexity = readRatio();
		options.difficulty = readRatio();
		options.pathLength = readRatio();

		if (br.read(1)) {
			const len = br.read(4);
			options.availableColors = [];
			for (let i = 0; i < len; i++) options.availableColors.push(br.read(3));
		}

		const defLen = br.read(4);
		if (defLen > 0) {
			options.defaultColors = {};
			for (let i = 0; i < defLen; i++) {
				const type = br.read(4);
				const color = br.read(3);
				(options.defaultColors as any)[type] = color;
			}
		}

		return options;
	}

	private static writePath(bw: BitWriter, path: SolutionPath) {
		bw.write(path.points.length, 12);
		if (path.points.length === 0) return;
		bw.write(path.points[0].x, 6);
		bw.write(path.points[0].y, 6);
		for (let i = 1; i < path.points.length; i++) {
			const p1 = path.points[i - 1];
			const p2 = path.points[i];
			const dx = p2.x - p1.x;
			const dy = p2.y - p1.y;
			let dir = 0;
			if (dy === -1) dir = 0;
			else if (dx === 1) dir = 1;
			else if (dy === 1) dir = 2;
			else if (dx === -1) dir = 3;
			bw.write(dir, 2);
		}
	}

	private static readPath(br: BitReader): SolutionPath {
		const len = br.read(12);
		if (len === 0) return { points: [] };
		const points: Point[] = [];
		let x = br.read(6);
		let y = br.read(6);
		points.push({ x, y });
		for (let i = 1; i < len; i++) {
			const dir = br.read(2);
			if (dir === 0) y--;
			else if (dir === 1) x++;
			else if (dir === 2) y++;
			else if (dir === 3) x--;
			points.push({ x, y });
		}
		return { points };
	}
}
