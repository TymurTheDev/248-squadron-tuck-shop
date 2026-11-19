(() => {
  const API = String(window.TUCKSHOP_CONFIG?.API_BASE || '').replace(/\/$/, '');
  const $ = (id) => document.getElementById(id);
  let products = [];
  let adminProducts = [];
  let adminToken = sessionStorage.getItem('248_staff_session') || '';
  let toastTimer;

  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function money(pence) { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format((Number(pence) || 0) / 100); }
  function notify(message) { const node = $('toast'); node.textContent = message; node.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 2800); }
  async function api(path, options = {}, auth = false) {
    if (!API || API.includes('REPLACE-WITH-YOUR-WORKER')) throw new Error('Website backend is not configured yet. Complete the Cloudflare setup and update site/config.js.');
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (auth) {
      if (!adminToken) throw new Error('Please sign in again.');
      headers.Authorization = `Bearer ${adminToken}`;
    }
    const response = await fetch(`${API}${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && auth) { adminToken = ''; sessionStorage.removeItem('248_staff_session'); }
      throw new Error(data.error || `Request failed (${response.status})`);
    }
    return data;
  }
  function stockState(product) {
    if (product.quantity <= 0) return { cls: 'out-stock', label: 'OUT OF STOCK' };
    if (product.quantity <= (product.lowStockThreshold ?? 3)) return { cls: 'low-stock', label: `LOW STOCK · ${product.quantity} LEFT` };
    return { cls: 'in-stock', label: `AVAILABLE · ${product.quantity} LEFT` };
  }
  function renderProducts() {
    const query = $('searchInput').value.trim().toLowerCase();
    const category = $('categoryFilter').value;
    const filtered = products.filter(p => (!query || `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(query)) && (category === 'all' || p.category === category));
    $('productCountLabel').textContent = `${filtered.length} ITEMS LISTED`;
    $('emptyState').classList.toggle('hidden', filtered.length !== 0);
    $('productGrid').innerHTML = filtered.map((p, index) => {
      const state = stockState(p); const unavailable = p.quantity <= 0;
      const image = p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" loading="lazy" onerror="this.remove()">` : '';
      const placeholder = p.imageUrl ? '' : `<div class="product-placeholder">248</div>`;
      return `<article class="product-card ${unavailable ? 'out-stock-card' : ''}" style="animation-delay:${Math.min(index * 45, 360)}ms"><div class="product-image">${image}${placeholder}</div><div class="product-body"><div class="product-category">${esc(p.category || 'GENERAL')}</div><h3 class="product-name">${esc(p.name)}</h3><div class="product-description">${esc(p.description || '248 Squadron tuck shop')}</div><div class="product-bottom"><strong class="product-price">${money(p.pricePence)}</strong><span class="stock-state ${state.cls}">${state.label}</span></div></div></article>`;
    }).join('');
    $('totalProducts').textContent = products.length;
    $('availableProducts').textContent = products.filter(p => p.quantity > 0).length;
    $('unavailableProducts').textContent = products.filter(p => p.quantity <= 0).length;
    $('lowProducts').textContent = products.filter(p => p.quantity > 0 && p.quantity <= (p.lowStockThreshold ?? 3)).length;
    const cats = [...new Set(products.map(p => p.category || 'General'))].sort();
    const previous = $('categoryFilter').value;
    $('categoryFilter').innerHTML = '<option value="all">ALL CATEGORIES</option>' + cats.map(c => `<option value="${esc(c)}">${esc(c.toUpperCase())}</option>`).join('');
    $('categoryFilter').value = cats.includes(previous) ? previous : 'all';
  }
  async function loadPublic() {
    try {
      const data = await api('/api/products'); products = data.products || []; renderProducts();
      $('systemStatus').textContent = 'SYSTEM ONLINE';
      $('lastUpdated').textContent = `LAST UPDATE ${data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'}) : '—'}`;
    } catch (error) {
      $('systemStatus').textContent = 'OFFLINE';
      $('productGrid').innerHTML = `<div class="loading-card">${esc(error.message)}</div>`;
    }
  }
  function showModal(id) { $(id).classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
  function hideModal(id) { $(id).classList.add('hidden'); if ($('loginModal').classList.contains('hidden') && $('adminModal').classList.contains('hidden')) document.body.style.overflow = ''; }
  function openStaff() { if (adminToken) openAdminPanel(); else { $('loginMessage').textContent = ''; $('adminCode').value = ''; showModal('loginModal'); $('adminCode').focus(); } }
  async function openAdminPanel() {
    hideModal('loginModal'); showModal('adminModal');
    try { await Promise.all([loadAdminProducts(), loadSumupStatus(), loadHistory()]); }
    catch (error) { notify(error.message); }
  }
  async function loadAdminProducts() {
    const data = await api('/api/admin/products', {}, true); adminProducts = data.products || [];
    $('adminProductList').innerHTML = adminProducts.length ? adminProducts.map(p => `<div class="admin-product-row"><div><strong>${esc(p.name)}</strong><small>${esc(p.category)} · ${money(p.pricePence)} · ${p.active ? 'ACTIVE' : 'ARCHIVED'}</small></div><span class="qty">${p.quantity} IN STOCK</span><div class="row-actions"><button class="mini-button" data-edit="${esc(p.id)}">EDIT / STOCK</button><button class="mini-button" data-delete="${esc(p.id)}">REMOVE</button></div></div>`).join('') : '<div class="empty-state"><h3>NO PRODUCTS YET</h3><p>Add the first tuck shop item.</p></div>';
  }
  function resetProductForm() { $('productForm').reset(); $('editId').value = ''; $('productThreshold').value = '3'; $('productForm').classList.add('hidden'); $('productMessage').textContent = ''; }
  function fillProductForm(p) {
    $('editId').value = p?.id || ''; $('productName').value = p?.name || ''; $('productCategory').value = p?.category || ''; $('productPrice').value = ((p?.pricePence || 0) / 100).toFixed(2); $('productQuantity').value = p?.quantity ?? 0; $('productThreshold').value = p?.lowStockThreshold ?? 3; $('productSumupName').value = p?.sumupName || ''; $('productImage').value = p?.imageUrl || ''; $('productDescription').value = p?.description || ''; $('productForm').classList.remove('hidden'); $('productName').focus();
  }
  async function saveProduct(event) {
    event.preventDefault();
    const id = $('editId').value;
    const body = { name: $('productName').value.trim(), category: $('productCategory').value.trim() || 'General', pricePence: Math.round(Number($('productPrice').value) * 100), quantity: Number($('productQuantity').value), lowStockThreshold: Number($('productThreshold').value), sumupName: $('productSumupName').value.trim(), imageUrl: $('productImage').value.trim(), description: $('productDescription').value.trim() };
    try {
      await api(id ? `/api/admin/products/${id}` : '/api/admin/products', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) }, true);
      resetProductForm(); await Promise.all([loadAdminProducts(), loadPublic()]); notify(id ? 'Product updated.' : 'Product added.');
    } catch (error) { $('productMessage').textContent = error.message; }
  }
  async function removeProduct(id) {
    const p = adminProducts.find(x => x.id === id); if (!p || !confirm(`Remove ${p.name} from the public inventory?`)) return;
    try { await api(`/api/admin/products/${id}`, { method: 'DELETE' }, true); await Promise.all([loadAdminProducts(), loadPublic()]); notify('Product removed from public inventory.'); }
    catch (error) { notify(error.message); }
  }
  async function loadSumupStatus() {
    const data = await api('/api/admin/sumup/status', {}, true);
    $('sumupBadge').textContent = data.connected ? 'CONNECTED' : 'NOT CONNECTED'; $('sumupBadge').classList.toggle('connected', !!data.connected);
    $('syncNote').textContent = data.connected ? `Merchant ${data.merchantCode}. Last sync: ${data.lastSync ? new Date(data.lastSync).toLocaleString('en-GB') : 'Waiting for first sync'}. Automatic checks run every five minutes.` : 'Automatic sync checks for new closed sales every five minutes after connection.';
    $('disconnectSumup').disabled = !data.connected; $('syncNow').disabled = !data.connected;
  }
  async function loadHistory() {
    const data = await api('/api/admin/history', {}, true); const rows = data.history || [];
    $('historyList').innerHTML = rows.length ? rows.map(r => `<div class="history-row"><div><strong>${esc(r.product_name)} · ${esc(r.action.replaceAll('_',' '))}</strong><small>${esc(r.note)} · ${new Date(r.created_at).toLocaleString('en-GB')} · ${esc(r.source)}</small></div><span class="history-delta ${r.quantity_change < 0 ? 'negative' : ''}">${r.quantity_change > 0 ? '+' : ''}${r.quantity_change}</span></div>`).join('') : '<div class="empty-state"><h3>NO ACTIVITY YET</h3><p>Stock changes will appear here.</p></div>';
  }
  async function saveSumup(event) {
    event.preventDefault(); $('sumupMessage').textContent = 'Testing connection securely…';
    try {
      const data = await api('/api/admin/sumup/save', { method: 'POST', body: JSON.stringify({ merchantCode: $('merchantCode').value.trim(), apiKey: $('sumupApiKey').value.trim() }) }, true);
      $('sumupApiKey').value = ''; $('sumupMessage').textContent = `Connected to merchant ${data.merchantCode}. Key encrypted and saved.`; $('sumupMessage').style.color = '#47816e'; await loadSumupStatus(); notify('SumUp connection saved.');
    } catch (error) { $('sumupMessage').textContent = error.message; $('sumupMessage').style.color = '#a34b4d'; }
  }
  async function syncNow() {
    $('syncNote').textContent = 'Checking recent completed SumUp sales…';
    try { const data = await api('/api/admin/sumup/sync', { method: 'POST', body: '{}' }, true); $('syncNote').textContent = `Sync complete. ${data.synced} matching item quantities deducted; ${data.skipped} unmatched or unsupported lines skipped.`; await Promise.all([loadPublic(), loadAdminProducts(), loadHistory(), loadSumupStatus()]); notify('SumUp sync complete.'); }
    catch (error) { $('syncNote').textContent = error.message; }
  }
  async function disconnectSumup() {
    if (!confirm('Disconnect SumUp? Your products and manually managed stock will remain saved.')) return;
    try { await api('/api/admin/sumup/disconnect', { method: 'POST', body: '{}' }, true); $('sumupApiKey').value = ''; await loadSumupStatus(); notify('SumUp disconnected.'); }
    catch (error) { notify(error.message); }
  }

  $('searchInput').addEventListener('input', renderProducts);
  $('categoryFilter').addEventListener('change', renderProducts);
  $('openAdmin').addEventListener('click', openStaff);
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => hideModal(button.dataset.close)));
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', e => { if (e.target === backdrop) hideModal(backdrop.id); }));
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault(); $('loginMessage').textContent = 'Verifying…';
    try { const data = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ code: $('adminCode').value }) }); adminToken = data.token; sessionStorage.setItem('248_staff_session', adminToken); $('adminCode').value = ''; await openAdminPanel(); }
    catch (error) { $('loginMessage').textContent = error.message; }
  });
  $('newProduct').addEventListener('click', () => fillProductForm(null));
  $('cancelProduct').addEventListener('click', resetProductForm);
  $('productForm').addEventListener('submit', saveProduct);
  $('adminProductList').addEventListener('click', e => { const edit = e.target.closest('[data-edit]'); const del = e.target.closest('[data-delete]'); if (edit) fillProductForm(adminProducts.find(p => p.id === edit.dataset.edit)); if (del) removeProduct(del.dataset.delete); });
  document.querySelectorAll('.admin-tab').forEach(tab => tab.addEventListener('click', () => { document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t === tab)); document.querySelectorAll('.admin-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${tab.dataset.tab}`)); }));
  $('sumupForm').addEventListener('submit', saveSumup);
  $('syncNow').addEventListener('click', syncNow);
  $('disconnectSumup').addEventListener('click', disconnectSumup);
  $('logoutButton').addEventListener('click', () => { adminToken = ''; sessionStorage.removeItem('248_staff_session'); resetProductForm(); hideModal('adminModal'); notify('Staff session signed out.'); });
  loadPublic();
  setInterval(loadPublic, 20000);
})();
