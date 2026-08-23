/* =========================================
   cart.js — Cart Logic using localStorage
   ========================================= */

window.cart = {
  items: [],

  init() {
    this.loadCart();
    this.updateCartBadge();
    this.renderCartPage();
    this.initToastContainer();
  },

  loadCart() {
    try {
      const data = localStorage.getItem('rr-cart');
      if (data) {
        this.items = JSON.parse(data);
      }
    } catch (e) {
      console.error('Error loading cart', e);
      this.items = [];
    }
  },

  saveCart() {
    localStorage.setItem('rr-cart', JSON.stringify(this.items));
    this.updateCartBadge();
    this.renderCartPage();
  },

  addToCart(product, qty = 1) {
    const existing = this.items.find(item => item.id === product.id);
    if (existing) {
      existing.quantity += qty;
    } else {
      this.items.push({
        id: product.id,
        name: product.name,
        price: parseFloat(product.priceRetail || product.price || 0),
        image: this.normalizeAssetPath(product.image || ''),
        sku: product.sku || '',
        quantity: qty
      });
    }
    this.saveCart();
    this.showToast('Товар добавлен', product.name);
  },

  removeFromCart(id) {
    this.items = this.items.filter(item => item.id !== id);
    this.saveCart();
  },

  updateQuantity(id, qty) {
    qty = parseInt(qty);
    if (isNaN(qty) || qty < 1) return;
    const item = this.items.find(i => i.id === id);
    if (item) {
      item.quantity = qty;
      this.saveCart();
    }
  },

  clearCart() {
    this.items = [];
    this.saveCart();
  },

  getTotalItems() {
    return this.items.reduce((sum, item) => sum + item.quantity, 0);
  },

  getTotalPrice() {
    return this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  },

  normalizeAssetPath(value = '') {
    if (!value || /^(?:https?:)?\/\//i.test(value) || value.startsWith('/')) return value;
    return `/${value}`;
  },

  updateCartBadge() {
    const badges = document.querySelectorAll('.header-cart__badge');
    const total = this.getTotalItems();
    badges.forEach(badge => {
      if (total > 0) {
        badge.textContent = total;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    });
  },

  initToastContainer() {
    if (!document.getElementById('toastContainer')) {
      const container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
  },

  showToast(title, desc) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <div class="toast-icon">🛒</div>
      <div class="toast-content">
        <span class="toast-title">${title}</span>
        <span class="toast-desc">${desc}</span>
      </div>
    `;
    
    container.appendChild(toast);
    
    // trigger reflow
    void toast.offsetWidth;
    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  // Renders cart items if we are on cart.html
  renderCartPage() {
    const cartContainer = document.getElementById('cartItemsContainer');
    const totalElement = document.getElementById('cartTotalSum');
    const hiddenProductInput = document.getElementById('formProduct');

    if (!cartContainer) return; // not on cart page

    if (this.items.length === 0) {
      cartContainer.innerHTML = '<p style="color:var(--clr-text-3); text-align:center; padding:2rem 0;">Ваша корзина пуста. <br><br><a href="/catalog/" class="btn btn-primary">Перейти в каталог</a></p>';
      if (totalElement) totalElement.textContent = '0 ₽';
      if (hiddenProductInput) hiddenProductInput.value = '';
      
      const submitBtn = document.getElementById('orderSubmitBtn');
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    let html = '';
    let cartTextForEmail = 'ЗАКАЗ ИЗ КОРЗИНЫ:\n\n';

    this.items.forEach(item => {
      const priceFmt = window.formatPrice ? window.formatPrice(item.price) : (item.price + ' ₽');
      const sumFmt = window.formatPrice ? window.formatPrice(item.price * item.quantity) : ((item.price * item.quantity) + ' ₽');
      
      cartTextForEmail += `- ${item.name} (Арт. ${item.sku}) x ${item.quantity} шт. = ${sumFmt}\n`;

      html += `
        <div class="cart-item">
          <div class="cart-item__img">
            ${item.image ? `<img src="${this.normalizeAssetPath(item.image)}" alt="${item.name}">` : '📸'}
          </div>
          <div class="cart-item__info">
            <div class="cart-item__sku">Арт. ${item.sku}</div>
            <h3 class="cart-item__title">${item.name}</h3>
            <div class="cart-item__price">${priceFmt}</div>
          </div>
          <div class="cart-item__qty">
            <button onclick="window.cart.updateQuantity('${item.id}', ${item.quantity - 1})">-</button>
            <span>${item.quantity}</span>
            <button onclick="window.cart.updateQuantity('${item.id}', ${item.quantity + 1})">+</button>
          </div>
          <div class="cart-item__sum">
            ${sumFmt}
          </div>
          <button class="cart-item__del" onclick="window.cart.removeFromCart('${item.id}')" aria-label="Удалить">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </button>
        </div>
      `;
    });

    const totalFmt = window.formatPrice ? window.formatPrice(this.getTotalPrice()) : (this.getTotalPrice() + ' ₽');
    
    cartTextForEmail += `\nИТОГО: ${totalFmt}`;

    cartContainer.innerHTML = html;
    if (totalElement) totalElement.textContent = totalFmt;
    if (hiddenProductInput) hiddenProductInput.value = cartTextForEmail;
    
    const submitBtn = document.getElementById('orderSubmitBtn');
    if (submitBtn) submitBtn.disabled = false;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  window.cart.init();
});
