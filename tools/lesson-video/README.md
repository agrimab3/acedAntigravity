# Aced lesson video maker

Local-only 1080p lesson rendering with Kokoro TTS, Playwright (Google Chrome), and ffmpeg. Nothing here calls the Aced application, database, or production services.

## One-time setup

```bash
./tools/lesson-video/setup.sh
npm run lesson:samples
```

Astra uses `af_heart`; Cosmo uses `bm_fable`. Generate the locally cached Cosmo comparison clips with `npm run lesson:samples`. The renderer applies the pronunciation map before every Kokoro request: Aced is spoken “AYST,” and ACT/AI are spoken as individual letters.

## Script syntax

```md
## Part 5
[BOARD: Read the question before the choices.]
ASTRA SAYS: Start by underlining what the question actually asks.
[CHAT 10s]
```

`ASTRA SAYS:` becomes narration and captions. `[BOARD: ...]` accumulates animated board cards. `[CHAT 10s]` produces a ten-second on-screen countdown. `Aced`, `ACT`, and `AI` are normalized by `pronunciation.json` before every Kokoro request.

## Render

```bash
npm run lesson -- docs/lesson-1-script.md
npm run lesson -- docs/lesson-1-script.md --part "Part 5" --duration 60
```

MP4 files and their timeline JSON are written to `tools/lesson-video/output/`. A dashed corner is deliberately reserved for a later HeyGen intro/outro clip.

The render uses no paid services. Kokoro is Apache-2.0 licensed; see its upstream project for model/license details.
