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

const SHARE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const SHARE64_MAP = new Int16Array(128).fill(-1);
for (let i = 0; i < SHARE64_ALPHABET.length; i++) SHARE64_MAP[SHARE64_ALPHABET.charCodeAt(i)] = i;

const GF64_EXP = new Uint8Array(126);
const GF64_LOG = new Int16Array(64).fill(-1);
{
	let x = 1;
	for (let i = 0; i < 63; i++) {
		GF64_EXP[i] = x;
		GF64_LOG[x] = i;
		x <<= 1;
		if (x & 0x40) x ^= 0x43; // x^6 + x + 1
	}
	for (let i = 63; i < 126; i++) GF64_EXP[i] = GF64_EXP[i - 63];
}

function gf64_add(a: number, b: number): number {
	return a ^ b;
}

function gf64_mul(a: number, b: number): number {
	if (a === 0 || b === 0) return 0;
	return GF64_EXP[GF64_LOG[a] + GF64_LOG[b]];
}

function gf64_inv(a: number): number {
	if (a === 0) throw new Error("GF64 inverse of zero");
	return GF64_EXP[63 - GF64_LOG[a]];
}

function gf64_pow(a: number, p: number): number {
	if (p === 0) return 1;
	if (a === 0) return 0;
	return GF64_EXP[(GF64_LOG[a] * p) % 63];
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
	static async serialize(input: SerializationOptions): Promise<string> {
		const bw = new BitWriter();

		let flags = 0;
		if (input.puzzle) flags |= 1 << 0;
		if (input.seed) flags |= 1 << 1;
		if (input.options) flags |= 1 << 2;
		if (input.path) flags |= 1 << 3;
		if (input.filter) flags |= 1 << 5;
		const recovery = input.parityMode === "recovery";
		if (recovery) flags |= 1 << 4;

		bw.write(flags, 8);

		if (input.puzzle) this.writePuzzle(bw, input.puzzle);
		if (input.seed) this.writeSeed(bw, input.seed);
		if (input.options) this.writeOptions(bw, input.options);
		if (input.path) this.writePath(bw, input.path);
		if (input.filter) this.writeFilter(bw, input.filter);

		const raw = bw.finish();
		const gz = new Uint8Array(await new Response(new Blob([raw.buffer as ArrayBuffer]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());

		const useGzip = gz.length + 1 < raw.length;
		const payload = useGzip ? gz : raw;
		const modeByte = useGzip ? 1 : 0;

		const body = new Uint8Array(payload.length + 1);
		body[0] = modeByte;
		body.set(payload, 1);
		let p = 0;
		for (const b of body) p ^= b;
		const final = new Uint8Array(body.length + 1);
		final.set(body);
		final[body.length] = p;

		const base = this.toBase64Url(final);
		return recovery ? this.encodeRobustShareCode(base) : base;
	}

	/**
	 * シリアライズされた文字列からデータを復元する
	 */
	static async deserialize(str: string): Promise<DeserializedData> {
		const tryDecode = (s: string): Uint8Array | null => {
			try {
				let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
				while (b64.length % 4) b64 += "=";
				const bin = atob(b64);
				return Uint8Array.from(bin, (c) => c.charCodeAt(0));
			} catch {
				return null;
			}
		};

		const attemptRecovery = (data: Uint8Array): { payload: Uint8Array; compressed: boolean } | null => {
			if (data.length < 2) return null;

			let p = 0;
			for (let i = 0; i < data.length - 1; i++) p ^= data[i];
			const body = p === data[data.length - 1] ? data.slice(0, -1) : null;
			if (!body || body.length < 1) return null;
			const mode = body[0];
			if (mode !== 0 && mode !== 1) return null;
			return { payload: body.slice(1), compressed: mode === 1 };
		};

		const parseCandidate = async (candidate: string): Promise<DeserializedData | null> => {
			const decoded = tryDecode(candidate);
			if (!decoded) return null;
			const recovered = attemptRecovery(decoded);
			if (!recovered) return null;
			try {
				const parsed = await this.finalizeDeserialize(recovered.payload, recovered.compressed);
				if (parsed.puzzle || parsed.seed || parsed.options || parsed.path || parsed.filter) return parsed;
			} catch {
				return null;
			}
			return null;
		};

		const candidates = this.extractShareCodeCandidates(str);
		for (const candidate of candidates) {
			const parsed = await parseCandidate(candidate);
			if (parsed) return parsed;
		}

		for (const candidate of candidates) {
			if (candidate.length >= 1000) continue;
			for (let i = 0; i <= candidate.length; i++) {
				for (let j = 0; j < SHARE64_ALPHABET.length; j++) {
					const s = candidate.slice(0, i) + SHARE64_ALPHABET[j] + candidate.slice(i);
					const parsed = await parseCandidate(s);
					if (parsed) return parsed;
				}
			}
		}

		throw new Error("Invalid parity data or unrecoverable corruption");
	}

	private static toBase64Url(bytes: Uint8Array): string {
		return btoa(String.fromCharCode(...bytes))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");
	}

	private static share64Value(ch: string): number {
		const code = ch.charCodeAt(0);
		return code < SHARE64_MAP.length ? SHARE64_MAP[code] : -1;
	}

	private static solveLinearGF64(matrix: number[][], vector: number[]): number[] {
		const n = matrix.length;
		const a = matrix.map((row, i) => [...row, vector[i]]);
		for (let col = 0; col < n; col++) {
			let pivot = col;
			while (pivot < n && a[pivot][col] === 0) pivot++;
			if (pivot === n) throw new Error("Singular matrix");
			if (pivot !== col) [a[col], a[pivot]] = [a[pivot], a[col]];
			const inv = gf64_inv(a[col][col]);
			for (let j = col; j <= n; j++) a[col][j] = gf64_mul(a[col][j], inv);
			for (let r = 0; r < n; r++) {
				if (r === col || a[r][col] === 0) continue;
				const factor = a[r][col];
				for (let j = col; j <= n; j++) a[r][j] = gf64_add(a[r][j], gf64_mul(factor, a[col][j]));
			}
		}
		return a.map((row) => row[n]);
	}

	private static encodeRobustShareCode(core: string): string {
		if (core.length === 0) return "r.0-8.0-8.0-8";
		const parityCount = 5;
		const chunkSize = Math.max(8, Math.ceil(core.length / 59));
		const dataChunkCount = Math.ceil(core.length / chunkSize);
		if (dataChunkCount + parityCount > 63) throw new Error("Share code is too long for recovery mode");

		const dataChunks: number[][] = [];
		for (let i = 0; i < dataChunkCount; i++) {
			const chars: number[] = [];
			for (let j = 0; j < chunkSize; j++) {
				const idx = i * chunkSize + j;
				if (idx < core.length) {
					const v = this.share64Value(core[idx]);
					if (v < 0) throw new Error("Invalid core character for robust code");
					chars.push(v);
				} else {
					chars.push(0);
				}
			}
			dataChunks.push(chars);
		}

		const parityChunks = Array.from({ length: parityCount }, () => Array(chunkSize).fill(0));
		for (let pos = 0; pos < chunkSize; pos++) {
			for (let pj = 0; pj < parityCount; pj++) {
				let acc = 0;
				for (let di = 0; di < dataChunkCount; di++) {
					const coef = gf64_pow(di + 1, pj);
					acc = gf64_add(acc, gf64_mul(dataChunks[di][pos], coef));
				}
				parityChunks[pj][pos] = acc;
			}
		}

		const checksum12 = (chunk: number[]): number => {
			let acc = 0;
			for (let i = 0; i < chunk.length; i++) acc = (acc + (i + 1) * chunk[i]) & 0xfff;
			return acc;
		};

		const toToken = (index: number, chunk: number[]) => {
			const crc = checksum12(chunk);
			let body = "";
			for (const v of chunk) body += SHARE64_ALPHABET[v];
			return `${SHARE64_ALPHABET[index]}${SHARE64_ALPHABET[(crc >> 6) & 0x3f]}${SHARE64_ALPHABET[crc & 0x3f]}${body}`;
		};

		const tokens: string[] = [];
		for (let i = 0; i < dataChunkCount; i++) tokens.push(toToken(i, dataChunks[i]));
		for (let i = 0; i < parityCount; i++) tokens.push(toToken(dataChunkCount + i, parityChunks[i]));
		const tokenStream = tokens.join(".");

		const header = `${core.length.toString(36)}-${chunkSize.toString(36)}`;
		const repeatedHeader = Array.from({ length: 8 }, () => header).join(".");
		return `r.${repeatedHeader}.${tokenStream}`;
	}

	private static decodeRobustShareCode(str: string): string | null {
		if (!str.startsWith("r.")) return null;
		let coreLen = -1;
		let chunkSize = -1;
		let tail = "";
		const compactHeader = /^r\.([0-9a-z]+)\.([0-9a-z]+)(?:\.(.*))?$/.exec(str);
		if (compactHeader) {
			coreLen = Number.parseInt(compactHeader[1], 36);
			chunkSize = Number.parseInt(compactHeader[2], 36);
			tail = compactHeader[3] || "";
			if (coreLen >= 0 && chunkSize >= 1) return this.decodeRobustCore(coreLen, chunkSize, tail);
		}

		const segments = str.slice(2).split(".");
		let headerIndex = -1;
		for (let i = 0; i < segments.length; i++) {
			const seg = segments[i];
			const m = /^([0-9a-z]+)-([0-9a-z]+)$/.exec(seg);
			if (!m) continue;
			const l = Number.parseInt(m[1], 36);
			const c = Number.parseInt(m[2], 36);
			if (Number.isFinite(l) && l >= 0 && Number.isFinite(c) && c >= 1) {
				coreLen = l;
				chunkSize = c;
				headerIndex = i;
			}
		}
		if (headerIndex < 0 || coreLen < 0 || chunkSize < 1) return null;
		tail = segments.slice(headerIndex + 1).join(".");
		return this.decodeRobustCore(coreLen, chunkSize, tail);
	}

	private static decodeRobustCore(coreLen: number, chunkSize: number, tail: string): string | null {
		const parityCount = 5;
		const dataChunkCount = coreLen === 0 ? 0 : Math.ceil(coreLen / chunkSize);
		const totalChunkCount = dataChunkCount + parityCount;
		if (totalChunkCount > 63) return null;
		if (coreLen === 0) return "";

		const tokenLen = chunkSize + 3;
		if (tail.length < tokenLen) return null;

		const checksum12 = (chunk: number[]): number => {
			let acc = 0;
			for (let i = 0; i < chunk.length; i++) acc = (acc + (i + 1) * chunk[i]) & 0xfff;
			return acc;
		};

		const chunks: Array<number[] | null> = Array(totalChunkCount).fill(null);
		for (const t of tail.split(".")) {
			if (t.length !== tokenLen) continue;
			const idx = this.share64Value(t[0]);
			const crcHi = this.share64Value(t[1]);
			const crcLo = this.share64Value(t[2]);
			if (idx < 0 || idx >= totalChunkCount || crcHi < 0 || crcLo < 0) continue;
			const data: number[] = [];
			let ok = true;
			for (let j = 3; j < t.length; j++) {
				const v = this.share64Value(t[j]);
				if (v < 0) {
					ok = false;
					break;
				}
				data.push(v);
			}
			if (!ok) continue;
			const crc = (crcHi << 6) | crcLo;
			if (checksum12(data) !== crc) continue;
			chunks[idx] = data;
		}

		const missingSet = new Set<number>();
		for (let i = 0; i < dataChunkCount; i++) if (!chunks[i]) missingSet.add(i);
		if (missingSet.size > parityCount) return null;

		const availableParity: number[] = [];
		for (let i = 0; i < parityCount; i++) if (chunks[dataChunkCount + i]) availableParity.push(i);
		if (missingSet.size > availableParity.length) return null;

		const missingData = [...missingSet];
		if (missingData.length > 0) {
			const rows = availableParity.slice(0, missingData.length);
			for (let pos = 0; pos < chunkSize; pos++) {
				const mat = rows.map((r) => missingData.map((di) => gf64_pow(di + 1, r)));
				const vec = rows.map((r) => {
					let rhs = (chunks[dataChunkCount + r] as number[])[pos];
					for (let di = 0; di < dataChunkCount; di++) {
						if (missingSet.has(di)) continue;
						rhs = gf64_add(rhs, gf64_mul((chunks[di] as number[])[pos], gf64_pow(di + 1, r)));
					}
					return rhs;
				});
				const solved = this.solveLinearGF64(mat, vec);
				for (let i = 0; i < missingData.length; i++) {
					const di = missingData[i];
					if (!chunks[di]) chunks[di] = Array(chunkSize).fill(0);
					(chunks[di] as number[])[pos] = solved[i];
				}
			}
		}
		let core = "";
		for (let i = 0; i < dataChunkCount; i++) {
			const chunk = chunks[i];
			if (!chunk) return null;
			for (const v of chunk) core += SHARE64_ALPHABET[v];
		}
		return core.slice(0, coreLen);
	}

	private static extractShareCodeCandidates(str: string): string[] {
		const set = new Set<string>();
		if (str) set.add(str);
		const decodedRobust = this.decodeRobustShareCode(str);
		if (decodedRobust) set.add(decodedRobust);
		return [...set];
	}

	private static async finalizeDeserialize(payload: Uint8Array, compressed: boolean): Promise<DeserializedData> {
		const raw = compressed ? new Uint8Array(await new Response(new Blob([payload.buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()) : payload;
		const br = new BitReader(raw);

		const flags = br.read(8);
		const result: DeserializedData = {};

		if (flags & (1 << 0)) result.puzzle = this.readPuzzle(br);
		if (flags & (1 << 1)) result.seed = this.readSeed(br);
		if (flags & (1 << 2)) result.options = this.readOptions(br);
		if (flags & (1 << 3)) result.path = this.readPath(br);
		if (flags & (1 << 5)) result.filter = this.readFilter(br);

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

	private static writeColorHex24(bw: BitWriter, color: string) {
		const v = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#000000";
		bw.write(parseInt(v.slice(1), 16), 24);
	}

	private static readColorHex24(br: BitReader): string {
		return `#${br.read(24).toString(16).padStart(6, "0")}`;
	}

	private static writeFilter(bw: BitWriter, filter: { enabled?: boolean; mode?: "custom" | "rgb"; customColor?: string; rgbColors?: [string, string, string]; rgbIndex?: 0 | 1 | 2; threshold?: number }) {
		bw.write(+!!filter.enabled, 1);
		bw.write(filter.mode === "rgb" ? 1 : 0, 1);
		this.writeColorHex24(bw, filter.customColor ?? "#ffffff");
		const rgb = filter.rgbColors ?? ["#ff0000", "#00ff00", "#0000ff"];
		this.writeColorHex24(bw, rgb[0]);
		this.writeColorHex24(bw, rgb[1]);
		this.writeColorHex24(bw, rgb[2]);
		bw.write(Math.max(0, Math.min(2, filter.rgbIndex ?? 0)), 2);
		bw.write(Math.max(0, Math.min(255, Math.round(filter.threshold ?? 128))), 8);
	}

	private static readFilter(br: BitReader): {
		enabled?: boolean;
		mode?: "custom" | "rgb";
		customColor?: string;
		rgbColors?: [string, string, string];
		rgbIndex?: 0 | 1 | 2;
		threshold?: number;
	} {
		return {
			enabled: !!br.read(1),
			mode: br.read(1) ? "rgb" : "custom",
			customColor: this.readColorHex24(br),
			rgbColors: [this.readColorHex24(br), this.readColorHex24(br), this.readColorHex24(br)],
			rgbIndex: br.read(2) as 0 | 1 | 2,
			threshold: br.read(8),
		};
	}
}
