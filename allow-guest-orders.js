require('dotenv').config();
const pool = require('./db');
async function run() {
  // Allow orders without a user account (guest checkout)
  await pool.query('ALTER TABLE orders ALTER COLUMN user_id DROP NOT NULL');
  console.log('Done. Guest orders are now allowed.');
  process.exit();
}
run().catch(function(e) { console.error(e.message); process.exit(1); });
