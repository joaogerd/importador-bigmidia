(() => {
  'use strict';

  const STATE_KEY = 'yklStateV2';
  const CACHE_KEY = 'yklLeagueReferencesV149';
  const BATCH_KEY = 'yklPhotoBatchV150';
  const UI_KEY = 'yklUiV150';
  const ORIGIN = 'https://ligapaulistafutsal.bigmidia.com';
  const INDEX_URL = `${ORIGIN}/atleta/index`;
  const PENDING_MAX_AGE = 2 * 60 * 1000;

  const get = keys => new Promise(resolve => chrome.storage.local.get(keys, resolve));
  const set = values => new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });

  function normalize(value) {
    return String(value ?? '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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

  async function resolveReference(athleteId, saved, cachedReferences) {
    let reference = cachedReferences?.[athleteId] || null;
    if (reference?.bigmidiaId) return reference;

    if (saved.apiUrl && saved.apiToken) {
      try {
        const data = await api(saved, 'listAthletes', {});
        reference = data?.references?.[athleteId] || null;
        if (reference?.bigmidiaId) {
          await set({ [CACHE_KEY]: { ...(cachedReferences || {}), ...(data?.references || {}) } });
          return reference;
        }
      } catch (error) {
        console.warn('[Importador Yoka] Não foi possível atualizar referências durante o retorno da sessão de fotos.', error);
      }
    }
    return null;
  }

  async function selectNextAthlete(athleteId, saved) {
    const headers = Array.isArray(saved.headers) ? saved.headers : [];
    const rows = Array.isArray(saved.rows) ? saved.rows : [];
    const index = rows.findIndex(row => value(row, headers, ['ID', 'ID do atleta']) === athleteId);
    if (index < 0) return saved;
    return {
      ...saved,
      currentIndex: index,
      categoryFilter: '',
      documentStatus: {},
      pendingRegistration: null
    };
  }

  async function restoreCategoryOnIndex(category) {
    const stored = await get([UI_KEY]);
    const ui = stored?.[UI_KEY] || {};
    await set({ [UI_KEY]: { ...ui, athleteCategory: category || '' } });
  }

  async function continuePendingPhotoBatch() {
    // /atleta/update possui o controlador completo; /atleta/index também.
    if (pathIs('/atleta/update') || pathIs('/atleta/index')) return false;

    const stored = await get([BATCH_KEY, STATE_KEY, CACHE_KEY]);
    const batch = stored?.[BATCH_KEY] || null;
    if (!batch?.active || !batch.pendingAdvance) return false;

    const age = Date.now() - Number(batch.pendingAdvance.at || 0);
    if (age < 0 || age > PENDING_MAX_AGE) {
      batch.pendingAdvance = null;
      batch.error = 'A confirmação de salvamento expirou antes de a sequência poder avançar.';
      await set({ [BATCH_KEY]: batch });
      return false;
    }

    const index = Number(batch.currentIndex) || 0;
    const currentAthleteId = batch.athleteIds?.[index];
    if (!currentAthleteId || currentAthleteId !== batch.pendingAdvance.athleteId) {
      batch.pendingAdvance = null;
      batch.error = 'A sessão de fotos perdeu a referência do atleta salvo.';
      await set({ [BATCH_KEY]: batch });
      return false;
    }

    batch.completed = Array.isArray(batch.completed) ? batch.completed : [];
    if (!batch.completed.includes(currentAthleteId)) batch.completed.push(currentAthleteId);
    batch.pendingAdvance = null;
    batch.currentIndex = index + 1;

    const saved = stored?.[STATE_KEY] || {};

    if (batch.currentIndex >= (batch.athleteIds?.length || 0)) {
      batch.active = false;
      batch.finishedAt = Date.now();
      batch.lastSummary = {
        category: batch.category,
        completed: batch.completed.length,
        skipped: Array.isArray(batch.skipped) ? batch.skipped.length : 0,
        total: batch.athleteIds?.length || 0
      };
      await restoreCategoryOnIndex(batch.category);
      await set({
        [BATCH_KEY]: batch,
        [STATE_KEY]: { ...saved, pendingRegistration: null }
      });
      location.replace(INDEX_URL);
      return true;
    }

    const nextAthleteId = batch.athleteIds[batch.currentIndex];
    const reference = await resolveReference(nextAthleteId, saved, stored?.[CACHE_KEY] || {});
    if (!reference?.bigmidiaId) {
      batch.active = false;
      batch.error = 'Não foi possível localizar o registro da Liga do próximo atleta.';
      await restoreCategoryOnIndex(batch.category);
      await set({ [BATCH_KEY]: batch });
      location.replace(INDEX_URL);
      return true;
    }

    const nextState = await selectNextAthlete(nextAthleteId, saved);
    await set({
      [BATCH_KEY]: batch,
      [STATE_KEY]: nextState
    });

    location.replace(`${ORIGIN}/atleta/update?id=${encodeURIComponent(reference.bigmidiaId)}`);
    return true;
  }

  continuePendingPhotoBatch().catch(error => {
    console.error('[Importador Yoka] Falha ao retomar sessão de fotos após salvar.', error);
  });
})();
