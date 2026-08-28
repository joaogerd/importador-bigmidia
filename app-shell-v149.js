(() => {
  'use strict';

  const STATE_KEY = 'yklStateV2';
  const CACHE_KEY = 'yklLeagueReferencesV149';
  const ORIGIN = 'https://ligapaulistafutsal.bigmidia.com';
  const ROUTES = {
    create: `${ORIGIN}/atleta/create`,
    index: `${ORIGIN}/atleta/index`,
    transfer: `${ORIGIN}/bid/create?id_cargo=`
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const storageGet = keys => new Promise(resolve => chrome.storage.local.get(keys, resolve));
  const storageSet = values => new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });

  let dataset = null;
  let datasetPromise = null;
  let searchTimer = null;
  let selectedAthlete = null;
  let activeTopTab = '';

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

  function pathIs(path) {
    return location.pathname.replace(/\/$/, '') === path;
  }

  function pageKind() {
    if (pathIs('/atleta/create')) return 'cadastro';
    if (pathIs('/atleta/update')) return 'cadastro';
    if (pathIs('/atleta/index')) return 'sincronizacao';
    if (pathIs('/bid/create')) return 'transferencia';
    return 'atletas';
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

  function mapAthletes(rows, headers, references, statuses) {
    return (rows || []).map((row, index) => {
      const athleteId = value(row, headers, ['ID', 'ID do atleta']);
      const name = value(row, headers, ['Nome completo do atleta', 'Nome completo', 'Nome']);
      return {
        athleteId,
        name,
        category: athleteCategory(row, headers),
        birthDate: value(row, headers, ['Data de nascimento', 'Data nascimento']),
        normalizedName: normalize(name),
        reference: references?.[athleteId] || null,
        status: statuses?.[athleteId] || '',
        sourceIndex: index
      };
    }).filter(item => item.athleteId && item.name);
  }

  async function loadDataset(force = false) {
    if (!force && dataset) return dataset;
    if (!force && datasetPromise) return datasetPromise;

    datasetPromise = (async () => {
      const stored = await storageGet([STATE_KEY, CACHE_KEY]);
      const saved = stored?.[STATE_KEY] || {};
      const localReferences = stored?.[CACHE_KEY] || {};
      let sourceRows = [];
      let sourceHeaders = [];
      let statuses = saved.serverStatuses || {};
      let references = { ...localReferences };

      if (saved.apiUrl && saved.apiToken) {
        try {
          const data = await api(saved, 'listAthletes', {});
          sourceRows = Array.isArray(data?.athletes) ? data.athletes : [];
          sourceHeaders = Array.isArray(data?.headers) && data.headers.length
            ? data.headers
            : Object.keys(sourceRows[0] || {});
          statuses = data?.statuses || statuses;
          references = { ...references, ...(data?.references || {}) };
        } catch (error) {
          sourceRows = Array.isArray(saved.rows) ? saved.rows : [];
          sourceHeaders = Array.isArray(saved.headers) ? saved.headers : [];
          if (!sourceRows.length) throw error;
        }
      } else {
        sourceRows = Array.isArray(saved.rows) ? saved.rows : [];
        sourceHeaders = Array.isArray(saved.headers) ? saved.headers : [];
      }

      if (!sourceRows.length) throw new Error('Carregue os atletas do Google Sheets na aba Configurações > Dados.');
      const enriched = addDerivedResponsibleColumns(sourceHeaders, sourceRows);
      dataset = {
        saved,
        headers: enriched.headers,
        rows: enriched.rows,
        statuses,
        references,
        athletes: mapAthletes(enriched.rows, enriched.headers, references, statuses)
      };
      return dataset;
    })();

    try {
      return await datasetPromise;
    } finally {
      datasetPromise = null;
    }
  }

  async function persistSelectedAthlete(item) {
    const data = await loadDataset();
    const index = data.rows.findIndex(row => value(row, data.headers, ['ID', 'ID do atleta']) === item.athleteId);
    if (index < 0) throw new Error('O atleta selecionado não foi encontrado nos dados do Yoka.');
    const stored = await storageGet([STATE_KEY]);
    const saved = stored?.[STATE_KEY] || {};
    const next = {
      ...saved,
      headers: data.headers,
      rows: data.rows,
      currentIndex: index,
      completed: saved.completed || {},
      dataSource: 'sheets',
      serverStatuses: data.statuses || {},
      categoryFilter: '',
      availableCategories: collectCategories(data.rows, data.headers),
      documentStatus: {},
      pendingRegistration: null
    };
    await storageSet({ [STATE_KEY]: next });
    selectedAthlete = item;
    renderSelectedAthlete();
    return item;
  }

  function currentStateAthlete(data, saved) {
    const rows = Array.isArray(saved?.rows) ? saved.rows : [];
    const headers = Array.isArray(saved?.headers) ? saved.headers : [];
    const row = rows[Number(saved?.currentIndex) || 0];
    const id = row ? value(row, headers, ['ID', 'ID do atleta']) : '';
    return data?.athletes?.find(item => item.athleteId === id) || null;
  }

  function ensureBaseRoot() {
    let root = $('#ykl-root');
    if (root) return root;

    root = document.createElement('div');
    root.id = 'ykl-root';
    root.className = 'ykl-unified-shell ykl-shell-standalone';
    root.innerHTML = `
      <div class="ykl-header">
        <div class="ykl-title">
          <div class="ykl-logo"><img id="ykl-logo-img" alt="Yoka"></div>
          <div class="ykl-title-text"><strong>Importador Yoka</strong><span>Liga Paulista · assistente operacional</span></div>
        </div>
        <button class="ykl-icon-btn" id="ykl-toggle" title="Recolher">−</button>
      </div>
      <div class="ykl-body"></div>`;
    document.body.appendChild(root);
    const img = $('#ykl-logo-img', root);
    if (img) img.src = chrome.runtime.getURL('icons/icon128.png');
    $('#ykl-toggle', root)?.addEventListener('click', () => {
      root.classList.toggle('ykl-collapsed');
      const button = $('#ykl-toggle', root);
      if (button) button.textContent = root.classList.contains('ykl-collapsed') ? '+' : '−';
    });
    return root;
  }

  function pageStatusText(kind) {
    if (kind === 'cadastro') return pathIs('/atleta/update') ? 'Edição de atleta' : 'Novo cadastro';
    if (kind === 'sincronizacao') return 'Listagem de atletas';
    if (kind === 'transferencia') return 'Nova transferência';
    return 'Navegação na Liga';
  }

  function buildUnifiedNavigation(root) {
    if ($('#ykl-app-nav', root)) return;
    root.classList.add('ykl-unified-shell');
    const body = $('.ykl-body', root);
    if (!body) return;

    const oldTabs = $('.ykl-tabs', body);
    const cadastro = $('.ykl-section[data-section="cadastro"]', body);
    const mapping = $('.ykl-section[data-section="mapeamento"]', body);
    const data = $('.ykl-section[data-section="dados"]', body);
    oldTabs?.remove();

    const context = document.createElement('div');
    context.id = 'ykl-app-context';
    context.className = 'ykl-app-context';
    context.innerHTML = `<span class="ykl-app-context-label">Página atual</span><strong>${escapeHtml(pageStatusText(pageKind()))}</strong>`;
    body.prepend(context);

    const nav = document.createElement('div');
    nav.id = 'ykl-app-nav';
    nav.className = 'ykl-app-nav';
    nav.innerHTML = `
      <button type="button" data-app-tab="atletas">Atletas</button>
      <button type="button" data-app-tab="cadastro">Cadastro</button>
      <button type="button" data-app-tab="transferencia">Transferir</button>
      <button type="button" data-app-tab="sincronizacao">Sincronizar</button>
      <button type="button" data-app-tab="config">Config.</button>`;
    context.after(nav);

    const atletas = document.createElement('section');
    atletas.id = 'ykl-app-atletas';
    atletas.className = 'ykl-app-page';
    atletas.innerHTML = `
      <div class="ykl-card">
        <h3>Atletas Yoka</h3>
        <label class="ykl-label" for="ykl-app-athlete-search">Buscar atleta</label>
        <input id="ykl-app-athlete-search" type="search" autocomplete="off" placeholder="Digite pelo menos 2 letras">
        <div id="ykl-app-athlete-status" class="ykl-muted" style="margin-top:5px">Pesquise um atleta para cadastrar, editar ou transferir.</div>
        <div id="ykl-app-athlete-results" class="ykl-app-results" hidden></div>
      </div>
      <div id="ykl-app-selected" class="ykl-card" hidden></div>
      <div class="ykl-app-shortcuts">
        <button type="button" class="ykl-btn" data-nav-url="${ROUTES.index}">Lista da Liga</button>
        <button type="button" class="ykl-btn ykl-blue" data-nav-url="${ROUTES.create}">Novo cadastro</button>
        <button type="button" class="ykl-btn" data-nav-url="${ROUTES.transfer}">Nova transferência</button>
      </div>`;

    const cadastroPage = cadastro || document.createElement('section');
    cadastroPage.id = cadastroPage.id || 'ykl-app-cadastro';
    cadastroPage.classList.add('ykl-app-page');
    cadastroPage.classList.remove('active');
    if (!cadastro) {
      cadastroPage.innerHTML = `
        <div class="ykl-card ykl-app-placeholder">
          <h3>Cadastro de atleta</h3>
          <div class="ykl-muted">As ferramentas de preenchimento ficam ativas nas páginas de novo cadastro ou edição de atleta.</div>
          <button type="button" class="ykl-btn ykl-blue ykl-full" data-nav-url="${ROUTES.create}">Abrir novo cadastro</button>
        </div>`;
    }

    const transfer = document.createElement('section');
    transfer.id = 'ykl-app-transferencia';
    transfer.className = 'ykl-app-page';
    transfer.innerHTML = pathIs('/bid/create')
      ? '<div id="ykl-app-transfer-host"></div>'
      : `<div class="ykl-card ykl-app-placeholder"><h3>Transferência</h3><div class="ykl-muted">Abra a tela de transferência para localizar o atleta do Yoka no BID e preparar a transferência.</div><button type="button" class="ykl-btn ykl-blue ykl-full" data-nav-url="${ROUTES.transfer}">Abrir transferência</button></div>`;

    const sync = document.createElement('section');
    sync.id = 'ykl-app-sincronizacao';
    sync.className = 'ykl-app-page';
    sync.innerHTML = pathIs('/atleta/index')
      ? '<div id="ykl-app-sync-host"></div>'
      : `<div class="ykl-card ykl-app-placeholder"><h3>Sincronização</h3><div class="ykl-muted">A captura dos números de registro da Liga fica ativa na listagem de atletas.</div><button type="button" class="ykl-btn ykl-blue ykl-full" data-nav-url="${ROUTES.index}">Abrir listagem de atletas</button></div>`;

    const config = document.createElement('section');
    config.id = 'ykl-app-config';
    config.className = 'ykl-app-page';
    config.innerHTML = `
      <div class="ykl-app-subtabs">
        <button type="button" data-config-tab="mapeamento">Mapeamento</button>
        <button type="button" data-config-tab="dados">Dados</button>
      </div>
      <div id="ykl-app-config-map" class="ykl-app-config-pane"></div>
      <div id="ykl-app-config-data" class="ykl-app-config-pane"></div>`;

    body.append(atletas, cadastroPage, transfer, sync, config);

    if (mapping) {
      mapping.classList.remove('ykl-section', 'active');
      mapping.classList.add('ykl-app-config-content');
      $('#ykl-app-config-map', config).appendChild(mapping);
    } else {
      $('#ykl-app-config-map', config).innerHTML = `
        <div class="ykl-card ykl-app-placeholder"><h3>Mapeamento</h3><div class="ykl-muted">O mapeamento depende dos campos do formulário da Liga. Ele pode ser revisado em uma tela de cadastro ou edição.</div><button type="button" class="ykl-btn ykl-full" data-nav-url="${ROUTES.create}">Abrir tela de cadastro</button></div>`;
    }

    if (data) {
      data.classList.remove('ykl-section', 'active');
      data.classList.add('ykl-app-config-content');
      $('#ykl-app-config-data', config).appendChild(data);
    } else {
      buildPortableDataConfig($('#ykl-app-config-data', config));
    }

    nav.querySelectorAll('[data-app-tab]').forEach(button => {
      button.addEventListener('click', () => activateTopTab(button.dataset.appTab));
    });
    config.querySelectorAll('[data-config-tab]').forEach(button => {
      button.addEventListener('click', () => activateConfigTab(button.dataset.configTab));
    });
    body.querySelectorAll('[data-nav-url]').forEach(button => {
      button.addEventListener('click', () => { location.href = button.dataset.navUrl; });
    });

    installAthleteSearch(atletas);
    activeTopTab = pageKind();
    activateTopTab(activeTopTab);
    activateConfigTab('mapeamento');
  }

  function activateTopTab(name) {
    activeTopTab = name;
    const root = $('#ykl-root');
    if (!root) return;
    root.querySelectorAll('#ykl-app-nav [data-app-tab]').forEach(button => {
      button.classList.toggle('active', button.dataset.appTab === name);
    });
    const pages = {
      atletas: '#ykl-app-atletas',
      cadastro: '#ykl-app-cadastro, .ykl-app-page[data-section="cadastro"]',
      transferencia: '#ykl-app-transferencia',
      sincronizacao: '#ykl-app-sincronizacao',
      config: '#ykl-app-config'
    };
    root.querySelectorAll('.ykl-app-page').forEach(page => page.classList.remove('active'));
    const selector = pages[name] || pages.atletas;
    const page = root.querySelector(selector);
    page?.classList.add('active');
  }

  function activateConfigTab(name) {
    const root = $('#ykl-root');
    if (!root) return;
    root.querySelectorAll('[data-config-tab]').forEach(button => button.classList.toggle('active', button.dataset.configTab === name));
    $('#ykl-app-config-map', root)?.classList.toggle('active', name === 'mapeamento');
    $('#ykl-app-config-data', root)?.classList.toggle('active', name === 'dados');
  }

  function buildPortableDataConfig(host) {
    if (!host) return;
    host.innerHTML = `
      <div class="ykl-card">
        <h3>Google Sheets do Yoka</h3>
        <label class="ykl-label" for="ykl-app-api-url">URL da API (Apps Script)</label>
        <input id="ykl-app-api-url" type="text" placeholder="https://script.google.com/macros/s/.../exec">
        <label class="ykl-label" for="ykl-app-api-token" style="margin-top:7px">Chave da API</label>
        <input id="ykl-app-api-token" type="password" placeholder="Chave da API">
        <div class="ykl-row"><button id="ykl-app-api-save" class="ykl-btn ykl-grow" type="button">Salvar</button><button id="ykl-app-api-test" class="ykl-btn ykl-blue ykl-grow" type="button">Testar conexão</button></div>
        <div id="ykl-app-api-status" class="ykl-muted"></div>
      </div>
      <div class="ykl-note">Configurações ficam salvas neste Chrome. O mapeamento completo é revisado em uma tela de cadastro/edição porque depende dos campos do formulário da Liga.</div>`;

    storageGet([STATE_KEY]).then(result => {
      const saved = result?.[STATE_KEY] || {};
      $('#ykl-app-api-url', host).value = saved.apiUrl || '';
      $('#ykl-app-api-token', host).value = saved.apiToken || '';
      $('#ykl-app-api-status', host).textContent = saved.apiUrl && saved.apiToken ? 'API configurada.' : 'API ainda não configurada.';
    });

    $('#ykl-app-api-save', host)?.addEventListener('click', async () => {
      const stored = await storageGet([STATE_KEY]);
      const saved = stored?.[STATE_KEY] || {};
      saved.apiUrl = String($('#ykl-app-api-url', host)?.value || '').trim();
      saved.apiToken = String($('#ykl-app-api-token', host)?.value || '').trim();
      await storageSet({ [STATE_KEY]: saved });
      dataset = null;
      $('#ykl-app-api-status', host).textContent = 'Configuração salva.';
    });

    $('#ykl-app-api-test', host)?.addEventListener('click', async () => {
      const status = $('#ykl-app-api-status', host);
      try {
        const stored = await storageGet([STATE_KEY]);
        const saved = stored?.[STATE_KEY] || {};
        saved.apiUrl = String($('#ykl-app-api-url', host)?.value || saved.apiUrl || '').trim();
        saved.apiToken = String($('#ykl-app-api-token', host)?.value || saved.apiToken || '').trim();
        await storageSet({ [STATE_KEY]: saved });
        status.textContent = 'Testando conexão…';
        const result = await api(saved, 'ping', {});
        status.textContent = `Conexão OK${result?.version ? ` · API ${result.version}` : ''}.`;
      } catch (error) {
        status.textContent = error.message || String(error);
      }
    });
  }

  function setAthleteStatus(message, kind = 'normal') {
    const el = $('#ykl-app-athlete-status');
    if (!el) return;
    el.textContent = message;
    el.className = `ykl-muted ${kind === 'error' ? 'ykl-app-error' : kind === 'success' ? 'ykl-app-success' : ''}`;
  }

  function renderSearchResults(matches) {
    const box = $('#ykl-app-athlete-results');
    if (!box) return;
    box.innerHTML = '';
    if (!matches.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    matches.forEach(item => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ykl-app-result';
      const ref = item.reference?.bigmidiaId;
      button.innerHTML = `<strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.category || 'Sem categoria')} · ${ref ? `Liga #${escapeHtml(ref)}` : 'não cadastrado na Liga'}</span>`;
      button.addEventListener('click', async () => {
        try {
          await persistSelectedAthlete(item);
          setAthleteStatus(`${item.name} selecionado.`, 'success');
        } catch (error) {
          setAthleteStatus(error.message || String(error), 'error');
        }
      });
      box.appendChild(button);
    });
  }

  async function searchAthletes() {
    const input = $('#ykl-app-athlete-search');
    const query = normalize(input?.value || '');
    const box = $('#ykl-app-athlete-results');
    if (box) { box.innerHTML = ''; box.hidden = true; }
    if (query.length < 2) {
      setAthleteStatus('Digite pelo menos 2 caracteres.');
      return;
    }
    setAthleteStatus('Buscando atletas…');
    try {
      const data = await loadDataset();
      const words = query.split(/\s+/).filter(Boolean);
      const matches = data.athletes
        .filter(item => words.every(word => item.normalizedName.includes(word)))
        .sort((a, b) => {
          const ap = a.normalizedName.startsWith(query) ? 0 : 1;
          const bp = b.normalizedName.startsWith(query) ? 0 : 1;
          return ap - bp || a.name.localeCompare(b.name, 'pt-BR');
        })
        .slice(0, 10);
      renderSearchResults(matches);
      if (!matches.length) setAthleteStatus('Nenhum atleta encontrado.');
      else setAthleteStatus(`${matches.length} resultado(s). Clique no atleta para selecioná-lo.`);
    } catch (error) {
      setAthleteStatus(error.message || 'Não foi possível carregar os atletas.', 'error');
    }
  }

  function installAthleteSearch(root) {
    const input = $('#ykl-app-athlete-search', root);
    if (!input) return;
    input.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(searchAthletes, 180);
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        clearTimeout(searchTimer);
        searchAthletes();
      }
    });

    loadDataset().then(async data => {
      const stored = await storageGet([STATE_KEY]);
      selectedAthlete = currentStateAthlete(data, stored?.[STATE_KEY] || {});
      renderSelectedAthlete();
    }).catch(() => {});
  }

  function renderSelectedAthlete() {
    const host = $('#ykl-app-selected');
    if (!host) return;
    if (!selectedAthlete) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    const ref = selectedAthlete.reference?.bigmidiaId;
    host.hidden = false;
    host.innerHTML = `
      <div class="ykl-row"><span class="ykl-muted">Atleta selecionado</span>${selectedAthlete.status ? `<span class="ykl-badge">${escapeHtml(selectedAthlete.status)}</span>` : ''}</div>
      <div class="ykl-athlete">${escapeHtml(selectedAthlete.name)}</div>
      <div class="ykl-muted">${escapeHtml(selectedAthlete.category || 'Categoria não informada')}${ref ? ` · Liga #${escapeHtml(ref)}` : ' · sem registro na Liga'}</div>
      <div class="ykl-app-selected-actions">
        <button type="button" id="ykl-app-primary-athlete" class="ykl-btn ykl-blue">${ref ? 'Editar na Liga' : 'Cadastrar na Liga'}</button>
        <button type="button" id="ykl-app-transfer-athlete" class="ykl-btn">Transferir</button>
      </div>`;

    $('#ykl-app-primary-athlete', host)?.addEventListener('click', async () => {
      await persistSelectedAthlete(selectedAthlete);
      location.href = ref ? `${ORIGIN}/atleta/update?id=${encodeURIComponent(ref)}` : ROUTES.create;
    });
    $('#ykl-app-transfer-athlete', host)?.addEventListener('click', async () => {
      await persistSelectedAthlete(selectedAthlete);
      location.href = ROUTES.transfer;
    });
  }

  function integrateFloatingPanels() {
    $('#ykl-v149-registry')?.remove();
    $('#ykl-v149-index-registry')?.remove();
    $('#ykl-v149-launcher')?.remove();
    const panel = $('#ykl-v149-sync-registry');
    const host = $('#ykl-app-sync-host');
    if (panel && host && !host.contains(panel)) {
      host.appendChild(panel);
      panel.classList.add('ykl-app-embedded-panel');
      panel.style.position = 'static';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.width = '100%';
      panel.style.boxShadow = 'none';
      panel.style.border = '0';
      panel.style.borderRadius = '0';
      panel.style.padding = '0';
    }
  }

  function init() {
    const root = ensureBaseRoot();
    buildUnifiedNavigation(root);
    integrateFloatingPanels();

    const observer = new MutationObserver(() => integrateFloatingPanels());
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[STATE_KEY] || changes[CACHE_KEY]) {
        dataset = null;
        loadDataset(true).then(async data => {
          const stored = await storageGet([STATE_KEY]);
          selectedAthlete = currentStateAthlete(data, stored?.[STATE_KEY] || {}) || selectedAthlete;
          if (selectedAthlete) {
            const refreshed = data.athletes.find(item => item.athleteId === selectedAthlete.athleteId);
            if (refreshed) selectedAthlete = refreshed;
          }
          renderSelectedAthlete();
        }).catch(() => {});
      }
    });
  }

  init();
})();
