#!/usr/bin/env python3
# Generates audio/Node02_Spectrogram.wav — NODE_02's cipher payload. This
# is a standalone dev-time tool, not part of the `npm run build` pipeline
# (build/strip-comments.mjs never runs this; it just copies whatever's
# already in audio/ verbatim, same as any other clip there). Run this by
# hand only when NODE_02's answer changes and the asset needs regenerating
# — same "compute it, verify it, don't hand-edit" discipline CLAUDE.md
# already asks for on every other cipher value in this project, just for
# a binary asset instead of a hash or a glyph-index array.
#
# The technique: render text to a bitmap, then synthesize an audio signal
# where each bitmap row is one fixed frequency and each column is one
# time-slot — a "lit" pixel becomes a Hann-windowed tone burst at that
# row's frequency during that column's time window. Recomputing the
# spectrogram of the resulting WAV reconstructs the original bitmap as
# legible text, visible only by actually looking at the spectrogram (a
# tool like Audacity, or sox, or this same script's own verification
# step) — not by listening to it or feeding it to a speech/audio model,
# which is what made the original Morse-in-audio version of this node
# trivial for exactly that kind of tool.
#
# What actually gets encoded is NODE_02's real answer, Atbash-shifted
# (see TEXT below) — never the plaintext answer directly. Storing the
# plaintext directly in the spectrogram would defeat the puzzle entirely:
# unlike this repo's own JS source, a shipped WAV file is fully public and
# entirely exposed to anyone who thinks to inspect it (that's the whole
# point — the player is *supposed* to be able to extract this), so
# whatever the spectrogram shows has to still require solving a real
# cipher, the same "glyph layer sits on top of a real transformation"
# principle every other converted node in this project follows.
#
# Needs numpy/scipy/matplotlib/Pillow (not in this repo's own
# package.json — install into a venv or with --break-system-packages
# before running, this script isn't wired into any existing dependency
# list). Round-trip-verify the Atbash step and visually inspect
# verification.png before trusting a regenerated file — don't just assume
# the pipeline worked.
#
# IMPORTANT, added 2026-08-17 — regenerating the WAV here is no longer the
# whole job. The live site doesn't serve audio/Node02_Spectrogram.wav
# directly anymore (it moved off a plain public static path — see
# NODE_AUDIO's own comment in src/index.js and the cipher.key note on n2
# in scripts/console.js); what actually ships is a base64-embedded COPY of
# those bytes, NODE_AUDIO.n2 in src/index.js, hand-committed the same way
# ANSWER_HASHES/GLYPH_CIPHERTEXTS are. Running this script only updates the
# audio/ file — the master copy to re-derive that constant from — it does
# NOT touch src/index.js. Forgetting the second step means the file on
# disk and what the Worker actually serves silently disagree. This script
# now also writes build/node02_audio.b64 (gitignored scratch output, same
# as the verification PNG) with the fresh base64 for exactly that reason:
# after confirming the verification PNG looks right, paste that file's
# contents into NODE_AUDIO.n2 in src/index.js, then round-trip-verify the
# same way the original embed was verified — decode the new constant back
# and diff it byte-for-byte against audio/Node02_Spectrogram.wav — before
# trusting it, don't just assume the copy-paste went cleanly.

import base64
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.io import wavfile
from scipy import signal
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

# Atbash-shifted ciphertext of "COME WITH ME IF YOU WANT TO LIVE" — verify
# this independently (atbash is its own inverse) before trusting it if
# NODE_02's answer ever changes:
#
#   def atbash(s):
#       return "".join(
#           chr(ord("A") + (25 - (ord(c) - ord("A")))) if c.isalpha() else c
#           for c in s.upper()
#       )
TEXT = "XLNV DRGS NV RU BLF DZMG GL OREV"

FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
FONT_SIZE = 16
OUT_WAV = "audio/Node02_Spectrogram.wav"
OUT_VERIFICATION_PNG = "build/node02_spectrogram_verification.png"  # gitignored scratch output, not shipped
OUT_AUDIO_B64 = "build/node02_audio.b64"  # gitignored scratch output — paste into NODE_AUDIO.n2 in src/index.js, see this file's own top comment

SR = 22050  # sample rate
DT = 0.045  # seconds per bitmap column
FREQ_MIN = 600.0
FREQ_STEP = 280.0


def render_bitmap(text: str) -> np.ndarray:
    font = ImageFont.truetype(FONT_PATH, FONT_SIZE)
    dummy = Image.new("L", (10, 10))
    bbox = ImageDraw.Draw(dummy).textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    img = Image.new("L", (w, h), color=0)
    draw = ImageDraw.Draw(img)
    draw.text((-bbox[0], -bbox[1]), text, font=font, fill=255)
    return (np.array(img) > 128).astype(np.uint8)  # rows x cols, 1 = "on"


def synthesize(bitmap: np.ndarray) -> np.ndarray:
    rows, cols = bitmap.shape
    duration = cols * DT
    n_samples = int(duration * SR)
    audio = np.zeros(n_samples)
    t_col = np.arange(int(DT * SR)) / SR
    window = np.hanning(len(t_col))  # avoids onset/offset clicks that would smear energy across frequencies

    for r in range(rows):
        freq = FREQ_MIN + (rows - 1 - r) * FREQ_STEP  # row 0 (top of image) -> highest frequency
        on_cols = np.where(bitmap[r] == 1)[0]
        if len(on_cols) == 0:
            continue
        tone = np.sin(2 * np.pi * freq * t_col) * window
        for c in on_cols:
            start = int(c * DT * SR)
            end = start + len(tone)
            if end > len(audio):
                audio[start:] += tone[: len(audio) - start]
            else:
                audio[start:end] += tone

    return audio / (np.max(np.abs(audio)) + 1e-9) * 0.85


def main():
    bitmap = render_bitmap(TEXT)
    print(f"bitmap: {bitmap.shape[1]} columns x {bitmap.shape[0]} rows")

    audio = synthesize(bitmap)
    wavfile.write(OUT_WAV, SR, (audio * 32767).astype(np.int16))
    print(f"wrote {OUT_WAV}, duration={len(audio) / SR:.2f}s")

    # Verify by recomputing the spectrogram from the file just written —
    # not from the in-memory signal — so this actually checks what got
    # saved to disk, not just what was generated in memory.
    sr_check, audio_check = wavfile.read(OUT_WAV)
    f, t, Sxx = signal.spectrogram(audio_check.astype(np.float64), fs=sr_check, nperseg=1024, noverlap=900)
    Sxx_db = 10 * np.log10(Sxx + 1e-12)

    fig, axes = plt.subplots(2, 1, figsize=(14, 6))
    axes[0].imshow(bitmap, cmap="gray", aspect="auto")
    axes[0].set_title("original bitmap (what should be legible)")
    axes[1].pcolormesh(t, f, Sxx_db, shading="auto", cmap="magma")
    axes[1].set_ylim(0, 5500)
    axes[1].set_title("spectrogram recomputed from the saved WAV")
    axes[1].set_xlabel("time (s)")
    axes[1].set_ylabel("frequency (Hz)")
    plt.tight_layout()
    plt.savefig(OUT_VERIFICATION_PNG, dpi=130)
    print(f"wrote {OUT_VERIFICATION_PNG} — inspect it before trusting the regenerated WAV")

    # Encoded from the file on disk (opened fresh below), not the in-memory
    # `audio` array — same "verify what actually got saved" reasoning as
    # the spectrogram re-check just above, and the only way this can catch
    # wavfile.write applying header/formatting this script didn't itself
    # produce in memory.
    with open(OUT_WAV, "rb") as wav_file:
        b64 = base64.b64encode(wav_file.read()).decode("ascii")
    with open(OUT_AUDIO_B64, "w") as b64_file:
        b64_file.write(b64)
    print(f"wrote {OUT_AUDIO_B64} ({len(b64)} chars) — paste into NODE_AUDIO.n2 in src/index.js, then round-trip-verify (decode it back, diff against {OUT_WAV}) before trusting it")


if __name__ == "__main__":
    main()
