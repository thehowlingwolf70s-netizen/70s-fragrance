require('dotenv').config();
const pool = require('./db');
const names = ['Barakkat Rouge 540', 'Maison Alhambra No.2 Men', 'YSL Y EDP', 'Mercedes-Benz Club', 'Davidoff Cool Water'];
async function run() {
  for (const name of names) {
    await pool.query('UPDATE products SET in_stock = 0 WHERE name = $1', [name]);
    console.log('Out of stock: ' + name);
  }
  process.exit();
}
run().catch(function(e) { console.error(e); process.exit(1); });
