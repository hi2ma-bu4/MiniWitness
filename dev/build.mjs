import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
/* -------------------------------------------------------------------------- */
/* 設定値 */
/* -------------------------------------------------------------------------- */

/** プロジェクトルート */
const ROOT_DIR = process.cwd();

const INPUT_FILE_NAME = "index";
const OUTPUT_FILE_NAME = "MiniWitness";

/** esbuild の出力先 */
const DIST_DIR = path.resolve(ROOT_DIR, "dist");

/** エントリーポイント */
const ENTRY_FILE = path.resolve(ROOT_DIR, `src/${INPUT_FILE_NAME}.ts`);

/* -------------------------------------------------------------------------- */
/* ユーティリティ */
/* -------------------------------------------------------------------------- */

/**
 * ディレクトリを安全に削除して再作成する
 * @param {string} dirPath
 */
function cleanDir(dirPath) {
	if (fs.existsSync(dirPath)) {
		fs.rmSync(dirPath, { recursive: true, force: true });
	}
	fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * コマンドを同期実行する（失敗時は即終了）
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 * @param {string} [errMes] - エラーメッセージ
 */
function runCommand(command, args, cwd, errMes) {
	const result = spawnSync(command, args, {
		cwd,
		stdio: "inherit",
		shell: process.platform === "win32", // Windows 対策
	});

	if (result.status !== 0) {
		if (errMes) console.error(errMes);
		process.exit(result.status ?? 1);
	}
}

/* -------------------------------------------------------------------------- */
/* esbuild */
/* -------------------------------------------------------------------------- */

const ESBUILD_COMMON = {
	entryPoints: [ENTRY_FILE],
	outdir: DIST_DIR,
	bundle: true,

	/* ESM / browser 前提 */
	format: "esm",
	platform: "browser",
	target: "es2024",

	sourcemap: true,
	minify: false,

	loader: {
		".wasm": "file",
	},

	supported: {
		"import-meta": true,
	},
};

/**
 * esbuild を実行する
 *
 * - ESM 出力
 * - import.meta を保持
 * - wasm は file loader
 */
async function buildJs() {
	console.log("📦 esbuild 開始...");

	await build({
		...ESBUILD_COMMON,
		entryNames: OUTPUT_FILE_NAME,
	});

	console.log("┗✅ esbuild 完了");
}

async function buildJsMin() {
	console.log("📦 esbuild (min) 開始...");

	await build({
		...ESBUILD_COMMON,
		entryNames: `${OUTPUT_FILE_NAME}.min`,
		minify: true,
	});

	console.log("┗✅ esbuild (min) 完了");
}

/* -------------------------------------------------------------------------- */
/* .d.ts */
/* -------------------------------------------------------------------------- */

/**
 * .d.ts を dist に生成する
 */
function buildTypes() {
	console.log("📐 型定義(.d.ts)生成開始...");

	runCommand("npx", ["dts-bundle-generator", "-o", `${DIST_DIR}/${OUTPUT_FILE_NAME}.d.ts`, ENTRY_FILE], ROOT_DIR, "❌ 型定義のバンドルに失敗しました");

	console.log("┗✅ 型定義生成完了");
}

/* -------------------------------------------------------------------------- */
/* メイン処理 */
/* -------------------------------------------------------------------------- */

(async () => {
	try {
		console.log("🧹 dist クリーン中...");
		cleanDir(DIST_DIR);

		await Promise.all([
			//
			buildJs(),
			buildJsMin(),
		]);

		buildTypes();

		console.log("🎉 build 完了");
	} catch (err) {
		console.error("❌ build 失敗:", err);
		process.exit(1);
	}
})();
