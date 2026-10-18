# Aced lesson video maker

Local-only 1080p lesson rendering with Kokoro TTS, Playwright (Google Chrome), and ffmpeg. Nothing here calls the Aced application, database, or production services.

## One-time setup

```bash
./tools/lesson-video/setup.sh
npm run lesson:samples
```

The three generated voice samples are `tools/lesson-video/output/voice-samples/af_heart.wav`, `af_bella.wav`, and `af_nicole.wav`. Set `LESSON_VOICE=af_bella` (or another listed voice) when rendering after choosing Astra's voice.

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
