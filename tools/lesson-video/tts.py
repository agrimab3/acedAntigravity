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
    # Legacy scripts may contain dotted initialisms. The narration passed to Kokoro
    # is plain text; pronunciation is controlled by its lexicon below.
    return re.sub(r"(?<![A-Za-z])A\.\s*C\.\s*T\.?(?![A-Za-z])", "ACT", text, flags=re.IGNORECASE)


def apply_phoneme_overrides(pipeline: KPipeline) -> None:
    # Misaki/Kokoro phoneme notation corresponding to the IPA documented in
    # pronunciation.json. Exact-case entries take priority for capitalized brands
    # and initialisms.
    for word, value in PRONUNCIATION.items():
        pipeline.g2p.lexicon.golds[word] = value["kokoro"]


def synthesize(text: str, voice: str, output: Path, pipeline: KPipeline | None = None) -> None:
    spoken = apply_pronunciation(text)
    pipeline = pipeline or KPipeline(lang_code="a")
    apply_phoneme_overrides(pipeline)
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
        apply_phoneme_overrides(pipeline)
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
