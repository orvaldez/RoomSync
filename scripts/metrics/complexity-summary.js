// Per-label size and cyclomatic complexity, from complexity.config.mjs output.
// "Code lines" are non-blank lines that are not comments.
//   node scripts/metrics/complexity-summary.js cx.json
const fs = require("fs");
const r = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const groups = {};
for (const f of r) {
  const p = f.filePath.split(String.fromCharCode(92)).join("/");
  const parts = p.split("/cx/");
  if (parts.length < 2) continue;
  const k = parts[1].split("/")[0];
  const g = (groups[k] = groups[k] || { c: [], files: 0, lines: 0 });
  g.files++;
  g.lines += fs
    .readFileSync(f.filePath, "utf8")
    .split("\n")
    .filter((l) => l.trim() && !/^\s*(\/\/|\*|\/\*)/.test(l)).length;
  for (const m of f.messages) {
    const x = m.message.match(/complexity of (\d+)/);
    if (x) g.c.push(+x[1]);
  }
}
for (const [k, g] of Object.entries(groups).sort()) {
  const c = g.c.sort((a, b) => a - b);
  const mean = (c.reduce((a, b) => a + b, 0) / c.length).toFixed(2);
  console.log(
    k.padEnd(22), "files", g.files, "codeLines", g.lines, "functions", c.length,
    "mean", mean, "median", c[Math.floor(c.length / 2)], "max", c[c.length - 1],
    "over10", c.filter((x) => x > 10).length
  );
}
