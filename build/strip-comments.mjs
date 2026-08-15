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
import { minify as minifyJs } from "terser";
import CleanCSS from "clean-css";

const DIST = "dist";

const HTML_FILES = ["index.html", "console.html"];
const JS_FILES = ["scripts/gate.js", "scripts/console.js"];
const CSS_FILES = ["styles/gate.css", "styles/console.css", "styles/theme.css"];
const COPY_DIRS = ["audio"]; // no comments in binary audio files, so a plain recursive copy is enough

// Matched by a literal substring of each comment's own text, not a
// position/index into the file — keeps intent obvious at the call site
// and survives the comment moving around later. Add new entries here if
// more intentional in-fiction comments are ever added anywhere.
const KEEP_HTML_COMMENTS = [
  'legacy override phrase "no fate"',
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
  // level: 0 — strip comments/whitespace only, no rule merging or other
  // restructuring. Same "narrow scope, minimize what could go wrong"
  // reasoning as compress:false above, doubly so for theme.css's base64
  // font data.
  const result = new CleanCSS({ level: 0 }).minify(src);
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
for (const d of COPY_DIRS) cpSync(d, `${DIST}/${d}`, { recursive: true });

console.log("Build complete ->", DIST);
