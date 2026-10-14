require("dotenv").config();
const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const bcrypt = require("bcrypt");
const axios = require("axios");
const pool = require("./db");
const app = express();

const BKASH_NUMBER = "01959350071";

// Sends you a Telegram message. Not awaited by callers, so it can never slow down or break an order.
async function notifyOwner(text) {
  try {
    await axios.post(
      "https://api.telegram.org/bot" + process.env.TELEGRAM_BOT_TOKEN + "/sendMessage",
      { chat_id: process.env.TELEGRAM_CHAT_ID, text: text },
      { timeout: 10000 }
    );
  } catch (err) {
    console.error("Telegram error:", err.response ? JSON.stringify(err.response.data) : err.message);
  }
}

// Trims a value and cuts it to a maximum length, so nobody can send huge or empty-looking text.
const clean = (value, max) => String(value == null ? "" : value).trim().slice(0, max);

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

// One order, for its owner (or an admin). Used by the receipt page.
app.get("/api/orders/:id", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: "Please log in first." });
  }
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: "Invalid order." });

  const { rows } = await pool.query("SELECT * FROM orders WHERE id = $1", [id]);
  const order = rows[0];
  if (!order) return res.status(404).json({ success: false, message: "Order not found." });

  let allowed = order.user_id === req.session.userId;
  if (!allowed) {
    const u = await pool.query("SELECT is_admin FROM users WHERE id = $1", [req.session.userId]);
    allowed = !!(u.rows[0] && u.rows[0].is_admin);
  }
  if (!allowed) return res.status(403).json({ success: false, message: "This isn't your order." });

  const { rows: items } = await pool.query("SELECT * FROM order_items WHERE order_id = $1", [id]);
  res.json({ success: true, order: { ...order, items }, bkashNumber: BKASH_NUMBER });
});

app.post("/api/place-order", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: "Please log in first." });
  }

  const { cart, custName, custEmail, custPhone, custAddr, txnId } = req.body;

  if (!Array.isArray(cart) || cart.length === 0) {
    return res.status(400).json({ success: false, message: "Cart is empty." });
  }
  if (cart.length > 40) {
    return res.status(400).json({ success: false, message: "Too many items in one order. Please split it into two orders." });
  }

  const name = clean(custName, 100);
  const phone = clean(custPhone, 30);
  const addr = clean(custAddr, 300);
  const mail = clean(custEmail, 100);
  const txn = clean(txnId, 50);

  if (!name || !phone || !addr) {
    return res.status(400).json({ success: false, message: "Please fill in your name, phone, and address." });
  }

  // Never trust prices sent by the browser: look up every price in the database.
  const { rows: productRows } = await pool.query("SELECT name, sizes, in_stock FROM products");
  const catalog = {};
  for (const p of productRows) catalog[p.name] = p;

  const items = [];
  for (const entry of cart) {
    const itemName = entry ? entry.name : "";
    const p = catalog[itemName];
    if (!p) {
      return res.status(400).json({ success: false, message: "Sorry, \"" + itemName + "\" is no longer available. Please remove it from your cart." });
    }
    if (!p.in_stock) {
      return res.status(400).json({ success: false, message: p.name + " is out of stock. Please remove it from your cart." });
    }
    const size = JSON.parse(p.sizes).find(s => Number(s[0]) === Number(entry.ml));
    if (!size) {
      return res.status(400).json({ success: false, message: p.name + " is no longer sold in " + entry.ml + "ml. Please remove it from your cart." });
    }
    items.push({ name: p.name, ml: size[0], price: size[1] });
  }

  const total = items.reduce((sum, item) => sum + item.price, 0);

  const orderResult = await pool.query(
    `INSERT INTO orders (user_id, total, status, tran_id, cust_name, cust_email, cust_phone, cust_addr)
     VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7) RETURNING id`,
    [req.session.userId, total, txn || null, name, mail || null, phone, addr]
  );
  const orderId = orderResult.rows[0].id;

  for (const item of items) {
    await pool.query(
      "INSERT INTO order_items (order_id, product_name, ml, price) VALUES ($1, $2, $3, $4)",
      [orderId, item.name, item.ml, item.price]
    );
  }

  const itemLines = items.map(i => `- ${i.name} (${i.ml}ml) — ${i.price} Tk`).join("\n");
  const message = `NEW ORDER #${orderId}

${itemLines}

Total: ${total} Tk

Name: ${name}
Phone: ${phone}
Address: ${addr}
Email: ${mail || "-"}
bKash Txn ID: ${txn || "not provided yet"}`;

  notifyOwner(message);

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
  const allowed = ["pending", "paid", "shipped", "delivered", "cancelled"];
  const { status } = req.body;
  if (!allowed.includes(status)) {
    return res.status(400).json({ success: false, message: "Unknown status." });
  }
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