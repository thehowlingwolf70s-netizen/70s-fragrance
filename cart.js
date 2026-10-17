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

// Shows "Hi, Name" and a Logout link in the header when someone is logged in.
async function updateNavAccount() {
  const link = document.querySelector('.nav-icons a[href="login.html"]');
  if (!link) return;
  try {
    const res = await fetch('/api/me');
    const me = await res.json();
    if (!me.loggedIn) return;

    link.href = 'orders.html';
    link.title = 'My orders';
    link.textContent = 'Hi, ' + String(me.name).split(' ')[0];
    link.style.fontSize = '0.85rem';

    const out = document.createElement('a');
    out.href = '#';
    out.textContent = 'Logout';
    out.title = 'Log out';
    out.style.fontSize = '0.85rem';
    out.addEventListener('click', async function (e) {
      e.preventDefault();
      try { await fetch('/api/logout', { method: 'POST' }); } catch (err) {}
      window.location.href = 'index.html';
    });
    link.insertAdjacentElement('afterend', out);
  } catch (e) {}
}

document.addEventListener('DOMContentLoaded', function () {
  updateNavCartCount();
  updateNavAccount();
});
