require("dotenv").config();
const pool = require("./db");

// ---- YOUR PRICING RULES (change a number here and run again) ----
const PACKAGING = 30;   // Tk added to every size
const PROFIT = { 1.5: 70, 3: 130, 5: 200, 10: 280, 15: 360, 30: 470 };

// Which sizes get re-priced. Remove 5 and 10 from this list to keep your original 5ml and 10ml prices.
const SIZES_TO_UPDATE = [1.5, 3, 5, 10, 15, 30];

// Put the REAL cost per ml here for any perfume where the guess is wrong.
// Example:  "Rayhaan Ocean Rush": 25,
const COST_PER_ML = {
};
// -----------------------------------------------------------------

const ALL_SIZES = [1.5, 3, 5, 10, 15, 30];

// Rounds to the nearest 10 Tk (the tiny + 0.000001 stops .5 values rounding the wrong way)
const roundTo10 = n => Math.round((n + 0.000001) / 10) * 10;

async function run() {
  const apply = process.argv[2] === "--apply";
  const { rows } = await pool.query("SELECT id, name, sizes FROM products ORDER BY id");

  for (const r of rows) {
    const sizes = JSON.parse(r.sizes);
    const s3 = sizes.find(s => s[0] === 3);
    if (!s3) {
      console.log("SKIPPED (no 3ml size): " + r.name);
      continue;
    }

    // Cost per ml: your own number if you gave one, otherwise worked out from the 3ml price
    const c = COST_PER_ML[r.name] !== undefined
      ? COST_PER_ML[r.name]
      : (s3[1] - PACKAGING - PROFIT[3]) / 3;

    if (c <= 0) {
      console.log("SKIPPED (3ml price too low to work out a cost): " + r.name);
      continue;
    }

    const newSizes = [];
    const changes = [];

    for (const ml of ALL_SIZES) {
      const existing = sizes.find(s => s[0] === ml);
      if (SIZES_TO_UPDATE.includes(ml)) {
        const p = roundTo10(c * ml + PACKAGING + PROFIT[ml]);
        newSizes.push([ml, p]);
        changes.push(ml + "ml " + (existing ? existing[1] : "-") + "->" + p);
      } else if (existing) {
        newSizes.push(existing);
      }
    }

    // keep any custom sizes you added through the admin panel
    for (const s of sizes) {
      if (!ALL_SIZES.includes(s[0])) newSizes.push(s);
    }
    newSizes.sort((a, b) => a[0] - b[0]);

    console.log(r.name.padEnd(36) + " cost/ml " + c.toFixed(1).padStart(6) + " | " + changes.join(" | "));

    if (apply) {
      await pool.query("UPDATE products SET sizes = $1 WHERE id = $2", [JSON.stringify(newSizes), r.id]);
    }
  }

  console.log(apply
    ? "\nDone. Prices updated."
    : "\nPREVIEW ONLY - nothing was changed. If it looks right, run:  node fix-prices.js --apply");
  process.exit();
}

run().catch(err => { console.error(err); process.exit(1); });