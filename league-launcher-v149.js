(() => {
  'use strict';

  const STATE_KEY = 'yklStateV2';
  const CACHE_KEY = 'yklLeagueReferencesV149';
  const ORIGIN = 'https://ligapaulistafutsal.bigmidia.com';
  const INDEX_PATH = '/atleta/index';
  const CREATE_URL = `${ORIGIN}/atleta/create`;

  if (location.pathname.replace(/\/$/, '') !== INDEX_PATH) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const storageGet = keys => new Promise(resolve => chrome.storage.local.get(keys, resolve));

  let dataset = null;
  let loadPromise = null;
  let searchTimer = null;

  const normalize = value => String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  function api(saved, action, payload = {}) {
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

  function mapAthletes(rows, headers, references) {
    return (rows || []).map(row => {
      const athleteId = value(row, headers, ['ID', 'ID do atleta']);
      const name = value(row, headers, ['Nome completo do atleta', 'Nome completo', 'Nome']);
      const category = value(row, headers, ['Equipe atual', 'Categoria calculada', 'Categoria']);
      return {
        athleteId,
        name,
        category,
        normalizedName: normalize(name),
        reference: references?.[athleteId] || null
      };
    }).filter(item => item.athleteId && item.name);
  }

  async function loadDataset() {
    if (dataset) return dataset;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      const stored = await storageGet([STATE_KEY, CACHE_KEY]);
      const saved = stored?.[STATE_KEY] || {};
      const localReferences = stored?.[CACHE_KEY] || {};

      if (!saved.apiUrl || !saved.apiToken) {
        throw new Error('Configure a API do Yoka na aba Dados da extensão.');
      }

      const data = await api(saved, 'listAthletes', {});
      const rows = Array.isArray(data?.athletes) ? data.athletes : [];
      const headers = Array.isArray(data?.headers) && data.headers.length
        ? data.headers
        : Object.keys(rows[0] || {});
      const references = { ...localReferences, ...(data?.references || {}) };

      dataset = mapAthletes(rows, headers, references);
      return dataset;
    })();

    try {
      return await loadPromise;
    } finally {
      loadPromise = null;
    }
  }

  function navigate(url) {
    location.href = url;
  }

  function setStatus(root, message, kind = 'normal') {
    const status = $('#ykl-v149-launcher-status', root);
    if (!status) return;
    status.textContent = message;
    status.style.color = kind === 'error' ? '#b42318' : '#64717d';
  }

  function clearResults(root) {
    const results = $('#ykl-v149-launcher-results', root);
    if (results) results.innerHTML = '';
  }

  function renderResults(root, items) {
    const results = $('#ykl-v149-launcher-results', root);
    if (!results) return;
    results.innerHTML = '';

    for (const item of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.style.cssText = [
        'display:block', 'width:100%', 'text-align:left', 'margin:0 0 5px', 'padding:8px 9px',
        'border:1px solid #dce2e8', 'border-radius:7px', 'background:#fff', 'color:#17212b',
        'font-family:Arial,Helvetica,sans-serif'
      ].join(';');

      const name = document.createElement('strong');
      name.textContent = item.name;
      name.style.cssText = 'display:block;font-size:11px;line-height:1.3';

      const meta = document.createElement('span');
      const hasReference = Boolean(item.reference?.bigmidiaId);
      meta.textContent = [
        item.category || '',
        hasReference ? `Liga #${item.reference.bigmidiaId}` : 'Registro da Liga não sincronizado'
      ].filter(Boolean).join(' · ');
      meta.style.cssText = `display:block;margin-top:2px;font-size:9px;line-height:1.35;color:${hasReference ? '#147a42' : '#7a8692'}`;

      button.append(name, meta);

      if (hasReference) {
        button.style.cursor = 'pointer';
        button.addEventListener('mouseenter', () => {
          button.style.borderColor = '#174a7e';
          button.style.background = '#f7f9fb';
        });
        button.addEventListener('mouseleave', () => {
          button.style.borderColor = '#dce2e8';
          button.style.background = '#fff';
        });
        button.addEventListener('click', () => {
          const id = encodeURIComponent(String(item.reference.bigmidiaId));
          navigate(`${ORIGIN}/atleta/update?id=${id}`);
        });
      } else {
        button.disabled = true;
        button.style.opacity = '.62';
        button.style.cursor = 'default';
      }

      results.appendChild(button);
    }
  }

  async function searchAthletes(root) {
    const input = $('#ykl-v149-launcher-search', root);
    const query = normalize(input?.value || '');
    clearResults(root);

    if (query.length < 2) {
      setStatus(root, 'Digite pelo menos 2 caracteres.');
      return;
    }

    setStatus(root, 'Buscando atletas…');

    try {
      const athletes = await loadDataset();
      const words = query.split(/\s+/).filter(Boolean);
      const matches = athletes
        .filter(item => words.every(word => item.normalizedName.includes(word)))
        .sort((a, b) => {
          const aStarts = a.normalizedName.startsWith(query) ? 0 : 1;
          const bStarts = b.normalizedName.startsWith(query) ? 0 : 1;
          return aStarts - bStarts || a.name.localeCompare(b.name, 'pt-BR');
        })
        .slice(0, 8);

      if (!matches.length) {
        setStatus(root, 'Nenhum atleta encontrado.');
        return;
      }

      renderResults(root, matches);
      const available = matches.filter(item => item.reference?.bigmidiaId).length;
      setStatus(root, `${matches.length} resultado(s) · ${available} com registro da Liga.`);
    } catch (error) {
      setStatus(root, error?.message || 'Não foi possível carregar os atletas.', 'error');
    }
  }

  function buildLauncher(panel) {
    if (!panel || $('#ykl-v149-launcher', panel)) return;

    const root = document.createElement('div');
    root.id = 'ykl-v149-launcher';
    root.style.cssText = 'padding-bottom:10px;margin-bottom:10px;border-bottom:1px solid #e5e9ed';

    const title = document.createElement('div');
    title.textContent = 'Atletas Yoka';
    title.style.cssText = 'font-size:13px;font-weight:800;color:#174a7e;margin-bottom:7px';

    const create = document.createElement('button');
    create.type = 'button';
    create.textContent = 'Novo cadastro';
    create.style.cssText = 'width:100%;border:0;border-radius:7px;padding:9px 10px;background:#174a7e;color:#fff;font-size:12px;font-weight:700;cursor:pointer;margin-bottom:8px';
    create.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      navigate(CREATE_URL);
    });

    const label = document.createElement('div');
    label.textContent = 'Buscar atleta para editar';
    label.style.cssText = 'font-size:10px;font-weight:700;color:#3e4b57;margin-bottom:4px';

    const input = document.createElement('input');
    input.id = 'ykl-v149-launcher-search';
    input.type = 'search';
    input.autocomplete = 'off';
    input.placeholder = 'Digite o nome do atleta';
    input.style.cssText = 'width:100%;box-sizing:border-box;border:1px solid #cbd4dc;border-radius:7px;padding:8px 9px;font-size:11px;outline:none';

    const status = document.createElement('div');
    status.id = 'ykl-v149-launcher-status';
    status.textContent = 'Digite pelo menos 2 caracteres.';
    status.style.cssText = 'font-size:9px;line-height:1.4;color:#64717d;margin-top:5px';

    const results = document.createElement('div');
    results.id = 'ykl-v149-launcher-results';
    results.style.cssText = 'margin-top:6px;max-height:220px;overflow:auto';

    input.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => searchAthletes(root), 180);
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        clearTimeout(searchTimer);
        searchAthletes(root);
      }
    });

    root.append(title, create, label, input, status, results);
    panel.prepend(root);
  }

  function init() {
    const existing = $('#ykl-v149-sync-registry');
    if (existing) {
      buildLauncher(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const panel = $('#ykl-v149-sync-registry');
      if (!panel) return;
      buildLauncher(panel);
      observer.disconnect();
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 15000);
  }

  init();
})();
