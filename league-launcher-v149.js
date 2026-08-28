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
  const storageSet = values => new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });

  let dataset = null;
  let loadPromise = null;
  let searchTimer = null;
  let selectedAthlete = null;

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

  function athleteCategory(row, headers) {
    return value(row, headers, ['Equipe atual', 'Categoria calculada', 'Categoria', 'Equipe']);
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

  function mapAthletes(rows, headers, references) {
    return (rows || []).map((row, index) => {
      const athleteId = value(row, headers, ['ID', 'ID do atleta']);
      const name = value(row, headers, ['Nome completo do atleta', 'Nome completo', 'Nome']);
      const category = athleteCategory(row, headers);
      return {
        athleteId,
        name,
        category,
        normalizedName: normalize(name),
        reference: references?.[athleteId] || null,
        sourceIndex: index
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
      const sourceRows = Array.isArray(data?.athletes) ? data.athletes : [];
      const sourceHeaders = Array.isArray(data?.headers) && data.headers.length
        ? data.headers
        : Object.keys(sourceRows[0] || {});
      const references = { ...localReferences, ...(data?.references || {}) };
      const enriched = addDerivedResponsibleColumns(sourceHeaders, sourceRows);

      dataset = {
        rows: enriched.rows,
        headers: enriched.headers,
        athletes: mapAthletes(enriched.rows, enriched.headers, references),
        statuses: data?.statuses || {},
        references
      };
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
    status.style.color = kind === 'error' ? '#b42318' : kind === 'success' ? '#147a42' : '#64717d';
  }

  function clearResults(root) {
    const results = $('#ykl-v149-launcher-results', root);
    if (results) results.innerHTML = '';
  }

  function updateCreateButton(root) {
    const button = $('#ykl-v149-launcher-create', root);
    if (!button) return;
    if (selectedAthlete && !selectedAthlete.reference?.bigmidiaId) {
      button.textContent = 'Novo cadastro — atleta selecionado';
      button.style.background = '#147a42';
      button.title = selectedAthlete.name;
    } else {
      button.textContent = 'Novo cadastro';
      button.style.background = '#174a7e';
      button.title = '';
    }
  }

  function selectForRegistration(root, item) {
    selectedAthlete = item;
    updateCreateButton(root);
    setStatus(root, `${item.name} selecionado para novo cadastro.`, 'success');
    renderResults(root, root._yklCurrentMatches || []);
  }

  function renderResults(root, items) {
    const results = $('#ykl-v149-launcher-results', root);
    if (!results) return;
    results.innerHTML = '';
    root._yklCurrentMatches = items;

    for (const item of items) {
      const button = document.createElement('button');
      button.type = 'button';
      const isSelected = selectedAthlete?.athleteId === item.athleteId;
      button.style.cssText = [
        'display:block', 'width:100%', 'text-align:left', 'margin:0 0 5px', 'padding:8px 9px',
        `border:${isSelected ? '2px solid #147a42' : '1px solid #dce2e8'}`,
        'border-radius:7px', `background:${isSelected ? '#f0faf4' : '#fff'}`, 'color:#17212b',
        'font-family:Arial,Helvetica,sans-serif', 'cursor:pointer'
      ].join(';');

      const name = document.createElement('strong');
      name.textContent = item.name;
      name.style.cssText = 'display:block;font-size:11px;line-height:1.3';

      const meta = document.createElement('span');
      const hasReference = Boolean(item.reference?.bigmidiaId);
      meta.textContent = [
        item.category || '',
        hasReference ? `Liga #${item.reference.bigmidiaId}` : (isSelected ? 'Selecionado para novo cadastro' : 'Não cadastrado na Liga')
      ].filter(Boolean).join(' · ');
      meta.style.cssText = `display:block;margin-top:2px;font-size:9px;line-height:1.35;color:${hasReference || isSelected ? '#147a42' : '#7a8692'}`;

      button.append(name, meta);
      button.addEventListener('mouseenter', () => {
        if (!isSelected) {
          button.style.borderColor = '#174a7e';
          button.style.background = '#f7f9fb';
        }
      });
      button.addEventListener('mouseleave', () => {
        if (!isSelected) {
          button.style.borderColor = '#dce2e8';
          button.style.background = '#fff';
        }
      });

      if (hasReference) {
        button.addEventListener('click', () => {
          const id = encodeURIComponent(String(item.reference.bigmidiaId));
          navigate(`${ORIGIN}/atleta/update?id=${id}`);
        });
      } else {
        button.addEventListener('click', () => selectForRegistration(root, item));
      }

      results.appendChild(button);
    }
  }

  async function prepareSelectedForCreate(root) {
    if (!selectedAthlete) {
      navigate(CREATE_URL);
      return;
    }

    if (selectedAthlete.reference?.bigmidiaId) {
      const id = encodeURIComponent(String(selectedAthlete.reference.bigmidiaId));
      navigate(`${ORIGIN}/atleta/update?id=${id}`);
      return;
    }

    setStatus(root, `Preparando cadastro de ${selectedAthlete.name}…`);
    const data = await loadDataset();
    const index = data.rows.findIndex(row => value(row, data.headers, ['ID', 'ID do atleta']) === selectedAthlete.athleteId);
    if (index < 0) throw new Error('O atleta selecionado não foi encontrado nos dados carregados do Yoka.');

    const stored = await storageGet([STATE_KEY]);
    const saved = stored?.[STATE_KEY] || {};
    const nextState = {
      ...saved,
      headers: data.headers,
      rows: data.rows,
      currentIndex: index,
      completed: saved.completed || {},
      dataSource: 'sheets',
      serverStatuses: data.statuses || {},
      categoryFilter: '',
      availableCategories: collectCategories(data.rows, data.headers),
      pendingRegistration: null,
      documentStatus: {}
    };

    await storageSet({ [STATE_KEY]: nextState });
    sessionStorage.setItem('ykl-v149-create-target', selectedAthlete.athleteId);
    navigate(CREATE_URL);
  }

  async function searchAthletes(root) {
    const input = $('#ykl-v149-launcher-search', root);
    const query = normalize(input?.value || '');
    clearResults(root);
    selectedAthlete = null;
    updateCreateButton(root);

    if (query.length < 2) {
      setStatus(root, 'Digite pelo menos 2 caracteres.');
      return;
    }

    setStatus(root, 'Buscando atletas…');

    try {
      const data = await loadDataset();
      const words = query.split(/\s+/).filter(Boolean);
      const matches = data.athletes
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

      const available = matches.filter(item => item.reference?.bigmidiaId).length;
      const unsynced = matches.filter(item => !item.reference?.bigmidiaId);
      if (matches.length === 1 && unsynced.length === 1) {
        selectedAthlete = unsynced[0];
        updateCreateButton(root);
        setStatus(root, `${unsynced[0].name} selecionado para novo cadastro.`, 'success');
      } else {
        setStatus(root, `${matches.length} resultado(s) · ${available} com registro da Liga.`);
      }
      renderResults(root, matches);
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
    create.id = 'ykl-v149-launcher-create';
    create.type = 'button';
    create.textContent = 'Novo cadastro';
    create.style.cssText = 'width:100%;border:0;border-radius:7px;padding:9px 10px;background:#174a7e;color:#fff;font-size:12px;font-weight:700;cursor:pointer;margin-bottom:8px';
    create.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      create.disabled = true;
      prepareSelectedForCreate(root)
        .catch(error => setStatus(root, error?.message || 'Não foi possível preparar o cadastro.', 'error'))
        .finally(() => { create.disabled = false; });
    });

    const label = document.createElement('div');
    label.textContent = 'Buscar atleta';
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
