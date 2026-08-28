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
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const storageGet = keys => new Promise(resolve => chrome.storage.local.get(keys, resolve));
  const storageSet = values => new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });

  let dataset = null;
  let datasetPromise = null;
  let selectedAthlete = null;
  let searchTimer = null;
  let activeTab = '';
  let configTab = 'dados';
  let root = null;
  let body = null;
  let legacy = null;

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

  function pathIs(path) {
    return location.pathname.replace(/\/$/, '') === path;
  }

  function pageKind() {
    if (pathIs('/atleta/create') || pathIs('/atleta/update')) return 'cadastro';
    if (pathIs('/atleta/index')) return 'sincronizacao';
    if (pathIs('/bid/create')) return 'transferencia';
    return 'atletas';
  }

  function pageStatusText() {
    if (pathIs('/atleta/create')) return 'Novo cadastro';
    if (pathIs('/atleta/update')) return 'Edição de atleta';
    if (pathIs('/atleta/index')) return 'Listagem de atletas';
    if (pathIs('/bid/create')) return 'Nova transferência';
    return 'Navegação na Liga';
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
      let rows = Array.isArray(saved.rows) ? saved.rows : [];
      let headers = Array.isArray(saved.headers) ? saved.headers : [];
      let statuses = saved.serverStatuses || {};
      let references = { ...localReferences };

      if (saved.apiUrl && saved.apiToken) {
        try {
          const data = await api(saved, 'listAthletes', {});
          rows = Array.isArray(data?.athletes) ? data.athletes : rows;
          headers = Array.isArray(data?.headers) && data.headers.length ? data.headers : (rows.length ? Object.keys(rows[0]) : headers);
          statuses = data?.statuses || statuses;
          references = { ...references, ...(data?.references || {}) };
        } catch (error) {
          if (!rows.length) throw error;
        }
      }

      if (!rows.length) throw new Error('Carregue os atletas do Google Sheets em Config. > Dados.');
      const enriched = addDerivedResponsibleColumns(headers, rows);
      dataset = {
        saved,
        rows: enriched.rows,
        headers: enriched.headers,
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
    await storageSet({
      [STATE_KEY]: {
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
      }
    });
    selectedAthlete = item;
    renderSelectedAthlete();
  }

  function currentStateAthlete(data, saved) {
    const rows = Array.isArray(saved?.rows) ? saved.rows : [];
    const headers = Array.isArray(saved?.headers) ? saved.headers : [];
    const row = rows[Number(saved?.currentIndex) || 0];
    const id = row ? value(row, headers, ['ID', 'ID do atleta']) : '';
    return data?.athletes?.find(item => item.athleteId === id) || null;
  }

  function createStandaloneRoot() {
    const node = document.createElement('div');
    node.id = 'ykl-root';
    node.className = 'ykl-unified-shell ykl-shell-standalone';
    node.innerHTML = `
      <div class="ykl-header">
        <div class="ykl-title">
          <div class="ykl-logo"><img id="ykl-logo-img" alt="Logo do Yoka"></div>
          <div class="ykl-title-text"><strong>Importador Yoka</strong><span>Liga Paulista · assistente operacional</span></div>
        </div>
        <button class="ykl-icon-btn" id="ykl-toggle" title="Recolher">−</button>
      </div>
      <div class="ykl-body"></div>`;
    document.body.appendChild(node);
    const img = $('#ykl-logo-img', node);
    if (img) img.src = chrome.runtime.getURL('icons/icon128.png');
    $('#ykl-toggle', node)?.addEventListener('click', () => {
      node.classList.toggle('ykl-collapsed');
      const button = $('#ykl-toggle', node);
      if (button) button.textContent = node.classList.contains('ykl-collapsed') ? '+' : '−';
    });
    return node;
  }

  async function obtainRoot() {
    for (let i = 0; i < 20; i++) {
      const existing = $('#ykl-root');
      if (existing) return existing;
      if (!pathIs('/atleta/create') && !pathIs('/atleta/update')) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return $('#ykl-root') || createStandaloneRoot();
  }

  function captureLegacy() {
    const oldTabs = $('.ykl-tabs', body);
    const cadastro = $('.ykl-section[data-section="cadastro"]', body);
    const mapping = $('.ykl-section[data-section="mapeamento"]', body);
    const dados = $('.ykl-section[data-section="dados"]', body);
    legacy = { oldTabs, cadastro, mapping, dados };
    if (oldTabs) oldTabs.style.display = 'none';
  }

  function buildShell() {
    if ($('#ykl-global-nav', root)) return;
    root.classList.add('ykl-unified-shell');

    const context = document.createElement('div');
    context.id = 'ykl-global-context';
    context.className = 'ykl-global-context';
    context.innerHTML = `<span>Página atual</span><strong>${escapeHtml(pageStatusText())}</strong>`;

    const nav = document.createElement('div');
    nav.id = 'ykl-global-nav';
    nav.className = 'ykl-global-nav';
    nav.innerHTML = `
      <button type="button" data-global-tab="atletas">Atletas</button>
      <button type="button" data-global-tab="cadastro">Cadastro</button>
      <button type="button" data-global-tab="transferencia">Transferir</button>
      <button type="button" data-global-tab="sincronizacao">Sincronizar</button>
      <button type="button" data-global-tab="config">Config.</button>`;

    const pages = document.createElement('div');
    pages.id = 'ykl-global-pages';
    pages.innerHTML = `
      <section id="ykl-global-atletas" class="ykl-global-page">
        <div class="ykl-card">
          <h3>Atletas Yoka</h3>
          <label class="ykl-label" for="ykl-global-search">Buscar atleta</label>
          <input id="ykl-global-search" type="search" autocomplete="off" placeholder="Digite pelo menos 2 letras">
          <div id="ykl-global-search-status" class="ykl-muted" style="margin-top:5px">Pesquise um atleta para cadastrar, editar ou transferir.</div>
          <div id="ykl-global-results" class="ykl-global-results" hidden></div>
        </div>
        <div id="ykl-global-selected" class="ykl-card" hidden></div>
        <div class="ykl-global-shortcuts">
          <button type="button" class="ykl-btn" data-url="${ROUTES.index}">Lista da Liga</button>
          <button type="button" class="ykl-btn ykl-blue" data-url="${ROUTES.create}">Novo cadastro</button>
          <button type="button" class="ykl-btn" data-url="${ROUTES.transfer}">Nova transferência</button>
        </div>
      </section>

      <section id="ykl-global-cadastro" class="ykl-global-page">
        <div id="ykl-global-cadastro-placeholder" class="ykl-card ykl-global-placeholder">
          <h3>Cadastro de atleta</h3>
          <div class="ykl-muted">As ferramentas completas ficam ativas em novo cadastro ou edição.</div>
          <button type="button" class="ykl-btn ykl-blue ykl-full" data-url="${ROUTES.create}" style="margin-top:8px">Abrir novo cadastro</button>
        </div>
      </section>

      <section id="ykl-global-transferencia" class="ykl-global-page">
        <div id="ykl-app-transfer-host"></div>
        <div id="ykl-global-transfer-placeholder" class="ykl-card ykl-global-placeholder">
          <h3>Transferência</h3>
          <div class="ykl-muted">A seleção assistida fica ativa na tela de Nova Transferência.</div>
          <button type="button" class="ykl-btn ykl-blue ykl-full" data-url="${ROUTES.transfer}" style="margin-top:8px">Abrir transferência</button>
        </div>
      </section>

      <section id="ykl-global-sincronizacao" class="ykl-global-page">
        <div id="ykl-app-sync-host"></div>
        <div id="ykl-global-sync-placeholder" class="ykl-card ykl-global-placeholder">
          <h3>Sincronização</h3>
          <div class="ykl-muted">A captura dos registros da Liga fica ativa na listagem de atletas.</div>
          <button type="button" class="ykl-btn ykl-blue ykl-full" data-url="${ROUTES.index}" style="margin-top:8px">Abrir listagem</button>
        </div>
      </section>

      <section id="ykl-global-config" class="ykl-global-page">
        <div class="ykl-global-config-tabs">
          <button type="button" data-config-tab="mapeamento">Mapeamento</button>
          <button type="button" data-config-tab="dados">Dados</button>
        </div>
        <div id="ykl-global-config-standalone"></div>
      </section>`;

    body.prepend(pages);
    body.prepend(nav);
    body.prepend(context);

    $$('#ykl-global-nav [data-global-tab]', root).forEach(button => {
      button.addEventListener('click', () => showTab(button.dataset.globalTab));
    });
    $$('#ykl-global-config [data-config-tab]', root).forEach(button => {
      button.addEventListener('click', () => showConfig(button.dataset.configTab));
    });
    $$('[data-url]', pages).forEach(button => {
      button.addEventListener('click', () => { location.href = button.dataset.url; });
    });

    const search = $('#ykl-global-search', root);
    search?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(searchAthletes, 180);
    });
    search?.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        clearTimeout(searchTimer);
        searchAthletes();
      }
    });

    buildStandaloneDataConfig();
  }

  function hideLegacySections() {
    for (const section of [legacy?.cadastro, legacy?.mapping, legacy?.dados]) {
      if (section) section.style.display = 'none';
    }
  }

  function showTab(name) {
    activeTab = name;
    hideLegacySections();
    $$('.ykl-global-page', root).forEach(page => page.classList.remove('active'));
    $$('#ykl-global-nav [data-global-tab]', root).forEach(button => button.classList.toggle('active', button.dataset.globalTab === name));

    if (name === 'cadastro' && legacy?.cadastro) {
      legacy.cadastro.style.display = 'block';
      return;
    }

    if (name === 'config') {
      $('#ykl-global-config', root)?.classList.add('active');
      showConfig(configTab);
      return;
    }

    $(`#ykl-global-${name}`, root)?.classList.add('active');
    refreshContextualPlaceholders();
  }

  function showConfig(name) {
    configTab = name === 'mapeamento' ? 'mapeamento' : 'dados';
    $$('#ykl-global-config [data-config-tab]', root).forEach(button => button.classList.toggle('active', button.dataset.configTab === configTab));
    if (activeTab !== 'config') return;

    if (legacy?.mapping || legacy?.dados) {
      if (legacy.mapping) legacy.mapping.style.display = configTab === 'mapeamento' ? 'block' : 'none';
      if (legacy.dados) legacy.dados.style.display = configTab === 'dados' ? 'block' : 'none';
      const standalone = $('#ykl-global-config-standalone', root);
      if (standalone) standalone.style.display = 'none';
      return;
    }

    const standalone = $('#ykl-global-config-standalone', root);
    if (!standalone) return;
    standalone.style.display = 'block';
    if (configTab === 'mapeamento') {
      standalone.innerHTML = `
        <div class="ykl-card">
          <h3>Mapeamento</h3>
          <div class="ykl-muted">Abra um cadastro ou uma edição de atleta para descobrir e configurar os campos do formulário.</div>
          <button type="button" class="ykl-btn ykl-blue ykl-full" id="ykl-global-open-map" style="margin-top:8px">Abrir cadastro</button>
        </div>`;
      $('#ykl-global-open-map', standalone)?.addEventListener('click', () => { location.href = ROUTES.create; });
    } else {
      renderStandaloneDataConfig();
    }
  }

  function refreshContextualPlaceholders() {
    const transferPlaceholder = $('#ykl-global-transfer-placeholder', root);
    if (transferPlaceholder) transferPlaceholder.style.display = pathIs('/bid/create') ? 'none' : 'block';
    const syncPlaceholder = $('#ykl-global-sync-placeholder', root);
    if (syncPlaceholder) syncPlaceholder.style.display = pathIs('/atleta/index') ? 'none' : 'block';
  }

  function setSearchStatus(message, kind = 'normal') {
    const el = $('#ykl-global-search-status', root);
    if (!el) return;
    el.textContent = message;
    el.style.color = kind === 'error' ? '#b42318' : kind === 'success' ? '#147a42' : '#64717d';
  }

  function renderSearchResults(items) {
    const box = $('#ykl-global-results', root);
    if (!box) return;
    box.innerHTML = '';
    box.hidden = !items.length;
    for (const item of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ykl-global-result';
      const ref = item.reference?.bigmidiaId;
      button.innerHTML = `<strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.category || 'Categoria não informada')}${ref ? ` · Liga #${escapeHtml(ref)}` : ' · não cadastrado na Liga'}</span>`;
      button.addEventListener('click', async () => {
        try {
          await persistSelectedAthlete(item);
          setSearchStatus(`${item.name} selecionado.`, 'success');
        } catch (error) {
          setSearchStatus(error.message || String(error), 'error');
        }
      });
      box.appendChild(button);
    }
  }

  async function searchAthletes() {
    const input = $('#ykl-global-search', root);
    const query = normalize(input?.value || '');
    const box = $('#ykl-global-results', root);
    if (box) { box.innerHTML = ''; box.hidden = true; }
    if (query.length < 2) {
      setSearchStatus('Digite pelo menos 2 caracteres.');
      return;
    }

    setSearchStatus('Buscando atletas…');
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
      setSearchStatus(matches.length ? `${matches.length} resultado(s). Clique para selecionar.` : 'Nenhum atleta encontrado.');
    } catch (error) {
      setSearchStatus(error.message || 'Não foi possível carregar os atletas.', 'error');
    }
  }

  function renderSelectedAthlete() {
    const host = $('#ykl-global-selected', root);
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
      <div class="ykl-global-selected-actions">
        <button type="button" id="ykl-global-primary" class="ykl-btn ykl-blue">${ref ? 'Editar na Liga' : 'Cadastrar na Liga'}</button>
        <button type="button" id="ykl-global-transfer" class="ykl-btn">Transferir</button>
      </div>`;

    $('#ykl-global-primary', host)?.addEventListener('click', async () => {
      await persistSelectedAthlete(selectedAthlete);
      location.href = ref ? `${ORIGIN}/atleta/update?id=${encodeURIComponent(ref)}` : ROUTES.create;
    });
    $('#ykl-global-transfer', host)?.addEventListener('click', async () => {
      await persistSelectedAthlete(selectedAthlete);
      location.href = ROUTES.transfer;
    });
  }

  function integrateSyncPanel() {
    const panel = $('#ykl-v149-sync-registry');
    const host = $('#ykl-app-sync-host', root);
    if (!panel || !host || host.contains(panel)) return;
    host.appendChild(panel);
    panel.classList.add('ykl-global-embedded-panel');
    panel.style.position = 'static';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.width = '100%';
    panel.style.boxShadow = 'none';
    panel.style.border = '0';
    panel.style.borderRadius = '0';
    panel.style.padding = '0';
  }

  function buildStandaloneDataConfig() {
    const host = $('#ykl-global-config-standalone', root);
    if (!host || legacy?.dados) return;
    host.dataset.ready = '1';
  }

  async function renderStandaloneDataConfig() {
    const host = $('#ykl-global-config-standalone', root);
    if (!host || legacy?.dados) return;
    const stored = await storageGet([STATE_KEY]);
    const saved = stored?.[STATE_KEY] || {};
    host.innerHTML = `
      <div class="ykl-card">
        <h3>Google Sheets do Yoka</h3>
        <label class="ykl-label" for="ykl-global-api-url">URL da API</label>
        <input id="ykl-global-api-url" type="text" value="${escapeHtml(saved.apiUrl || '')}" placeholder="https://script.google.com/macros/s/.../exec">
        <label class="ykl-label" for="ykl-global-api-token" style="margin-top:7px">Chave da API</label>
        <input id="ykl-global-api-token" type="password" value="${escapeHtml(saved.apiToken || '')}" placeholder="Chave da API">
        <div class="ykl-row" style="margin-top:7px"><button id="ykl-global-api-test" class="ykl-btn ykl-grow" type="button">Testar conexão</button><button id="ykl-global-api-load" class="ykl-btn ykl-blue ykl-grow" type="button">Carregar atletas</button></div>
        <div id="ykl-global-api-status" class="ykl-muted" style="margin-top:6px">Configuração salva neste Chrome.</div>
      </div>`;

    const saveCredentials = async () => {
      const current = (await storageGet([STATE_KEY]))?.[STATE_KEY] || {};
      current.apiUrl = String($('#ykl-global-api-url', host)?.value || '').trim();
      current.apiToken = String($('#ykl-global-api-token', host)?.value || '').trim();
      await storageSet({ [STATE_KEY]: current });
      dataset = null;
      return current;
    };

    $('#ykl-global-api-url', host)?.addEventListener('change', saveCredentials);
    $('#ykl-global-api-token', host)?.addEventListener('change', saveCredentials);
    $('#ykl-global-api-test', host)?.addEventListener('click', async () => {
      const status = $('#ykl-global-api-status', host);
      try {
        const current = await saveCredentials();
        status.textContent = 'Testando conexão…';
        await api(current, 'ping', {});
        status.textContent = '✓ Conexão com a API funcionando.';
        status.style.color = '#147a42';
      } catch (error) {
        status.textContent = error.message || String(error);
        status.style.color = '#b42318';
      }
    });
    $('#ykl-global-api-load', host)?.addEventListener('click', async () => {
      const status = $('#ykl-global-api-status', host);
      try {
        await saveCredentials();
        status.textContent = 'Carregando atletas…';
        const data = await loadDataset(true);
        const current = (await storageGet([STATE_KEY]))?.[STATE_KEY] || {};
        current.headers = data.headers;
        current.rows = data.rows;
        current.serverStatuses = data.statuses || {};
        current.dataSource = 'sheets';
        current.availableCategories = collectCategories(data.rows, data.headers);
        if (Number(current.currentIndex) >= data.rows.length) current.currentIndex = 0;
        await storageSet({ [STATE_KEY]: current });
        status.textContent = `✓ ${data.rows.length} atletas carregados.`;
        status.style.color = '#147a42';
      } catch (error) {
        status.textContent = error.message || String(error);
        status.style.color = '#b42318';
      }
    });
  }

  async function loadCurrentSelection() {
    try {
      const data = await loadDataset();
      const stored = await storageGet([STATE_KEY]);
      selectedAthlete = currentStateAthlete(data, stored?.[STATE_KEY] || {});
      renderSelectedAthlete();
    } catch { /* sem dados ainda */ }
  }

  function installObservers() {
    const observer = new MutationObserver(() => {
      integrateSyncPanel();
      refreshContextualPlaceholders();
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || (!changes[STATE_KEY] && !changes[CACHE_KEY])) return;
      dataset = null;
      loadCurrentSelection();
    });
  }

  async function init() {
    root = await obtainRoot();
    body = $('.ykl-body', root);
    if (!body) return;

    captureLegacy();
    buildShell();
    refreshContextualPlaceholders();
    integrateSyncPanel();
    await loadCurrentSelection();
    showTab(pageKind());
    installObservers();
  }

  init().catch(error => console.error('[Importador Yoka] Falha ao montar painel unificado:', error));
})();