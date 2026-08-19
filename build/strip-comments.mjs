#!/usr/bin/env node
// Generates dist/ — the actual deployed artifact — from this repo's real
// source. Two things happen here, both requested explicitly (not a
// default worth applying without being asked): comments get stripped from
// what ships live, and only an explicit allowlist of files is copied at
// all, rather than "everything except an exclude-list" the way
// .assetsignore worked before this existed. That's a real improvement
// this replaces, not just a side effect: a new file added to the repo
// root later defaults to NOT public now, instead of defaulting to public
// unless someone remembers to exclude it.
//
// Why comments specifically needed to go, not just "nice to have": this
// repo's comments are written for future maintainers, not for players —
// and several of them (the red-herring section of scripts/console.js,
// most pointedly) explicitly explain "this is fake, deliberately inert."
// A curious player finding one of those spoils it immediately. A short
// allowlist of intentional, in-fiction comments survives on purpose — see
// KEEP_HTML_COMMENTS below — everything else, in every file type, does
// not, no exceptions.
//
// Runs as this project's Cloudflare "Build command" (Settings -> Build,
// currently "None" — needs setting to `npm install && npm run build`) on
// every push, before `wrangler deploy` reads dist/ per wrangler.toml's
// [assets].directory. The real repo files are never touched by this —
// dist/ is pure generated output, gitignored, nothing here is a one-way
// edit. Turning this whole thing off after the CTF ends is just pointing
// [assets].directory back at "." and clearing the dashboard's Build
// command — the source stays exactly as commented as it's always been.
//
// Uses terser/clean-css rather than hand-rolled regex specifically for
// JS/CSS: both parse the real syntax instead of pattern-matching text, so
// neither can be fooled by a "//" inside a string, a regex literal, or —
// concretely, in this repo — the base64 font data in styles/theme.css,
// which could plausibly contain a "/*"-shaped byte sequence by pure
// chance in ~150KB of encoded data. A naive regex wouldn't know the
// difference between that and a real comment; these tools do.

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, rmSync } from "node:fs";
import { basename } from "node:path";
import { minify as minifyJs } from "terser";
import CleanCSS from "clean-css";

const DIST = "dist";

const HTML_FILES = ["index.html", "console.html"];
const JS_FILES = ["scripts/gate.js", "scripts/console.js"];
const CSS_FILES = ["styles/gate.css", "styles/console.css", "styles/theme.css"];
const COPY_DIRS = ["audio"]; // no comments in binary audio files, so a plain recursive copy is enough

// Added 2026-08-17, same day and same reasoning as GLYPH_LETTERS/
// DECO_NODES[].fragment before it: this file was a puzzle *payload*
// (NODE_02's cipher, see its own comment in scripts/console.js) sitting
// at a plain, guessable, permanently-public static path — anyone could
// curl it directly, view its spectrogram, and solve NODE_02 without ever
// touching the game or "unlocking" it in the narrative sense. Moved
// server-side into src/index.js's NODE_AUDIO map (base64, same pattern as
// GLYPH_CIPHERTEXTS/DECO_FRAGMENTS) and served from a new rate-limited
// /node-audio endpoint instead — see that file's own comment for the
// honest limit on what this does and doesn't close (still no real
// per-player "have you actually unlocked n2" check, same as every other
// reveal endpoint here; this only removes it from being a static,
// zero-interaction, cacheable-forever file). NODE_AUDIO's base64 is a
// one-time generated, hand-committed constant — same as
// GLYPH_CIPHERTEXTS/DECO_FRAGMENTS, not something this build step
// regenerates on every run. The file still stays in audio/ (excluded here
// by filtering the recursive copy, not deleted from the repo) purely as
// the master copy to re-derive that base64 from if NODE_02's audio ever
// changes — same reasoning as keeping any other pre-hash/pre-cipher
// source value around.
const PRIVATE_AUDIO_FILES = ["Node02_Spectrogram.wav"];

// Matched by a literal substring of each comment's own text, not a
// position/index into the file — keeps intent obvious at the call site
// and survives the comment moving around later. Add new entries here if
// more intentional in-fiction comments are ever added anywhere.
const KEEP_HTML_COMMENTS = [
  // 'legacy override phrase "no fate"' entry removed 2026-08-17 — that
  // comment (index.html) is gone entirely now, not just re-hidden; the
  // hidden-glyph mechanism replaced it as the real discovery path (see
  // that element's own comment in index.html). Left this note rather
  // than silently deleting the line with no trace, so a future find of
  // "why isn't this marker matching anything" doesn't need to dig through
  // git history to learn it was intentional.
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
  // compress/mangle both off on purpose: this is a comment-and-whitespace
  // strip, not a minification pass. Rewriting logic or renaming variables
  // is a different, riskier job than what was actually asked for here —
  // narrower scope means less that could go subtly wrong on a live site
  // that's already had a few broken-deploy incidents this session.
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
  // Real bug, found 2026-08-17+ (later session) — `level: 0` does NOT
  // strip comments at all, contrary to what this comment used to claim.
  // Checked directly against clean-css itself, not assumed: `level: 0`
  // leaves every comment byte-for-byte untouched; every maintainer
  // comment in this repo's CSS (including ones with real internal
  // reasoning, not just the intentional red-herring ones) was shipping to
  // the live site verbatim. This became load-bearing, not just cosmetic,
  // once console.html/gate.css started carrying content that genuinely
  // needs to not leak (see the gate page's own hidden-glyph comment for
  // the concrete example that surfaced this).
  //
  // Fix: `level: 1` with `specialComments: 0` — level 1 does pull in real
  // optimizations beyond comment stripping (shorter color hex forms,
  // redundant-semicolon removal, adjacent-selector merging, zero-unit
  // stripping), a wider blast radius than the narrow "whitespace/comments
  // only" scope this function originally wanted, doubly so given
  // theme.css's ~66KB of base64 font data sitting in `url(data:...)`
  // values. Verified rather than assumed before trusting this: ran it
  // against the real theme.css and diffed every `data:font/woff2;base64,`
  // payload before vs after byte-for-byte identical (4 for 4) — clean-css
  // treats url() contents as an opaque string, never parses/rewrites it —
  // and confirmed zero `/*` markers remain in the output.
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
