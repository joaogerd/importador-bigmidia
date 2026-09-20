(() => {
  'use strict';

  const STATE_KEY = 'yklStateV2';
  if (location.pathname.replace(/\/$/, '') !== '/bid/create') return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const storageGet = keys => new Promise(resolve => chrome.storage.local.get(keys, resolve));

  function normalize(value) {
    return String(value ?? '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[ch]));
  }

  function findHeader(headers, candidates) {
    const list = (headers || []).map(raw => ({ raw, n: normalize(raw) }));
    for (const candidate of candidates) {
      const found = list.find(item => item.n === normalize(candidate));
      if (found) return found.raw;
    }
    return '';
  }

  function value(row, headers, candidates) {
    const header = findHeader(headers, candidates);
    return header ? String(row?.[header] ?? '').trim() : '';
  }

  function currentAthlete(saved) {
    const headers = Array.isArray(saved?.headers) ? saved.headers : [];
    const rows = Array.isArray(saved?.rows) ? saved.rows : [];
    const row = rows[Number(saved?.currentIndex) || 0];
    if (!row) return null;
    return {
      name: value(row, headers, ['Nome completo do atleta', 'Nome completo', 'Nome']),
      category: value(row, headers, ['Equipe atual', 'Categoria calculada', 'Categoria', 'Equipe']),
      birthDate: value(row, headers, ['Data de nascimento', 'Data nascimento'])
    };
  }

  function normalizeDate(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    const br = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (br) return `${br[1].padStart(2, '0')}/${br[2].padStart(2, '0')}/${br[3]}`;
    const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return `${iso[3].padStart(2, '0')}/${iso[2].padStart(2, '0')}/${iso[1]}`;
    return value;
  }

  function setStatus(message, kind = 'normal') {
    const el = $('#ykl-transfer-status');
    if (!el) return;
    el.textContent = message;
    el.className = `ykl-muted ${kind === 'success' ? 'ykl-app-success' : kind === 'error' ? 'ykl-app-error' : ''}`;
  }

  function openSelector() {
    const modal = $('#selAtleta');
    if (!modal) throw new Error('O seletor de atletas da transferência não foi encontrado.');
    const opener = $$('a,button').find(el => String(el.getAttribute('onclick') || '').includes('selAtleta'));
    if (opener) {
      opener.click();
      return;
    }
    modal.classList.add('show');
    modal.style.display = 'block';
  }

  function dispatchSearch(input) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a', code: 'KeyA' }));
  }

  function matchingRows(athlete) {
    const wantedName = normalize(athlete.name);
    const wantedBirth = normalizeDate(athlete.birthDate);
    return $$('#TableAtletaSelTransf tbody tr').map(row => {
      const cells = $$('td', row);
      const name = String(cells[1]?.innerText || cells[1]?.textContent || '').replace(/\s+/g, ' ').trim();
      const birth = String(cells[2]?.innerText || cells[2]?.textContent || '').trim();
      return { row, name, birth, exactName: normalize(name) === wantedName, exactBirth: wantedBirth && normalizeDate(birth) === wantedBirth };
    }).filter(item => item.exactName);
  }

  async function waitForMatches(athlete, timeout = 10000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const matches = matchingRows(athlete);
      if (matches.length) return matches;
      await sleep(200);
    }
    return [];
  }

  async function locateCurrentAthlete() {
    const stored = await storageGet([STATE_KEY]);
    const athlete = currentAthlete(stored?.[STATE_KEY] || {});
    if (!athlete?.name) throw new Error('Selecione um atleta Yoka antes de preparar a transferência.');

    setStatus(`Abrindo seletor e procurando ${athlete.name}…`);
    openSelector();
    await sleep(250);

    const search = $('#generalSearchAtl');
    if (!search) throw new Error('O campo de busca do seletor de atletas não foi encontrado.');
    search.value = athlete.name;
    dispatchSearch(search);

    const matches = await waitForMatches(athlete);
    if (!matches.length) {
      setStatus('A busca foi preenchida, mas não encontrei uma correspondência exata. Confira manualmente o modal da Liga.', 'error');
      return;
    }

    let chosen = null;
    if (matches.length === 1) chosen = matches[0];
    else {
      const byBirth = matches.filter(item => item.exactBirth);
      if (byBirth.length === 1) chosen = byBirth[0];
    }

    if (!chosen) {
      setStatus(`${matches.length} atletas com esse nome foram encontrados. O modal ficou aberto para conferência manual.`, 'error');
      return;
    }

    const action = $('td:last-child a[onclick*="funcSelAtleta2"], td:last-child button[onclick*="funcSelAtleta2"]', chosen.row)
      || $('a[onclick*="funcSelAtleta2"],button[onclick*="funcSelAtleta2"]', chosen.row);
    if (!action) {
      setStatus('Encontrei o atleta, mas não achei o botão Selecionar. O modal ficou aberto para conferência.', 'error');
      return;
    }

    action.click();
    await sleep(250);
    const selectedName = String($('#transferencia-nm_atleta')?.value || '').trim();
    if (normalize(selectedName) === normalize(athlete.name)) {
      setStatus(`Atleta selecionado: ${athlete.name}. Confira origem, anexos e mensagem antes de cadastrar.`, 'success');
    } else {
      setStatus('O atleta foi localizado, mas a seleção não pôde ser confirmada automaticamente. Confira o formulário.', 'error');
    }
  }

  async function render() {
    const host = $('#ykl-app-transfer-host');
    if (!host) return false;
    const stored = await storageGet([STATE_KEY]);
    const athlete = currentAthlete(stored?.[STATE_KEY] || {});
    const formName = String($('#transferencia-nm_atleta')?.value || '').trim();

    host.innerHTML = `
      <div class="ykl-card">
        <h3>Transferência</h3>
        ${athlete?.name
          ? `<div class="ykl-athlete">${escapeHtml(athlete.name)}</div><div class="ykl-muted">${escapeHtml(athlete.category || 'Categoria não informada')}${athlete.birthDate ? ` · Nasc. ${escapeHtml(normalizeDate(athlete.birthDate))}` : ''}</div>`
          : '<div class="ykl-muted">Nenhum atleta Yoka selecionado.</div>'}
        <button id="ykl-transfer-locate" type="button" class="ykl-btn ykl-blue ykl-full" style="margin-top:8px" ${athlete?.name ? '' : 'disabled'}>Localizar e selecionar no BID</button>
        <div id="ykl-transfer-status" class="ykl-muted" style="margin-top:6px">${formName ? `Selecionado no formulário: ${escapeHtml(formName)}` : 'O cadastro final da transferência permanece manual.'}</div>
      </div>
      <div class="ykl-card">
        <div class="ykl-muted">A extensão abre o seletor da Liga, pesquisa pelo nome completo e só seleciona automaticamente quando encontra uma correspondência exata e única. Em caso de duplicidade, deixa o modal aberto para conferência.</div>
      </div>`;

    $('#ykl-transfer-locate', host)?.addEventListener('click', () => {
      const button = $('#ykl-transfer-locate', host);
      button.disabled = true;
      locateCurrentAthlete().catch(error => setStatus(error.message || String(error), 'error')).finally(() => { button.disabled = false; });
    });
    return true;
  }

  function init() {
    render();
    const observer = new MutationObserver(() => render().then(ok => { if (ok) observer.disconnect(); }));
    if (!$('#ykl-app-transfer-host')) {
      observer.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 15000);
    }
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[STATE_KEY]) render();
    });
  }

  init();
})();
