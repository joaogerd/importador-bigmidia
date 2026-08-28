(() => {
  'use strict';

  const STATE = 'yklStateV2';
  const CACHE = 'yklLeagueReferencesV149';
  const ORIGIN = 'https://ligapaulistafutsal.bigmidia.com';
  const CREATE_URL = `${ORIGIN}/atleta/create`;
  const INDEX_URL = `${ORIGIN}/atleta/index`;

  const $ = id => document.getElementById(id);
  let dataset = null;
  let loadPromise = null;
  let searchTimer = null;

  const normalize = value => String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  function storageGet(keys) {
    return new Promise(resolve => chrome.storage.local.get(keys, resolve));
  }

  function sendApi(saved, action, payload = {}) {
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

  function value(row, headers, candidates) {
    const header = findHeader(headers, candidates);
    return header ? String(row?.[header] ?? '').trim() : '';
  }

  function mapRows(rows, headers, references) {
    return (rows || []).map(row => {
      const athleteId = value(row, headers, ['ID', 'ID do atleta']);
      const name = value(row, headers, ['Nome completo do atleta', 'Nome completo', 'Nome']);
      const category = value(row, headers, ['Equipe atual', 'Categoria calculada', 'Categoria']);
      const ref = references?.[athleteId] || null;
      return { athleteId, name, category, normalizedName: normalize(name), ref };
    }).filter(item => item.athleteId && item.name);
  }

  async function loadDataset() {
    if (dataset) return dataset;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      const stored = await storageGet([STATE, CACHE]);
      const saved = stored?.[STATE] || {};
      const localRefs = stored?.[CACHE] || {};
      let apiData = null;
      let apiError = null;

      if (saved.apiUrl && saved.apiToken) {
        try {
          apiData = await sendApi(saved, 'listAthletes', {});
        } catch (error) {
          apiError = error;
        }
      }

      if (apiData) {
        const rows = Array.isArray(apiData.athletes) ? apiData.athletes : [];
        const headers = Array.isArray(apiData.headers) && apiData.headers.length
          ? apiData.headers : Object.keys(rows[0] || {});
        const refs = { ...localRefs, ...(apiData.references || {}) };
        dataset = { athletes: mapRows(rows, headers, refs), apiError: null };
        return dataset;
      }

      const rows = Array.isArray(saved.rows) ? saved.rows : [];
      const headers = Array.isArray(saved.headers) ? saved.headers : Object.keys(rows[0] || {});
      dataset = {
        athletes: mapRows(rows, headers, localRefs),
        apiError: apiError || (!saved.apiUrl || !saved.apiToken ? new Error('API do Yoka não configurada.') : null)
      };
      return dataset;
    })();

    try { return await loadPromise; }
    finally { loadPromise = null; }
  }

  function navigate(url) {
    chrome.tabs.update({ url }, () => {
      if (chrome.runtime.lastError) chrome.tabs.create({ url });
      window.close();
    });
  }

  function setStatus(message, error = false) {
    const el = $('search-status');
    if (!el) return;
    el.textContent = message;
    el.className = `status${error ? ' error' : ''}`;
  }

  function clearResults() {
    const box = $('search-results');
    if (box) box.innerHTML = '';
  }

  function resultMeta(item) {
    const parts = [];
    if (item.category) parts.push(item.category);
    if (item.ref?.bigmidiaId) parts.push(`Liga #${item.ref.bigmidiaId}`);
    else parts.push('Registro da Liga não sincronizado');
    return parts.join(' · ');
  }

  function renderResults(items) {
    const box = $('search-results');
    if (!box) return;
    box.innerHTML = '';

    for (const item of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `result${item.ref?.bigmidiaId ? '' : ' unsynced'}`;

      const name = document.createElement('strong');
      name.textContent = item.name;
      const meta = document.createElement('span');
      meta.className = `meta${item.ref?.bigmidiaId ? ' ok' : ''}`;
      meta.textContent = resultMeta(item);

      button.append(name, meta);
      if (item.ref?.bigmidiaId) {
        button.addEventListener('click', () => {
          const id = encodeURIComponent(String(item.ref.bigmidiaId));
          navigate(`${ORIGIN}/atleta/update?id=${id}`);
        });
      } else {
        button.disabled = true;
      }
      box.appendChild(button);
    }
  }

  async function search() {
    const query = normalize($('athlete-search')?.value || '');
    clearResults();
    if (query.length < 2) {
      setStatus('Digite pelo menos 2 caracteres.');
      return;
    }

    setStatus('Buscando atletas…');
    try {
      const data = await loadDataset();
      if (!data.athletes.length) {
        setStatus(data.apiError?.message || 'Nenhum atleta disponível para busca.', true);
        return;
      }

      const words = query.split(/\s+/).filter(Boolean);
      const matches = data.athletes
        .filter(item => words.every(word => item.normalizedName.includes(word)))
        .sort((a, b) => {
          const aStarts = a.normalizedName.startsWith(query) ? 0 : 1;
          const bStarts = b.normalizedName.startsWith(query) ? 0 : 1;
          return aStarts - bStarts || a.name.localeCompare(b.name, 'pt-BR');
        })
        .slice(0, 12);

      if (!matches.length) {
        setStatus('Nenhum atleta encontrado.');
        return;
      }

      renderResults(matches);
      const synced = matches.filter(item => item.ref?.bigmidiaId).length;
      const suffix = data.apiError ? ' · usando dados já carregados' : '';
      setStatus(`${matches.length} resultado(s) · ${synced} com registro da Liga${suffix}.`);
    } catch (error) {
      setStatus(error?.message || 'Não foi possível carregar os atletas.', true);
    }
  }

  async function configureLogo() {
    const stored = await storageGet([STATE]);
    const custom = stored?.[STATE]?.logoDataUrl || '';
    const img = $('popup-logo-img');
    const fallback = $('popup-logo-fallback');
    if (!img) return;
    img.src = custom || chrome.runtime.getURL('icons/icon128.png');
    img.hidden = false;
    if (fallback) fallback.hidden = true;
    img.addEventListener('error', () => {
      img.hidden = true;
      if (fallback) fallback.hidden = false;
    }, { once: true });
  }

  function configureVersion() {
    const el = $('popup-version');
    if (!el) return;
    const version = chrome.runtime.getManifest()?.version || '?';
    el.textContent = `v${version}`;
  }

  $('open-create')?.addEventListener('click', () => navigate(CREATE_URL));
  $('open-index')?.addEventListener('click', () => navigate(INDEX_URL));
  $('athlete-search')?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(search, 180);
  });
  $('athlete-search')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      clearTimeout(searchTimer);
      search();
    }
  });

  configureVersion();
  configureLogo();
  $('athlete-search')?.focus();
})();
