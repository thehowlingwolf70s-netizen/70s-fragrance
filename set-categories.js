require("dotenv").config();
const pool = require("./db");

// ---- EDIT ANY LINE, THEN RUN AGAIN ----
// Gender: "For Him", "For Her" or "Unisex"
// Season: "Summer", "Winter" or "All Season"
const CATEGORIES = {
  "Versace Eros":                          ["For Him", "All Season"],
  "Mercedes-Benz Club":                    ["For Him", "Summer"],
  "Marwa (Arabiyat Prestige)":             ["Unisex",  "Summer"],
  "Stronger With You Intensely":           ["For Him", "Winter"],
  "Xerjoff Erba Pura":                     ["Unisex",  "Summer"],
  "Hawas Ice":                             ["For Him", "Summer"],
  "Dolce & Gabbana The One":               ["For Him", "Winter"],
  "Afnan Supremacy Collector's Edition":   ["For Him", "All Season"],
  "Hawas Black":                           ["For Him", "Winter"],
  "Liquid Brun Limited Edition":           ["Unisex",  "Winter"],
  "Kenzo EDT":                             ["For Him", "Summer"],
  "Rayhaan Aquatica":                      ["Unisex",  "Summer"],
  "Rayhaan Ocean Rush":                    ["For Him", "Summer"],
  "Afnan 9pm Night Out":                   ["For Him", "Winter"],
  "Nautica Voyage":                        ["For Him", "Summer"],
  "Armaf Club de Nuit Intense Man":        ["For Him", "All Season"],
  "Barakkat Rouge 540":                    ["Unisex",  "All Season"],
  "Davidoff Cool Water":                   ["For Him", "Summer"],
  "YSL Y EDP":                             ["For Him", "All Season"],
  "Rayhaan Lion":                          ["For Him", "Winter"],
  "Invicto":                               ["For Him", "All Season"],
  "Lattafa Fakhar":                        ["For Him", "All Season"],
  "Bruno Banani Not For Everyone":         ["For Him", "All Season"],
  "Maison Alhambra No.2 Men":              ["For Him", "All Season"]
};
// ----------------------------------------

const GENDERS = ["For Him", "For Her", "Unisex"];
const SEASONS = ["Summer", "Winter", "All Season"];

async function run() {
  const apply = process.argv[2] === "--apply";

  // Catch typos in your list before anything is saved.
  let problems = 0;
  for (const name of Object.keys(CATEGORIES)) {
    const [gender, season] = CATEGORIES[name];
    if (!GENDERS.includes(gender)) { console.log("BAD GENDER for " + name + ": " + gender); problems++; }
    if (!SEASONS.includes(season)) { console.log("BAD SEASON for " + name + ": " + season); problems++; }
  }
  if (problems > 0) {
    console.log("\nFix the lines above and run again. Nothing was changed.");
    process.exit(1);
  }

  const { rows } = await pool.query("SELECT id, name, gender, season FROM products ORDER BY id");
  const inDatabase = new Set(rows.map(r => r.name));

  for (const r of rows) {
    const rule = CATEGORIES[r.name];
    if (!rule) {
      console.log("NOT IN YOUR LIST (left alone): " + r.name);
      continue;
    }
    console.log(r.name.padEnd(38) + (r.gender + " / " + r.season).padEnd(24) + "->  " + rule[0] + " / " + rule[1]);
    if (apply) {
      await pool.query("UPDATE products SET gender = $1, season = $2 WHERE id = $3", [rule[0], rule[1], r.id]);
    }
  }

  for (const name of Object.keys(CATEGORIES)) {
    if (!inDatabase.has(name)) console.log("NOT FOUND IN DATABASE (check the spelling): " + name);
  }

  console.log(apply
    ? "\nDone. Categories updated."
    : "\nPREVIEW ONLY - nothing was changed. If it looks right, run:  node set-categories.js --apply");
  process.exit();
}

run().catch(err => { console.error(err); process.exit(1); });
