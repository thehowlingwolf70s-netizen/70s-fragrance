require("dotenv").config();
const bcrypt = require("bcrypt");
const pool = require("./db");

// How to use (type these in the VS Code terminal):
//   node manage-users.js                                  -> shows every account and who is an admin
//   node manage-users.js make     someone@email.com       -> makes that account an admin
//   node manage-users.js remove   someone@email.com       -> takes admin rights away
//   node manage-users.js password someone@email.com NEWPASSWORD -> sets a new password (at least 6 characters)
const [command = "list", email, newPassword] = process.argv.slice(2);

async function showUsers() {
  const { rows } = await pool.query("SELECT id, name, email, is_admin FROM users ORDER BY id");
  console.log("\nAll accounts (" + rows.length + "):");
  rows.forEach(u => {
    console.log(
      "  " + (u.is_admin ? "[ADMIN]" : "       ") + " " + u.email + "   (name: " + u.name + ")"
    );
  });
  const admins = rows.filter(u => u.is_admin);
  console.log("\nAdmins right now: " + (admins.length ? admins.map(a => a.email).join(", ") : "none"));
}

async function run() {
  if (command === "list") {
    await showUsers();
  } else if (command === "make" || command === "remove") {
    if (!email) {
      console.log("Please add the email, like:  node manage-users.js " + command + " someone@email.com");
      process.exit(1);
    }
    const flag = command === "make" ? 1 : 0;
    const result = await pool.query("UPDATE users SET is_admin = $1 WHERE LOWER(email) = LOWER($2)", [flag, email]);
    if (result.rowCount === 0) {
      console.log("No account found with the email: " + email);
    } else {
      console.log(email + (flag ? " is now an admin." : " is no longer an admin."));
    }
    await showUsers();
  } else if (command === "password") {
    if (!email || !newPassword) {
      console.log("Please add the email and the new password, like:  node manage-users.js password someone@email.com NewPassword123");
      process.exit(1);
    }
    if (newPassword.length < 6) {
      console.log("The password must be at least 6 characters. Nothing was changed.");
      process.exit(1);
    }
    const hashed = await bcrypt.hash(newPassword, 10);
    const result = await pool.query("UPDATE users SET password = $1 WHERE LOWER(email) = LOWER($2)", [hashed, email]);
    console.log(result.rowCount === 0
      ? "No account found with the email: " + email
      : "New password saved for " + email + ".");
  } else {
    console.log("I don't know the command \"" + command + "\". Use one of: list, make, remove, password");
    process.exit(1);
  }
  process.exit();
}

run().catch(err => { console.error(err); process.exit(1); });