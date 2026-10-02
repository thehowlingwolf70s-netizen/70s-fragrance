const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const axios = require("axios");
const qs = require("querystring");
const db = require("./db");
const app = express();

const STORE_ID = "70sfr6abd68b689aef";
const STORE_PASSWORD = "se0zIfT2o6k5";
const BASE_URL = "http://localhost:3000";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use(session({
  secret: "70sfragrance-secret-key",
  resave: false,
  saveUninitialized: false
}));

function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ success: false, message: "Please log in." });
  const user = db.prepare("SELECT is_admin FROM users WHERE id = ?").get(req.session.userId);
  if (!user || !user.is_admin) return res.status(403).json({ success: false, message: "Admin access only." });
  next();
}

app.get("/api/products", (req, res) => {
  const rows = db.prepare("SELECT * FROM products").all();
  const products = rows.map(r => ({ id: r.id, name: r.name, sizes: JSON.parse(r.sizes), image: r.image }));
  res.json(products);
});

app.post("/api/signup", async (req, res) => {
  const { name, email, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  try {
    db.prepare("INSERT INTO users (name, email, password) VALUES (?, ?, ?)").run(name, email, hashed);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: "Email already registered." });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
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

app.get("/api/orders", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: "Please log in first." });
  }
  const orders = db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC").all(req.session.userId);
  const full = orders.map(o => {
    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(o.id);
    return { ...o, items };
  });
  res.json(full);
});

app.post("/api/initiate-payment", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: "Please log in first." });
  }
  const { cart, custName, custEmail, custPhone, custAddr } = req.body;
  if (!cart || cart.length === 0) {
    return res.status(400).json({ success: false, message: "Cart is empty." });
  }
  const total = cart.reduce((sum, item) => sum + item.price, 0);

  const orderResult = db.prepare("INSERT INTO orders (user_id, total, status) VALUES (?, ?, 'pending')").run(req.session.userId, total);
  const orderId = orderResult.lastInsertRowid;
  const insertItem = db.prepare("INSERT INTO order_items (order_id, product_name, ml, price) VALUES (?, ?, ?, ?)");
  for (const item of cart) {
    insertItem.run(orderId, item.name, item.ml, item.price);
  }

  const tranId = "70SFRAG_" + orderId + "_" + Date.now();
  db.prepare("UPDATE orders SET tran_id = ? WHERE id = ?").run(tranId, orderId);

  const payload = {
    store_id: STORE_ID,
    store_passwd: STORE_PASSWORD,
    total_amount: total,
    currency: "BDT",
    tran_id: tranId,
    success_url: BASE_URL + "/api/payment/success",
    fail_url: BASE_URL + "/api/payment/fail",
    cancel_url: BASE_URL + "/api/payment/cancel",
    emi_option: 0,
    cus_name: custName || "Customer",
    cus_email: custEmail || "customer@example.com",
    cus_add1: custAddr || "N/A",
    cus_city: "Dhaka",
    cus_postcode: "1000",
    cus_country: "Bangladesh",
    cus_phone: custPhone || "01700000000",
    shipping_method: "NO",
    num_of_item: cart.length,
    product_name: cart.map(i => i.name).join(", "),
    product_category: "Fragrance",
    product_profile: "general"
  };

  try {
    const response = await axios.post(
      "https://sandbox.sslcommerz.com/gwprocess/v4/api.php",
      qs.stringify(payload),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    if (response.data && response.data.GatewayPageURL) {
      res.json({ success: true, url: response.data.GatewayPageURL });
    } else {
      res.status(400).json({ success: false, message: "Could not start payment.", details: response.data });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: "Payment gateway error." });
  }
});

app.post("/api/payment/success", async (req, res) => {
  const { tran_id, val_id } = req.body;
  try {
    const check = await axios.get("https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php", {
      params: { val_id, store_id: STORE_ID, store_passwd: STORE_PASSWORD, format: "json" }
    });
    if (check.data && (check.data.status === "VALID" || check.data.status === "VALIDATED")) {
      db.prepare("UPDATE orders SET status = 'paid' WHERE tran_id = ?").run(tran_id);
      return res.redirect("/payment-success.html?tran=" + tran_id);
    }
    return res.redirect("/payment-fail.html?tran=" + tran_id);
  } catch (err) {
    return res.redirect("/payment-fail.html?tran=" + tran_id);
  }
});

app.post("/api/payment/fail", (req, res) => {
  const { tran_id } = req.body;
  db.prepare("UPDATE orders SET status = 'failed' WHERE tran_id = ?").run(tran_id);
  res.redirect("/payment-fail.html?tran=" + tran_id);
});

app.post("/api/payment/cancel", (req, res) => {
  const { tran_id } = req.body;
  db.prepare("UPDATE orders SET status = 'cancelled' WHERE tran_id = ?").run(tran_id);
  res.redirect("/payment-cancel.html?tran=" + tran_id);
});

app.get("/api/admin/check", (req, res) => {
  if (!req.session.userId) return res.json({ isAdmin: false });
  const user = db.prepare("SELECT is_admin FROM users WHERE id = ?").get(req.session.userId);
  res.json({ isAdmin: !!(user && user.is_admin) });
});

app.get("/api/admin/orders", requireAdmin, (req, res) => {
  const orders = db.prepare(`
    SELECT orders.*, users.name AS customerName, users.email AS customerEmail
    FROM orders JOIN users ON orders.user_id = users.id
    ORDER BY orders.created_at DESC
  `).all();
  const full = orders.map(o => {
    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(o.id);
    return { ...o, items };
  });
  res.json(full);
});

app.post("/api/admin/products", requireAdmin, (req, res) => {
  const { name, sizes, image } = req.body;
  const result = db.prepare("INSERT INTO products (name, sizes, image) VALUES (?, ?, ?)").run(name, JSON.stringify(sizes), image || null);
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put("/api/admin/products/:id", requireAdmin, (req, res) => {
  const { name, sizes, image } = req.body;
  db.prepare("UPDATE products SET name = ?, sizes = ?, image = ? WHERE id = ?").run(name, JSON.stringify(sizes), image || null, req.params.id);
  res.json({ success: true });
});

app.delete("/api/admin/products/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});