(() => {
  'use strict';

  const STATE_KEY = 'yklStateV2';
  const PATH = '/cbfutsal/evento/escalacao';
  const DELAY = 900;
  if (location.pathname.replace(/\/$/, '') !== PATH) return;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const getStorage = keys => new Promise(resolve => chrome.storage.local.get(keys, resolve));

  let dataCache = null;
  let items = [];
  let selected = new Set();
  let busy = false;
  let observer = null;
  let refreshTimer = null;

  function norm(v) {
    return String(v == null ? '' : v)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[c]);
  }

  function header(headers, names) {
    const list = (headers || []).map(raw => ({ raw: raw, key: norm(raw) }));
    for (const name of names) {
      const found = list.find(x => x.key === norm(name));
      if (found) return found.raw;
    }
    return '';
  }

  function val(row, headers, names) {
    const h = header(headers, names);
    return h ? String(row && row[h] != null ? row[h] : '').trim() : '';
  }

  function numberOf(row, headers) {
    const value = val(row, headers, [
      'Número da camisa', 'Numero da camisa', 'Nº da camisa', 'N° da camisa',
      'Número camisa', 'Numero camisa', 'Nº camisa', 'N° camisa',
      'Camisa', 'Número', 'Numero', 'Nº', 'N°'
    ]);
    return value.replace(/\D+/g, '').slice(0, 2);
  }

  function api(saved, action, payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'ykl-api-request',
        apiUrl: saved.apiUrl || '',
        token: saved.apiToken || '',
        action: action,
        payload: payload || {}
      }, response => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!response || !response.ok) return reject(new Error(response && response.error ? response.error : 'Falha na comunicação com o Yoka.'));
        resolve(response.data);
      });
    });
  }

  async function loadData(force) {
    if (dataCache && !force) return dataCache;
    const stored = await getStorage([STATE_KEY]);
    const saved = stored && stored[STATE_KEY] ? stored[STATE_KEY] : {};
    let rows = Array.isArray(saved.rows) ? saved.rows : [];
    let headers = Array.isArray(saved.headers) ? saved.headers : [];

    if (saved.apiUrl && saved.apiToken) {
      try {
        const response = await api(saved, 'listAthletes', {});
        rows = Array.isArray(response && response.athletes) ? response.athletes : rows;
        headers = Array.isArray(response && response.headers) && response.headers.length
          ? response.headers
          : (rows.length ? Object.keys(rows[0]) : headers);
      } catch (error) {
        if (!rows.length) throw error;
      }
    }

    if (!rows.length) throw new Error('Nenhum atleta carregado. Configure os dados do Google Sheets na extensão.');

    const byName = new Map();
    rows.forEach(row => {
      const name = val(row, headers, ['Nome completo do atleta', 'Nome completo', 'Nome']);
      if (!name) return;
      const item = { name: name, number: numberOf(row, headers), row: row };
      const key = norm(name);
      const list = byName.get(key) || [];
      list.push(item);
      byName.set(key, list);
    });
    dataCache = { rows: rows, headers: headers, byName: byName };
    return dataCache;
  }

  function bigmidiaRows() {
    const table = $('#TableAtletaEscalacao');
    if (!table) return [];
    return $$('tbody tr', table).map(row => {
      const numberInput = $('input[id^="num_"]', row);
      const action = $$('input[type="checkbox"]', row).find(input => /escalaAtleta\s*\(/.test(input.getAttribute('onclick') || ''));
      const nameNode = $('.kt-widget4__username', row);
      const id = numberInput ? numberInput.id.replace(/^num_/, '') : '';
      const name = nameNode ? String(nameNode.textContent || '').replace(/\s+/g, ' ').trim() : '';
      return {
        id: id,
        name: name,
        key: norm(name),
        numberInput: numberInput,
        action: action,
        escalated: !!(action && action.checked),
        currentNumber: numberInput ? String(numberInput.value || '').trim() : ''
      };
    }).filter(x => x.id && x.name && x.numberInput && x.action);
  }

  function mergeRows(rows, data) {
    return rows.map(row => {
      const matches = data.byName.get(row.key) || [];
      row.athlete = matches.length === 1 ? matches[0] : null;
      row.ambiguous = matches.length > 1;
      row.sheetNumber = row.athlete ? row.athlete.number : '';
      return row;
    });
  }

  function notice(message, type) {
    const el = $('#ykl-lineup-notice');
    if (!el) return;
    el.textContent = message || '';
    el.dataset.type = type || 'info';
    el.hidden = !message;
  }

  function status(item) {
    if (item.ambiguous) return ['Nome duplicado na planilha', 'warning'];
    if (!item.athlete) return ['Não encontrado na planilha', 'error'];
    if (!item.sheetNumber) return ['Sem número da camisa', 'warning'];
    if (item.escalated) {
      if (item.currentNumber && item.currentNumber !== item.sheetNumber) {
        return ['Já escalado · Bigmidia nº ' + item.currentNumber, 'warning'];
      }
      return ['Já escalado', 'success'];
    }
    return ['Pronto para escalar', 'ready'];
  }

  function counters() {
    const el = $('#ykl-lineup-stats');
    if (!el) return;
    const matched = items.filter(x => x.athlete).length;
    const numbered = items.filter(x => x.athlete && x.sheetNumber).length;
    const scaled = items.filter(x => x.escalated).length;
    const chosen = items.filter(x => selected.has(x.id) && x.athlete && x.sheetNumber).length;
    el.textContent = items.length + ' na página · ' + matched + ' identificados · ' +
      numbered + ' com número · ' + scaled + ' já escalados · ' + chosen + ' selecionados';
  }

  function renderRows() {
    const host = $('#ykl-lineup-rows');
    if (!host) return;
    if (!items.length) {
      host.innerHTML = '<div class="ykl-lineup-empty">Nenhum atleta visível na tabela do Bigmidia.</div>';
      counters();
      return;
    }

    host.innerHTML = items.map(item => {
      const st = status(item);
      const disabled = !item.athlete || !item.sheetNumber;
      const number = item.sheetNumber || item.currentNumber || '—';
      return '<label class="ykl-lineup-row' + (item.escalated ? ' is-scaled' : '') + '">' +
        '<input type="checkbox" data-lineup-id="' + esc(item.id) + '"' +
        (selected.has(item.id) ? ' checked' : '') + (disabled ? ' disabled' : '') + '>' +
        '<span class="ykl-lineup-row-main"><strong>' + esc(item.name) + '</strong>' +
        '<small>Nº ' + esc(number) + ' · <span data-tone="' + st[1] + '">' + esc(st[0]) +
        '</span></small></span></label>';
    }).join('');

    $$('input[data-lineup-id]', host).forEach(input => {
      input.addEventListener('change', () => {
        if (input.checked) selected.add(input.dataset.lineupId);
        else selected.delete(input.dataset.lineupId);
        counters();
      });
    });
    counters();
  }

  async function refresh(force) {
    if (busy) return;
    try {
      notice('Atualizando atletas...', 'info');
      const data = await loadData(!!force);
      items = mergeRows(bigmidiaRows(), data);
      const valid = new Set(items.map(x => x.id));
      selected = new Set(Array.from(selected).filter(id => valid.has(id)));
      items.filter(x => x.escalated && x.athlete && x.sheetNumber).forEach(x => selected.add(x.id));
      renderRows();

      const missing = items.filter(x => !x.athlete).length;
      const noNumber = items.filter(x => x.athlete && !x.sheetNumber).length;
      if (missing || noNumber) {
        const parts = [];
        if (missing) parts.push(missing + ' não encontrado(s) na planilha');
        if (noNumber) parts.push(noNumber + ' sem número da camisa');
        notice(parts.join(' · '), 'warning');
      } else {
        notice('Lista conferida com a planilha do Yoka.', 'success');
      }
    } catch (error) {
      notice(error.message || String(error), 'error');
    }
  }

  function fillNumbers(targets) {
    let changed = 0;
    let skipped = 0;
    (targets || items).forEach(item => {
      if (!item.athlete || !item.sheetNumber) {
        skipped += 1;
        return;
      }
      if (item.numberInput.value !== item.sheetNumber) {
        item.numberInput.value = item.sheetNumber;
        item.numberInput.dispatchEvent(new Event('input', { bubbles: true }));
        item.numberInput.dispatchEvent(new Event('change', { bubbles: true }));
        changed += 1;
      }
      item.currentNumber = String(item.numberInput.value || '').trim();
    });
    renderRows();
    notice(changed + ' número(s) preenchido(s)' + (skipped ? ' · ' + skipped + ' ignorado(s)' : '') +
      '. Ainda não houve alteração da escalação.', skipped ? 'warning' : 'success');
  }

  function setBusy(active) {
    busy = active;
    const host = $('#ykl-lineup-host');
    if (host) host.classList.toggle('is-busy', active);
    $$('#ykl-lineup-host button').forEach(button => { button.disabled = active; });
    if (!active) renderRows();
  }

  async function applySelected() {
    if (busy) return;
    const targets = items.filter(x => selected.has(x.id));
    if (!targets.length) return notice('Selecione pelo menos um atleta para escalar.', 'warning');

    const invalid = targets.filter(x => !x.athlete || !x.sheetNumber);
    if (invalid.length) return notice(invalid.length + ' atleta(s) selecionado(s) estão sem correspondência ou número.', 'error');

    const pending = targets.filter(x => !x.escalated);
    if (!pending.length) return notice('Todos os atletas selecionados já estão escalados.', 'success');

    setBusy(true);
    let ok = 0;
    let failed = 0;
    try {
      for (let i = 0; i < pending.length; i += 1) {
        const item = pending[i];
        notice('Escalando ' + (i + 1) + ' de ' + pending.length + ': ' + item.name, 'info');
        fillNumbers([item]);
        if (!item.action.checked) {
          item.action.click();
          await sleep(DELAY);
        }
        if (item.action.checked) {
          item.escalated = true;
          item.currentNumber = item.sheetNumber;
          ok += 1;
        } else {
          failed += 1;
        }
      }
    } finally {
      setBusy(false);
    }
    await sleep(400);
    await refresh(false);
    notice(ok + ' atleta(s) escalado(s)' + (failed ? ' · ' + failed + ' não confirmado(s)' : '') + '.',
      failed ? 'warning' : 'success');
  }

  function selectAll() {
    items.filter(x => x.athlete && x.sheetNumber).forEach(x => selected.add(x.id));
    renderRows();
  }

  function selectPending() {
    selected.clear();
    items.filter(x => x.athlete && x.sheetNumber && !x.escalated).forEach(x => selected.add(x.id));
    renderRows();
  }

  function clearSelection() {
    selected.clear();
    items.filter(x => x.escalated && x.athlete && x.sheetNumber).forEach(x => selected.add(x.id));
    renderRows();
  }

  function gameText() {
    const crumbs = $$('.kt-subheader__breadcrumbs-link').map(x => String(x.textContent || '').trim()).filter(Boolean);
    return crumbs.length ? crumbs[crumbs.length - 1] : 'Partida atual';
  }

  function build(host) {
    const alertText = $('.alert.alert-light .alert-text');
    const deadline = alertText ? String(alertText.textContent || '').replace(/\s+/g, ' ').trim() : '';
    host.innerHTML =
      '<div class="ykl-card ykl-lineup-card">' +
        '<div class="ykl-v150-section-heading"><div><h3>Escalação da partida</h3><span>' + esc(gameText()) + '</span></div></div>' +
        (deadline ? '<div class="ykl-lineup-deadline">' + esc(deadline) + '</div>' : '') +
        '<div id="ykl-lineup-stats" class="ykl-lineup-stats"></div>' +
        '<div id="ykl-lineup-notice" class="ykl-lineup-notice" hidden></div>' +
        '<div class="ykl-lineup-toolbar">' +
          '<button id="ykl-lineup-all" class="ykl-btn" type="button">Selecionar todos</button>' +
          '<button id="ykl-lineup-pending" class="ykl-btn" type="button">Só não escalados</button>' +
          '<button id="ykl-lineup-clear" class="ykl-btn" type="button">Limpar</button>' +
          '<button id="ykl-lineup-refresh" class="ykl-btn" type="button">Atualizar</button>' +
        '</div>' +
        '<div id="ykl-lineup-rows" class="ykl-lineup-rows"></div>' +
        '<div class="ykl-lineup-actions">' +
          '<button id="ykl-lineup-fill" class="ykl-btn ykl-full" type="button">Preencher números</button>' +
          '<button id="ykl-lineup-apply" class="ykl-btn ykl-blue ykl-full" type="button">Escalar selecionados</button>' +
        '</div>' +
        '<div class="ykl-lineup-footnote">A extensão apenas adiciona os selecionados. Atletas já escalados não são removidos automaticamente.</div>' +
      '</div>';

    $('#ykl-lineup-all', host).addEventListener('click', selectAll);
    $('#ykl-lineup-pending', host).addEventListener('click', selectPending);
    $('#ykl-lineup-clear', host).addEventListener('click', clearSelection);
    $('#ykl-lineup-refresh', host).addEventListener('click', () => refresh(true));
    $('#ykl-lineup-fill', host).addEventListener('click', () => fillNumbers());
    $('#ykl-lineup-apply', host).addEventListener('click', applySelected);
  }

  function showAllRows() {
    const select = $('select[name="TableAtletaEscalacao_length"]');
    if (!select) return false;
    const current = Number(select.value || 0);
    const values = Array.from(select.options).map(x => Number(x.value)).filter(Boolean);
    const desired = values.find(x => x >= 50) || Math.max.apply(null, values.concat([current]));
    if (desired > current) {
      select.value = String(desired);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }

  function watchTable() {
    if (observer) observer.disconnect();
    const table = $('#TableAtletaEscalacao');
    if (!table) return;
    observer = new MutationObserver(() => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { if (!busy) refresh(false); }, 350);
    });
    observer.observe(table, { childList: true, subtree: true });
  }

  async function wait(selector, timeout) {
    const start = Date.now();
    const limit = timeout || 12000;
    while (Date.now() - start < limit) {
      const found = $(selector);
      if (found) return found;
      await sleep(100);
    }
    return null;
  }

  async function init() {
    const root = await wait('#ykl-root');
    const host = await wait('#ykl-lineup-host');
    const table = await wait('#TableAtletaEscalacao');
    if (!root || !host || !table) return;

    root.classList.add('ykl-lineup-enabled');
    build(host);
    if (showAllRows()) await sleep(900);
    await refresh(true);
    watchTable();
  }

  init();
})();
