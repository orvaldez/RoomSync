// Pull-request flow per milestone, for docs/process/metrics.md.
//
//   gh pr list --state merged --limit 500 \
//     --json number,author,createdAt,mergedAt,mergedBy,baseRefName,reviews > prs.json
//   node scripts/metrics/pr-flow.js prs.json
//
// A PR belongs to the milestone whose tag commit it merged on or before. Only
// PRs merged into main count. Times are hours, or days past 48 hours.
const fs = require("fs");
const { execSync } = require("child_process");

const prs = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).filter((p) => p.baseRefName === "main");
const tagDate = (tag) => {
  try {
    return execSync(`git log -1 --format=%cI ${tag}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};
const tags = ["milestone-0", "milestone-1", "milestone-2", "milestone-3"].map((t) => [t, tagDate(t)]);
const hours = (a, b) => (new Date(b) - new Date(a)) / 36e5;
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const p90 = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.9)] : null);
const fmt = (x) => (x == null ? "n/a" : x < 48 ? `${x.toFixed(1)} h` : `${(x / 24).toFixed(1)} d`);

for (let i = 1; i < tags.length; i++) {
  const [name, to] = tags[i];
  const from = tags[i - 1][1];
  if (!from) break;
  const set = prs.filter(
    (p) => new Date(p.mergedAt) > new Date(from) && (!to || new Date(p.mergedAt) <= new Date(to))
  );
  const toMerge = set.map((p) => hours(p.createdAt, p.mergedAt));
  const toReview = set
    .map((p) => {
      const times = (p.reviews || [])
        .filter((r) => r.author.login !== p.author.login && r.submittedAt)
        .map((r) => r.submittedAt)
        .sort();
      return times.length ? hours(p.createdAt, times[0]) : null;
    })
    .filter((x) => x != null);
  const approved = set.filter((p) =>
    (p.reviews || []).some((r) => r.state === "APPROVED" && r.author.login !== p.author.login)
  ).length;
  const selfMerged = set.filter((p) => p.mergedBy && p.mergedBy.login === p.author.login).map((p) => `#${p.number}`);
  const byAuthor = {};
  for (const p of set) byAuthor[p.author.login] = (byAuthor[p.author.login] || 0) + 1;
  console.log(
    `${to ? name : name + " (so far)"}: merged ${set.length} ${JSON.stringify(byAuthor)}; ` +
      `approved by the other member ${approved}/${set.length}; merged by author: ${selfMerged.join(", ") || "none"}; ` +
      `open → first review median ${fmt(median(toReview))}; open → merge median ${fmt(median(toMerge))}, 90th percentile ${fmt(p90(toMerge))}`
  );
  if (!to) break;
}
