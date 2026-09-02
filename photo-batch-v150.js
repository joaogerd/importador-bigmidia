(() => {
  'use strict';

  const STATE_KEY = 'yklStateV2';
  const CACHE_KEY = 'yklLeagueReferencesV149';
  const BATCH_KEY = 'yklPhotoBatchV150';
  const UI_KEY = 'yklUiV150';
  const ORIGIN = 'https://ligapaulistafutsal.bigmidia.com';
  const PHOTO_HEADERS = ['Link da foto do atleta', 'Link da foto', 'Foto do atleta'];
  const PENDING_MAX_AGE = 2 * 60 * 1000;

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
  let saveHooked = false;

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
        photoUrl: value(row, headers, PHOTO_HEADERS),
        reference: references?.[athleteId] || null,
        status: statuses?.[athleteId] || '',
        sourceIndex
      };
    }).filter(item => item.athleteId && item.name);

    datasetCache = { saved, rows, headers, statuses, references, athletes };
    return datasetCache;
  }

  async function getBatch() {
    return (await get([BATCH_KEY]))?.[BATCH_KEY] || null;
  }

  async function saveBatch(batch) {
    await set({ [BATCH_KEY]: batch });
    return batch;
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
    const availableCategories = [...new Set(data.athletes.map(a => a.category).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
    await set({
      [STATE_KEY]: {
        ...saved,
        headers: data.headers,
        rows: data.rows,
        currentIndex: index,
        dataSource: 'sheets',
        serverStatuses: data.statuses || {},
        categoryFilter: '',
        availableCategories,
        documentStatus: {},
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

  async function clearPendingRegistration() {
    const stored = await get([STATE_KEY]);
    const saved = stored?.[STATE_KEY] || {};
    if (!saved.pendingRegistration) return;
    await set({ [STATE_KEY]: { ...saved, pendingRegistration: null } });
  }

  function categoryFromDetail() {
    return String($('#ykl-v150-category-title')?.textContent || '').trim();
  }

  function eligibleForPhotos(item) {
    return Boolean(item.reference?.bigmidiaId && String(item.photoUrl || '').trim());
  }

  async function categoryInfo(category) {
    const data = await loadDataset();
    const all = data.athletes
      .filter(item => item.category === category)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const eligible = all.filter(eligibleForPhotos);
    return {
      data,
      all,
      eligible,
      missingLeague: all.filter(item => !item.reference?.bigmidiaId).length,
      missingPhoto: all.filter(item => item.reference?.bigmidiaId && !String(item.photoUrl || '').trim()).length
    };
  }

  async function startBatch(category) {
    const info = await categoryInfo(category);
    if (!info.eligible.length) throw new Error('Nenhum atleta desta categoria possui simultaneamente registro na Liga e foto no Drive.');
    const batch = {
      version: 1,
      active: true,
      category,
      athleteIds: info.eligible.map(item => item.athleteId),
      currentIndex: 0,
      completed: [],
      skipped: [],
      pendingAdvance: null,
      startedAt: Date.now(),
      lastSummary: null
    };
    await saveUiCategory(category);
    await saveBatch(batch);
    const first = info.eligible[0];
    await selectAthlete(first, info.data);
    location.href = editUrl(first);
  }

  async function resumeBatch(batch) {
    if (!batch?.active || !Array.isArray(batch.athleteIds) || !batch.athleteIds.length) return;
    const data = await loadDataset();
    const index = Math.max(0, Math.min(Number(batch.currentIndex) || 0, batch.athleteIds.length - 1));
    const item = data.athletes.find(a => a.athleteId === batch.athleteIds[index]);
    if (!item?.reference?.bigmidiaId) throw new Error('O próximo atleta da sessão não possui registro sincronizado na Liga.');
    await selectAthlete(item, data);
    location.href = editUrl(item);
  }

  async function injectCategoryControls() {
    if (!pathIs('/atleta/index')) return;
    const detail = $('#ykl-v150-category-detail');
    const header = detail?.querySelector('.ykl-v150-detail-header');
    const category = categoryFromDetail();
    if (!detail || detail.hidden || !header || !category) {
      $('#ykl-photo-batch-launch')?.remove();
      return;
    }

    let host = $('#ykl-photo-batch-launch');
    if (!host) {
      host = document.createElement('div');
      host.id = 'ykl-photo-batch-launch';
      host.className = 'ykl-photo-batch-launch';
      header.after(host);
    }

    try {
      const info = await categoryInfo(category);
      const batch = await getBatch();
      const activeHere = Boolean(batch?.active && batch.category === category);
      const exclusions = [];
      if (info.missingLeague) exclusions.push(`${info.missingLeague} sem registro`);
      if (info.missingPhoto) exclusions.push(`${info.missingPhoto} sem foto`);
      const signature = JSON.stringify({
        category,
        eligible: info.eligible.length,
        missingLeague: info.missingLeague,
        missingPhoto: info.missingPhoto,
        activeHere,
        batchIndex: activeHere ? Number(batch.currentIndex) || 0 : -1,
        batchTotal: activeHere ? batch.athleteIds?.length || 0 : 0
      });
      if (host.dataset.signature === signature) return;
      host.dataset.signature = signature;
      host.innerHTML = `
        <div>
          <strong>Atualização de fotos</strong>
          <span>${info.eligible.length} pronto(s) para sequência${exclusions.length ? ` · ${escapeHtml(exclusions.join(' · '))}` : ''}</span>
        </div>
        <div class="ykl-photo-batch-launch-actions">
          <button id="ykl-photo-batch-start" type="button" class="ykl-btn ykl-blue" ${info.eligible.length ? '' : 'disabled'}>${activeHere ? `Retomar fotos · ${(Number(batch.currentIndex) || 0) + 1}/${batch.athleteIds?.length || 0}` : 'Atualizar fotos em sequência'}</button>
          ${activeHere ? '<button id="ykl-photo-batch-stop-index" type="button" class="ykl-btn">Encerrar</button>' : ''}
        </div>`;
      $('#ykl-photo-batch-start', host)?.addEventListener('click', async () => {
        try {
          if (activeHere) await resumeBatch(batch);
          else await startBatch(category);
        } catch (error) {
          const span = host.querySelector('span');
          if (span) span.textContent = error.message || String(error);
        }
      });
      $('#ykl-photo-batch-stop-index', host)?.addEventListener('click', async () => {
        await saveBatch({ ...batch, active: false, pendingAdvance: null, endedAt: Date.now() });
        host.dataset.signature = '';
        injectCategoryControls();
      });
    } catch (error) {
      const signature = `error:${error.message || String(error)}`;
      if (host.dataset.signature === signature) return;
      host.dataset.signature = signature;
      host.innerHTML = `<div class="ykl-note">${escapeHtml(error.message || String(error))}</div>`;
    }
  }

  async function restoreCategory() {
    if (!pathIs('/atleta/index')) return;
    const ui = (await get([UI_KEY]))?.[UI_KEY] || {};
    const category = String(ui.athleteCategory || '').trim();
    if (!category) return;
    for (let attempt = 0; attempt < 60; attempt++) {
      const detail = $('#ykl-v150-category-detail');
      if (detail && !detail.hidden && categoryFromDetail() === category) return;
      const cards = $$('.ykl-v150-category-card');
      const target = cards.find(card => String(card.querySelector('strong')?.textContent || '').trim() === category);
      if (target) {
        target.click();
        await sleep(80);
        return;
      }
      await sleep(100);
    }
  }

  async function rememberCategoryFromClick(event) {
    const card = event.target.closest('.ykl-v150-category-card');
    if (card) {
      const category = String(card.querySelector('strong')?.textContent || '').trim();
      if (category) await saveUiCategory(category);
      setTimeout(() => injectCategoryControls(), 80);
      return;
    }
    if (event.target.closest('#ykl-v150-category-back')) {
      await saveUiCategory('');
      $('#ykl-photo-batch-launch')?.remove();
    }
  }

  async function markPendingAdvance() {
    const batch = await getBatch();
    if (!batch?.active) return;
    const data = await loadDataset();
    const athleteId = batch.athleteIds?.[Number(batch.currentIndex) || 0];
    const item = data.athletes.find(a => a.athleteId === athleteId);
    if (!item || String(item.reference?.bigmidiaId || '') !== currentBigMidiaId()) return;
    batch.pendingAdvance = { athleteId, at: Date.now() };
    await saveBatch(batch);
    await clearPendingRegistration();
  }

  async function processReturnFromSave() {
    if (!pathIs('/atleta/index')) return false;
    const batch = await getBatch();
    if (!batch?.active || !batch.pendingAdvance) return false;
    const age = Date.now() - Number(batch.pendingAdvance.at || 0);
    if (age < 0 || age > PENDING_MAX_AGE) {
      batch.pendingAdvance = null;
      await saveBatch(batch);
      return false;
    }

    const currentAthleteId = batch.athleteIds?.[Number(batch.currentIndex) || 0];
    if (!currentAthleteId || currentAthleteId !== batch.pendingAdvance.athleteId) {
      batch.pendingAdvance = null;
      await saveBatch(batch);
      return false;
    }

    if (!batch.completed.includes(currentAthleteId)) batch.completed.push(currentAthleteId);
    batch.pendingAdvance = null;
    batch.currentIndex = Number(batch.currentIndex || 0) + 1;
    await clearPendingRegistration();

    if (batch.currentIndex >= batch.athleteIds.length) {
      batch.active = false;
      batch.finishedAt = Date.now();
      batch.lastSummary = {
        category: batch.category,
        completed: batch.completed.length,
        skipped: batch.skipped.length,
        total: batch.athleteIds.length
      };
      await saveBatch(batch);
      await saveUiCategory(batch.category);
      return false;
    }

    await saveBatch(batch);
    const data = await loadDataset(true);
    const next = data.athletes.find(item => item.athleteId === batch.athleteIds[batch.currentIndex]);
    if (!next?.reference?.bigmidiaId) {
      batch.active = false;
      batch.error = 'O próximo atleta não possui registro na Liga.';
      await saveBatch(batch);
      return false;
    }
    await selectAthlete(next, data);
    location.replace(editUrl(next));
    return true;
  }

  function photoReady() {
    const status = normalize($('#ykl-v148-photo-status')?.textContent || '');
    if (status === 'incluido') return true;
    return $$('input[type="file"]').some(input => {
      const own = normalize(`${input.id || ''} ${input.name || ''} ${input.accept || ''}`);
      return input.files?.length && (own.includes('foto') || own.includes('photo') || own.includes('image') || own.includes('imagem'));
    });
  }

  async function currentBatchContext() {
    const batch = await getBatch();
    if (!batch?.active || !pathIs('/atleta/update')) return null;
    const data = await loadDataset();
    const index = Number(batch.currentIndex) || 0;
    const athleteId = batch.athleteIds?.[index];
    const item = data.athletes.find(a => a.athleteId === athleteId);
    if (!item || String(item.reference?.bigmidiaId || '') !== currentBigMidiaId()) return { batch, data, item: null, index };
    return { batch, data, item, index };
  }

  async function goToNextWithoutSave(context) {
    const { batch, data, item } = context;
    if (item && !batch.skipped.includes(item.athleteId)) batch.skipped.push(item.athleteId);
    batch.pendingAdvance = null;
    batch.currentIndex = Number(batch.currentIndex || 0) + 1;
    if (batch.currentIndex >= batch.athleteIds.length) {
      batch.active = false;
      batch.finishedAt = Date.now();
      batch.lastSummary = { category: batch.category, completed: batch.completed.length, skipped: batch.skipped.length, total: batch.athleteIds.length };
      await saveBatch(batch);
      await saveUiCategory(batch.category);
      location.href = `${ORIGIN}/atleta/index`;
      return;
    }
    await saveBatch(batch);
    const next = data.athletes.find(a => a.athleteId === batch.athleteIds[batch.currentIndex]);
    if (!next?.reference?.bigmidiaId) {
      location.href = `${ORIGIN}/atleta/index`;
      return;
    }
    await selectAthlete(next, data);
    location.href = editUrl(next);
  }

  function scrollToNativeSave() {
    const button = $('#save-Atleta');
    if (!button) return false;
    button.scrollIntoView({ behavior: 'smooth', block: 'center' });
    button.classList.add('ykl-photo-save-highlight');
    setTimeout(() => button.classList.remove('ykl-photo-save-highlight'), 3500);
    return true;
  }

  async function renderUpdateWorkflow() {
    if (!pathIs('/atleta/update')) return;
    const context = await currentBatchContext();
    let card = $('#ykl-photo-batch-card');
    if (!context?.batch?.active) {
      card?.remove();
      return;
    }

    const section = $('.ykl-section[data-section="cadastro"]');
    const firstCard = section?.querySelector('.ykl-card');
    if (!section || !firstCard) return;
    if (!card) {
      card = document.createElement('div');
      card.id = 'ykl-photo-batch-card';
      card.className = 'ykl-card ykl-photo-batch-card';
      firstCard.after(card);
    }

    if (!context.item) {
      const signature = `mismatch:${context.batch.category}:${context.index}`;
      if (card.dataset.signature === signature) return;
      card.dataset.signature = signature;
      card.innerHTML = `
        <div class="ykl-photo-batch-title"><strong>Sessão de fotos ativa</strong><span>${escapeHtml(context.batch.category)}</span></div>
        <div class="ykl-muted">Esta página não corresponde ao atleta atual da sequência.</div>
        <button id="ykl-photo-batch-resume-update" class="ykl-btn ykl-blue ykl-full" type="button">Retomar sequência</button>`;
      $('#ykl-photo-batch-resume-update', card)?.addEventListener('click', () => resumeBatch(context.batch));
      return;
    }

    const ready = photoReady();
    const position = context.index + 1;
    const total = context.batch.athleteIds.length;
    const signature = JSON.stringify({ athleteId: context.item.athleteId, position, total, ready });
    if (card.dataset.signature === signature) return;
    card.dataset.signature = signature;
    card.innerHTML = `
      <div class="ykl-photo-batch-title">
        <strong>Fotos · ${escapeHtml(context.batch.category)}</strong>
        <span>${position} de ${total}</span>
      </div>
      <div class="ykl-photo-batch-athlete">${escapeHtml(context.item.name)}</div>
      <div class="ykl-photo-batch-state ${ready ? 'is-ready' : ''}">${ready ? 'Foto incluída e pronta para salvar.' : 'Inclua a foto no bloco Arquivos no Drive.'}</div>
      <div class="ykl-photo-batch-primary-actions">
        <button id="ykl-photo-batch-scroll-save" class="ykl-btn" type="button">Ir para Salvar</button>
        <button id="ykl-photo-batch-save-next" class="ykl-btn ykl-blue" type="button" ${ready ? '' : 'disabled'}>Salvar e próximo</button>
      </div>
      <div class="ykl-photo-batch-secondary-actions">
        <button id="ykl-photo-batch-skip" class="ykl-btn" type="button">Pular</button>
        <button id="ykl-photo-batch-stop" class="ykl-btn" type="button">Encerrar</button>
      </div>`;

    $('#ykl-photo-batch-scroll-save', card)?.addEventListener('click', () => scrollToNativeSave());
    $('#ykl-photo-batch-save-next', card)?.addEventListener('click', async () => {
      const saveButton = $('#save-Atleta');
      if (!saveButton) {
        scrollToNativeSave();
        return;
      }
      await markPendingAdvance();
      saveButton.click();
    });
    $('#ykl-photo-batch-skip', card)?.addEventListener('click', () => goToNextWithoutSave(context));
    $('#ykl-photo-batch-stop', card)?.addEventListener('click', async () => {
      context.batch.active = false;
      context.batch.pendingAdvance = null;
      context.batch.endedAt = Date.now();
      await saveBatch(context.batch);
      await saveUiCategory(context.batch.category);
      location.href = `${ORIGIN}/atleta/index`;
    });
  }

  async function hookNativeSave() {
    if (!pathIs('/atleta/update') || saveHooked) return;
    const saveButton = $('#save-Atleta');
    if (!saveButton) return;
    saveHooked = true;
    const prepare = () => markPendingAdvance().catch(() => {});
    saveButton.addEventListener('pointerdown', prepare, true);
    saveButton.addEventListener('click', prepare, true);
  }

  function observePhotoState() {
    const status = $('#ykl-v148-photo-status');
    if (!status || status.dataset.yklBatchObserved === '1') return;
    status.dataset.yklBatchObserved = '1';
    new MutationObserver(() => renderUpdateWorkflow().catch(() => {}))
      .observe(status, { childList: true, characterData: true, subtree: true, attributes: true });
  }

  async function renderFinishedSummary() {
    if (!pathIs('/atleta/index')) return;
    const batch = await getBatch();
    if (!batch?.lastSummary || batch.active) return;
    const category = categoryFromDetail();
    if (!category || category !== batch.lastSummary.category) return;
    const host = $('#ykl-photo-batch-launch');
    if (!host || host.querySelector('.ykl-photo-batch-summary')) return;
    const summary = document.createElement('div');
    summary.className = 'ykl-photo-batch-summary';
    summary.textContent = `Última sequência: ${batch.lastSummary.completed} salva(s) · ${batch.lastSummary.skipped} pulada(s) · ${batch.lastSummary.total} total.`;
    host.appendChild(summary);
  }

  async function tick() {
    if (pathIs('/atleta/index')) {
      await injectCategoryControls();
      await renderFinishedSummary();
    }
    if (pathIs('/atleta/update')) {
      await clearPendingRegistration();
      await hookNativeSave();
      observePhotoState();
      await renderUpdateWorkflow();
    }
  }

  async function initIndex() {
    document.addEventListener('click', event => {
      rememberCategoryFromClick(event).catch(() => {});
    }, true);

    const navigated = await processReturnFromSave();
    if (navigated) return;
    await restoreCategory();
    await tick();

    observer = new MutationObserver(mutations => {
      if (mutations.every(mutation => mutation.target.closest?.('#ykl-photo-batch-launch'))) return;
      clearTimeout(observer._timer);
      observer._timer = setTimeout(() => tick().catch(() => {}), 80);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  }

  async function initUpdate() {
    await tick();
    observer = new MutationObserver(mutations => {
      if (mutations.every(mutation => mutation.target.closest?.('#ykl-photo-batch-card'))) return;
      clearTimeout(observer._timer);
      observer._timer = setTimeout(() => tick().catch(() => {}), 100);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (pathIs('/atleta/index')) initIndex().catch(console.error);
  if (pathIs('/atleta/update')) initUpdate().catch(console.error);
})();
