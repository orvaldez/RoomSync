// Merged PRs to main per week, for docs/process/metrics.md. Weeks start on
// Monday, America/Chicago; weeks with no merges are listed as 0.
//   node scripts/metrics/merges-per-week.js prs.json   (prs.json as in pr-flow.js)
const prs = JSON.parse(require("fs").readFileSync(process.argv[2], "utf8")).filter((p) => p.baseRefName === "main");
const localYMD = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Chicago" }); // YYYY-MM-DD
const mondayOf = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt;
};
const counts = new Map();
for (const p of prs) {
  const k = mondayOf(localYMD(p.mergedAt)).toISOString().slice(0, 10);
  counts.set(k, (counts.get(k) || 0) + 1);
}
const keys = [...counts.keys()].sort();
const out = [];
for (let w = new Date(keys[0] + "T00:00:00Z"); w <= new Date(keys[keys.length - 1] + "T00:00:00Z"); w.setUTCDate(w.getUTCDate() + 7)) {
  const k = w.toISOString().slice(0, 10);
  out.push(`${k}:${counts.get(k) || 0}`);
}
console.log(out.join(" "));
