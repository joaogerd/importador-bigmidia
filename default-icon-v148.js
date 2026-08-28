(() => {
  'use strict';

  const DEFAULT_ICON_URL = chrome.runtime.getURL('icons/icon128.png');

  function applyDefaultPanelIcon() {
    const img = document.getElementById('ykl-logo-img');
    const fallback = document.getElementById('ykl-logo-fallback');
    if (!img || !fallback) return false;

    // O content.js deixa a imagem visível quando há um logo personalizado salvo.
    // Nesse caso, respeitamos a escolha do operador. Quando não há logo salvo,
    // ele esconde a imagem e mostra o fallback "YK"; substituímos esse fallback
    // pelo ícone oficial empacotado com a extensão.
    if (img.hidden || !img.getAttribute('src')) {
      img.src = DEFAULT_ICON_URL;
      img.hidden = false;
      fallback.hidden = true;
    }

    return true;
  }

  if (!applyDefaultPanelIcon()) {
    const observer = new MutationObserver(() => {
      if (applyDefaultPanelIcon()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
