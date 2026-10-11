# npm audit review — October 2026

`npm audit` reported **9 advisories: 5 high and 4 moderate**. All nine arise from development-only dependency trees, not packages needed to handle production HTTP requests. Avoid `npm audit fix --force`: the suggested fixes downgrade or make breaking major changes to Next.js ESLint tooling and Drizzle migration tooling. Reassess upstream patched versions and test migrations/lint in a separate controlled upgrade.

| Package | Severity | Exposure and decision |
|---|---|---|
| `@esbuild-kit/core-utils` | Moderate | Developer tooling only; transitive dependency of Drizzle CLI, not the live request path; major Drizzle CLI change required. |
| `@esbuild-kit/esm-loader` | Moderate | Developer tooling only; transitive Drizzle CLI loader; major upgrade required. |
| `drizzle-kit` | Moderate | Schema/migration tooling only; not a live-site runtime dependency; upgrade requires migration validation. |
| `esbuild` | Moderate | Build-time/dev tooling through Drizzle CLI; not a live HTTP handler; major CLI change required. |
| `@next/eslint-plugin-next` | High | Lint tooling only; npm suggests a major version change incompatible with the current Next 16 toolchain. |
| `eslint-config-next` | High | Lint tooling only; proposed remediation is a major downgrade; deferred. |
| `fast-glob` | High | Transitive lint tooling dependency; not the production web server. |
| `micromatch` | High | Transitive glob matching in lint tooling; not the production web server. |
| `braces` | High | Transitive lint glob parser; not the production web server. |

**No forced dependency changes made.** Production risk is lower because these tools are not exposed to untrusted HTTP requests, but malicious source/configuration files or compromised CI/build inputs could still exploit developer-tool vulnerabilities.
