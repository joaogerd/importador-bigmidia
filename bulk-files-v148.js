(() => {
  'use strict';

  // A foto é opcional e permanece somente no fluxo individual.
  // O botão coletivo inclui apenas os documentos exigidos no cadastro.
  const ITEMS = [
    { label: 'RG', include: '#ykl-doc-rg-include', status: '#ykl-doc-rg-status' },
    { label: 'Atestado', include: '#ykl-doc-atestado-include', status: '#ykl-doc-atestado-status' },
    { label: 'Autorização', include: '#ykl-doc-autorizacao-include', status: '#ykl-doc-autorizacao-status' }
  ];

  const WORKING_STATUSES = [
    '#ykl-v148-photo-status',
    ...ITEMS.map(item => item.status)
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
    return WORKING_STATUSES.some(selector => $(selector)?.classList.contains('ykl-doc-working'));
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
    throw new Error('Tempo limite excedido aguardando a inclusão do documento.');
  }

  async function includeItem(item) {
    const button = $(item.include);
    const status = $(item.status);
    if (!button || !status) throw new Error(`${item.label}: controles não encontrados.`);

    await waitFor(() => !button.disabled, 5000, 100);
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

  async function includeAllDocuments() {
    if (bulkBusy) return;
    const items = availableItems();
    if (!items.length) {
      showNotice('Este atleta não possui documentos disponíveis para inclusão.', 'error', 0);
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
        showNotice('✓ Todos os documentos disponíveis foram incluídos. A foto é opcional e pode ser incluída separadamente.', 'success', 9000);
      } else {
        const prefix = included ? `${included} documento(s) incluído(s). ` : '';
        showNotice(`${prefix}A inclusão terminou com problema: ${errors.join(' | ')}`, 'error', 0);
      }
    } finally {
      bulkBusy = false;
      updateBulkButton();
    }
  }

  function installBulkCoordinator() {
    const original = $('#ykl-doc-include-all');
    if (!original) return false;
    if (original.dataset.yklBulkV148 === '1') return true;

    // Mantém o coordenador sequencial já validado, mas somente para
    // RG, Atestado e Autorização. A foto não participa do fluxo coletivo.
    const button = original.cloneNode(true);
    button.dataset.yklBulkV148 = '1';
    button.textContent = 'Incluir todos os documentos';
    original.replaceWith(button);
    button.addEventListener('click', includeAllDocuments);

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
