require("dotenv").config();
const pool = require("./db");

const NEW_PRODUCTS = [
  { name: "Lattafa Musamam Black Intense", gender: "For Him",  season: "All Season", sizes: [[1.5,180],[3,310],[5,470],[10,780],[15,1120],[30,2020]] },
  { name: "Armaf Club de Nuit Untold",     gender: "Unisex",   season: "Winter",     sizes: [[1.5,170],[3,290],[5,440],[10,720],[15,1020],[30,1800]] },
  { name: "Lattafa Dalal",                 gender: "For Her",  season: "Winter",     sizes: [[1.5,150],[3,260],[5,400],[10,620],[15,880],[30,1530]] },
  { name: "Lattafa Khamrah",               gender: "Unisex",   season: "Winter",     sizes: [[1.5,150],[3,260],[5,400],[10,630],[15,900],[30,1560]] },
  { name: "Afnan 9pm Rebel",               gender: "Unisex",   season: "All Season", sizes: [[1.5,170],[3,300],[5,460],[10,760],[15,1100],[30,1950]] },
  { name: "Rasasi Hawas Diva",             gender: "For Her",  season: "Winter",     sizes: [[1.5,150],[3,250],[5,370],[10,580],[15,820],[30,1410]] },
];

async function run() {
  const apply = process.argv[2] === "--apply";
  const { rows: existing } = await pool.query("SELECT name FROM products");
  const existingNames = new Set(existing.map(r => r.name));

  for (const p of NEW_PRODUCTS) {
    if (existingNames.has(p.name)) {
      console.log("ALREADY EXISTS (skipped): " + p.name);
      continue;
    }
    console.log((apply ? "ADDING: " : "WOULD ADD: ") + p.name + " | " + p.gender + " | " + p.season);
    if (apply) {
      await pool.query(
        "INSERT INTO products (name, sizes, image, season, gender, in_stock) VALUES ($1, $2, NULL, $3, $4, 1)",
        [p.name, JSON.stringify(p.sizes), p.season, p.gender]
      );
    }
  }

  console.log(apply
    ? "\nDone. Products added."
    : "\nPREVIEW ONLY. Run:  node add-new-perfumes.js --apply");
  process.exit();
}

run().catch(err => { console.error(err); process.exit(1); });
