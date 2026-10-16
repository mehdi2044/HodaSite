// Enforce cumulative FID steps without changing the 146 normative measurements.
// Until FID-6, the full suite also reports later-stage failures. A crash, missing
// measurement, regression below the baseline, or any active-stage failure is fatal.
import fs from "node:fs";
const phase = Number(process.argv[2]);
if (!Number.isInteger(phase) || phase < 1 || phase > 6)
  throw Error("FID phase must be 1..6");
const rows = JSON.parse(
  fs.readFileSync("test-results/moda4-fidelity/app/results.json", "utf8"),
);
const groups = {
  home: ["H", 2],
  women: ["C", 3],
  kids: ["CK", 3],
  product: ["P", 4],
  fitting: ["F", 5],
  account: ["A", 6],
};
const counts = {
  home: 24,
  women: 9,
  kids: 11,
  product: 10,
  fitting: 10,
  account: 9,
};
if (rows.length !== 146) throw Error(`Incomplete report: ${rows.length}/146`);
const keys = new Set();
for (const r of rows) {
  if (
    !groups[r.page] ||
    !["desktop", "mobile"].includes(r.viewport) ||
    typeof r.pass !== "boolean"
  )
    throw Error("Invalid measurement");
  const key = `${r.page}/${r.viewport}/${r.id}`;
  if (keys.has(key)) throw Error(`Duplicate measurement ${key}`);
  keys.add(key);
}
for (const [page, count] of Object.entries(counts))
  for (const viewport of ["desktop", "mobile"]) {
    if (
      rows.filter((r) => r.page === page && r.viewport === viewport).length !==
      count
    )
      throw Error(`Incomplete ${page}/${viewport}`);
  }
const active = rows.filter(
  (r) =>
    r.id.startsWith("G") ||
    (phase >= groups[r.page][1] && groups[r.page][0].includes(r.id[0])),
);
const failed = active.filter((r) => !r.pass);
const passed = rows.filter((r) => r.pass).length;
console.log(
  `Full unchanged contract: ${passed}/146. FID-${phase}: ${active.length - failed.length}/${active.length}.`,
);
if (passed < 44 || failed.length)
  throw Error(
    failed
      .map((r) => `${r.page}/${r.viewport} ${r.id}: ${r.detail}`)
      .join("\n") || "Baseline regression",
  );
