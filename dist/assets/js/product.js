/* Product page interactions for generated static pages. */

document.addEventListener('DOMContentLoaded', () => {
  const dataElement = document.getElementById('productData');
  if (!dataElement) return;

  let product;
  try {
    product = JSON.parse(dataElement.textContent);
  } catch (error) {
    console.error('Invalid product data', error);
    return;
  }

  const mainImage = document.getElementById('mainImg');
  const thumbs = [...document.querySelectorAll('.gallery__thumb')];
  const thumbRail = document.getElementById('galleryThumbs');
  const thumbShell = document.getElementById('galleryThumbsShell');
  const thumbScrollButtons = [...document.querySelectorAll('[data-thumb-scroll]')];
  const images = thumbs.length
    ? thumbs.map(thumb => thumb.dataset.src)
    : [mainImage?.getAttribute('src')].filter(Boolean);
  let currentIndex = 0;

  function setImage(index) {
    if (!images.length || !mainImage) return;
    currentIndex = (index + images.length) % images.length;
    mainImage.src = images[currentIndex];
    thumbs.forEach((thumb, thumbIndex) => thumb.classList.toggle('active', thumbIndex === currentIndex));
    thumbs[currentIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  thumbs.forEach((thumb, index) => thumb.addEventListener('click', () => setImage(index)));

  function updateThumbControls() {
    if (!thumbRail || !thumbShell) return;
    const maxScroll = Math.max(0, thumbRail.scrollWidth - thumbRail.clientWidth);
    thumbShell.classList.toggle('is-static', maxScroll <= 2);
    for (const button of thumbScrollButtons) {
      const direction = Number(button.dataset.thumbScroll);
      button.disabled = direction < 0 ? thumbRail.scrollLeft <= 2 : thumbRail.scrollLeft >= maxScroll - 2;
    }
  }

  thumbScrollButtons.forEach(button => {
    button.addEventListener('click', () => {
      if (!thumbRail) return;
      thumbRail.scrollBy({ left: Number(button.dataset.thumbScroll) * thumbRail.clientWidth * .8, behavior: 'smooth' });
    });
  });
  thumbRail?.addEventListener('scroll', updateThumbControls, { passive: true });
  window.addEventListener('resize', updateThumbControls);
  requestAnimationFrame(updateThumbControls);
  document.getElementById('galleryPrev')?.addEventListener('click', event => {
    event.stopPropagation();
    setImage(currentIndex - 1);
  });
  document.getElementById('galleryNext')?.addEventListener('click', event => {
    event.stopPropagation();
    setImage(currentIndex + 1);
  });

  const lightbox = document.getElementById('lightbox');
  const lightboxImage = document.getElementById('lightboxImg');
  const lightboxCounter = document.getElementById('lightboxCounter');

  function updateLightbox() {
    if (lightboxImage) {
      lightboxImage.src = images[currentIndex];
      lightboxImage.alt = product.name || '';
    }
    if (lightboxCounter) lightboxCounter.textContent = images.length > 1 ? `${currentIndex + 1} / ${images.length}` : '';
  }

  function openLightbox() {
    if (!lightbox || !images.length) return;
    updateLightbox();
    lightbox.classList.add('open');
    document.body.classList.add('modal-open');
  }

  function closeLightbox() {
    lightbox?.classList.remove('open');
    document.body.classList.remove('modal-open');
  }

  document.getElementById('galleryMain')?.addEventListener('click', openLightbox);
  document.getElementById('lightboxClose')?.addEventListener('click', closeLightbox);
  lightbox?.addEventListener('click', event => {
    if (event.target === lightbox) closeLightbox();
  });
  document.getElementById('lightboxPrev')?.addEventListener('click', event => {
    event.stopPropagation();
    setImage(currentIndex - 1);
    updateLightbox();
  });
  document.getElementById('lightboxNext')?.addEventListener('click', event => {
    event.stopPropagation();
    setImage(currentIndex + 1);
    updateLightbox();
  });
  document.addEventListener('keydown', event => {
    if (!lightbox?.classList.contains('open')) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'ArrowLeft') {
      setImage(currentIndex - 1);
      updateLightbox();
    }
    if (event.key === 'ArrowRight') {
      setImage(currentIndex + 1);
      updateLightbox();
    }
  });

  const quantityInput = document.getElementById('productQtyInput');
  document.querySelectorAll('[data-qty-change]').forEach(button => {
    button.addEventListener('click', () => {
      if (!quantityInput) return;
      const next = (Number.parseInt(quantityInput.value, 10) || 1) + Number(button.dataset.qtyChange);
      quantityInput.value = Math.max(1, next);
    });
  });
  document.getElementById('addProductToCart')?.addEventListener('click', () => {
    const quantity = Math.max(1, Number.parseInt(quantityInput?.value, 10) || 1);
    window.cart?.addToCart(product, quantity);
  });
});
