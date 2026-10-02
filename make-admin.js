const pool = require("./db");
const email = process.argv[2];

async function run() {
  if (!email) {
    console.log("Usage: node make-admin.js youremail@example.com");
    process.exit();
  }
  const result = await pool.query("UPDATE users SET is_admin = 1 WHERE email = $1", [email]);
  if (result.rowCount > 0) {
    console.log(email + " is now an admin.");
  } else {
    console.log("No user found with that email.");
  }
  process.exit();
}

run();