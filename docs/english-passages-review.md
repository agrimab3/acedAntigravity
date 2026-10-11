# English long passages — review pending

**Not approved and not in the locked Dec 5 Form A.**

Five planned passage topics: The Night Garden; The Last Mapmaker; A Library of Sounds; The Bridge of Paper; Seeds on the Roof. Each requires 300–400 words, 10 underlined editing targets, 10 questions, and a passing second-model quality review before a draft can be saved to the mock reserve.

**Generation status:** blocked before the first complete passage passed validation. The Gemini generation models returned HTTP 503 (high demand), and earlier attempts did not pass the 10-underline, word-count, or distinct-answer-choice checks. No unreviewed questions were inserted or published. This document is a status placeholder, **not** the requested five-passage review set.

To retry on the server after provider recovery, run the owner-reviewed script from the release directory with the shared environment loaded. The script writes `docs/english-passages-review.json` and regenerates this Markdown document only for passages that pass structural validation and second-model review. Use `--insert` only when ready to save those reviewed questions as `mock_reserve` / `draft`.
