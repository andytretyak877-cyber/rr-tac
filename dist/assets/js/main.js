/* =========================================
   main.js — Global scripts for Rhino Rescue
   ========================================= */

/* ──────────────────────────────────────────
   GLOBAL HELPERS (must be defined BEFORE
   home.js / catalog.js execute onerror)
   ────────────────────────────────────────── */

/**
 * Returns an inline SVG placeholder HTML string for a product card.
 * Used in <img onerror="this.parentElement.innerHTML=window.getPlaceholderSVG(name)">
 * The SVG has explicit fills/strokes so it's always visible on dark cards.
 */
window.getPlaceholderSVG = function(name = '') {
  return `<div class="product-card__img-placeholder">
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Bag body -->
      <rect x="8" y="20" width="48" height="36" rx="6"
            fill="var(--clr-placeholder-bg, #2A2A2A)" stroke="var(--clr-placeholder-stroke, #6B7C3E)" stroke-width="2"/>
      <!-- Bag flap -->
      <rect x="8" y="20" width="48" height="14" rx="6"
            fill="var(--clr-bg-3, #3A3A2A)" stroke="var(--clr-placeholder-stroke, #6B7C3E)" stroke-width="2"/>
      <!-- Handle -->
      <path d="M22 20 Q32 10 42 20"
            stroke="var(--clr-placeholder-stroke, #6B7C3E)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <!-- Red cross horizontal -->
      <rect x="23" y="39" width="18" height="6" rx="2" fill="#D4632A"/>
      <!-- Red cross vertical -->
      <rect x="29" y="33" width="6" height="18" rx="2" fill="#D4632A"/>
      <!-- MOLLE straps -->
      <line x1="16" y1="38" x2="16" y2="50" stroke="var(--clr-khaki-dk, #4A5728)" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="20" y1="38" x2="20" y2="50" stroke="var(--clr-khaki-dk, #4A5728)" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="44" y1="38" x2="44" y2="50" stroke="var(--clr-khaki-dk, #4A5728)" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="48" y1="38" x2="48" y2="50" stroke="var(--clr-khaki-dk, #4A5728)" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    <span>${name || 'Фото скоро'}</span>
  </div>`;
};

/**
 * Formats a number as Russian price string: "1 490 ₽"
 */
window.formatPrice = function(price) {
  if (price == null || price === '') return '—';
  return Number(price).toLocaleString('ru-RU') + '\u00a0₽';
};

const YANDEX_METRIKA_ID = 110756263;
const LEAD_GOAL = 'qleads';

function formatRussianPhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits[0] === '8') digits = `7${digits.slice(1)}`;
  else if (digits[0] !== '7') digits = `7${digits}`;
  digits = digits.slice(0, 11);

  const local = digits.slice(1);
  let formatted = '+7';
  if (local.length) formatted += ` (${local.slice(0, 3)}`;
  if (local.length >= 3) formatted += ')';
  if (local.length > 3) formatted += ` ${local.slice(3, 6)}`;
  if (local.length > 6) formatted += `-${local.slice(6, 8)}`;
  if (local.length > 8) formatted += `-${local.slice(8, 10)}`;
  return formatted;
}

function initPhoneMasks() {
  document.querySelectorAll('input[type="tel"]').forEach(input => {
    if (input.dataset.phoneMaskReady === 'true') return;
    input.dataset.phoneMaskReady = 'true';
    input.placeholder = '+7 (___) ___-__-__';
    input.inputMode = 'tel';

    const updateValidity = () => {
      const digits = input.value.replace(/\D/g, '');
      input.setCustomValidity(input.value && digits.length !== 11 ? 'Введите номер телефона полностью' : '');
    };

    input.addEventListener('input', () => {
      input.value = formatRussianPhone(input.value);
      updateValidity();
    });
    input.addEventListener('blur', () => {
      if (input.value.replace(/\D/g, '').length <= 1) input.value = '';
      updateValidity();
    });
  });
}

async function sendLeadToRoistat(data) {
  const response = await fetch('/assets/php/send.php', {
    method: 'POST',
    body: data,
    credentials: 'same-origin',
    headers: { 'X-Requested-With': 'XMLHttpRequest' }
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Roistat rejected the lead');
  }
  return result;
}

async function sendLeadToWeb3Forms(data) {
  const response = await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    body: data
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Web3Forms rejected the lead');
  }
  return result;
}

function reachLeadGoal() {
  if (typeof window.ym === 'function') {
    window.ym(YANDEX_METRIKA_ID, 'reachGoal', LEAD_GOAL);
  }
}

window.submitLeadForm = async function(form) {
  const [web3FormsResult, roistatResult] = await Promise.allSettled([
    sendLeadToWeb3Forms(new FormData(form)),
    sendLeadToRoistat(new FormData(form))
  ]);
  const web3FormsAccepted = web3FormsResult.status === 'fulfilled';
  const roistatAccepted = roistatResult.status === 'fulfilled';

  if (!web3FormsAccepted) console.error('Web3Forms error:', web3FormsResult.reason);
  if (!roistatAccepted) console.error('Roistat error:', roistatResult.reason);
  if (!web3FormsAccepted && !roistatAccepted) {
    throw new Error('Lead delivery failed');
  }

  reachLeadGoal();
  return { success: true, web3FormsAccepted, roistatAccepted };
};

document.addEventListener('DOMContentLoaded', () => {


  /* ── Header scroll behaviour ── */
  const header = document.querySelector('.header');
  const scrollTopBtn = document.querySelector('.scroll-top');

  const onScroll = () => {
    const y = window.scrollY;
    if (header) header.classList.toggle('scrolled', y > 40);
    if (scrollTopBtn) scrollTopBtn.classList.toggle('visible', y > 400);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (scrollTopBtn) {
    scrollTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  /* ── Theme Toggle ── */
  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const html = document.documentElement;
      const current = html.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      localStorage.setItem('rr-theme', next);
    });
  }

  /* ── Hero product image: trigger float after fade-in completes ── */
  const heroImg = document.querySelector('.hero-product-image');
  if (heroImg) {
    const startFloat = () => {
      heroImg.style.animation = [
        'hero-img-in .75s cubic-bezier(.22,.68,0,1.2) .2s forwards',
        'hero-float 6s ease-in-out 1s infinite'
      ].join(', ');
    };
    if (heroImg.complete) {
      startFloat();
    } else {
      heroImg.addEventListener('load', startFloat);
    }
  }

  /* ── Active nav link ── */
  const navLinks = document.querySelectorAll('.header__nav a');
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  navLinks.forEach(a => {
    const href = a.getAttribute('href');
    if (href === currentPath || (currentPath === '' && href === 'index.html')) {
      a.classList.add('active');
    }
  });

  /* ── Burger / Mobile menu ── */
  const burger = document.querySelector('.burger');
  const mobileMenu = document.querySelector('.mobile-menu');

  if (burger && mobileMenu) {
    burger.addEventListener('click', () => {
      const isOpen = burger.classList.toggle('open');
      mobileMenu.classList.toggle('open', isOpen);
      document.body.classList.toggle('modal-open', isOpen);
    });

    mobileMenu.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        burger.classList.remove('open');
        mobileMenu.classList.remove('open');
        document.body.classList.remove('modal-open');
      });
    });

    // Close on Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && mobileMenu.classList.contains('open')) {
        burger.classList.remove('open');
        mobileMenu.classList.remove('open');
        document.body.classList.remove('modal-open');
      }
    });
  }

  /* ── Scroll Reveal (IntersectionObserver) ── */
  window._revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        window._revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  const revealEls = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
  revealEls.forEach(el => window._revealObserver.observe(el));

  /* ── FAQ Accordion ── */
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const trigger = item.querySelector('.faq-item__trigger');
    if (!trigger) return;
    trigger.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      // Close all
      faqItems.forEach(i => i.classList.remove('open'));
      // Open current if was closed
      if (!isOpen) item.classList.add('open');
    });
  });

  /* ── Order Form Modal (shared across pages) ── */
  initOrderModal();
  initPhoneMasks();
});

/* ═══════════════════════════════════════════
   Order Modal Logic
   ═══════════════════════════════════════════ */
function initOrderModal() {
  // Create modal if not exists in DOM
  if (!document.getElementById('orderModal')) {
    const html = `
    <div class="modal-overlay" id="orderModal" role="dialog" aria-modal="true" aria-label="Форма заявки">
      <div class="modal">
        <div class="modal__header">
          <span class="modal__title">Оставить заявку</span>
          <button class="modal__close" id="orderModalClose" aria-label="Закрыть">✕</button>
        </div>
        <div class="modal__body">
          <div class="form-success" id="orderFormSuccess">
            <div class="form-success__icon">✓</div>
            <h3>Заявка принята!</h3>
            <p>Наш менеджер свяжется с вами в течение 30 минут в рабочее время.</p>
          </div>
          <form id="orderForm" novalidate>
            <input type="hidden" name="access_key" value="3d0e28bc-7458-4208-9a0d-4b917d608a79">
            <input type="hidden" name="subject" id="formSubject" value="Новая заявка — Rhino Rescue">
            <input type="hidden" name="product" id="orderFormProduct" value="">
            <input type="hidden" name="from_name" value="Rhino Rescue сайт">
            <input type="checkbox" name="botcheck" style="display:none">

            <div id="orderFormProductDisplay" class="form-product-display" style="display:none">
              <span class="form-product-display__icon">📦</span>
              <span class="form-product-display__name" id="orderFormProductName"></span>
            </div>

            <div class="form-group">
              <label class="form-label" for="orderName">Ваше имя <span>*</span></label>
              <input class="form-input" type="text" id="orderName" name="name" placeholder="Иван Иванов" required autocomplete="name">
            </div>
            <div class="form-group">
              <label class="form-label" for="orderPhone">Телефон <span>*</span></label>
              <input class="form-input" type="tel" id="orderPhone" name="phone" placeholder="+7 (___) ___-__-__" required autocomplete="tel">
            </div>
            <div class="form-group">
              <label class="form-label" for="orderQty">Количество</label>
              <input class="form-input" type="number" id="orderQty" name="quantity" placeholder="1" min="1">
              <span class="form-hint">Для оптовых цен — уточните количество</span>
            </div>
            <div class="form-group">
              <label class="form-label" for="orderComment">Комментарий</label>
              <textarea class="form-textarea" id="orderComment" name="message" placeholder="Ваш вопрос или дополнительная информация..."></textarea>
            </div>
            <button class="btn btn-primary btn-full btn-lg" type="submit" id="orderModalSubmitBtn">
              Отправить заявку
            </button>
            <label class="form-consent">
              <input type="checkbox" name="privacy_consent" value="accepted" required>
              <span>Нажимая кнопку, вы соглашаетесь с <a href="/privacy/" target="_blank" rel="noopener">условиями обработки персональных данных</a></span>
            </label>
          </form>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  const overlay = document.getElementById('orderModal');
  const closeBtn = document.getElementById('orderModalClose');
  const form = document.getElementById('orderForm');
  const success = document.getElementById('orderFormSuccess');
  const productInput = document.getElementById('orderFormProduct');
  const productDisplay = document.getElementById('orderFormProductDisplay');
  const productName = document.getElementById('orderFormProductName');

  // Open modal
  window.openOrderModal = (productTitle = '') => {
    if (!overlay) return;
    if (productTitle) {
      productInput.value = productTitle;
      productName.textContent = productTitle;
      productDisplay.style.display = 'flex';
      document.getElementById('formSubject').value = `Заявка на: ${productTitle} — Rhino Rescue`;
    } else {
      productInput.value = '';
      productDisplay.style.display = 'none';
      document.getElementById('formSubject').value = 'Новая заявка — Rhino Rescue';
    }
    form.style.display = 'block';
    success.classList.remove('show');
    overlay.classList.add('open');
    document.body.classList.add('modal-open');
    overlay.querySelector('#orderName')?.focus();
  };

  // Close modal
  const closeModal = () => {
    overlay.classList.remove('open');
    document.body.classList.remove('modal-open');
    setTimeout(() => {
      form.reset();
      success.classList.remove('show');
      form.style.display = 'block';
    }, 300);
  };

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal();
  });

  // CTA buttons that open the modal
  document.querySelectorAll('[data-modal="order"]').forEach(btn => {
    btn.addEventListener('click', () => openOrderModal(btn.dataset.product || ''));
  });

  /* Form submission via Web3Forms */
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (form.dataset.submitting === 'true') return;
      const btn = document.getElementById('orderModalSubmitBtn');
      const name = document.getElementById('orderName').value.trim();
      const phone = document.getElementById('orderPhone').value.trim();

      if (!name) { shakeField('orderName'); return; }
      if (!phone) { shakeField('orderPhone'); return; }
      if (!form.reportValidity()) return;

      btn.textContent = 'Отправка...';
      btn.disabled = true;
      form.dataset.submitting = 'true';

      try {
        await window.submitLeadForm(form);
        form.style.display = 'none';
        success.classList.add('show');
      } catch (err) {
        console.error('Form error:', err);
        alert('Ошибка отправки. Пожалуйста, позвоните нам напрямую.');
      } finally {
        delete form.dataset.submitting;
        btn.textContent = 'Отправить заявку';
        btn.disabled = false;
      }
    });
  }
}

function shakeField(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.borderColor = 'var(--clr-orange)';
  el.style.animation = 'none';
  el.offsetHeight; // reflow
  el.style.animation = 'shake .4s ease';
  el.focus();
  setTimeout(() => { el.style.borderColor = ''; el.style.animation = ''; }, 700);
}

// Inject shake keyframes once
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
@keyframes shake {
  0%,100%{transform:translateX(0)}
  20%{transform:translateX(-6px)}
  40%{transform:translateX(6px)}
  60%{transform:translateX(-4px)}
  80%{transform:translateX(4px)}
}`;
document.head.appendChild(shakeStyle);

/* ═══════════════════════════════════════════
   Format price helper (exported globally)
   ═══════════════════════════════════════════ */
window.formatPrice = (n) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);

/* ═══════════════════════════════════════════
   Product image placeholder SVG
   ═══════════════════════════════════════════ */
window.getPlaceholderSVG = (text = '') => `
  <div class="product-card__img-placeholder">
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" width="48" height="48">
      <rect width="64" height="64" rx="8" fill="#272727"/>
      <path d="M20 44L28 32L34 40L40 28L48 44H20Z" stroke="#4A5728" stroke-width="1.5" stroke-linejoin="round"/>
      <circle cx="26" cy="24" r="4" stroke="#4A5728" stroke-width="1.5"/>
      <rect x="8" y="8" width="48" height="48" rx="8" stroke="#2A2A2A" stroke-width="1"/>
    </svg>
    <span>Фото<br>${text}</span>
  </div>`;
