const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
require("dotenv").config();
const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const pool = require("./db");
const app = express();

const BKASH_NUMBER = "01959350071";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  family: 4,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use(session({
  store: new pgSession({ pool: pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

async function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ success: false, message: "Please log in." });
  const { rows } = await pool.query("SELECT is_admin FROM users WHERE id = $1", [req.session.userId]);
  if (!rows[0] || !rows[0].is_admin) return res.status(403).json({ success: false, message: "Admin access only." });
  next();
}

app.get("/api/products", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM products ORDER BY id");
  const products = rows.map(r => ({
    id: r.id, name: r.name, sizes: JSON.parse(r.sizes), image: r.image,
    season: r.season, gender: r.gender, in_stock: r.in_stock
  }));
  res.json(products);
});

app.post("/api/signup", async (req, res) => {
  const { name, email, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  try {
    await pool.query("INSERT INTO users (name, email, password) VALUES ($1, $2, $3)", [name, email, hashed]);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: "Email already registered." });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
  const user = rows[0];
  if (!user) return res.status(400).json({ success: false, message: "No account found." });
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).json({ success: false, message: "Wrong password." });
  req.session.userId = user.id;
  req.session.userName = user.name;
  res.json({ success: true, name: user.name });
});

app.get("/api/me", (req, res) => {
  if (req.session.userId) {
    res.json({ loggedIn: true, name: req.session.userName });
  } else {
    res.json({ loggedIn: false });
  }
});

app.get("/api/orders", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: "Please log in first." });
  }
  const { rows: orders } = await pool.query("SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC", [req.session.userId]);
  const full = [];
  for (const o of orders) {
    const { rows: items } = await pool.query("SELECT * FROM order_items WHERE order_id = $1", [o.id]);
    full.push({ ...o, items });
  }
  res.json(full);
});

app.post("/api/place-order", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: "Please log in first." });
  }
  const { cart, custName, custEmail, custPhone, custAddr, txnId } = req.body;
  if (!cart || cart.length === 0) {
    return res.status(400).json({ success: false, message: "Cart is empty." });
  }
  if (!custName || !custPhone || !custAddr) {
    return res.status(400).json({ success: false, message: "Please fill in your name, phone, and address." });
  }

  const total = cart.reduce((sum, item) => sum + item.price, 0);

  const orderResult = await pool.query(
    `INSERT INTO orders (user_id, total, status, tran_id, cust_name, cust_email, cust_phone, cust_addr)
     VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7) RETURNING id`,
    [req.session.userId, total, txnId || null, custName, custEmail || null, custPhone, custAddr]
  );
  const orderId = orderResult.rows[0].id;

  for (const item of cart) {
    await pool.query(
      "INSERT INTO order_items (order_id, product_name, ml, price) VALUES ($1, $2, $3, $4)",
      [orderId, item.name, item.ml, item.price]
    );
  }

  const itemLines = cart.map(i => `- ${i.name} (${i.ml}ml) — ${i.price} Tk`).join("\n");
  const emailBody = `
Order #${orderId} received!

${itemLines}

Total: ${total} Tk

Payment: Please send ${total} Tk via bKash to ${BKASH_NUMBER} (Send Money) if you haven't already.
Transaction ID provided: ${txnId || "(not provided — message us on WhatsApp once sent)"}

Delivery to: ${custName}, ${custPhone}, ${custAddr}

We'll confirm your order shortly. Thank you for shopping with 70S Fragrance!
`;

  try {
    if (custEmail) {
      await transporter.sendMail({
        from: `"70S Fragrance" <${process.env.EMAIL_USER}>`,
        to: custEmail,
        subject: `Order #${orderId} Confirmation — 70S Fragrance`,
        text: emailBody
      });
    }
    await transporter.sendMail({
      from: `"70S Fragrance Orders" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL,
      subject: `New Order #${orderId} — ${total} Tk`,
      text: emailBody
    });
  } catch (err) {
    console.error("Email send error:", err.message);
  }

  res.json({ success: true, orderId, total, bkashNumber: BKASH_NUMBER });
});

app.get("/api/admin/check", async (req, res) => {
  if (!req.session.userId) return res.json({ isAdmin: false });
  const { rows } = await pool.query("SELECT is_admin FROM users WHERE id = $1", [req.session.userId]);
  res.json({ isAdmin: !!(rows[0] && rows[0].is_admin) });
});

app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  const { rows: orders } = await pool.query(`
    SELECT orders.*, users.name AS "accountName", users.email AS "accountEmail"
    FROM orders JOIN users ON orders.user_id = users.id
    ORDER BY orders.created_at DESC
  `);
  const full = [];
  for (const o of orders) {
    const { rows: items } = await pool.query("SELECT * FROM order_items WHERE order_id = $1", [o.id]);
    full.push({ ...o, items });
  }
  res.json(full);
});

app.put("/api/admin/orders/:id/status", requireAdmin, async (req, res) => {
  const { status } = req.body;
  await pool.query("UPDATE orders SET status = $1 WHERE id = $2", [status, req.params.id]);
  res.json({ success: true });
});

app.post("/api/admin/products", requireAdmin, async (req, res) => {
  const { name, sizes, image, season, gender, in_stock } = req.body;
  const result = await pool.query(
    "INSERT INTO products (name, sizes, image, season, gender, in_stock) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    [name, JSON.stringify(sizes), image || null, season || "All Season", gender || "Unisex", in_stock ? 1 : 0]
  );
  res.json({ success: true, id: result.rows[0].id });
});

app.put("/api/admin/products/:id", requireAdmin, async (req, res) => {
  const { name, sizes, image, season, gender, in_stock } = req.body;
  await pool.query(
    "UPDATE products SET name = $1, sizes = $2, image = $3, season = $4, gender = $5, in_stock = $6 WHERE id = $7",
    [name, JSON.stringify(sizes), image || null, season || "All Season", gender || "Unisex", in_stock ? 1 : 0, req.params.id]
  );
  res.json({ success: true });
});

app.delete("/api/admin/products/:id", requireAdmin, async (req, res) => {
  await pool.query("DELETE FROM products WHERE id = $1", [req.params.id]);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});