(() => {
  'use strict';

  const STATE_KEY = 'yklStateV2';
  const CACHE_KEY = 'yklLeagueReferencesV149';
  const AUDIT_KEY = 'yklLpfAuditV150';
  const UI_KEY = 'yklUiV150';
  const ORIGIN = 'https://ligapaulistafutsal.bigmidia.com';
  const GROUPS = [
    { id: 'kids', label: 'KIDS', categories: ['Sub-7', 'Sub-8', 'Sub-9', 'Sub-10'] },
    { id: 'junior', label: 'JUNIOR', categories: ['Sub-11', 'Sub-13', 'Sub-15', 'Sub-17'] }
  ];
  const FIELDS = [
    { key: 'photo', label: 'Foto' },
    { key: 'rg', label: 'RG' },
    { key: 'medical', label: 'Atestado' },
    { key: 'authorization', label: 'Autorização' }
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const get = keys => new Promise(resolve => chrome.storage.local.get(keys, resolve));
  const set = values => new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });

  let datasetCache = null;
  let observer = null;

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
    const stored = await get([STATE_KEY, CACHE_KEY]);
    const saved = stored?.[STATE_KEY] || {};
    const cachedReferences = stored?.[CACHE_KEY] || {};
    let rows = Array.isArray(saved.rows) ? saved.rows : [];
    let headers = Array.isArray(saved.headers) ? saved.headers : [];
    let statuses = saved.serverStatuses || {};
    let references = { ...cachedReferences };

    if (saved.apiUrl && saved.apiToken) {
      try {
        const data = await api(saved, 'listAthletes', {});
        rows = Array.isArray(data?.athletes) && data.athletes.length ? data.athletes : rows;
        headers = Array.isArray(data?.headers) && data.headers.length ? data.headers : (rows.length ? Object.keys(rows[0]) : headers);
        statuses = data?.statuses || statuses;
        references = { ...references, ...(data?.references || {}) };
      } catch (error) {
        if (!rows.length) throw error;
      }
    }

    const athletes = rows.map((row, sourceIndex) => {
      const athleteId = value(row, headers, ['ID', 'ID do atleta']);
      const name = value(row, headers, ['Nome completo do atleta', 'Nome completo', 'Nome']);
      return {
        athleteId,
        name,
        category: categoryOf(row, headers),
        reference: references?.[athleteId] || null,
        status: statuses?.[athleteId] || '',
        sourceIndex
      };
    }).filter(item => item.athleteId && item.name);

    datasetCache = { saved, rows, headers, statuses, references, athletes };
    return datasetCache;
  }

  async function getAudit() {
    const audit = (await get([AUDIT_KEY]))?.[AUDIT_KEY];
    return audit && typeof audit === 'object'
      ? { version: 1, results: {}, session: null, ...audit, results: audit.results || {} }
      : { version: 1, results: {}, session: null };
  }

  async function saveAudit(audit) {
    await set({ [AUDIT_KEY]: audit });
    return audit;
  }

  async function saveUiCategory(category) {
    const stored = await get([UI_KEY]);
    const current = stored?.[UI_KEY] || {};
    await set({ [UI_KEY]: { ...current, athleteCategory: category || '' } });
  }

  async function selectAthlete(item, data) {
    const stored = await get([STATE_KEY]);
    const saved = stored?.[STATE_KEY] || {};
    const index = data.rows.findIndex(row => value(row, data.headers, ['ID', 'ID do atleta']) === item.athleteId);
    if (index < 0) throw new Error('Atleta não encontrado na cópia local dos dados.');
    await set({
      [STATE_KEY]: {
        ...saved,
        headers: data.headers,
        rows: data.rows,
        currentIndex: index,
        dataSource: 'sheets',
        serverStatuses: data.statuses || {},
        categoryFilter: '',
        pendingRegistration: null
      }
    });
  }

  function editUrl(item) {
    const id = item?.reference?.bigmidiaId;
    return id ? `${ORIGIN}/atleta/update?id=${encodeURIComponent(id)}` : '';
  }

  function currentBigMidiaId() {
    if (!pathIs('/atleta/update')) return '';
    try {
      const id = new URL(location.href).searchParams.get('id') || '';
      return /^\d+$/.test(id) ? id : '';
    } catch {
      return '';
    }
  }

  function categoryFromDetail() {
    return String($('#ykl-v150-category-title')?.textContent || '').trim();
  }

  function resultComplete(result) {
    return Boolean(result && FIELDS.every(field => ['ok', 'issue'].includes(result[field.key])));
  }

  function resultAllOk(result) {
    return Boolean(resultComplete(result) && FIELDS.every(field => result[field.key] === 'ok'));
  }

  function detectCreatedDate() {
    const root = document.querySelector('body');
    const text = String(root?.innerText || '');
    const match = text.match(/Criado\s+em\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
    return match ? match[1] : '';
  }

  function groupForCategory(category) {
    return GROUPS.find(group => group.categories.includes(category)) || null;
  }

  function athletesForCategory(data, category) {
    return data.athletes
      .filter(item => item.category === category)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  function eligibleForAudit(item) {
    return Boolean(item.reference?.bigmidiaId);
  }

  async function startCategoryAudit(category) {
    const data = await loadDataset(true);
    const all = athletesForCategory(data, category);
    const eligible = all.filter(eligibleForAudit);
    if (!eligible.length) throw new Error('Nenhum atleta desta categoria possui registro sincronizado na Liga.');

    const audit = await getAudit();
    const firstIncomplete = eligible.findIndex(item => !resultComplete(audit.results[item.athleteId]));
    const currentIndex = firstIncomplete >= 0 ? firstIncomplete : 0;
    audit.session = {
      active: true,
      category,
      athleteIds: eligible.map(item => item.athleteId),
      currentIndex,
      startedAt: Date.now()
    };
    await saveUiCategory(category);
    await saveAudit(audit);
    const current = eligible[currentIndex];
    await selectAthlete(current, data);
    location.href = editUrl(current);
  }

  async function resumeCategoryAudit() {
    const audit = await getAudit();
    const session = audit.session;
    if (!session?.active || !Array.isArray(session.athleteIds) || !session.athleteIds.length) return;
    const data = await loadDataset(true);
    const index = Math.max(0, Math.min(Number(session.currentIndex) || 0, session.athleteIds.length - 1));
    const current = data.athletes.find(item => item.athleteId === session.athleteIds[index]);
    if (!current?.reference?.bigmidiaId) throw new Error('O atleta atual da conferência não possui registro na Liga.');
    await selectAthlete(current, data);
    location.href = editUrl(current);
  }

  async function currentContext() {
    const audit = await getAudit();
    const session = audit.session;
    if (!session?.active || !pathIs('/atleta/update')) return null;
    const data = await loadDataset();
    const index = Number(session.currentIndex) || 0;
    const athleteId = session.athleteIds?.[index];
    const item = data.athletes.find(a => a.athleteId === athleteId);
    if (!item || String(item.reference?.bigmidiaId || '') !== currentBigMidiaId()) {
      return { audit, session, data, item: null, index };
    }
    return { audit, session, data, item, index };
  }

  async function saveCurrentResult(context, nextResult) {
    const { audit, item } = context;
    if (!item) return;
    audit.results[item.athleteId] = {
      athleteId: item.athleteId,
      bigmidiaId: String(item.reference?.bigmidiaId || ''),
      name: item.name,
      category: item.category,
      registrationDate: nextResult.registrationDate || detectCreatedDate() || '',
      photo: nextResult.photo || '',
      rg: nextResult.rg || '',
      medical: nextResult.medical || '',
      authorization: nextResult.authorization || '',
      checkedAt: Date.now()
    };
    await saveAudit(audit);
  }

  async function moveSession(context, delta, markSkip = false) {
    const { audit, session, data, item } = context;
    if (markSkip && item) {
      const current = audit.results[item.athleteId] || {};
      audit.results[item.athleteId] = { ...current, athleteId: item.athleteId, name: item.name, category: item.category, skippedAt: Date.now() };
    }
    const nextIndex = Number(session.currentIndex || 0) + delta;
    if (nextIndex < 0) return;
    if (nextIndex >= session.athleteIds.length) {
      session.active = false;
      session.finishedAt = Date.now();
      audit.session = session;
      await saveAudit(audit);
      await saveUiCategory(session.category);
      location.href = `${ORIGIN}/atleta/index`;
      return;
    }
    session.currentIndex = nextIndex;
    audit.session = session;
    await saveAudit(audit);
    const next = data.athletes.find(a => a.athleteId === session.athleteIds[nextIndex]);
    if (!next?.reference?.bigmidiaId) throw new Error('O próximo atleta não possui registro na Liga.');
    await selectAthlete(next, data);
    location.href = editUrl(next);
  }

  function clickDocumentsShortcut() {
    const button = $$('#ykl-root button').find(btn => normalize(btn.textContent).includes('ir para a secao de documentos'));
    if (button) {
      button.click();
      return true;
    }
    const candidates = $$('h1,h2,h3,h4,.card-title,.portlet-title,strong,label');
    const target = candidates.find(el => normalize(el.textContent).includes('document'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return true;
    }
    return false;
  }

  function statusButton(fieldKey, status, label, current) {
    const active = current === status ? ' is-active' : '';
    return `<button type="button" class="ykl-lpf-status${active}" data-lpf-field="${fieldKey}" data-lpf-status="${status}">${label}</button>`;
  }

  async function renderUpdateCard() {
    if (!pathIs('/atleta/update')) return;
    const context = await currentContext();
    let card = $('#ykl-lpf-audit-card');
    if (!context?.session?.active) {
      card?.remove();
      return;
    }

    const section = $('.ykl-section[data-section="cadastro"]');
    const firstCard = section?.querySelector('.ykl-card');
    if (!section || !firstCard) return;
    if (!card) {
      card = document.createElement('div');
      card.id = 'ykl-lpf-audit-card';
      card.className = 'ykl-card ykl-lpf-audit-card';
      firstCard.after(card);
    }

    if (!context.item) {
      card.innerHTML = `
        <div class="ykl-lpf-title"><strong>Conferência LPF ativa</strong><span>${escapeHtml(context.session.category)}</span></div>
        <div class="ykl-note">Esta página não corresponde ao atleta atual da conferência.</div>
        <button id="ykl-lpf-resume" class="ykl-btn ykl-blue ykl-full" type="button">Retomar conferência</button>`;
      $('#ykl-lpf-resume', card)?.addEventListener('click', () => resumeCategoryAudit());
      return;
    }

    const existing = context.audit.results[context.item.athleteId] || {};
    const registrationDate = existing.registrationDate || detectCreatedDate();
    const position = context.index + 1;
    const total = context.session.athleteIds.length;
    const complete = resultComplete(existing);
    const signature = JSON.stringify({
      athleteId: context.item.athleteId,
      position,
      registrationDate,
      photo: existing.photo || '',
      rg: existing.rg || '',
      medical: existing.medical || '',
      authorization: existing.authorization || ''
    });
    if (card.dataset.signature === signature) return;
    card.dataset.signature = signature;

    card.innerHTML = `
      <div class="ykl-lpf-title">
        <strong>Conferência LPF · ${escapeHtml(context.session.category)}</strong>
        <span>${position} de ${total}</span>
      </div>
      <div class="ykl-lpf-athlete">${escapeHtml(context.item.name)}</div>
      <div class="ykl-lpf-date">Data cadastro: <strong>${escapeHtml(registrationDate || 'não detectada')}</strong></div>
      <div class="ykl-lpf-fields">
        ${FIELDS.map(field => `
          <div class="ykl-lpf-field-row">
            <strong>${field.label}</strong>
            <div class="ykl-lpf-segmented">
              ${statusButton(field.key, 'ok', 'OK', existing[field.key])}
              ${statusButton(field.key, 'issue', 'Pendência', existing[field.key])}
            </div>
          </div>`).join('')}
      </div>
      <div class="ykl-lpf-tools">
        <button id="ykl-lpf-documents" class="ykl-btn" type="button">Ir para documentos</button>
        <button id="ykl-lpf-all-ok" class="ykl-btn ykl-blue" type="button">Tudo OK</button>
      </div>
      <div id="ykl-lpf-message" class="ykl-muted">${complete ? (resultAllOk(existing) ? 'Tudo conferido e OK.' : 'Conferência concluída com pendência(s).') : 'Marque os quatro itens antes de avançar.'}</div>
      <div class="ykl-lpf-primary">
        <button id="ykl-lpf-save-next" class="ykl-btn ykl-green ykl-full" type="button" ${complete ? '' : 'disabled'}>Salvar conferência e próximo</button>
      </div>
      <div class="ykl-lpf-nav">
        <button id="ykl-lpf-prev" class="ykl-btn" type="button" ${context.index <= 0 ? 'disabled' : ''}>← Anterior</button>
        <button id="ykl-lpf-skip" class="ykl-btn" type="button">Pular</button>
        <button id="ykl-lpf-stop" class="ykl-btn" type="button">Encerrar</button>
      </div>`;

    card.querySelectorAll('[data-lpf-field]').forEach(button => {
      button.addEventListener('click', async () => {
        const field = button.dataset.lpfField;
        const status = button.dataset.lpfStatus;
        const current = context.audit.results[context.item.athleteId] || {};
        await saveCurrentResult(context, { ...current, registrationDate, [field]: status });
        card.dataset.signature = '';
        renderUpdateCard();
      });
    });

    $('#ykl-lpf-documents', card)?.addEventListener('click', () => {
      if (!clickDocumentsShortcut()) {
        const message = $('#ykl-lpf-message', card);
        if (message) message.textContent = 'Não encontrei automaticamente a seção de documentos nesta página.';
      }
    });

    $('#ykl-lpf-all-ok', card)?.addEventListener('click', async () => {
      await saveCurrentResult(context, {
        registrationDate,
        photo: 'ok', rg: 'ok', medical: 'ok', authorization: 'ok'
      });
      card.dataset.signature = '';
      renderUpdateCard();
    });

    $('#ykl-lpf-save-next', card)?.addEventListener('click', async () => {
      const latestAudit = await getAudit();
      const latest = latestAudit.results[context.item.athleteId] || {};
      if (!resultComplete(latest)) return;
      await moveSession({ ...context, audit: latestAudit }, 1, false);
    });
    $('#ykl-lpf-prev', card)?.addEventListener('click', () => moveSession(context, -1, false));
    $('#ykl-lpf-skip', card)?.addEventListener('click', () => moveSession(context, 1, true));
    $('#ykl-lpf-stop', card)?.addEventListener('click', async () => {
      const audit = await getAudit();
      if (audit.session) {
        audit.session.active = false;
        audit.session.endedAt = Date.now();
      }
      await saveAudit(audit);
      await saveUiCategory(context.session.category);
      location.href = `${ORIGIN}/atleta/index`;
    });
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      return ok;
    }
  }

  function rowsForSpreadsheet(items, audit) {
    return items.map((item, index) => {
      const result = audit.results[item.athleteId] || {};
      return [
        index + 1,
        item.name,
        result.registrationDate || '',
        result.photo === 'ok' ? 'X' : '',
        result.rg === 'ok' ? 'X' : '',
        result.medical === 'ok' ? 'X' : '',
        result.authorization === 'ok' ? 'X' : ''
      ];
    });
  }

  async function copyCategoryToSpreadsheet(category, host) {
    const data = await loadDataset();
    const audit = await getAudit();
    const items = athletesForCategory(data, category).filter(eligibleForAudit);
    const ready = items.length && items.every(item => resultAllOk(audit.results[item.athleteId]) && audit.results[item.athleteId]?.registrationDate);
    if (!ready) throw new Error('A categoria ainda possui atleta não conferido, pendência ou data de cadastro não detectada.');
    const text = rowsForSpreadsheet(items, audit).map(row => row.join('\t')).join('\n');
    const copied = await copyText(text);
    if (!copied) throw new Error('Não foi possível copiar os dados para a área de transferência.');
    const message = host.querySelector('.ykl-lpf-index-message');
    if (message) message.textContent = `✓ ${items.length} linha(s) copiadas. Na planilha LPF, clique em B5 e cole.`;
  }

  async function copyGroupToSpreadsheet(group, host) {
    const data = await loadDataset();
    const audit = await getAudit();
    const items = data.athletes
      .filter(item => group.categories.includes(item.category) && eligibleForAudit(item))
      .sort((a, b) => {
        const cat = a.category.localeCompare(b.category, 'pt-BR', { numeric: true, sensitivity: 'base' });
        return cat || a.name.localeCompare(b.name, 'pt-BR');
      });
    const missingRegistration = data.athletes.filter(item => group.categories.includes(item.category) && !eligibleForAudit(item));
    if (missingRegistration.length) throw new Error(`${missingRegistration.length} atleta(s) do grupo ainda estão sem registro na Liga.`);
    const ready = items.length && items.every(item => resultAllOk(audit.results[item.athleteId]) && audit.results[item.athleteId]?.registrationDate);
    if (!ready) throw new Error(`O grupo ${group.label} ainda possui atleta não conferido, pendência ou data de cadastro não detectada.`);
    const text = rowsForSpreadsheet(items, audit).map(row => row.join('\t')).join('\n');
    const copied = await copyText(text);
    if (!copied) throw new Error('Não foi possível copiar os dados para a área de transferência.');
    const message = host.querySelector('.ykl-lpf-overview-message');
    if (message) message.textContent = `✓ ${items.length} linha(s) de ${group.label} copiadas. Na planilha LPF, clique em B5 e cole.`;
  }

  async function injectOverviewCard() {
    if (!pathIs('/atleta/index')) return;
    const athletesPage = $('#ykl-v150-page-atletas');
    const categoryView = $('#ykl-v150-category-view');
    if (!athletesPage || !categoryView) return;
    let host = $('#ykl-lpf-overview');
    if (!host) {
      host = document.createElement('div');
      host.id = 'ykl-lpf-overview';
      host.className = 'ykl-card ykl-lpf-overview';
      categoryView.before(host);
    }
    const data = await loadDataset();
    const audit = await getAudit();
    host.innerHTML = `
      <div class="ykl-lpf-title"><strong>Conferência documental LPF</strong><span>Auditoria manual antes da planilha oficial</span></div>
      <div class="ykl-lpf-group-grid">
        ${GROUPS.map(group => {
          const items = data.athletes.filter(item => group.categories.includes(item.category));
          const registered = items.filter(eligibleForAudit);
          const checked = registered.filter(item => resultComplete(audit.results[item.athleteId])).length;
          const allOk = registered.filter(item => resultAllOk(audit.results[item.athleteId])).length;
          const missing = items.length - registered.length;
          const ready = items.length > 0 && missing === 0 && allOk === registered.length && registered.every(item => audit.results[item.athleteId]?.registrationDate);
          return `<div class="ykl-lpf-group-card">
            <strong>${group.label}</strong>
            <span>${checked}/${registered.length} conferidos · ${allOk} OK${missing ? ` · ${missing} sem registro` : ''}</span>
            <button type="button" class="ykl-btn" data-lpf-copy-group="${group.id}" ${ready ? '' : 'disabled'}>Copiar ${group.label} para planilha</button>
          </div>`;
        }).join('')}
      </div>
      <div class="ykl-muted ykl-lpf-overview-message">Entre em uma categoria abaixo para iniciar ou continuar a conferência.</div>`;
    host.querySelectorAll('[data-lpf-copy-group]').forEach(button => {
      button.addEventListener('click', async () => {
        const group = GROUPS.find(item => item.id === button.dataset.lpfCopyGroup);
        if (!group) return;
        try { await copyGroupToSpreadsheet(group, host); }
        catch (error) {
          const message = host.querySelector('.ykl-lpf-overview-message');
          if (message) message.textContent = error.message || String(error);
        }
      });
    });
  }

  async function injectCategoryCard() {
    if (!pathIs('/atleta/index')) return;
    const detail = $('#ykl-v150-category-detail');
    const header = detail?.querySelector('.ykl-v150-detail-header');
    const category = categoryFromDetail();
    if (!detail || detail.hidden || !header || !category) {
      $('#ykl-lpf-index-card')?.remove();
      return;
    }
    let host = $('#ykl-lpf-index-card');
    if (!host) {
      host = document.createElement('div');
      host.id = 'ykl-lpf-index-card';
      host.className = 'ykl-card ykl-lpf-index-card';
      header.after(host);
    }

    const data = await loadDataset();
    const audit = await getAudit();
    const all = athletesForCategory(data, category);
    const registered = all.filter(eligibleForAudit);
    const checked = registered.filter(item => resultComplete(audit.results[item.athleteId])).length;
    const allOk = registered.filter(item => resultAllOk(audit.results[item.athleteId])).length;
    const issues = registered.filter(item => resultComplete(audit.results[item.athleteId]) && !resultAllOk(audit.results[item.athleteId])).length;
    const missing = all.length - registered.length;
    const sessionHere = Boolean(audit.session?.active && audit.session.category === category);
    const readyToCopy = registered.length > 0 && missing === 0 && allOk === registered.length && registered.every(item => audit.results[item.athleteId]?.registrationDate);
    host.innerHTML = `
      <div class="ykl-lpf-title"><strong>Conferência LPF</strong><span>${checked}/${registered.length} conferidos · ${allOk} OK${issues ? ` · ${issues} com pendência` : ''}${missing ? ` · ${missing} sem registro` : ''}</span></div>
      <div class="ykl-lpf-index-actions">
        <button id="ykl-lpf-start" class="ykl-btn ykl-blue" type="button" ${registered.length ? '' : 'disabled'}>${sessionHere ? `Retomar · ${(Number(audit.session.currentIndex) || 0) + 1}/${audit.session.athleteIds?.length || 0}` : (checked ? 'Continuar conferência' : 'Iniciar conferência')}</button>
        <button id="ykl-lpf-copy-category" class="ykl-btn" type="button" ${readyToCopy ? '' : 'disabled'}>Copiar para planilha LPF</button>
      </div>
      <div class="ykl-muted ykl-lpf-index-message">${readyToCopy ? 'Categoria pronta para copiar para a planilha oficial.' : 'A planilha só é liberada quando todos estiverem conferidos, sem pendências e com data de cadastro.'}</div>`;
    $('#ykl-lpf-start', host)?.addEventListener('click', async () => {
      try {
        if (sessionHere) await resumeCategoryAudit();
        else await startCategoryAudit(category);
      } catch (error) {
        const message = host.querySelector('.ykl-lpf-index-message');
        if (message) message.textContent = error.message || String(error);
      }
    });
    $('#ykl-lpf-copy-category', host)?.addEventListener('click', async () => {
      try { await copyCategoryToSpreadsheet(category, host); }
      catch (error) {
        const message = host.querySelector('.ykl-lpf-index-message');
        if (message) message.textContent = error.message || String(error);
      }
    });
  }

  async function restoreCategory() {
    if (!pathIs('/atleta/index')) return;
    const ui = (await get([UI_KEY]))?.[UI_KEY] || {};
    const category = String(ui.athleteCategory || '').trim();
    if (!category) return;
    for (let attempt = 0; attempt < 60; attempt++) {
      const detail = $('#ykl-v150-category-detail');
      if (detail && !detail.hidden && categoryFromDetail() === category) return;
      const card = $$('.ykl-v150-category-card').find(item => String(item.querySelector('strong')?.textContent || '').trim() === category);
      if (card) {
        card.click();
        await sleep(80);
        return;
      }
      await sleep(100);
    }
  }

  async function rememberCategory(event) {
    const card = event.target.closest('.ykl-v150-category-card');
    if (card) {
      const category = String(card.querySelector('strong')?.textContent || '').trim();
      if (category) await saveUiCategory(category);
      return;
    }
    if (event.target.closest('#ykl-v150-category-back')) await saveUiCategory('');
  }

  async function tickIndex() {
    await injectOverviewCard();
    await injectCategoryCard();
  }

  async function initIndex() {
    document.addEventListener('click', event => { rememberCategory(event).catch(() => {}); }, true);
    await restoreCategory();
    await tickIndex();
    observer = new MutationObserver(mutations => {
      if (mutations.every(m => m.target.closest?.('#ykl-lpf-overview,#ykl-lpf-index-card'))) return;
      clearTimeout(observer._timer);
      observer._timer = setTimeout(() => tickIndex().catch(() => {}), 100);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (changes[AUDIT_KEY] || changes[STATE_KEY] || changes[CACHE_KEY])) tickIndex().catch(() => {});
    });
  }

  async function initUpdate() {
    await renderUpdateCard();
    observer = new MutationObserver(mutations => {
      if (mutations.every(m => m.target.closest?.('#ykl-lpf-audit-card'))) return;
      clearTimeout(observer._timer);
      observer._timer = setTimeout(() => renderUpdateCard().catch(() => {}), 120);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[AUDIT_KEY]) renderUpdateCard().catch(() => {});
    });
  }

  if (pathIs('/atleta/index')) initIndex().catch(console.error);
  if (pathIs('/atleta/update')) initUpdate().catch(console.error);
})();