require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("./db");

const IMAGES_DIR = path.join(__dirname, "images");
const EXTS = [".jpg", ".jpeg", ".png", ".webp"];

// How to recognise each product from a photo's file name.
// Every group in a rule needs at least one of its words to appear in the file name.
const RULES = {
  "Versace Eros": [["versace"], ["eros"]],
  "Mercedes-Benz Club": [["mercedes", "mercedez", "benz"]],
  "Marwa (Arabiyat Prestige)": [["marwa"]],
  "Stronger With You Intensely": [["stronger"]],
  "Xerjoff Erba Pura": [["xerjoff", "erba"]],
  "Hawas Ice": [["hawas"], ["ice"]],
  "Dolce & Gabbana The One": [["dolce"], ["gabbana"]],
  "Afnan Supremacy Collector's Edition": [["afnan"], ["supremacy"]],
  "Hawas Black": [["hawas"], ["black"]],
  "Liquid Brun Limited Edition": [["liquid"], ["brun"]],
  "Kenzo EDT": [["kenzo"]],
  "Rayhaan Aquatica": [["aquatica"]],
  "Rayhaan Ocean Rush": [["ocean"], ["rush"]],
  "Afnan 9pm Night Out": [["9pm"]],
  "Nautica Voyage": [["nautica"]],
  "Armaf Club de Nuit Intense Man": [["nuit"]],
  "Barakkat Rouge 540": [["barakkat", "baccarat"]],
  "Davidoff Cool Water": [["davidoff", "cool"]],
  "YSL Y EDP": [["ysl", "yusuf"]],
  "Rayhaan Lion": [["lion"]],
  "Invicto": [["invicto"]],
  "Lattafa Fakhar": [["fakhar", "fakhr"]],
  "Bruno Banani Not For Everyone": [["bruno", "banani"]],
  "Maison Alhambra No.2 Men": [["alhambra"]]
};

// "Dolce & Gabbana.jpg.jpeg" -> ["dolce", "gabbana"]
function words(fileName) {
  let base = fileName.toLowerCase();
  while (/\.(jpe?g|png|webp)$/.test(base)) base = base.replace(/\.(jpe?g|png|webp)$/, "");
  return base.replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean);
}

function matches(rule, fileWords) {
  return rule.every(group => group.some(w => fileWords.includes(w)));
}

async function run() {
  const apply = process.argv[2] === "--apply";

  if (!fs.existsSync(IMAGES_DIR)) {
    console.log("No images folder found at " + IMAGES_DIR);
    process.exit();
  }

  const files = fs.readdirSync(IMAGES_DIR)
    .filter(f => EXTS.includes(path.extname(f).toLowerCase()))
    .map(f => ({ name: f, time: fs.statSync(path.join(IMAGES_DIR, f)).mtimeMs, words: words(f) }));

  const { rows: products } = await pool.query("SELECT id, name FROM products ORDER BY id");

  const candidates = {};   // product name -> photos that match it
  const unmatched = [];

  for (const f of files) {
    const hits = products.filter(p => RULES[p.name] && matches(RULES[p.name], f.words));
    if (hits.length === 0) {
      unmatched.push(f.name);
      continue;
    }
    // if a photo fits several products, the product with the most specific rule wins
    hits.sort((a, b) => RULES[b.name].length - RULES[a.name].length);
    if (hits.length > 1 && RULES[hits[0].name].length === RULES[hits[1].name].length) {
      console.log("UNSURE (fits several products, skipped): " + f.name);
      continue;
    }
    (candidates[hits[0].name] = candidates[hits[0].name] || []).push(f);
  }

  const missing = [];

  for (const p of products) {
    const list = (candidates[p.name] || []).sort((a, b) => b.time - a.time);   // newest photo first
    if (list.length === 0) {
      missing.push(p.name);
      continue;
    }
    const pick = list[0];
    const imagePath = "images/" + encodeURIComponent(pick.name);

    console.log(p.name.padEnd(38) + " <- " + pick.name);
    if (list.length > 1) {
      console.log("      also found (not used, you can delete): " + list.slice(1).map(f => f.name).join(", "));
    }

    if (apply) {
      await pool.query("UPDATE products SET image = $1 WHERE id = $2", [imagePath, p.id]);
    }
  }

  if (missing.length) {
    console.log("\nNo photo found for: " + missing.join(", "));
  }
  if (unmatched.length) {
    console.log("\nPhotos that matched no product: " + unmatched.join(", "));
  }

  console.log(apply
    ? "\nDone. Photos linked."
    : "\nPREVIEW ONLY - nothing was changed. If it looks right, run:  node link-images.js --apply");
  process.exit();
}

run().catch(err => { console.error(err); process.exit(1); });