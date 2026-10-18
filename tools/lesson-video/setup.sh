#!/usr/bin/env bash
# Installs only the local, open-source dependencies for the lesson renderer.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PYTHON="${LESSON_PYTHON:-/opt/homebrew/opt/python@3.12/bin/python3.12}"
command -v ffmpeg >/dev/null || { echo "Install ffmpeg first: brew install ffmpeg" >&2; exit 1; }
[[ -x "$PYTHON" ]] || { echo "Install Python 3.12 first: brew install python@3.12" >&2; exit 1; }
"$PYTHON" -m venv "$ROOT/.venv"
"$ROOT/.venv/bin/pip" install --upgrade pip
"$ROOT/.venv/bin/pip" install -r "$ROOT/requirements.txt"
echo "Lesson-video setup complete. Run: npm run lesson:samples"
