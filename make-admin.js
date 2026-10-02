const db = require("./db");
const email = process.argv[2];
if (!email) {
  console.log("Usage: node make-admin.js youremail@example.com");
  process.exit();
}
const result = db.prepare("UPDATE users SET is_admin = 1 WHERE email = ?").run(email);
if (result.changes > 0) {
  console.log(email + " is now an admin.");
} else {
  console.log("No user found with that email.");
}