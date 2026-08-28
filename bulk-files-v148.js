(() => {
  'use strict';

  const ITEMS = [
    { label: 'Foto', include: '#ykl-v148-photo-include', status: '#ykl-v148-photo-status' },
    { label: 'RG', include: '#ykl-doc-rg-include', status: '#ykl-doc-rg-status' },
    { label: 'Atestado', include: '#ykl-doc-atestado-include', status: '#ykl-doc-atestado-status' },
    { label: 'Autorização', include: '#ykl-doc-autorizacao-include', status: '#ykl-doc-autorizacao-status' }
  ];

  let bulkBusy = false;
  let noticeTimer = null;
  let refreshQueued = false;

  const $ = selector => document.querySelector(selector);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function normalize(value) {
    return String(value ?? '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function showNotice(message, kind = 'info', timeout = 7000) {
    const el = $('#ykl-notice');
    if (!el) return;
    if (noticeTimer) clearTimeout(noticeTimer);
    el.textContent = message;
    el.className = `ykl-notice ykl-notice-${kind} ykl-notice-visible`;
    el.removeAttribute('hidden');
    noticeTimer = null;
    if (timeout > 0) {
      noticeTimer = setTimeout(() => {
        el.classList.remove('ykl-notice-visible');
        el.setAttribute('hidden', '');
        noticeTimer = null;
      }, timeout);
    }
  }

  function statusHasLink(status) {
    if (!status) return false;
    const text = normalize(status.textContent || '');
    return Boolean(text) && text !== 'sem link' && text !== 'verificando';
  }

  function availableItems() {
    return ITEMS.filter(item => statusHasLink($(item.status)));
  }

  function anyItemWorking() {
    return ITEMS.some(item => $(item.status)?.classList.contains('ykl-doc-working'));
  }

  function formIsFilling() {
    const abort = $('#ykl-abort');
    return Boolean(abort && !abort.disabled);
  }

  function updateBulkButton() {
    const button = $('#ykl-doc-include-all');
    if (!button || button.dataset.yklBulkV148 !== '1') return;
    const hasAvailable = availableItems().length > 0;
    button.disabled = bulkBusy || anyItemWorking() || formIsFilling() || !hasAvailable;
  }

  function queueBulkButtonRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      updateBulkButton();
    });
  }

  async function waitFor(check, timeout = 90000, interval = 150) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const value = check();
      if (value) return value;
      await sleep(interval);
    }
    throw new Error('Tempo limite excedido aguardando a inclusão do arquivo.');
  }

  async function includeItem(item) {
    const button = $(item.include);
    const status = $(item.status);
    if (!button || !status) throw new Error(`${item.label}: controles não encontrados.`);

    await waitFor(() => !button.disabled || statusHasLink(status), 5000, 100);
    if (button.disabled) throw new Error(`${item.label}: botão Incluir indisponível.`);

    button.click();

    await waitFor(() => {
      if (status.classList.contains('ykl-doc-working')) return 'working';
      if (status.classList.contains('ykl-doc-error')) return 'error';
      return null;
    }, 6000, 100);

    const result = await waitFor(() => {
      if (status.classList.contains('ykl-doc-success')) return 'success';
      if (status.classList.contains('ykl-doc-error')) return 'error';
      return null;
    }, 90000, 180);

    if (result === 'error') {
      throw new Error(`${item.label}: ${status.textContent.trim() || 'erro na inclusão'}.`);
    }
  }

  function documentModalIsOpen() {
    const modal = document.getElementById('modalFormDoc');
    return Boolean(modal && (modal.classList.contains('show') || getComputedStyle(modal).display !== 'none'));
  }

  async function includeAllFiles() {
    if (bulkBusy) return;
    const items = availableItems();
    if (!items.length) {
      showNotice('Este atleta não possui arquivos disponíveis para inclusão.', 'error', 0);
      return;
    }

    bulkBusy = true;
    updateBulkButton();
    const errors = [];
    let included = 0;

    try {
      for (const item of items) {
        try {
          await includeItem(item);
          included += 1;
        } catch (error) {
          errors.push(error.message);
          if (documentModalIsOpen()) break;
        }
      }

      if (!errors.length) {
        showNotice('✓ Todos os arquivos disponíveis foram incluídos. Você já pode conferir e clicar em Cadastrar.', 'success', 9000);
      } else {
        const prefix = included ? `${included} arquivo(s) incluído(s). ` : '';
        showNotice(`${prefix}A inclusão terminou com problema: ${errors.join(' | ')}`, 'error', 0);
      }
    } finally {
      bulkBusy = false;
      updateBulkButton();
    }
  }

  function installBulkCoordinator() {
    const original = $('#ykl-doc-include-all');
    const photoRow = $('#ykl-v148-photo-row');
    if (!original || !photoRow) return false;
    if (original.dataset.yklBulkV148 === '1') return true;

    // Substitui o botão para remover o listener antigo do content.js, que conhece
    // apenas RG/Atestado/Autorização. Os uploads individuais continuam sendo
    // executados pelas rotinas originais já testadas.
    const button = original.cloneNode(true);
    button.dataset.yklBulkV148 = '1';
    button.textContent = 'Incluir todos os arquivos';
    original.replaceWith(button);
    button.addEventListener('click', includeAllFiles);

    const card = button.closest('.ykl-doc-card');
    if (card) {
      const observer = new MutationObserver(queueBulkButtonRefresh);
      observer.observe(card, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class', 'disabled']
      });
    }

    updateBulkButton();
    return true;
  }

  function init() {
    if (installBulkCoordinator()) return;
    const observer = new MutationObserver(() => {
      if (installBulkCoordinator()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 15000);
  }

  init();
})();
