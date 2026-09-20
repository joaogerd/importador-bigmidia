(() => {
  'use strict';

  if (location.pathname.replace(/\/$/, '') !== '/atleta/index') return;

  let activating = false;

  document.addEventListener('pointerdown', event => {
    const button = event.target.closest?.('#ykl-lpf-start');
    if (!button || button.disabled || activating) return;

    activating = true;
    event.preventDefault();
    event.stopImmediatePropagation();

    const originalLabel = button.textContent;
    const host = button.closest('#ykl-lpf-index-card');
    const message = host?.querySelector('.ykl-lpf-index-message');

    button.textContent = 'Abrindo conferência…';
    if (message) message.textContent = 'Preparando a fila da categoria e abrindo o primeiro atleta…';

    // Dispara imediatamente o handler já registrado pelo lpf-audit-v150.js,
    // antes que outro MutationObserver possa substituir o botão no DOM.
    try {
      button.click();
      button.disabled = true;
    } catch (error) {
      activating = false;
      button.disabled = false;
      button.textContent = originalLabel;
      if (message) message.textContent = error?.message || String(error);
      return;
    }

    // Se por algum motivo não houver navegação, devolve o controle ao usuário.
    setTimeout(() => {
      if (location.pathname.replace(/\/$/, '') !== '/atleta/index') return;
      const current = document.querySelector('#ykl-lpf-start');
      if (!current) return;
      activating = false;
      current.disabled = false;
      if (current.textContent.includes('Abrindo conferência')) current.textContent = originalLabel;
      const currentHost = current.closest('#ykl-lpf-index-card');
      const currentMessage = currentHost?.querySelector('.ykl-lpf-index-message');
      if (currentMessage && currentMessage.textContent.includes('Preparando a fila')) {
        currentMessage.textContent = 'A abertura não concluiu. Tente novamente; se persistir, a mensagem de erro aparecerá aqui.';
      }
    }, 12000);
  }, true);
})();
