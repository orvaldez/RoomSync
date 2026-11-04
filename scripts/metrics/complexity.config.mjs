// ESLint config for measuring cyclomatic complexity, for docs/process/metrics.md.
// Reports every function (max: 0), so the summary sees the whole distribution,
// not just the ones over a limit. Not part of the lint that CI runs.
//
// Run from server/ (which has typescript-eslint installed), with the source to
// measure copied, tests removed, into server/cx/<label>/:
//   npx eslint -c ../scripts/metrics/complexity.config.mjs --format json cx > cx.json
//   node ../scripts/metrics/complexity-summary.js cx.json
//   node ../scripts/metrics/complexity-top.js cx.json
import tseslint from "typescript-eslint";

export default [
  {
    files: ["cx/**/*.ts", "cx/**/*.tsx"],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: { complexity: ["warn", { max: 0 }] },
  },
];
