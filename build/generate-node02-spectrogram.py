#!/usr/bin/env python3
# Generates audio/Node02_Spectrogram.wav (NODE_02's cipher payload). A
# standalone dev-time tool, not part of `npm run build` — run by hand only
# when NODE_02's answer changes, then verify before trusting the output.
#
# Technique: render text to a bitmap, then synthesize audio where each row
# is a fixed frequency and each column a time-slot, so a "lit" pixel becomes
# a Hann-windowed tone burst — the spectrogram of the resulting WAV
# reconstructs the bitmap as legible text, visible only by looking at the
# spectrogram, not by listening or feeding it to a speech/audio model.
#
# TEXT below is NODE_02's real answer, Atbash-shifted — never plaintext,
# since the WAV ships fully public and is meant to be extracted, just not
# trivially.
#
# Needs numpy/scipy/matplotlib/Pillow (not in this repo's own
# package.json — install separately before running).
#
# IMPORTANT: regenerating the WAV here isn't the whole job. The live site
# serves a base64 copy of these bytes from NODE_AUDIO.n2 in src/index.js,
# not this file directly — after verifying the output, paste
# build/node02_audio.b64 into that constant and round-trip-verify it.

import base64
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.io import wavfile
from scipy import signal
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

# Atbash-shifted ciphertext of "COME WITH ME IF YOU WANT TO LIVE" — atbash
# is its own inverse, so re-shifting this should recover the plaintext.
TEXT = "XLNV DRGS NV RU BLF DZMG GL OREV"

FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
FONT_SIZE = 16
OUT_WAV = "audio/Node02_Spectrogram.wav"
OUT_VERIFICATION_PNG = "build/node02_spectrogram_verification.png"  # gitignored scratch output
OUT_AUDIO_B64 = "build/node02_audio.b64"  # gitignored — paste into NODE_AUDIO.n2 in src/index.js

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
    window = np.hanning(len(t_col))  # avoids onset/offset clicks that smear energy across frequencies

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

    # Verify against the file just written, not the in-memory signal, so
    # this checks what actually got saved to disk.
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

    # Encoded from disk, not the in-memory array, for the same reason as
    # the spectrogram re-check above.
    with open(OUT_WAV, "rb") as wav_file:
        b64 = base64.b64encode(wav_file.read()).decode("ascii")
    with open(OUT_AUDIO_B64, "w") as b64_file:
        b64_file.write(b64)
    print(f"wrote {OUT_AUDIO_B64} ({len(b64)} chars) — paste into NODE_AUDIO.n2 in src/index.js, then round-trip-verify before trusting it")


if __name__ == "__main__":
    main()
