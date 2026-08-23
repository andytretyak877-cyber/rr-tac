/* ============================================
   theme.js — Inline theme initializer
   Подключается в <head> ПЕРЕД stylesheet для 
   предотвращения мигания (FOCT)
   ============================================ */

(function () {
  var stored = localStorage.getItem('rr-theme');
  var theme = (stored === 'light' || stored === 'dark') ? stored : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
})();
