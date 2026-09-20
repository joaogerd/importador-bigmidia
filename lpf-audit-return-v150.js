(() => {
  'use strict';

  const STATE_KEY = 'yklStateV2';
  const CACHE_KEY = 'yklLeagueReferencesV149';
  const AUDIT_KEY = 'yklLpfAuditV150';
  const PHOTO_BATCH_KEY = 'yklPhotoBatchV150';
  const RESUME_LOCK_KEY = 'yklLpfAuditResumeLockV150';
  const ORIGIN = 'https://ligapaulistafutsal.bigmidia.com';
  const LOCK_MAX_AGE = 8000;

  const get = keys => new Promise(resolve => chrome.storage.local.get(keys, resolve));
  const set = values => new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
  const remove = keys => new Promise(resolve => chrome.storage.local.remove(keys, resolve));

  function pathIs(path) {
    return location.pathname.replace(/\/$/, '') === path;
  }

  function normalize(value) {
    return String(value ?? '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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

  async function resolveReference(athleteId, saved, cachedReferences, audit) {
    const auditedId = String(audit?.results?.[athleteId]?.bigmidiaId || '').trim();
    if (/^\d+$/.test(auditedId)) return { bigmidiaId: auditedId };

    let reference = cachedReferences?.[athleteId] || null;
    if (/^\d+$/.test(String(reference?.bigmidiaId || ''))) return reference;

    if (saved.apiUrl && saved.apiToken) {
      try {
        const data = await api(saved, 'listAthletes', {});
        reference = data?.references?.[athleteId] || null;
        if (/^\d+$/.test(String(reference?.bigmidiaId || ''))) {
          await set({ [CACHE_KEY]: { ...(cachedReferences || {}), ...(data?.references || {}) } });
          return reference;
        }
      } catch (error) {
        console.warn('[Importador Yoka] Não foi possível atualizar as referências ao retomar a conferência LPF.', error);
      }
    }
    return null;
  }

  async function selectCurrentAthlete(athleteId, saved) {
    const rows = Array.isArray(saved.rows) ? saved.rows : [];
    const headers = Array.isArray(saved.headers) ? saved.headers : [];
    const index = rows.findIndex(row => value(row, headers, ['ID', 'ID do atleta']) === athleteId);
    if (index < 0) return saved;
    return {
      ...saved,
      currentIndex: index,
      categoryFilter: '',
      pendingRegistration: null
    };
  }

  async function resumeActiveAuditFromIndex() {
    if (!pathIs('/atleta/index')) return false;

    const stored = await get([AUDIT_KEY, STATE_KEY, CACHE_KEY, PHOTO_BATCH_KEY, RESUME_LOCK_KEY]);
    const audit = stored?.[AUDIT_KEY] || null;
    const session = audit?.session || null;

    // Sessões de fotos têm seu próprio controlador de retorno e têm prioridade.
    if (stored?.[PHOTO_BATCH_KEY]?.active) return false;
    if (!session?.active || !Array.isArray(session.athleteIds) || !session.athleteIds.length) return false;

    const index = Math.max(0, Math.min(Number(session.currentIndex) || 0, session.athleteIds.length - 1));
    const athleteId = String(session.athleteIds[index] || '').trim();
    if (!athleteId) return false;

    const lock = stored?.[RESUME_LOCK_KEY] || null;
    const lockAge = Date.now() - Number(lock?.at || 0);
    if (lock?.athleteId === athleteId && lockAge >= 0 && lockAge < LOCK_MAX_AGE) {
      return false;
    }

    const saved = stored?.[STATE_KEY] || {};
    const reference = await resolveReference(athleteId, saved, stored?.[CACHE_KEY] || {}, audit);
    const bigmidiaId = String(reference?.bigmidiaId || '').trim();
    if (!/^\d+$/.test(bigmidiaId)) {
      console.warn('[Importador Yoka] Conferência LPF ativa, mas o registro da Liga do atleta atual não foi localizado.', athleteId);
      return false;
    }

    const nextState = await selectCurrentAthlete(athleteId, saved);
    await set({
      [STATE_KEY]: nextState,
      [RESUME_LOCK_KEY]: { athleteId, bigmidiaId, at: Date.now() }
    });

    location.replace(`${ORIGIN}/atleta/update?id=${encodeURIComponent(bigmidiaId)}`);
    return true;
  }

  async function init() {
    // Ao chegar novamente no atleta, libera o lock. Se a BigMidia falhar e
    // devolver imediatamente à listagem, o lock curto evita um loop infinito.
    if (pathIs('/atleta/update')) {
      await remove(RESUME_LOCK_KEY);
      return;
    }

    if (pathIs('/atleta/index')) {
      await resumeActiveAuditFromIndex();
    }
  }

  init().catch(error => {
    console.error('[Importador Yoka] Falha ao restaurar a conferência LPF após navegação.', error);
  });
})();
