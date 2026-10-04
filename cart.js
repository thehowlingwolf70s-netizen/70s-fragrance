function loadCartGlobal() {
  try { return JSON.parse(localStorage.getItem('70sfrag_cart') || '[]'); }
  catch (e) { return []; }
}
function saveCartGlobal(cart) {
  try { localStorage.setItem('70sfrag_cart', JSON.stringify(cart)); }
  catch (e) {}
}
function updateNavCartCount() {
  const cart = loadCartGlobal();
  const el = document.getElementById('navCartCount');
  if (el) el.textContent = cart.length;
}
document.addEventListener('DOMContentLoaded', updateNavCartCount);