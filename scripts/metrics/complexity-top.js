// Every function with a cyclomatic complexity over 10, most complex first.
//   node scripts/metrics/complexity-top.js cx.json
const fs = require("fs");
const r = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const rows = [];
for (const f of r) {
  const p = f.filePath.split(String.fromCharCode(92)).join("/").split("/cx/")[1];
  if (!p) continue;
  for (const m of f.messages) {
    const x = m.message.match(/^(.*) has a complexity of (\d+)/);
    if (x && +x[2] > 10) rows.push([+x[2], p, m.line, x[1]]);
  }
}
rows.sort((a, b) => b[0] - a[0]);
for (const [c, p, line, what] of rows) console.log(c, `${p}:${line}`, what);
