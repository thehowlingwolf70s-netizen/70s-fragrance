require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function setup() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      sizes TEXT NOT NULL,
      image TEXT
    )
  `);
  try { await pool.query("ALTER TABLE products ADD COLUMN season TEXT DEFAULT 'All Season'"); } catch (e) {}
  try { await pool.query("ALTER TABLE products ADD COLUMN gender TEXT DEFAULT 'Unisex'"); } catch (e) {}
  try { await pool.query("ALTER TABLE products ADD COLUMN in_stock INTEGER DEFAULT 1"); } catch (e) {}
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      total INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      tran_id TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  try { await pool.query("ALTER TABLE orders ADD COLUMN cust_name TEXT"); } catch (e) {}
  try { await pool.query("ALTER TABLE orders ADD COLUMN cust_email TEXT"); } catch (e) {}
  try { await pool.query("ALTER TABLE orders ADD COLUMN cust_phone TEXT"); } catch (e) {}
  try { await pool.query("ALTER TABLE orders ADD COLUMN cust_addr TEXT"); } catch (e) {}
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      ml REAL NOT NULL,
      price INTEGER NOT NULL
    )
  `);

  const { rows } = await pool.query("SELECT COUNT(*) AS c FROM products");
  if (parseInt(rows[0].c) === 0) {
    const products = [
      { name: "Versace Eros", sizes: [[1.5,320],[3,380],[5,620],[10,1130],[15,1700],[30,3270]] },
      { name: "Mercedes-Benz Club", sizes: [[1.5,230],[3,290],[5,440],[10,780],[15,1350],[30,2920]] },
      { name: "Marwa (Arabiyat Prestige)", sizes: [[1.5,210],[3,270],[5,400],[10,680],[15,1250],[30,2820]] },
      { name: "Stronger With You Intensely", sizes: [[1.5,400],[3,460],[5,720],[10,1280],[15,1850],[30,3420]] },
      { name: "Xerjoff Erba Pura", sizes: [[1.5,540],[3,600],[5,1000],[10,1800],[15,2370],[30,3940]] },
      { name: "Hawas Ice", sizes: [[1.5,200],[3,260],[5,360],[10,600],[15,1170],[30,2740]] },
      { name: "Dolce & Gabbana The One", sizes: [[1.5,360],[3,420],[5,650],[10,1160],[15,1730],[30,3300]] },
      { name: "Afnan Supremacy Collector's Edition", sizes: [[1.5,280],[3,340],[5,530],[10,900],[15,1470],[30,3040]] },
      { name: "Hawas Black", sizes: [[1.5,210],[3,270],[5,350],[10,580],[15,1150],[30,2720]] },
      { name: "Liquid Brun Limited Edition", sizes: [[1.5,240],[3,300],[5,450],[10,770],[15,1340],[30,2910]] },
      { name: "Kenzo EDT", sizes: [[1.5,290],[3,350],[5,540],[10,920],[15,1490],[30,3060]] },
      { name: "Rayhaan Aquatica", sizes: [[1.5,170],[3,230],[5,330],[10,540],[15,1110],[30,2680]] },
      { name: "Rayhaan Ocean Rush", sizes: [[1.5,130],[3,190],[5,290],[10,400],[15,970],[30,2540]] },
      { name: "Afnan 9pm Night Out", sizes: [[1.5,270],[3,330],[5,500],[10,880],[15,1450],[30,3020]] },
      { name: "Nautica Voyage", sizes: [[1.5,160],[3,220],[5,330],[10,500],[15,1070],[30,2640]] },
      { name: "Armaf Club de Nuit Intense Man", sizes: [[1.5,210],[3,270],[5,420],[10,660],[15,1230],[30,2800]] },
      { name: "Barakkat Rouge 540", sizes: [[1.5,130],[3,190],[5,270],[10,450],[15,1020],[30,2590]] },
      { name: "Davidoff Cool Water", sizes: [[1.5,230],[3,290],[5,370],[10,620],[15,1190],[30,2760]] },
      { name: "YSL Y EDP", sizes: [[1.5,190],[3,250],[5,380],[10,620],[15,1190],[30,2760]] },
      { name: "Rayhaan Lion", sizes: [[1.5,140],[3,200],[5,290],[10,450],[15,1020],[30,2590]] },
      { name: "Invicto", sizes: [[1.5,230],[3,290],[5,430],[10,670],[15,1240],[30,2810]] },
      { name: "Lattafa Fakhar", sizes: [[1.5,150],[3,210],[5,340],[10,560],[15,1130],[30,2700]] },
      { name: "Bruno Banani Not For Everyone", sizes: [[1.5,180],[3,240],[5,350],[10,550],[15,1120],[30,2690]] },
      { name: "Maison Alhambra No.2 Men", sizes: [[1.5,150],[3,210],[5,300],[10,480],[15,1050],[30,2620]] }
    ];
    for (const p of products) {
      await pool.query("INSERT INTO products (name, sizes) VALUES ($1, $2)", [p.name, JSON.stringify(p.sizes)]);
    }
    console.log("Inserted " + products.length + " products into database.");
  }
}

setup().catch(err => console.error("Database setup error:", err));

module.exports = pool;