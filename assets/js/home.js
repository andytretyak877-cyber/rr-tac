/* =============================================
   home.js — Renders featured products on index.html
   ============================================= */

document.addEventListener('DOMContentLoaded', async () => {
  const grid = document.getElementById('featuredGrid');
  if (!grid) return;

  grid.innerHTML = `<div class="loading-spinner"><div class="spinner"></div>Загружаем товары...</div>`;

  try {
    const res  = await fetch('/assets/data/products.json');
    const all  = await res.json();
    const featured = all.filter(p => p.featured).slice(0, 6);

    if (!featured.length) {
      grid.innerHTML = '';
      return;
    }

    grid.innerHTML = '';
    featured.forEach((p, i) => {
      const delay = i < 4 ? `reveal-delay-${i + 1}` : '';
      const card  = buildProductCard(p, delay);
      grid.appendChild(card);
    });

    // re-observe new elements for scroll reveal
    document.querySelectorAll('#featuredGrid .reveal').forEach(el => {
      window._revealObserver && window._revealObserver.observe(el);
    });

  } catch (err) {
    console.error('Failed to load products:', err);
    grid.innerHTML = `<p style="color:var(--clr-text-4); text-align:center; padding:2rem;">Не удалось загрузить товары.</p>`;
  }
});

function assetUrl(value = '') {
  if (!value || /^(?:https?:)?\/\//i.test(value) || value.startsWith('/')) return value;
  return `/${value}`;
}

function buildProductCard(p, revealClass = '') {
  const article = document.createElement('article');
  article.className = `product-card reveal ${revealClass}`;
  article.setAttribute('data-id', p.id);

  const stockBadge = p.inStock
    ? '<span class="product-card__badge">В наличии</span>'
    : '<span class="product-card__badge no-stock">Под заказ</span>';

  const imgContent = p.image
    ? `<img src="${assetUrl(p.image)}" alt="${p.name}"
        onerror="this.outerHTML=window.getPlaceholderSVG('${p.name.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')"
        loading="lazy">`
    : window.getPlaceholderSVG(p.name);

  const wsTier = p.priceWholesale?.[0];
  const wsLine = wsTier
    ? `<div class="product-card__price-wholesale">от ${wsTier.from} шт — <span>${window.formatPrice(wsTier.price)}</span></div>`
    : '';

  article.innerHTML = `
    <div class="product-card__img">
      ${imgContent}
      ${stockBadge}
    </div>
    <div class="product-card__body">
      <span class="product-card__category">${p.categoryName}</span>
      <h3 class="product-card__name">${p.name}</h3>
      <span class="product-card__sku">Арт. ${p.sku}</span>
      <div class="product-card__price">
        <div class="product-card__price-retail">
          <span class="product-card__price-label">Розница</span>
          <span class="product-card__price-value">${window.formatPrice(p.priceRetail)}</span>
        </div>
        ${wsLine}
      </div>
    </div>
    <div class="product-card__footer" style="display:flex;gap:.5rem">
      <a href="/product/${p.id}/" class="btn btn-secondary btn-sm" style="flex:1;text-align:center;text-decoration:none" onclick="event.stopPropagation()">Подробнее</a>
      <button class="btn btn-primary btn-sm order-btn" style="flex:1">Заявка</button>
    </div>`;

  // Open order modal on button click
  article.querySelector('.order-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    window.openOrderModal(p.name);
  });

  // Navigate to product page on card click
  article.addEventListener('click', () => {
    window.location.href = `/product/${p.id}/`;
  });

  return article;
}

/* ── Product detail modal ── */
function openProductModal(p) {
  let overlay = document.getElementById('productModal');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'productModal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="modal modal--wide">
        <div class="modal__header">
          <span class="modal__title" id="pmTitle">Товар</span>
          <button class="modal__close" id="pmClose" aria-label="Закрыть">✕</button>
        </div>
        <div class="modal__body" id="pmBody"></div>
      </div>`;
    document.body.appendChild(overlay);

    document.getElementById('pmClose').addEventListener('click', closeProductModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeProductModal(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.classList.contains('open')) closeProductModal();
    });
  }

  const inStock = p.inStock;
  const wsTiers = `<div class="wholesale-tier-row" style="color:var(--clr-text-3);">по запросу</div>`;

  const features = (p.features || []).map(f =>
    `<span class="product-modal__feature">${f}</span>`
  ).join('');

  // Build img tag separately to avoid nested-quote conflicts
  const safeName = (p.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  const imgHTML = p.image
    ? `<img src="${assetUrl(p.image)}" alt="${safeName}" onerror="this.outerHTML=window.getPlaceholderSVG('${safeName}')" loading="lazy">`
    : window.getPlaceholderSVG(p.name);

  document.getElementById('pmTitle').textContent = p.name;
  document.getElementById('pmBody').innerHTML = `
    <div class="product-modal__grid">
      <div class="product-modal__img">${imgHTML}</div>
      <div class="product-modal__info">
        <span class="product-modal__category">${p.categoryName}</span>
        <h2 class="product-modal__name">${p.name}</h2>
        <span class="product-modal__sku">Артикул: ${p.sku}</span>
        <div class="product-modal__stock ${inStock ? 'in' : 'out'}">
          ${inStock ? 'В наличии' : 'Под заказ — уточните срок'}
        </div>
        <p class="product-modal__desc">${p.description || ''}</p>
        ${features ? `<div class="product-modal__features">${features}</div>` : ''}
        <div class="product-modal__prices">
          <div class="product-modal__price-retail">
            <span class="product-modal__price-label">Розница:</span>
            <span class="product-modal__price-value">${window.formatPrice(p.priceRetail)}</span>
          </div>
          <div class="product-modal__wholesale-title" style="margin-top: .5rem">Оптовые цены</div>${wsTiers}
        </div>
        <button class="btn btn-primary btn-full" onclick="closeProductModal(); window.openOrderModal('${safeName}')">
          Оставить заявку на этот товар
        </button>
      </div>
    </div>`;

  overlay.classList.add('open');
  document.body.classList.add('modal-open');
}

function closeProductModal() {
  const overlay = document.getElementById('productModal');
  if (overlay) {
    overlay.classList.remove('open');
    document.body.classList.remove('modal-open');
  }
}

window.openProductModal  = openProductModal;
window.buildProductCard  = buildProductCard;
