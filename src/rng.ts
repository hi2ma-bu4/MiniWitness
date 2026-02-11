export enum RngType {
	Mulberry32 = 0,
	XorShift128Plus = 1,
	MathRandom = 2,
}

export interface IRng {
	next(): number;
}

export class Mulberry32 implements IRng {
	private state: number;
	constructor(seed: number) {
		this.state = seed >>> 0;
	}
	next(): number {
		let t = (this.state += 0x6d2b79f5) | 0;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}
}

export class XorShift128Plus implements IRng {
	private s0: number;
	private s1: number;
	constructor(seedLo: number, seedHi: number) {
		this.s0 = seedLo >>> 0;
		this.s1 = seedHi >>> 0;
		if (this.s0 === 0 && this.s1 === 0) {
			this.s1 = 1;
		}
	}
	next(): number {
		let x = this.s0;
		const y = this.s1;
		this.s0 = y;
		x ^= x << 23;
		this.s1 = x ^ y ^ (x >>> 17) ^ (y >>> 26);
		return ((this.s1 + y) >>> 0) / 4294967296;
	}
}

export class MathRandomRng implements IRng {
	next(): number {
		return Math.random();
	}
}

export function createRng(type: RngType, seed: bigint): IRng {
	switch (type) {
		case RngType.Mulberry32:
			return new Mulberry32(Number(seed & 0xffffffffn));
		case RngType.XorShift128Plus:
			return new XorShift128Plus(Number(seed & 0xffffffffn), Number((seed >> 32n) & 0xffffffffn));
		case RngType.MathRandom:
			return new MathRandomRng();
		default:
			return new Mulberry32(Number(seed & 0xffffffffn));
	}
}
