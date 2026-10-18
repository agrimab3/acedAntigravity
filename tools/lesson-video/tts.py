#!/usr/bin/env python3
"""Local Kokoro narration helper. It never calls an Aced service."""
import argparse
import json
import re
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

ROOT = Path(__file__).resolve().parent
PRONUNCIATION = json.loads((ROOT / "pronunciation.json").read_text())


def apply_pronunciation(text: str) -> str:
    # Longest first prevents a future short phrase from overriding a longer one.
    for phrase, spoken in sorted(PRONUNCIATION.items(), key=lambda item: len(item[0]), reverse=True):
        text = re.sub(r"\\b" + re.escape(phrase) + r"\\b", spoken, text, flags=re.IGNORECASE)
    return text


def synthesize(text: str, voice: str, output: Path) -> None:
    spoken = apply_pronunciation(text)
    pipeline = KPipeline(lang_code="a")
    chunks = []
    for _, _, audio in pipeline(spoken, voice=voice):
        chunks.append(np.asarray(audio, dtype=np.float32))
    if not chunks:
        raise RuntimeError("Kokoro returned no audio")
    output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output, np.concatenate(chunks), 24000)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice", required=True, choices=["af_heart", "af_bella", "af_nicole"])
    parser.add_argument("--text")
    parser.add_argument("--text-file")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    text = args.text or (Path(args.text_file).read_text().strip() if args.text_file else "")
    if not text:
        raise SystemExit("Supply --text or --text-file")
    synthesize(text, args.voice, Path(args.output))


if __name__ == "__main__":
    main()
