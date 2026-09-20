(() => {
  'use strict';

  const CREATE_URL = 'https://ligapaulistafutsal.bigmidia.com/atleta/create';
  const ROW_ID = 'ykl-v149-current-reference';
  const BUTTON_ID = 'ykl-v149-register';

  function normalize(value) {
    return String(value ?? '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function ensureRegisterButton() {
    const row = document.getElementById(ROW_ID);
    if (!row) return false;

    const text = normalize(row.textContent || '');
    const unsynced = text.includes('registro liga nao sincronizado');
    const existing = document.getElementById(BUTTON_ID);

    if (!unsynced) {
      existing?.remove();
      return true;
    }

    if (existing && row.contains(existing)) return true;

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.className = 'ykl-btn ykl-primary';
    button.textContent = 'Cadastrar';
    button.title = 'Abrir um novo cadastro na Liga para o atleta atual';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      // O atleta atual já está persistido em yklStateV2 pelo painel principal.
      // Apenas navegamos para o formulário novo; o content.js recarrega o mesmo
      // currentIndex e mantém esse atleta selecionado.
      location.href = CREATE_URL;
    });

    row.appendChild(button);
    return true;
  }

  function init() {
    ensureRegisterButton();

    const observer = new MutationObserver(() => ensureRegisterButton());
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.yklStateV2) {
        setTimeout(ensureRegisterButton, 0);
        setTimeout(ensureRegisterButton, 150);
      }
    });
  }

  init();
})();
