#!/usr/bin/env node
// Generates dist/ (the deployed artifact) from this repo's real source:
// strips comments and copies only an explicit allowlist of files, so
// players can't view-source the reasoning behind the puzzles.
//
// Runs as this project's Cloudflare "Build command" before `wrangler
// deploy` reads dist/ per wrangler.toml's [assets].directory. dist/ is
// gitignored generated output — the real repo files are never touched.
//
// Uses terser/clean-css rather than regex because both parse real syntax
// instead of pattern-matching text, so a "//" inside a string or the
// base64 font data in theme.css can't be mistaken for a comment.

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, rmSync } from "node:fs";
import { basename } from "node:path";
import { minify as minifyJs } from "terser";
import CleanCSS from "clean-css";

const DIST = "dist";

const HTML_FILES = ["index.html", "console.html"];
const JS_FILES = ["scripts/gate.js", "scripts/console.js"];
const CSS_FILES = ["styles/gate.css", "styles/console.css", "styles/theme.css"];
const COPY_DIRS = ["audio"]; // no comments in binary audio files, so a plain recursive copy is enough

// NODE_02's cipher payload — excluded from the static copy and served
// instead from src/index.js's /node-audio endpoint, so it isn't a
// permanently public, unlock-free static file. Kept in audio/ as the
// master copy to re-derive that endpoint's base64 from if it ever changes.
const PRIVATE_AUDIO_FILES = ["Node02_Spectrogram.wav"];

// Matched by a literal substring of each comment's own text (not file
// position), so intent stays obvious even if the comment moves. Add new
// entries here for any future intentional in-fiction comment.
const KEEP_HTML_COMMENTS = [
  "backup auth string, rotated per security policy",
  "qa override still wired in from the last pentest round",
  "backup transmission — real flag mirror",
  "targeting log dump, recovered fragment",
];

function stripHtmlComments(html) {
  return html.replace(/<!--([\s\S]*?)-->/g, (full, inner) =>
    KEEP_HTML_COMMENTS.some((marker) => inner.includes(marker)) ? full : ""
  );
}

async function buildJs(srcPath, outPath) {
  const src = readFileSync(srcPath, "utf8");
  // compress/mangle stay off — this is a comment/whitespace strip, not a
  // minification pass, to keep the blast radius narrow.
  const result = await minifyJs(src, {
    compress: false,
    mangle: false,
    format: { comments: false },
  });
  if (result.error) throw result.error;
  writeFileSync(outPath, result.code);
}

function buildCss(srcPath, outPath) {
  const src = readFileSync(srcPath, "utf8");
  // level: 1 + specialComments: 0 (not level: 0, which doesn't strip
  // comments at all — verified directly against clean-css, not assumed).
  // level 1's other optimizations (hex shortening, etc.) are a wider blast
  // radius than pure comment stripping, but url(data:...) contents (the
  // base64 font data in theme.css) are treated as opaque and pass through
  // byte-for-byte — verified by diffing before/after.
  const result = new CleanCSS({ level: 1, specialComments: 0 }).minify(src);
  if (result.errors.length) throw new Error(result.errors.join("\n"));
  writeFileSync(outPath, result.styles);
}

function buildHtml(srcPath, outPath) {
  writeFileSync(outPath, stripHtmlComments(readFileSync(srcPath, "utf8")));
}

if (existsSync(DIST)) rmSync(DIST, { recursive: true });
mkdirSync(`${DIST}/scripts`, { recursive: true });
mkdirSync(`${DIST}/styles`, { recursive: true });

for (const f of HTML_FILES) buildHtml(f, `${DIST}/${f}`);
for (const f of JS_FILES) await buildJs(f, `${DIST}/${f}`);
for (const f of CSS_FILES) buildCss(f, `${DIST}/${f}`);
for (const d of COPY_DIRS) {
  cpSync(d, `${DIST}/${d}`, {
    recursive: true,
    filter: (src) => !PRIVATE_AUDIO_FILES.includes(basename(src)),
  });
}

console.log("Build complete ->", DIST);
