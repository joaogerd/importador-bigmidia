(() => {
  'use strict';

  const STORAGE_KEY = 'yklStateV2';
  const PHOTO_HEADERS = ['Link da foto do atleta', 'Link da foto', 'Foto do atleta'];
  const SEARCH_MIN_CHARS = 2;
  const SEARCH_LIMIT = 10;
  let searchDataset = null;
  let searchDatasetPromise = null;
  let photoBusy = false;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

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

  function getStoredState() {
    return new Promise(resolve => {
      chrome.storage.local.get(STORAGE_KEY, data => resolve(data?.[STORAGE_KEY] || {}));
    });
  }

  function setStoredState(nextState) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [STORAGE_KEY]: nextState }, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      });
    });
  }

  function apiRequest(saved, action, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'ykl-api-request',
        apiUrl: saved.apiUrl || '',
        token: saved.apiToken || '',
        action,
        payload
      }, response => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!response?.ok) return reject(new Error(response?.error || 'Falha na comunicação com o Yoka.'));
        resolve(response.data);
      });
    });
  }

  function findHeader(headers, candidates) {
    const normalized = (headers || []).map(raw => ({ raw, n: normalize(raw) }));
    for (const candidate of candidates) {
      const found = normalized.find(item => item.n === normalize(candidate));
      if (found) return found.raw;
    }
    return '';
  }

  function headerValue(row, headers, candidates) {
    const header = findHeader(headers, candidates);
    return header ? String(row?.[header] ?? '').trim() : '';
  }

  function athleteName(row, headers) {
    return headerValue(row, headers, ['Nome completo do atleta', 'Nome completo', 'Atleta', 'Nome']);
  }

  function athleteCategory(row, headers) {
    return headerValue(row, headers, ['Equipe atual', 'Categoria calculada', 'Categoria', 'Equipe']);
  }

  function athleteId(row, headers) {
    return headerValue(row, headers, ['ID', 'ID do atleta']);
  }

  function collectCategories(rows, headers) {
    return [...new Set((rows || []).map(row => athleteCategory(row, headers)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  }

  function addDerivedResponsibleColumns(headers, rows) {
    const principalH = findHeader(headers, ['Responsável principal', 'Responsavel principal']);
    const motherNameH = findHeader(headers, ['Nome da mãe', 'Nome da mae']);
    const motherCpfH = findHeader(headers, ['CPF da mãe', 'CPF da mae']);
    const motherPhoneH = findHeader(headers, ['Telefone/WhatsApp da mãe', 'Telefone WhatsApp da mãe', 'Telefone da mãe']);
    const fatherNameH = findHeader(headers, ['Nome do pai']);
    const fatherCpfH = findHeader(headers, ['CPF do pai']);
    const fatherPhoneH = findHeader(headers, ['Telefone/WhatsApp do pai', 'Telefone WhatsApp do pai', 'Telefone do pai']);

    if (!principalH && !motherNameH && !fatherNameH) return { headers: [...headers], rows: [...rows] };

    const derived = {
      name: 'Gerado: nome do responsável principal',
      cpf: 'Gerado: CPF do responsável principal',
      phone: 'Gerado: telefone do responsável principal',
      relation: 'Gerado: parentesco do responsável principal'
    };
    const outputHeaders = [...headers];
    Object.values(derived).forEach(header => {
      if (!outputHeaders.includes(header)) outputHeaders.push(header);
    });

    const outputRows = rows.map(row => {
      const principal = String(row?.[principalH] || '').trim();
      const p = normalize(principal);
      const motherName = String(row?.[motherNameH] || '').trim();
      const fatherName = String(row?.[fatherNameH] || '').trim();
      const motherN = normalize(motherName);
      const fatherN = normalize(fatherName);
      const motherMatch = motherName && (motherN === p || (p.length >= 4 && (motherN.includes(p) || p.includes(motherN))));
      const fatherMatch = fatherName && (fatherN === p || (p.length >= 4 && (fatherN.includes(p) || p.includes(fatherN))));

      let role = '';
      if (/^mae$/.test(p) || p.includes('mae') || motherMatch) role = 'mae';
      else if (/^pai$/.test(p) || p.includes('pai') || fatherMatch) role = 'pai';
      else if (motherName && !fatherName) role = 'mae';
      else if (fatherName && !motherName) role = 'pai';

      const useMother = role === 'mae';
      return {
        ...row,
        [derived.name]: useMother ? motherName : fatherName,
        [derived.cpf]: String(row?.[useMother ? motherCpfH : fatherCpfH] || '').trim(),
        [derived.phone]: String(row?.[useMother ? motherPhoneH : fatherPhoneH] || '').trim(),
        [derived.relation]: useMother ? 'Mãe' : role === 'pai' ? 'Pai' : ''
      };
    });
    return { headers: outputHeaders, rows: outputRows };
  }

  async function loadSearchDataset(force = false) {
    if (!force && searchDataset) return searchDataset;
    if (!force && searchDatasetPromise) return searchDatasetPromise;

    searchDatasetPromise = (async () => {
      const saved = await getStoredState();
      if (saved.apiUrl && saved.apiToken) {
        const data = await apiRequest(saved, 'listAthletes', {});
        const athletes = Array.isArray(data?.athletes) ? data.athletes : [];
        const headers = Array.isArray(data?.headers) && data.headers.length
          ? data.headers
          : Object.keys(athletes[0] || {});
        if (!athletes.length) throw new Error('Nenhum atleta foi retornado pelo Google Sheets.');
        const enriched = addDerivedResponsibleColumns(headers, athletes);
        searchDataset = {
          headers: enriched.headers,
          rows: enriched.rows,
          serverStatuses: data?.statuses || {},
          source: 'sheets'
        };
        return searchDataset;
      }

      const rows = Array.isArray(saved.rows) ? saved.rows : [];
      const headers = Array.isArray(saved.headers) ? saved.headers : [];
      if (!rows.length) throw new Error('Carregue os atletas do Google Sheets antes de pesquisar.');
      searchDataset = {
        headers,
        rows,
        serverStatuses: saved.serverStatuses || {},
        source: saved.dataSource || 'csv'
      };
      return searchDataset;
    })();

    try {
      return await searchDatasetPromise;
    } finally {
      searchDatasetPromise = null;
    }
  }

  function renderSearchResults(query, dataset) {
    const box = $('#ykl-v148-search-results');
    if (!box) return;
    const q = normalize(query);
    if (q.length < SEARCH_MIN_CHARS) {
      box.innerHTML = '';
      box.hidden = true;
      return;
    }

    const words = q.split(/\s+/).filter(Boolean);
    const matches = dataset.rows
      .map((row, index) => {
        const name = athleteName(row, dataset.headers);
        const normalizedName = normalize(name);
        const matchesAll = words.every(word => normalizedName.includes(word));
        return { row, index, name, matchesAll };
      })
      .filter(item => item.name && item.matchesAll)
      .sort((a, b) => {
        const an = normalize(a.name);
        const bn = normalize(b.name);
        const aStarts = an.startsWith(q) ? 0 : 1;
        const bStarts = bn.startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
      })
      .slice(0, SEARCH_LIMIT);

    if (!matches.length) {
      box.innerHTML = '<div class="ykl-v148-empty">Nenhum atleta encontrado.</div>';
      box.hidden = false;
      return;
    }

    box.innerHTML = matches.map(item => {
      const category = athleteCategory(item.row, dataset.headers) || 'Sem categoria';
      const id = athleteId(item.row, dataset.headers);
      const status = id ? String(dataset.serverStatuses?.[id] || '') : '';
      return `<button type="button" class="ykl-v148-result" data-index="${item.index}">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(category)}${status ? ` · ${escapeHtml(status)}` : ''}</span>
      </button>`;
    }).join('');
    box.hidden = false;
  }

  async function selectSearchResult(index) {
    const dataset = await loadSearchDataset();
    const row = dataset.rows[index];
    if (!row) return;

    const saved = await getStoredState();
    const nextState = {
      ...saved,
      headers: dataset.headers,
      rows: dataset.rows,
      currentIndex: index,
      completed: {},
      dataSource: dataset.source,
      serverStatuses: dataset.serverStatuses || {},
      categoryFilter: '',
      availableCategories: collectCategories(dataset.rows, dataset.headers)
    };
    await setStoredState(nextState);
    sessionStorage.setItem('ykl-v148-search-selected', athleteName(row, dataset.headers));
    location.reload();
  }

  async function onSearchInput(event) {
    const query = event.target.value;
    const box = $('#ykl-v148-search-results');
    if (!box) return;
    if (normalize(query).length < SEARCH_MIN_CHARS) {
      renderSearchResults('', { rows: [], headers: [] });
      return;
    }

    box.hidden = false;
    box.innerHTML = '<div class="ykl-v148-empty">Buscando atletas…</div>';
    try {
      const dataset = await loadSearchDataset();
      renderSearchResults(query, dataset);
    } catch (error) {
      box.innerHTML = `<div class="ykl-v148-empty">${escapeHtml(error.message)}</div>`;
    }
  }

  function injectSearchCard() {
    if ($('#ykl-v148-search-card')) return;
    const section = $('.ykl-section[data-section="cadastro"]');
    if (!section) return;
    const firstCard = $('.ykl-card', section);
    if (!firstCard) return;

    const card = document.createElement('div');
    card.id = 'ykl-v148-search-card';
    card.className = 'ykl-card ykl-v148-search-card';
    card.innerHTML = `
      <label class="ykl-label" for="ykl-v148-athlete-search">Buscar atleta pelo nome</label>
      <input id="ykl-v148-athlete-search" type="search" autocomplete="off" placeholder="Digite pelo menos 2 letras">
      <div class="ykl-muted" style="margin-top:5px">Busca em todos os atletas do Google Sheets, independentemente da categoria selecionada.</div>
      <div id="ykl-v148-search-results" class="ykl-v148-search-results" hidden></div>
    `;
    firstCard.after(card);

    const input = $('#ykl-v148-athlete-search');
    let timer = null;
    input.addEventListener('input', event => {
      clearTimeout(timer);
      timer = setTimeout(() => onSearchInput(event), 180);
    });
    input.addEventListener('focus', async event => {
      if (normalize(event.target.value).length >= SEARCH_MIN_CHARS) onSearchInput(event);
    });
    $('#ykl-v148-search-results').addEventListener('click', event => {
      const button = event.target.closest('.ykl-v148-result');
      if (!button) return;
      selectSearchResult(Number(button.dataset.index)).catch(error => {
        const box = $('#ykl-v148-search-results');
        if (box) box.innerHTML = `<div class="ykl-v148-empty">Erro: ${escapeHtml(error.message)}</div>`;
      });
    });

    const selected = sessionStorage.getItem('ykl-v148-search-selected');
    if (selected) {
      sessionStorage.removeItem('ykl-v148-search-selected');
      input.value = selected;
    }
  }

  function currentPhotoUrl(saved) {
    const headers = Array.isArray(saved.headers) ? saved.headers : [];
    const rows = Array.isArray(saved.rows) ? saved.rows : [];
    const row = rows[Number(saved.currentIndex) || 0];
    if (!row) return '';
    return headerValue(row, headers, PHOTO_HEADERS);
  }

  function normalizeExternalUrl(raw) {
    try {
      const url = new URL(String(raw || '').trim());
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  function openPhoto(url, download = false) {
    const normalizedUrl = normalizeExternalUrl(url);
    if (!normalizedUrl) return;
    if (!download) {
      window.open(normalizedUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      const parsed = new URL(normalizedUrl);
      const match = parsed.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      const id = match?.[1] || parsed.searchParams.get('id');
      if (id && parsed.hostname.includes('drive.google.com')) {
        window.open(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`, '_blank', 'noopener,noreferrer');
        return;
      }
    } catch { /* abre link original */ }
    window.open(normalizedUrl, '_blank', 'noopener,noreferrer');
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function fetchDriveFile(url, fallbackName) {
    return new Promise((resolve, reject) => {
      const port = chrome.runtime.connect({ name: 'ykl-drive-fetch' });
      const chunks = [];
      let meta = null;
      let settled = false;

      const finish = (handler, value) => {
        if (settled) return;
        settled = true;
        try { port.disconnect(); } catch { /* nada */ }
        handler(value);
      };

      port.onDisconnect.addListener(() => {
        if (!settled && chrome.runtime.lastError) {
          finish(reject, new Error(chrome.runtime.lastError.message));
        }
      });
      port.onMessage.addListener(message => {
        if (message?.type === 'meta') {
          meta = message;
          return;
        }
        if (message?.type === 'chunk') {
          chunks[Number(message.sequence) || 0] = base64ToBytes(message.data || '');
          return;
        }
        if (message?.type === 'error') {
          finish(reject, new Error(message.message || 'Falha ao baixar a foto.'));
          return;
        }
        if (message?.type === 'done') {
          if (!meta) return finish(reject, new Error('O download da foto terminou sem metadados.'));
          const total = chunks.reduce((sum, part) => sum + (part?.length || 0), 0);
          const bytes = new Uint8Array(total);
          let offset = 0;
          chunks.forEach(part => {
            if (!part) return;
            bytes.set(part, offset);
            offset += part.length;
          });
          finish(resolve, { ...meta, bytes });
        }
      });
      port.postMessage({ type: 'fetch-document', url, fallbackName });
    });
  }

  function photoInputScore(input) {
    const id = String(input.id || '');
    const name = String(input.name || '');
    const accept = String(input.accept || '');
    const aria = String(input.getAttribute('aria-label') || '');
    const title = String(input.title || '');
    const own = normalize([id, name, accept, aria, title].join(' '));
    const parentText = normalize(input.closest('.form-group, .control-group, .field, .row, .col, td, div')?.textContent || '');
    const text = `${own} ${parentText}`;
    let score = 0;
    if (/\bfoto\b/.test(text) || text.includes('fotografia')) score += 14;
    if (text.includes('photo') || text.includes('avatar')) score += 12;
    if (text.includes('imagem') || text.includes('image')) score += 7;
    if (normalize(accept).includes('image')) score += 7;
    if (id === 'doc_obj_imagem1' || own.includes('atletadocumento')) score -= 30;
    if (text.includes('tipo documento') || text.includes('documento atleta')) score -= 20;
    if (input.closest('.modal')) score -= 8;
    return score;
  }

  function findPhotoInput() {
    const candidates = $$('input[type="file"]')
      .map(input => ({ input, score: photoInputScore(input) }))
      .sort((a, b) => b.score - a.score);
    return candidates[0]?.score >= 5 ? candidates[0].input : null;
  }

  function dispatchFile(input, file) {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function showPhotoStatus(text, kind = '') {
    const status = $('#ykl-v148-photo-status');
    if (!status) return;
    status.textContent = text;
    status.className = `ykl-doc-status ykl-v148-photo-status ${kind ? `ykl-v148-${kind}` : ''}`;
  }

  async function refreshPhotoRow() {
    const saved = await getStoredState();
    const url = currentPhotoUrl(saved);
    const has = Boolean(normalizeExternalUrl(url));
    const open = $('#ykl-v148-photo-open');
    const download = $('#ykl-v148-photo-download');
    const include = $('#ykl-v148-photo-include');
    if (!open || !download || !include) return;
    open.disabled = !has || photoBusy;
    download.disabled = !has || photoBusy;
    include.disabled = !has || photoBusy;
    if (!photoBusy) showPhotoStatus(has ? 'Foto disponível no Drive' : 'Sem link da foto');
  }

  async function includePhoto() {
    if (photoBusy) return;
    const saved = await getStoredState();
    const url = currentPhotoUrl(saved);
    const normalizedUrl = normalizeExternalUrl(url);
    if (!normalizedUrl) {
      showPhotoStatus('Este atleta não possui link de foto no Google Sheets.', 'error');
      return;
    }

    const input = findPhotoInput();
    if (!input) {
      showPhotoStatus('Não encontrei automaticamente o campo de foto nesta tela do BigMidia.', 'error');
      return;
    }

    photoBusy = true;
    await refreshPhotoRow();
    showPhotoStatus('Baixando foto do Drive…');
    try {
      const downloaded = await fetchDriveFile(normalizedUrl, 'Foto do atleta');
      if (!['image/jpeg', 'image/png'].includes(String(downloaded.mimeType || '').toLowerCase())) {
        throw new Error('A foto precisa estar em JPG/JPEG ou PNG.');
      }
      const extension = downloaded.mimeType === 'image/png' ? '.png' : '.jpg';
      let filename = String(downloaded.filename || 'foto-atleta').trim() || 'foto-atleta';
      filename = filename.replace(/\.(pdf|jpe?g|png)$/i, '') + extension;
      const file = new File([downloaded.bytes], filename, {
        type: downloaded.mimeType,
        lastModified: Date.now()
      });
      dispatchFile(input, file);
      await new Promise(resolve => setTimeout(resolve, 650));
      showPhotoStatus(`✓ Foto selecionada: ${filename}. Confira a prévia no BigMidia antes de salvar.`, 'success');
    } catch (error) {
      showPhotoStatus(`Erro: ${error.message}`, 'error');
    } finally {
      photoBusy = false;
      const current = await getStoredState();
      const has = Boolean(normalizeExternalUrl(currentPhotoUrl(current)));
      const open = $('#ykl-v148-photo-open');
      const download = $('#ykl-v148-photo-download');
      const include = $('#ykl-v148-photo-include');
      if (open) open.disabled = !has;
      if (download) download.disabled = !has;
      if (include) include.disabled = !has;
    }
  }

  function injectPhotoRow() {
    if ($('#ykl-v148-photo-row')) return;
    const docCard = $('.ykl-doc-card');
    if (!docCard) return;
    const heading = $('h3', docCard);
    if (heading && normalize(heading.textContent).includes('documentos')) heading.textContent = 'Arquivos no Drive';

    const firstDocRow = $('.ykl-doc-row', docCard);
    const row = document.createElement('div');
    row.id = 'ykl-v148-photo-row';
    row.className = 'ykl-doc-row ykl-v148-photo-row';
    row.innerHTML = `
      <span>
        <strong>Foto do atleta</strong>
        <small id="ykl-v148-photo-status" class="ykl-doc-status ykl-v148-photo-status">Verificando…</small>
      </span>
      <div>
        <button id="ykl-v148-photo-open" class="ykl-btn" type="button">Abrir</button>
        <button id="ykl-v148-photo-download" class="ykl-btn" type="button">Baixar</button>
        <button id="ykl-v148-photo-include" class="ykl-btn ykl-blue" type="button">Incluir foto</button>
      </div>
    `;
    if (firstDocRow) firstDocRow.before(row);
    else docCard.appendChild(row);

    $('#ykl-v148-photo-open').addEventListener('click', async () => {
      const saved = await getStoredState();
      openPhoto(currentPhotoUrl(saved), false);
    });
    $('#ykl-v148-photo-download').addEventListener('click', async () => {
      const saved = await getStoredState();
      openPhoto(currentPhotoUrl(saved), true);
    });
    $('#ykl-v148-photo-include').addEventListener('click', includePhoto);
    refreshPhotoRow();
  }

  function injectStyles() {
    if ($('#ykl-v148-styles')) return;
    const style = document.createElement('style');
    style.id = 'ykl-v148-styles';
    style.textContent = `
      .ykl-v148-search-card { position: relative; }
      #ykl-v148-athlete-search {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #cbd5e1;
        border-radius: 7px;
        padding: 8px 9px;
        font: inherit;
        background: #fff;
      }
      .ykl-v148-search-results {
        margin-top: 7px;
        max-height: 250px;
        overflow-y: auto;
        border: 1px solid #dbe3ec;
        border-radius: 7px;
        background: #fff;
      }
      .ykl-v148-result {
        display: flex;
        width: 100%;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        padding: 8px 9px;
        border: 0;
        border-bottom: 1px solid #edf2f7;
        background: #fff;
        text-align: left;
        cursor: pointer;
        color: inherit;
      }
      .ykl-v148-result:last-child { border-bottom: 0; }
      .ykl-v148-result:hover, .ykl-v148-result:focus { background: #f1f5f9; outline: none; }
      .ykl-v148-result span, .ykl-v148-empty { font-size: 11px; color: #64748b; }
      .ykl-v148-empty { padding: 8px 9px; }
      .ykl-v148-photo-status.ykl-v148-success { color: #16803d; }
      .ykl-v148-photo-status.ykl-v148-error { color: #b42318; }
    `;
    document.head.appendChild(style);
  }

  function observeAthleteChanges() {
    const name = $('#ykl-athlete-name');
    if (!name) return;
    new MutationObserver(() => refreshPhotoRow()).observe(name, {
      subtree: true,
      characterData: true,
      childList: true
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[STORAGE_KEY]) return;
      refreshPhotoRow();
    });
  }

  function enhancePanel() {
    if (!$('#ykl-root')) return false;
    injectStyles();
    injectSearchCard();
    injectPhotoRow();
    observeAthleteChanges();
    return true;
  }

  function init() {
    if (enhancePanel()) return;
    const observer = new MutationObserver(() => {
      if (enhancePanel()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 15000);
  }

  init();
})();