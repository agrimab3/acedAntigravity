import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // A local, untracked Claude worktree is not part of this application.
    ".claude/**",
    // Local Python tooling for lesson-video rendering is never application source.
    "tools/lesson-video/.venv/**",
  ]),
]);

export default eslintConfig;
