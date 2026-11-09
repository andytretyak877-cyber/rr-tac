/* Catalog enhancements for statically generated category pages. */

document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('catalogGrid');
  if (!grid) return;

  const cards = [...grid.querySelectorAll('.product-card')];
  const countElement = document.getElementById('catalogCountNum');
  const noResults = document.getElementById('noResults');
  const searchInput = document.getElementById('catalogSearch');
  const stockCheckbox = document.getElementById('onlyInStock');

  function applyFilters() {
    const query = (searchInput?.value || '').trim().toLocaleLowerCase('ru-RU');
    const onlyInStock = Boolean(stockCheckbox?.checked);
    let visible = 0;

    for (const card of cards) {
      const matchesText = !query || card.textContent.toLocaleLowerCase('ru-RU').includes(query);
      const matchesStock = !onlyInStock || card.dataset.stock === 'true';
      const show = matchesText && matchesStock;
      card.hidden = !show;
      if (show) visible += 1;
    }

    if (countElement) countElement.textContent = visible;
    noResults?.classList.toggle('show', visible === 0);
  }

  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(applyFilters, 150);
    });
  }
  stockCheckbox?.addEventListener('change', applyFilters);

  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('catalogSidebar');

  // A tall sidebar travels with the page until its last items reach the viewport.
  // Recalculate after resizing, zooming or changes to the sidebar's contents.
  if (sidebar) {
    const header = document.querySelector('.header');
    const updateSidebarPosition = () => {
      const gap = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const top = Math.min(
        (header?.offsetHeight || 0) + gap,
        window.innerHeight - sidebar.offsetHeight - gap
      );
      sidebar.style.setProperty('--sidebar-top', `${top}px`);
    };
    const sidebarObserver = new ResizeObserver(updateSidebarPosition);
    sidebarObserver.observe(sidebar);
    if (header) sidebarObserver.observe(header);
    window.addEventListener('resize', updateSidebarPosition, { passive: true });
    updateSidebarPosition();
  }

  sidebarToggle?.addEventListener('click', () => {
    const isOpen = sidebar?.classList.toggle('open') || false;
    document.body.classList.toggle('modal-open', isOpen);
    sidebarToggle.setAttribute('aria-expanded', String(isOpen));
    sidebarToggle.textContent = isOpen ? '✕ Скрыть фильтры' : '☰ Фильтры и категории';
  });

  document.addEventListener('click', event => {
    if (window.innerWidth >= 1024 || !sidebar?.classList.contains('open')) return;
    if (sidebar.contains(event.target) || sidebarToggle?.contains(event.target)) return;
    sidebar.classList.remove('open');
    document.body.classList.remove('modal-open');
    sidebarToggle?.setAttribute('aria-expanded', 'false');
    if (sidebarToggle) sidebarToggle.textContent = '☰ Фильтры и категории';
  });
});
