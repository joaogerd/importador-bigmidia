(() => {
  'use strict';

  const STATE_KEY = 'yklStateV2';
  const CATALOG_KEY = 'yklFieldCatalogV150';
  const CACHE_KEY = 'yklLeagueReferencesV149';
  const MIN_DELAY = 550;
  const DEFAULT_DELAY = 750;
  const ORIGIN = 'https://ligapaulistafutsal.bigmidia.com';
  const CREATE_URL = `${ORIGIN}/atleta/create`;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const storageGet = keys => new Promise(resolve => chrome.storage.local.get(keys, resolve));
  const storageSet = values => new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });

  const PRESET = {
    'atletadocumento-numero': ['CPF do atleta'],
    'atleta-data_nascimento-disp': ['Data de nascimento'],
    'atleta-nome_completo': ['Nome completo do atleta'],
    'atleta-telefone_celular': ['Telefone do atleta'],
    'atleta-id_posicao': ['Posição'],
    'atleta-nome_mae': ['Nome da mãe'],
    'atleta-nome_pai': ['Nome do pai'],
    'atleta-cidade_natu': ['Cidade de nascimento'],
    'atleta-email': ['E-mail principal para contato'],
    'atleta-nome_evento': ['Nome ou apelido na camisa'],
    'atleta-lado_dominante': ['Pé predominante'],
    'atletahistorico-id_estabelecimento': ['Equipe atual'],
    'atletaendereco-endereco-cep': ['CEP'],
    'atletaendereco-logradouro': ['Logradouro'],
    'atletaendereco-numero': ['Número do endereço'],
    'atletaendereco-complemento': ['Complemento'],
    'atletaendereco-bairro': ['Bairro'],
    'atletaendereco-city': ['Cidade do endereço'],
    'atletaendereco-state': ['Estado'],
    'atletaresponsavel-nome_completo': ['Gerado: nome do responsável principal'],
    'atletaresponsavel-cpf': ['Gerado: CPF do responsável principal'],
    'atletaresponsavel-telefone_celular': ['Gerado: telefone do responsável principal'],
    'atletaresponsavel-parentesco': ['Gerado: parentesco do responsável principal'],
    'atletaresponsavel-email': ['E-mail principal para contato']
  };

  let draftMapping = {};
  let savedState = {};
  let catalog = null;
  let activePane = 'mapeamento';

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
    Object.values(derived).forEach(header => { if (!outputHeaders.includes(header)) outputHeaders.push(header); });
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

  function api(action, payload = {}, override = {}) {
    const apiUrl = String(override.apiUrl ?? savedState.apiUrl ?? '').trim();
    const token = String(override.token ?? savedState.apiToken ?? '').trim();
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'ykl-api-request', apiUrl, token, action, payload }, response => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!response?.ok) return reject(new Error(response?.error || 'Falha na comunicação com o Yoka.'));
        resolve(response.data);
      });
    });
  }

  function setMessage(id, message, kind = '') {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = message || '';
    element.className = `ykl-muted ${kind === 'ok' ? 'ykl-v150-success' : kind === 'error' ? 'ykl-v150-error' : ''}`;
  }

  async function reloadLocalState() {
    const stored = await storageGet([STATE_KEY, CATALOG_KEY]);
    savedState = stored?.[STATE_KEY] || {};
    catalog = stored?.[CATALOG_KEY] || null;
    draftMapping = { ...(savedState.mapping || {}) };
  }

  function host() {
    return document.getElementById('ykl-v150-config-host');
  }

  function renderShell() {
    const root = host();
    if (!root || root.dataset.ready === '1') return false;
    root.dataset.ready = '1';
    root.innerHTML = `
      <div class="ykl-v150-config-nav">
        <button type="button" class="active" data-config-pane="mapeamento">Mapeamento</button>
        <button type="button" data-config-pane="dados">Dados</button>
        <button type="button" data-config-pane="preferencias">Preferências</button>
      </div>

      <section id="ykl-v150-config-mapeamento" class="ykl-v150-config-pane active">
        <div class="ykl-card">
          <div class="ykl-v150-section-heading"><div><h3>Mapeamento de campos</h3><span>Configuração persistente da extensão, independente da página atual.</span></div></div>
          <div id="ykl-v150-catalog-status" class="ykl-muted"></div>
          <div class="ykl-v150-toolbar">
            <input id="ykl-v150-map-search" type="search" placeholder="Buscar campo ou coluna">
            <button id="ykl-v150-auto-map" type="button" class="ykl-btn">Sugerir</button>
          </div>
          <div id="ykl-v150-map-groups" class="ykl-v150-map-groups"></div>
          <button id="ykl-v150-save-map" type="button" class="ykl-btn ykl-blue ykl-full">Salvar mapeamento</button>
          <div id="ykl-v150-map-status" class="ykl-muted" style="margin-top:6px"></div>
        </div>
        <div class="ykl-card">
          <div class="ykl-v150-section-heading"><div><h3>Mapeamento salvo</h3><span>O formulário da Liga usa um único esquema; por isso há um mapeamento ativo, não um por categoria.</span></div></div>
          <div class="ykl-row"><button id="ykl-v150-export-map" type="button" class="ykl-btn ykl-grow">Exportar</button><button id="ykl-v150-import-map" type="button" class="ykl-btn ykl-grow">Importar</button></div>
          <input id="ykl-v150-import-map-file" type="file" accept=".json,application/json" class="ykl-hidden">
        </div>
      </section>

      <section id="ykl-v150-config-dados" class="ykl-v150-config-pane">
        <div class="ykl-card">
          <div class="ykl-v150-section-heading"><div><h3>Google Sheets do Yoka</h3><span>Fonte principal dos atletas e documentos.</span></div></div>
          <label class="ykl-label" for="ykl-v150-api-url">URL da API</label>
          <input id="ykl-v150-api-url" type="text" placeholder="https://script.google.com/macros/s/.../exec">
          <label class="ykl-label" for="ykl-v150-api-token" style="margin-top:7px">Chave da API</label>
          <input id="ykl-v150-api-token" type="password" placeholder="Chave do Apps Script">
          <div class="ykl-row"><button id="ykl-v150-api-test" type="button" class="ykl-btn ykl-grow">Testar conexão</button><button id="ykl-v150-api-load" type="button" class="ykl-btn ykl-blue ykl-grow">Atualizar atletas</button></div>
          <div id="ykl-v150-api-status" class="ykl-muted"></div>
        </div>
        <div class="ykl-card">
          <div class="ykl-v150-section-heading"><div><h3>CSV de contingência</h3><span>Use somente se o Apps Script estiver indisponível.</span></div></div>
          <input id="ykl-v150-csv" type="file" accept=".csv,text/csv,text/plain">
          <div id="ykl-v150-csv-status" class="ykl-muted" style="margin-top:5px"></div>
        </div>
      </section>

      <section id="ykl-v150-config-preferencias" class="ykl-v150-config-pane">
        <div class="ykl-card">
          <div class="ykl-v150-section-heading"><div><h3>Comportamento</h3><span>Preferências locais deste Chrome.</span></div></div>
          <label class="ykl-label" for="ykl-v150-delay">Pausa por campo (ms)</label>
          <input id="ykl-v150-delay" type="number" min="550" max="3000" step="50">
          <div class="ykl-muted" style="margin-top:5px">Recomendado: 700–900 ms. O modo compacto é automático conforme o espaço disponível.</div>
        </div>
        <div class="ykl-card">
          <div class="ykl-v150-section-heading"><div><h3>Identidade visual</h3><span>O ícone oficial é usado por padrão.</span></div></div>
          <input id="ykl-v150-logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml">
          <button id="ykl-v150-logo-reset" type="button" class="ykl-btn ykl-full" style="margin-top:7px">Usar ícone padrão</button>
        </div>
        <details class="ykl-v150-danger-zone">
          <summary>Manutenção dos dados locais</summary>
          <div class="ykl-card" style="margin-top:7px">
            <div class="ykl-muted">Remove cache de atletas, mapeamento e preferências salvos neste Chrome. Não altera a planilha nem a Liga.</div>
            <button id="ykl-v150-clear-local" type="button" class="ykl-btn ykl-danger ykl-full" style="margin-top:8px">Apagar dados locais</button>
          </div>
        </details>
      </section>`;

    $$('.ykl-v150-config-nav button', root).forEach(button => button.addEventListener('click', () => switchPane(button.dataset.configPane)));
    $('#ykl-v150-map-search', root)?.addEventListener('input', renderMapping);
    $('#ykl-v150-auto-map', root)?.addEventListener('click', autoMapDraft);
    $('#ykl-v150-save-map', root)?.addEventListener('click', saveMapping);
    $('#ykl-v150-export-map', root)?.addEventListener('click', exportMapping);
    $('#ykl-v150-import-map', root)?.addEventListener('click', () => $('#ykl-v150-import-map-file', root)?.click());
    $('#ykl-v150-import-map-file', root)?.addEventListener('change', importMapping);
    $('#ykl-v150-api-test', root)?.addEventListener('click', testConnection);
    $('#ykl-v150-api-load', root)?.addEventListener('click', loadAthletes);
    $('#ykl-v150-api-url', root)?.addEventListener('change', saveApiInputs);
    $('#ykl-v150-api-token', root)?.addEventListener('change', saveApiInputs);
    $('#ykl-v150-csv', root)?.addEventListener('change', importCsv);
    $('#ykl-v150-delay', root)?.addEventListener('change', saveDelay);
    $('#ykl-v150-logo', root)?.addEventListener('change', saveLogo);
    $('#ykl-v150-logo-reset', root)?.addEventListener('click', resetLogo);
    $('#ykl-v150-clear-local', root)?.addEventListener('click', clearLocal);
    return true;
  }

  function switchPane(name) {
    activePane = name;
    const root = host();
    if (!root) return;
    $$('.ykl-v150-config-nav button', root).forEach(button => button.classList.toggle('active', button.dataset.configPane === name));
    $$('.ykl-v150-config-pane', root).forEach(section => section.classList.toggle('active', section.id === `ykl-v150-config-${name}`));
  }

  function isStreetType(field) {
    const id = normalize(field?.id);
    const label = normalize(field?.label);
    return id.includes('tipo logradouro') || id.includes('tipo lograd') || label === 'tipo logradouro' || label.includes('tipo de logradouro');
  }

  function suggestHeader(field, headers) {
    if (isStreetType(field)) return '';
    const preset = PRESET[field.id] || [];
    const presetMatch = findHeader(headers, preset);
    if (presetMatch) return presetMatch;
    if (field.id.startsWith('atletaresponsavel-')) return '';

    const stripped = field.id.replace(/^(atleta|atletaendereco|atletaresponsavel|atletadadosmedicos|atletamedida|atletabanco)-/, '').replace(/[_-]/g, ' ');
    const candidates = [field.label, field.id, stripped].map(normalize).filter(Boolean);
    const normalizedHeaders = headers.map(raw => ({ raw, n: normalize(raw) }));
    let match = normalizedHeaders.find(item => candidates.includes(item.n));
    if (!match) match = normalizedHeaders.find(item => candidates.some(candidate => candidate.length >= 5 && (item.n.includes(candidate) || candidate.includes(item.n))));
    return match?.raw || '';
  }

  function autoMapDraft() {
    const fields = Array.isArray(catalog?.fields) ? catalog.fields : [];
    const headers = Array.isArray(savedState.headers) ? savedState.headers : [];
    if (!fields.length || !headers.length) {
      setMessage('ykl-v150-map-status', 'É necessário ter o esquema da Liga e as colunas do Yoka carregados.', 'error');
      return;
    }
    for (const field of fields) {
      if (draftMapping[field.id] && headers.includes(draftMapping[field.id])) continue;
      const suggestion = suggestHeader(field, headers);
      if (suggestion) draftMapping[field.id] = suggestion;
    }
    renderMapping();
    setMessage('ykl-v150-map-status', 'Sugestões aplicadas. Revise e clique em Salvar mapeamento.');
  }

  function renderMapping() {
    const container = document.getElementById('ykl-v150-map-groups');
    if (!container) return;
    const fields = Array.isArray(catalog?.fields) ? catalog.fields : [];
    const headers = Array.isArray(savedState.headers) ? savedState.headers : [];
    const search = normalize(document.getElementById('ykl-v150-map-search')?.value || '');
    container.innerHTML = '';

    if (!fields.length) {
      const onForm = Boolean(document.getElementById('Atleta'));
      container.innerHTML = `<div class="ykl-note">O esquema dos campos da Liga ainda não foi capturado. Isso é necessário apenas uma vez para descobrir os IDs/labels do formulário. Depois disso, o mapeamento funciona em qualquer página.</div>${onForm ? '<button id="ykl-v150-recapture" class="ykl-btn ykl-blue ykl-full" type="button" style="margin-top:7px">Capturar esquema desta página</button>' : `<button id="ykl-v150-open-capture" class="ykl-btn ykl-full" type="button" style="margin-top:7px">Abrir cadastro para capturar esquema</button>`}`;
      document.getElementById('ykl-v150-recapture')?.addEventListener('click', () => location.reload());
      document.getElementById('ykl-v150-open-capture')?.addEventListener('click', () => { location.href = CREATE_URL; });
      return;
    }

    const grouped = new Map();
    fields.forEach(field => {
      const mapped = draftMapping[field.id] || '';
      const haystack = normalize(`${field.group} ${field.label} ${field.id} ${mapped}`);
      if (search && !haystack.includes(search)) return;
      const key = field.group || 'Outros';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(field);
    });

    let first = true;
    for (const [group, items] of grouped.entries()) {
      const details = document.createElement('details');
      details.className = 'ykl-v150-map-group';
      details.open = Boolean(search) || first;
      first = false;
      const mappedCount = items.filter(field => draftMapping[field.id]).length;
      details.innerHTML = `<summary><span>${escapeHtml(group)}</span><small>${mappedCount}/${items.length}</small></summary><div class="ykl-v150-map-group-body"></div>`;
      const body = $('.ykl-v150-map-group-body', details);
      items.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')).forEach(field => {
        const row = document.createElement('div');
        row.className = 'ykl-v150-map-row';
        const label = document.createElement('label');
        label.innerHTML = `<strong>${escapeHtml(field.label)}</strong><small>${escapeHtml(field.id)}</small>`;
        const select = document.createElement('select');
        select.innerHTML = `<option value="">— não preencher —</option>` + headers.map(header => `<option value="${escapeHtml(header)}" ${draftMapping[field.id] === header ? 'selected' : ''}>${escapeHtml(header)}</option>`).join('');
        select.addEventListener('change', () => {
          if (select.value) draftMapping[field.id] = select.value;
          else delete draftMapping[field.id];
          setMessage('ykl-v150-map-status', 'Alterações ainda não salvas.');
        });
        row.append(label, select);
        body.appendChild(row);
      });
      container.appendChild(details);
    }

    if (!grouped.size) container.innerHTML = '<div class="ykl-muted">Nenhum campo corresponde à busca.</div>';
  }

  async function syncLegacyMappingControls() {
    const legacy = document.getElementById('ykl-map-list');
    if (!legacy) return;
    $$('select[data-field-id]', legacy).forEach(select => {
      const wanted = draftMapping[select.dataset.fieldId] || '';
      if (select.value !== wanted) {
        select.value = wanted;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    document.getElementById('ykl-save-map')?.click();
  }

  async function saveMapping() {
    savedState = {
      ...savedState,
      mapping: { ...draftMapping },
      mappingSavedAt: Date.now(),
      mappingLocked: true
    };
    await storageSet({ [STATE_KEY]: savedState });
    await syncLegacyMappingControls();
    setMessage('ykl-v150-map-status', `Mapeamento salvo às ${new Date(savedState.mappingSavedAt).toLocaleTimeString('pt-BR')}.`, 'ok');
    renderCatalogStatus();
  }

  function exportMapping() {
    const payload = { version: 3, mapping: draftMapping, mappingLocked: true, delay: Number(savedState.delay || DEFAULT_DELAY) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mapeamento-liga-yoka.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importMapping(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data.mapping || typeof data.mapping !== 'object') throw new Error('Arquivo sem objeto mapping.');
      draftMapping = { ...data.mapping };
      if (data.delay) savedState.delay = Math.max(MIN_DELAY, Math.min(3000, Number(data.delay) || DEFAULT_DELAY));
      await saveMapping();
      renderMapping();
    } catch (error) {
      setMessage('ykl-v150-map-status', `Arquivo inválido: ${error.message}`, 'error');
    }
    event.target.value = '';
  }

  function renderCatalogStatus() {
    const element = document.getElementById('ykl-v150-catalog-status');
    if (!element) return;
    const fields = Array.isArray(catalog?.fields) ? catalog.fields : [];
    if (!fields.length) {
      element.textContent = 'Esquema da Liga ainda não capturado.';
      return;
    }
    const when = catalog.capturedAt ? new Date(catalog.capturedAt).toLocaleString('pt-BR') : 'data desconhecida';
    element.textContent = `${fields.length} campos conhecidos · esquema capturado em ${when}.`;
  }

  async function saveApiInputs() {
    savedState.apiUrl = String(document.getElementById('ykl-v150-api-url')?.value || '').trim();
    savedState.apiToken = String(document.getElementById('ykl-v150-api-token')?.value || '').trim();
    await storageSet({ [STATE_KEY]: savedState });
    const legacyUrl = document.getElementById('ykl-api-url');
    const legacyToken = document.getElementById('ykl-api-token');
    if (legacyUrl) { legacyUrl.value = savedState.apiUrl; legacyUrl.dispatchEvent(new Event('change', { bubbles: true })); }
    if (legacyToken) { legacyToken.value = savedState.apiToken; legacyToken.dispatchEvent(new Event('change', { bubbles: true })); }
  }

  async function testConnection() {
    await saveApiInputs();
    setMessage('ykl-v150-api-status', 'Testando conexão…');
    try {
      const result = await api('ping');
      setMessage('ykl-v150-api-status', `Conexão OK${result?.version ? ` · API ${result.version}` : ''}.`, 'ok');
    } catch (error) {
      setMessage('ykl-v150-api-status', error.message || String(error), 'error');
    }
  }

  function collectCategories(rows, headers) {
    const team = findHeader(headers, ['Equipe atual', 'Equipe']);
    const calculated = findHeader(headers, ['Categoria calculada', 'Categoria']);
    return [...new Set(rows.map(row => String((team && row[team]) || (calculated && row[calculated]) || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  }

  async function loadAthletes() {
    await saveApiInputs();
    setMessage('ykl-v150-api-status', 'Atualizando atletas…');
    try {
      const data = await api('listAthletes');
      const rows = Array.isArray(data?.athletes) ? data.athletes : [];
      if (!rows.length) throw new Error('Nenhum atleta retornado pela API.');
      const headers = Array.isArray(data?.headers) && data.headers.length ? data.headers : Object.keys(rows[0] || {});
      const enriched = addDerivedResponsibleColumns(headers, rows);
      savedState = {
        ...savedState,
        headers: enriched.headers,
        rows: enriched.rows,
        currentIndex: Math.min(Number(savedState.currentIndex) || 0, enriched.rows.length - 1),
        dataSource: 'sheets',
        serverStatuses: data?.statuses || {},
        availableCategories: collectCategories(enriched.rows, enriched.headers),
        categoryFilter: ''
      };
      const cache = (await storageGet([CACHE_KEY]))?.[CACHE_KEY] || {};
      const references = data?.references || {};
      await storageSet({ [STATE_KEY]: savedState, [CACHE_KEY]: { ...cache, ...references } });
      setMessage('ykl-v150-api-status', `${enriched.rows.length} atletas atualizados do Google Sheets.`, 'ok');
      draftMapping = { ...(savedState.mapping || {}) };
      renderMapping();
    } catch (error) {
      setMessage('ykl-v150-api-status', error.message || String(error), 'error');
    }
  }

  function parseCsv(text) {
    const firstLine = String(text || '').split(/\r?\n/).find(line => line.trim()) || '';
    const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];
      if (char === '"' && quoted && next === '"') { cell += '"'; i++; continue; }
      if (char === '"') { quoted = !quoted; continue; }
      if (char === delimiter && !quoted) { row.push(cell.trim()); cell = ''; continue; }
      if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && next === '\n') i++;
        row.push(cell.trim());
        if (row.some(value => value !== '')) rows.push(row);
        row = []; cell = ''; continue;
      }
      cell += char;
    }
    row.push(cell.trim());
    if (row.some(value => value !== '')) rows.push(row);
    if (rows.length < 2) return { headers: [], rows: [] };
    const headers = rows[0].map(header => header.replace(/^\uFEFF/, '').trim());
    return { headers, rows: rows.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))) };
  }

  async function importCsv(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = parseCsv(await file.text());
      if (!parsed.headers.length || !parsed.rows.length) throw new Error('CSV sem cabeçalho ou registros.');
      const enriched = addDerivedResponsibleColumns(parsed.headers, parsed.rows);
      savedState = {
        ...savedState,
        headers: enriched.headers,
        rows: enriched.rows,
        currentIndex: 0,
        dataSource: 'csv',
        serverStatuses: {},
        availableCategories: collectCategories(enriched.rows, enriched.headers),
        categoryFilter: ''
      };
      await storageSet({ [STATE_KEY]: savedState });
      setMessage('ykl-v150-csv-status', `${enriched.rows.length} atletas importados do CSV.`, 'ok');
      renderMapping();
    } catch (error) {
      setMessage('ykl-v150-csv-status', error.message || String(error), 'error');
    }
    event.target.value = '';
  }

  async function saveDelay() {
    const input = document.getElementById('ykl-v150-delay');
    const delay = Math.max(MIN_DELAY, Math.min(3000, Number(input?.value) || DEFAULT_DELAY));
    if (input) input.value = delay;
    savedState.delay = delay;
    await storageSet({ [STATE_KEY]: savedState });
    const legacy = document.getElementById('ykl-delay');
    if (legacy) { legacy.value = delay; legacy.dispatchEvent(new Event('change', { bubbles: true })); }
  }

  async function saveLogo(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Use uma imagem de até 2 MB.');
      event.target.value = '';
      return;
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    savedState.logoDataUrl = dataUrl;
    await storageSet({ [STATE_KEY]: savedState });
    const image = document.getElementById('ykl-logo-img');
    if (image) { image.src = dataUrl; image.hidden = false; }
    event.target.value = '';
  }

  async function resetLogo() {
    savedState.logoDataUrl = '';
    await storageSet({ [STATE_KEY]: savedState });
    const image = document.getElementById('ykl-logo-img');
    if (image) { image.src = chrome.runtime.getURL('icons/icon128.png'); image.hidden = false; }
  }

  async function clearLocal() {
    if (!confirm('Apagar os dados locais da extensão neste Chrome? A planilha e a Liga não serão alteradas.')) return;
    await new Promise(resolve => chrome.storage.local.remove([STATE_KEY, CATALOG_KEY, CACHE_KEY], resolve));
    location.reload();
  }

  function fillInputs() {
    const url = document.getElementById('ykl-v150-api-url');
    const token = document.getElementById('ykl-v150-api-token');
    const delay = document.getElementById('ykl-v150-delay');
    if (url) url.value = savedState.apiUrl || '';
    if (token) token.value = savedState.apiToken || '';
    if (delay) delay.value = Math.max(MIN_DELAY, Number(savedState.delay) || DEFAULT_DELAY);
    setMessage('ykl-v150-api-status', savedState.apiUrl && savedState.apiToken ? 'Configuração salva.' : 'API ainda não configurada.');
    renderCatalogStatus();
    if (savedState.mappingSavedAt) setMessage('ykl-v150-map-status', `Mapeamento salvo em ${new Date(savedState.mappingSavedAt).toLocaleString('pt-BR')}.`, 'ok');
  }

  async function render() {
    await reloadLocalState();
    if (!renderShell() && !host()) return false;
    fillInputs();
    renderMapping();
    switchPane(activePane);
    return true;
  }

  async function init() {
    for (let i = 0; i < 100; i++) {
      if (host()) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!host()) return;
    await render();
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[CATALOG_KEY]) {
        catalog = changes[CATALOG_KEY].newValue || null;
        renderCatalogStatus();
        renderMapping();
      }
    });
  }

  init();
})();
