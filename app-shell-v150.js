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
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const storageGet = keys => new Promise(resolve => chrome.storage.local.get(keys, resolve));
  const storageSet = values => new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });

  let datasetCache = null;
  let datasetPromise = null;
  let selectedAthlete = null;
  let currentCategory = '';
  let searchTimer = null;
  let activePage = '';

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

  function pageContext() {
    if (pathIs('/atleta/create')) return { page: 'cadastro', label: 'Novo cadastro' };
    if (pathIs('/atleta/update')) return { page: 'cadastro', label: 'Edição de atleta' };
    if (pathIs('/bid/create')) return { page: 'transferir', label: 'Nova transferência' };
    if (pathIs('/atleta/index')) return { page: 'atletas', label: 'Listagem de atletas' };
    return { page: 'atletas', label: 'Navegação na Liga' };
  }

  function findHeader(headers, candidates) {
    const list = (headers || []).map(raw => ({ raw, normalized: normalize(raw) }));
    for (const candidate of candidates) {
      const found = list.find(item => item.normalized === normalize(candidate));
      if (found) return found.raw;
    }
    return '';
  }

  function value(row, headers, candidates) {
    const header = findHeader(headers, candidates);
    return header ? String(row?.[header] ?? '').trim() : '';
  }

  function categoryOf(row, headers) {
    return value(row, headers, ['Equipe atual', 'Categoria calculada', 'Categoria', 'Equipe']) || 'Sem categoria';
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

  async function loadDataset(force = false) {
    if (!force && datasetCache) return datasetCache;
    if (!force && datasetPromise) return datasetPromise;

    datasetPromise = (async () => {
      const stored = await storageGet([STATE_KEY, CACHE_KEY]);
      const saved = stored?.[STATE_KEY] || {};
      const cache = stored?.[CACHE_KEY] || {};
      let rows = Array.isArray(saved.rows) ? saved.rows : [];
      let headers = Array.isArray(saved.headers) ? saved.headers : [];
      let statuses = saved.serverStatuses || {};
      let references = { ...cache };

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

      if (!rows.length) throw new Error('Nenhum atleta carregado. Configure o Google Sheets em Configurações > Dados.');

      const athletes = rows.map((row, sourceIndex) => {
        const athleteId = value(row, headers, ['ID', 'ID do atleta']);
        const name = value(row, headers, ['Nome completo do atleta', 'Nome completo', 'Nome']);
        return {
          athleteId,
          name,
          normalizedName: normalize(name),
          category: categoryOf(row, headers),
          birthDate: value(row, headers, ['Data de nascimento', 'Data nascimento']),
          status: statuses?.[athleteId] || '',
          reference: references?.[athleteId] || null,
          sourceIndex
        };
      }).filter(item => item.athleteId && item.name);

      datasetCache = { saved, rows, headers, statuses, references, athletes };
      return datasetCache;
    })();

    try {
      return await datasetPromise;
    } finally {
      datasetPromise = null;
    }
  }

  async function persistSelection(item) {
    const data = await loadDataset();
    const index = data.rows.findIndex(row => value(row, data.headers, ['ID', 'ID do atleta']) === item.athleteId);
    if (index < 0) throw new Error('Atleta não encontrado na cópia local dos dados.');
    const stored = await storageGet([STATE_KEY]);
    const saved = stored?.[STATE_KEY] || {};
    await storageSet({
      [STATE_KEY]: {
        ...saved,
        headers: data.headers,
        rows: data.rows,
        currentIndex: index,
        dataSource: 'sheets',
        serverStatuses: data.statuses || {},
        categoryFilter: '',
        availableCategories: [...new Set(data.athletes.map(a => a.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
        documentStatus: {},
        pendingRegistration: null
      }
    });
    selectedAthlete = item;
    renderSelectedAthlete();
    renderContextActions();
  }

  function currentAthleteFromSaved(data, saved) {
    const rows = Array.isArray(saved?.rows) ? saved.rows : [];
    const headers = Array.isArray(saved?.headers) ? saved.headers : [];
    const row = rows[Number(saved?.currentIndex) || 0];
    const id = row ? value(row, headers, ['ID', 'ID do atleta']) : '';
    return data.athletes.find(item => item.athleteId === id) || null;
  }

  async function acquireRoot() {
    const hasAthleteForm = Boolean(document.getElementById('Atleta'));
    if (hasAthleteForm) {
      for (let i = 0; i < 80; i++) {
        const existing = document.getElementById('ykl-root');
        if (existing) return existing;
        await sleep(100);
      }
      console.error('[Importador Yoka] O executor de cadastro não criou o painel; o shell não irá substituir o painel para evitar perda de funcionalidade.');
      return null;
    }

    const existing = document.getElementById('ykl-root');
    if (existing) return existing;
    const root = document.createElement('div');
    root.id = 'ykl-root';
    root.className = 'ykl-v150-standalone';
    root.innerHTML = `
      <div class="ykl-header">
        <div class="ykl-title">
          <div class="ykl-logo"><img id="ykl-logo-img" alt="Yoka"></div>
          <div class="ykl-title-text"><strong>Importador Yoka</strong><span>Liga Paulista · assistente operacional</span></div>
        </div>
        <button class="ykl-icon-btn" id="ykl-toggle" type="button" title="Recolher">−</button>
      </div>
      <div class="ykl-body"></div>`;
    document.body.appendChild(root);
    const image = $('#ykl-logo-img', root);
    if (image) image.src = chrome.runtime.getURL('icons/icon128.png');
    $('#ykl-toggle', root)?.addEventListener('click', () => {
      root.classList.toggle('ykl-collapsed');
      const button = $('#ykl-toggle', root);
      if (button) button.textContent = root.classList.contains('ykl-collapsed') ? '+' : '−';
    });
    return root;
  }

  function buildShell(root) {
    if ($('#ykl-v150-nav', root)) return;
    root.classList.add('ykl-v150-shell');
    const body = $('.ykl-body', root);
    if (!body) return;

    $('.ykl-tabs', body)?.classList.add('ykl-v150-legacy-tabs');

    const context = document.createElement('div');
    context.id = 'ykl-v150-context';
    context.className = 'ykl-v150-context';
    context.innerHTML = `<span>Página atual</span><strong>${escapeHtml(pageContext().label)}</strong>`;
    body.prepend(context);

    const nav = document.createElement('nav');
    nav.id = 'ykl-v150-nav';
    nav.className = 'ykl-v150-nav';
    nav.innerHTML = `
      <button type="button" data-v150-page="atletas">Atletas</button>
      <button type="button" data-v150-page="cadastro">Cadastro</button>
      <button type="button" data-v150-page="transferir">Transferir</button>
      <button type="button" data-v150-page="config">Config.</button>`;
    context.after(nav);

    const athletesPage = document.createElement('section');
    athletesPage.id = 'ykl-v150-page-atletas';
    athletesPage.className = 'ykl-v150-page';
    athletesPage.innerHTML = `
      <div class="ykl-card ykl-v150-search-card">
        <div class="ykl-v150-section-heading"><div><h3>Atletas</h3><span>Busque diretamente ou navegue por categoria.</span></div></div>
        <input id="ykl-v150-athlete-search" type="search" autocomplete="off" placeholder="Buscar atleta pelo nome">
        <div id="ykl-v150-athlete-search-status" class="ykl-muted" style="margin-top:5px"></div>
        <div id="ykl-v150-search-results" class="ykl-v150-athlete-list" hidden></div>
      </div>
      <div id="ykl-v150-selected" class="ykl-card" hidden></div>
      <div id="ykl-v150-category-view">
        <div class="ykl-v150-section-heading"><div><h3>Categorias</h3><span id="ykl-v150-athlete-total"></span></div></div>
        <div id="ykl-v150-category-grid" class="ykl-v150-category-grid"></div>
      </div>
      <div id="ykl-v150-category-detail" hidden>
        <div class="ykl-v150-detail-header">
          <button id="ykl-v150-category-back" class="ykl-btn" type="button">← Categorias</button>
          <div><strong id="ykl-v150-category-title"></strong><span id="ykl-v150-category-count" class="ykl-muted"></span></div>
        </div>
        <div id="ykl-v150-category-athletes" class="ykl-v150-athlete-list"></div>
      </div>
      <div class="ykl-card ykl-v150-sync-card">
        <div class="ykl-v150-section-heading"><div><h3>Registros da Liga</h3><span>IDs usados para abrir diretamente a edição do atleta.</span></div></div>
        <div id="ykl-v150-sync-host"></div>
        <button id="ykl-v150-open-index" type="button" class="ykl-btn ykl-full" ${pathIs('/atleta/index') ? 'hidden' : ''}>Abrir listagem para sincronizar</button>
      </div>`;
    nav.after(athletesPage);

    const transferPage = document.createElement('section');
    transferPage.id = 'ykl-v150-page-transferir';
    transferPage.className = 'ykl-v150-page';
    transferPage.innerHTML = pathIs('/bid/create')
      ? '<div id="ykl-app-transfer-host"></div>'
      : '<div id="ykl-v150-transfer-placeholder"></div>';
    athletesPage.after(transferPage);

    const configPage = document.createElement('section');
    configPage.id = 'ykl-v150-page-config';
    configPage.className = 'ykl-v150-page';
    configPage.innerHTML = '<div id="ykl-v150-config-host"></div>';
    transferPage.after(configPage);

    const legacyCadastro = $('.ykl-section[data-section="cadastro"]', body);
    const legacyMapping = $('.ykl-section[data-section="mapeamento"]', body);
    const legacyData = $('.ykl-section[data-section="dados"]', body);
    legacyCadastro?.classList.add('ykl-v150-legacy-cadastro');
    legacyMapping?.classList.add('ykl-v150-legacy-config');
    legacyData?.classList.add('ykl-v150-legacy-config');

    if (!legacyCadastro) {
      const cadastroPlaceholder = document.createElement('section');
      cadastroPlaceholder.id = 'ykl-v150-page-cadastro';
      cadastroPlaceholder.className = 'ykl-v150-page';
      configPage.after(cadastroPlaceholder);
    }

    $$('#ykl-v150-nav button', root).forEach(button => {
      button.addEventListener('click', () => switchPage(button.dataset.v150Page));
    });

    $('#ykl-v150-open-index', root)?.addEventListener('click', () => { location.href = ROUTES.index; });
    $('#ykl-v150-category-back', root)?.addEventListener('click', () => showCategoryOverview());

    const search = $('#ykl-v150-athlete-search', root);
    search?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderGlobalSearch, 170);
    });

    renderContextActions();
  }

  function allNavigableContainers(root) {
    return [
      $('#ykl-v150-page-atletas', root),
      $('#ykl-v150-page-transferir', root),
      $('#ykl-v150-page-config', root),
      $('#ykl-v150-page-cadastro', root),
      $('.ykl-v150-legacy-cadastro', root)
    ].filter(Boolean);
  }

  function switchPage(page) {
    const root = document.getElementById('ykl-root');
    if (!root) return;
    activePage = page;
    $$('#ykl-v150-nav button', root).forEach(button => button.classList.toggle('active', button.dataset.v150Page === page));
    allNavigableContainers(root).forEach(element => {
      const isLegacyCadastro = element.classList.contains('ykl-v150-legacy-cadastro');
      const target = isLegacyCadastro ? 'cadastro' : element.id.replace('ykl-v150-page-', '');
      const active = target === page;
      element.hidden = !active;
      if (isLegacyCadastro) element.classList.toggle('active', active);
    });
    $$('.ykl-v150-legacy-config', root).forEach(element => {
      element.hidden = true;
      element.classList.remove('active');
    });
    if (page === 'atletas') renderAthletes();
    if (page === 'cadastro') renderContextActions();
    if (page === 'transferir') renderContextActions();
  }

  function athleteMeta(item) {
    const league = item.reference?.bigmidiaId ? `Liga #${item.reference.bigmidiaId}` : 'Sem registro na Liga';
    const status = item.status ? ` · ${item.status}` : '';
    return `${item.category} · ${league}${status}`;
  }

  function athleteButton(item) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ykl-v150-athlete-row';
    button.innerHTML = `<strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(athleteMeta(item))}</span>`;
    button.addEventListener('click', async () => {
      try {
        await persistSelection(item);
      } catch (error) {
        setSearchStatus(error.message || String(error), true);
      }
    });
    return button;
  }

  function renderSelectedAthlete() {
    const host = $('#ykl-v150-selected');
    if (!host) return;
    if (!selectedAthlete) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    const ref = selectedAthlete.reference?.bigmidiaId;
    host.hidden = false;
    host.innerHTML = `
      <div class="ykl-v150-selected-label">Atleta selecionado</div>
      <div class="ykl-athlete">${escapeHtml(selectedAthlete.name)}</div>
      <div class="ykl-muted">${escapeHtml(athleteMeta(selectedAthlete))}</div>
      <div class="ykl-v150-selected-actions">
        <button id="ykl-v150-primary-athlete" type="button" class="ykl-btn ykl-blue">${ref ? 'Editar na Liga' : 'Cadastrar na Liga'}</button>
        <button id="ykl-v150-transfer-athlete" type="button" class="ykl-btn">Transferir</button>
      </div>`;
    $('#ykl-v150-primary-athlete', host)?.addEventListener('click', async () => {
      await persistSelection(selectedAthlete);
      location.href = ref ? `${ORIGIN}/atleta/update?id=${encodeURIComponent(ref)}` : ROUTES.create;
    });
    $('#ykl-v150-transfer-athlete', host)?.addEventListener('click', async () => {
      await persistSelection(selectedAthlete);
      location.href = ROUTES.transfer;
    });
  }

  function setSearchStatus(message, error = false) {
    const element = $('#ykl-v150-athlete-search-status');
    if (!element) return;
    element.textContent = message || '';
    element.classList.toggle('ykl-v150-error', error);
  }

  async function renderGlobalSearch() {
    const input = $('#ykl-v150-athlete-search');
    const box = $('#ykl-v150-search-results');
    if (!input || !box) return;
    const query = normalize(input.value);
    box.innerHTML = '';
    box.hidden = true;
    if (query.length < 2) {
      setSearchStatus('');
      return;
    }
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
      if (!matches.length) {
        setSearchStatus('Nenhum atleta encontrado.');
        return;
      }
      matches.forEach(item => box.appendChild(athleteButton(item)));
      box.hidden = false;
      setSearchStatus(`${matches.length} resultado(s).`);
    } catch (error) {
      setSearchStatus(error.message || String(error), true);
    }
  }

  function categoryStats(athletes) {
    const groups = new Map();
    for (const athlete of athletes) {
      if (!groups.has(athlete.category)) groups.set(athlete.category, []);
      groups.get(athlete.category).push(athlete);
    }
    return [...groups.entries()].map(([name, items]) => ({
      name,
      items: items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      registered: items.filter(item => item.reference?.bigmidiaId).length
    })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  }

  function showCategoryOverview() {
    currentCategory = '';
    const overview = $('#ykl-v150-category-view');
    const detail = $('#ykl-v150-category-detail');
    if (overview) overview.hidden = false;
    if (detail) detail.hidden = true;
  }

  async function openCategory(category) {
    const data = await loadDataset();
    const items = data.athletes.filter(item => item.category === category).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    currentCategory = category;
    $('#ykl-v150-category-view').hidden = true;
    $('#ykl-v150-category-detail').hidden = false;
    $('#ykl-v150-category-title').textContent = category;
    $('#ykl-v150-category-count').textContent = `${items.length} atleta(s)`;
    const list = $('#ykl-v150-category-athletes');
    list.innerHTML = '';
    items.forEach(item => list.appendChild(athleteButton(item)));
  }

  async function renderAthletes(force = false) {
    try {
      const data = await loadDataset(force);
      const stored = await storageGet([STATE_KEY]);
      const fromState = currentAthleteFromSaved(data, stored?.[STATE_KEY] || {});
      if (!selectedAthlete || !data.athletes.some(item => item.athleteId === selectedAthlete.athleteId)) selectedAthlete = fromState;
      else selectedAthlete = data.athletes.find(item => item.athleteId === selectedAthlete.athleteId) || selectedAthlete;
      renderSelectedAthlete();

      const groups = categoryStats(data.athletes);
      const total = $('#ykl-v150-athlete-total');
      if (total) total.textContent = `${data.athletes.length} atletas · ${groups.length} categorias`;
      const grid = $('#ykl-v150-category-grid');
      if (grid) {
        grid.innerHTML = '';
        groups.forEach(group => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'ykl-v150-category-card';
          button.innerHTML = `<strong>${escapeHtml(group.name)}</strong><span>${group.items.length} atletas</span><small>${group.registered} com registro na Liga</small>`;
          button.addEventListener('click', () => openCategory(group.name));
          grid.appendChild(button);
        });
      }
      if (currentCategory) await openCategory(currentCategory);
    } catch (error) {
      const grid = $('#ykl-v150-category-grid');
      if (grid) grid.innerHTML = `<div class="ykl-note">${escapeHtml(error.message || String(error))}</div>`;
    }
  }

  function renderContextActions() {
    const cadastro = $('#ykl-v150-page-cadastro');
    if (cadastro) {
      const ref = selectedAthlete?.reference?.bigmidiaId;
      cadastro.innerHTML = `
        <div class="ykl-card">
          <h3>Cadastro de atleta</h3>
          ${selectedAthlete
            ? `<div class="ykl-athlete">${escapeHtml(selectedAthlete.name)}</div><div class="ykl-muted">${escapeHtml(athleteMeta(selectedAthlete))}</div>`
            : '<div class="ykl-muted">Selecione um atleta na aba Atletas para abrir um cadastro ou uma edição.</div>'}
          <button id="ykl-v150-open-cadastro" type="button" class="ykl-btn ykl-blue ykl-full" style="margin-top:8px" ${selectedAthlete ? '' : 'disabled'}>${ref ? 'Abrir edição na Liga' : 'Abrir novo cadastro'}</button>
        </div>`;
      $('#ykl-v150-open-cadastro', cadastro)?.addEventListener('click', async () => {
        if (!selectedAthlete) return;
        await persistSelection(selectedAthlete);
        location.href = ref ? `${ORIGIN}/atleta/update?id=${encodeURIComponent(ref)}` : ROUTES.create;
      });
    }

    const transfer = $('#ykl-v150-transfer-placeholder');
    if (transfer) {
      transfer.innerHTML = `
        <div class="ykl-card">
          <h3>Transferência</h3>
          ${selectedAthlete
            ? `<div class="ykl-athlete">${escapeHtml(selectedAthlete.name)}</div><div class="ykl-muted">${escapeHtml(athleteMeta(selectedAthlete))}</div>`
            : '<div class="ykl-muted">Selecione um atleta na aba Atletas antes de iniciar uma transferência.</div>'}
          <button id="ykl-v150-open-transfer" type="button" class="ykl-btn ykl-blue ykl-full" style="margin-top:8px" ${selectedAthlete ? '' : 'disabled'}>Abrir transferência</button>
        </div>`;
      $('#ykl-v150-open-transfer', transfer)?.addEventListener('click', async () => {
        if (!selectedAthlete) return;
        await persistSelection(selectedAthlete);
        location.href = ROUTES.transfer;
      });
    }
  }

  function embedSyncPanel() {
    const host = $('#ykl-v150-sync-host');
    if (!host) return;
    const panel = $('#ykl-v149-sync-registry') || $('#ykl-v149-registry');
    if (!panel || host.contains(panel)) return;
    host.appendChild(panel);
    panel.classList.add('ykl-v150-embedded-sync');
    panel.style.position = 'static';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.width = '100%';
    panel.style.padding = '0';
    panel.style.margin = '0';
    panel.style.border = '0';
    panel.style.borderRadius = '0';
    panel.style.boxShadow = 'none';
    panel.style.background = 'transparent';
  }

  async function init() {
    const root = await acquireRoot();
    if (!root) return;
    buildShell(root);

    try {
      const data = await loadDataset();
      const stored = await storageGet([STATE_KEY]);
      selectedAthlete = currentAthleteFromSaved(data, stored?.[STATE_KEY] || {});
    } catch { /* configuração pode existir sem atletas carregados */ }

    renderSelectedAthlete();
    renderContextActions();
    switchPage(pageContext().page);
    embedSyncPanel();

    const observer = new MutationObserver(() => embedSyncPanel());
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[STATE_KEY] || changes[CACHE_KEY]) {
        datasetCache = null;
        renderAthletes(true).catch(() => {});
      }
    });
  }

  init();
})();
