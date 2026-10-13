require("dotenv").config();
const pool = require("./db");
const email = process.argv[2];

async function run() {
  if (!email) {
    console.log("Usage: node make-admin.js youremail@example.com");
    process.exit();
  }

  const result = await pool.query(
    "UPDATE users SET is_admin = 1 WHERE LOWER(email) = LOWER($1)",
    [email]
  );

  if (result.rowCount > 0) {
    console.log(email + " is now an admin.");
  } else {
    console.log("No account found with the email: " + email);
    console.log("These accounts exist:");
    const all = await pool.query("SELECT name, email, is_admin FROM users ORDER BY id");
    all.rows.forEach(u => {
      console.log(" - " + u.email + "  (name: " + u.name + ", admin: " + (u.is_admin ? "yes" : "no") + ")");
    });
  }

  console.log("\nCurrent admins:");
  const admins = await pool.query("SELECT email FROM users WHERE is_admin = 1");
  if (admins.rows.length === 0) console.log(" (none yet)");
  admins.rows.forEach(a => console.log(" - " + a.email));

  process.exit();
}

run().catch(err => { console.error(err); process.exit(1); });