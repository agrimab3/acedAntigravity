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
    # Handle prose ("ACT") and script-friendly dotted forms ("A.C.T.").
    # Commas give Kokoro an unambiguous spoken-letter pause.
    text = re.sub(r"(?<![A-Za-z])A\.?\s*C\.?\s*T\.?(?![A-Za-z])", "A, C, T", text, flags=re.IGNORECASE)
    text = re.sub(r"(?<![A-Za-z])A\.?\s*I\.?(?![A-Za-z])", "A, I", text, flags=re.IGNORECASE)
    # Longest first prevents a future short phrase from overriding a longer one.
    for phrase, spoken in sorted(PRONUNCIATION.items(), key=lambda item: len(item[0]), reverse=True):
        text = re.sub(r"\b" + re.escape(phrase) + r"\b", spoken, text, flags=re.IGNORECASE)
    return text


def synthesize(text: str, voice: str, output: Path, pipeline: KPipeline | None = None) -> None:
    spoken = apply_pronunciation(text)
    pipeline = pipeline or KPipeline(lang_code="a")
    chunks = []
    for _, _, audio in pipeline(spoken, voice=voice):
        chunks.append(np.asarray(audio, dtype=np.float32))
    if not chunks:
        raise RuntimeError("Kokoro returned no audio")
    output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output, np.concatenate(chunks), 24000)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--voice",
        required=False,
        choices=[
            "af_heart", "af_bella", "af_nicole",
            "am_puck", "am_michael", "am_liam", "am_eric", "am_echo", "am_adam",
            "bm_lewis", "bm_fable",
        ],
    )
    parser.add_argument("--text")
    parser.add_argument("--text-file")
    parser.add_argument("--manifest", help="JSON array of local narration jobs")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    if args.manifest:
        jobs = json.loads(Path(args.manifest).read_text())
        pipeline = KPipeline(lang_code="a")
        for job in jobs:
            synthesize(job["text"], job["voice"], Path(job["output"]), pipeline)
        return
    if not args.voice:
        raise SystemExit("Supply --voice or --manifest")
    text = args.text or (Path(args.text_file).read_text().strip() if args.text_file else "")
    if not text:
        raise SystemExit("Supply --text or --text-file")
    synthesize(text, args.voice, Path(args.output))


if __name__ == "__main__":
    main()
