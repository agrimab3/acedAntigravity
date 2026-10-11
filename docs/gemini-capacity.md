# Gemini tutor capacity — October 10, 2026

## Current configuration

- Aced is configured to use `gemini-2.5-flash` by default.
- A Gemini API key is present in the local environment.
- The repository/API key does not expose the Google AI Studio / Cloud billing tier or project quota. Confirming the exact tier and RPM/TPM/RPD quota requires access to the Google account/project console.

## Current public pricing

Google's published Standard paid pricing for Gemini 2.5 Flash is:

- Input: **$0.30 per 1 million text/image/video tokens**
- Output (including thinking tokens): **$2.50 per 1 million tokens**

Official source: https://ai.google.dev/gemini-api/docs/pricing

## Aced estimate

The ACED Mock Test does not expose the AI tutor, so **100 students taking the mock test itself should add $0 of tutor-model usage**.

For regular practice, a reasonable planning assumption for one tutor turn is roughly:

- 2,000 input tokens
- 250 output tokens

At the paid Standard Gemini 2.5 Flash rates, that is about **$0.001225 per tutor turn**.

Examples:

- 100 students × 20 tutor turns each: about **$2.45**
- 100 students × 50 tutor turns each: about **$6.13**
- 1,000 tutor turns: about **$1.23**

Actual cost depends on prompt length, model thinking/output length, whether Google bills the project on the paid tier, and fallback-provider usage.

## Quota behavior

Aced now treats provider exhaustion/outage as temporary unavailability and shows:

> The tutor is taking a quick break, try again in a minute

The exact Gemini quota still needs to be checked in the Google AI Studio / Google Cloud project that owns the API key.
