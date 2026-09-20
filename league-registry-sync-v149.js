(() => {
  'use strict';

  const STATE_KEY = 'yklStateV2';
  const CACHE_KEY = 'yklLeagueReferencesV149';
  const RESULT_KEY = 'yklLeagueSyncResultV149';
  const ORIGIN = 'https://ligapaulistafutsal.bigmidia.com';
  const INDEX_PATH = '/atleta/index';

  if (location.pathname.replace(/\/$/, '') !== INDEX_PATH) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const normalize = value => String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const digits = value => String(value || '').replace(/\D+/g, '');

  let busy = false;
  let panel = null;
  let countEl = null;
  let statusEl = null;
  let button = null;
  let refreshTimer = null;

  const storageGet = keys => new Promise(resolve => chrome.storage.local.get(keys, resolve));
  const storageSet = values => new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });

  async function savedState() {
    return (await storageGet([STATE_KEY]))?.[STATE_KEY] || {};
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

  function canonicalReference(raw) {
    const text = String(raw || '').replace(/&amp;/g, '&');
    try {
      const url = new URL(text, location.href);
      if (url.origin === ORIGIN && url.pathname.replace(/\/$/, '') === '/atleta/update') {
        const id = String(url.searchParams.get('id') || '').trim();
        if (/^\d+$/.test(id)) {
          return { bigmidiaId: id, bigmidiaUrl: `${ORIGIN}/atleta/update?id=${id}` };
        }
      }
    } catch { /* tenta regex abaixo */ }

    const match = text.match(/(?:https?:\/\/[^'"\s<>]+)?\/atleta\/update\?[^'"\s<>]*\bid=(\d+)/i)
      || text.match(/atleta\/update\?id=(\d+)/i);
    return match
      ? { bigmidiaId: match[1], bigmidiaUrl: `${ORIGIN}/atleta/update?id=${match[1]}` }
      : null;
  }

  function rowText(element) {
    const row = element.closest('tr')
      || element.closest('[role="row"]')
      || element.closest('.card,.list-group-item,.row')
      || element.parentElement
      || element;
    return String(row?.innerText || row?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  }

  function cpfFromText(text) {
    const matches = String(text || '').match(/(?:\d{3}[.\s-]?){2}\d{3}[-.\s]?\d{2}|\b\d{11}\b/g) || [];
    for (const match of matches) {
      const cpf = digits(match);
      if (cpf.length === 11) return cpf;
    }
    return '';
  }

  function detectedRecords() {
    const found = new Map();
    const selectors = 'a[href],[onclick],[data-url],[data-href],[data-action],[data-link]';

    $$(selectors).forEach(element => {
      if (panel?.contains(element)) return;

      const candidates = [];
      if (element instanceof HTMLAnchorElement) candidates.push(element.getAttribute('href') || element.href || '');
      for (const attr of ['onclick', 'data-url', 'data-href', 'data-action', 'data-link']) {
        const raw = element.getAttribute?.(attr);
        if (raw) candidates.push(raw);
      }

      let reference = null;
      for (const candidate of candidates) {
        reference = canonicalReference(candidate);
        if (reference) break;
      }
      if (!reference || found.has(reference.bigmidiaId)) return;

      const text = rowText(element);
      found.set(reference.bigmidiaId, {
        ...reference,
        text,
        cpf: cpfFromText(text)
      });
    });

    return [...found.values()];
  }

  function buildAthletes(data) {
    const rows = Array.isArray(data?.athletes) ? data.athletes : [];
    const headers = Array.isArray(data?.headers) && data.headers.length
      ? data.headers
      : Object.keys(rows[0] || {});

    return rows.map(row => {
      const athleteId = value(row, headers, ['ID', 'ID do atleta']);
      const name = value(row, headers, ['Nome completo do atleta', 'Nome completo', 'Nome']);
      return {
        athleteId,
        name,
        normalizedName: normalize(name),
        cpf: digits(value(row, headers, ['CPF do atleta', 'CPF']))
      };
    }).filter(item => item.athleteId && item.name);
  }

  function matchRecord(record, athletes) {
    if (record.cpf) {
      const sameCpf = athletes.filter(athlete => athlete.cpf && athlete.cpf === record.cpf);
      if (sameCpf.length === 1) return { kind: 'matched', athlete: sameCpf[0], method: 'CPF' };
      if (sameCpf.length > 1) return { kind: 'ambiguous' };
    }

    const text = normalize(record.text);
    const matches = athletes.filter(athlete => athlete.normalizedName.length >= 5 && text.includes(athlete.normalizedName));
    if (matches.length === 1) return { kind: 'matched', athlete: matches[0], method: 'nome' };

    if (matches.length > 1) {
      const ordered = [...matches].sort((a, b) => b.normalizedName.length - a.normalizedName.length);
      if (ordered[0].normalizedName.length > ordered[1].normalizedName.length) {
        return { kind: 'matched', athlete: ordered[0], method: 'nome específico' };
      }
      return { kind: 'ambiguous' };
    }

    return { kind: 'unmatched' };
  }

  function matchAll(records, athletes) {
    const matches = new Map();
    const conflicts = [];
    const unmatched = [];
    const ambiguous = [];

    for (const record of records) {
      const match = matchRecord(record, athletes);
      if (match.kind === 'matched') {
        const previous = matches.get(match.athlete.athleteId);
        if (previous && previous.bigmidiaId !== record.bigmidiaId) {
          conflicts.push({ athleteName: match.athlete.name, first: previous.bigmidiaId, second: record.bigmidiaId });
          continue;
        }
        matches.set(match.athlete.athleteId, {
          athleteId: match.athlete.athleteId,
          athleteName: match.athlete.name,
          bigmidiaId: record.bigmidiaId,
          bigmidiaUrl: record.bigmidiaUrl,
          method: match.method
        });
      } else if (match.kind === 'ambiguous') {
        ambiguous.push({ bigmidiaId: record.bigmidiaId, text: record.text.slice(0, 250) });
      } else {
        unmatched.push({ bigmidiaId: record.bigmidiaId, text: record.text.slice(0, 250) });
      }
    }

    return {
      matches: [...matches.values()],
      conflicts,
      unmatched,
      ambiguous
    };
  }

  function setStatus(message, kind = 'normal') {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = kind === 'error' ? '#b42318' : kind === 'success' ? '#147a42' : '#64717d';
  }

  function refreshCount() {
    if (!countEl || busy) return;
    const total = detectedRecords().length;
    countEl.textContent = `${total} registro(s) detectado(s)`;
    button.disabled = total === 0;
    button.style.opacity = total === 0 ? '.55' : '1';
    if (total > 0 && !statusEl.textContent) setStatus('Pronto para cruzar os registros com os atletas do Yoka.');
  }

  async function synchronizeDetected() {
    if (busy) return;
    busy = true;
    button.disabled = true;
    button.textContent = 'Iniciando…';
    setStatus('Carregando atletas do Yoka…');

    try {
      const records = detectedRecords();
      if (!records.length) throw new Error('Nenhum registro da Liga foi detectado nesta página.');

      const saved = await savedState();
      if (!saved.apiUrl || !saved.apiToken) {
        throw new Error('Configure a API do Google Sheets na aba Dados da extensão antes de sincronizar.');
      }

      const data = await api(saved, 'listAthletes', {});
      const athletes = buildAthletes(data);
      if (!athletes.length) throw new Error('A API do Yoka não retornou atletas para comparação.');

      setStatus(`Cruzando ${records.length} registros com ${athletes.length} atletas do Yoka…`);
      const matched = matchAll(records, athletes);
      const issues = matched.unmatched.length + matched.ambiguous.length + matched.conflicts.length;

      await storageSet({
        [RESULT_KEY]: {
          detected: records.length,
          matched: matched.matches.length,
          unmatched: matched.unmatched,
          ambiguous: matched.ambiguous,
          conflicts: matched.conflicts,
          updatedAt: Date.now()
        }
      });

      countEl.textContent = `${records.length} detectados · ${matched.matches.length} vinculados · ${issues} para conferir`;
      if (!matched.matches.length) {
        throw new Error('Nenhuma correspondência segura foi encontrada. Os registros não foram gravados.');
      }

      button.textContent = 'Sincronizando…';
      setStatus(`Sincronizando ${matched.matches.length} referências seguras com a planilha…`);

      const result = await api(saved, 'syncBigMidiaReferences', {
        references: matched.matches.map(item => ({
          athleteId: item.athleteId,
          bigmidiaId: item.bigmidiaId,
          bigmidiaUrl: item.bigmidiaUrl
        }))
      });

      const cache = (await storageGet([CACHE_KEY]))?.[CACHE_KEY] || {};
      for (const item of matched.matches) {
        cache[item.athleteId] = { bigmidiaId: item.bigmidiaId, bigmidiaUrl: item.bigmidiaUrl };
      }
      await storageSet({ [CACHE_KEY]: cache });

      const written = Number(result?.created || 0) + Number(result?.updated || 0);
      const skipped = Number(result?.skipped || 0);
      setStatus(`✓ Sincronização concluída: ${written} gravados, ${skipped} já estavam corretos${issues ? `, ${issues} para conferir` : ''}.`, 'success');
      button.textContent = 'Sincronizar novamente';
    } catch (error) {
      setStatus(error.message || String(error), 'error');
      button.textContent = 'Tentar novamente';
    } finally {
      busy = false;
      button.disabled = detectedRecords().length === 0;
    }
  }

  function buildPanel() {
    $('#ykl-v149-registry')?.remove();
    $('#ykl-v149-index-registry')?.remove();

    panel = document.createElement('div');
    panel.id = 'ykl-v149-sync-registry';
    panel.style.cssText = [
      'position:fixed', 'z-index:2147483001', 'right:12px', 'bottom:12px', 'width:350px',
      'background:#fff', 'border:1px solid #cfd6dd', 'border-radius:10px',
      'box-shadow:0 8px 28px rgba(0,0,0,.2)', 'font-family:Arial,Helvetica,sans-serif',
      'color:#17212b', 'padding:10px'
    ].join(';');

    const title = document.createElement('div');
    title.textContent = 'Registros da Liga';
    title.style.cssText = 'font-size:13px;font-weight:800;color:#174a7e;margin-bottom:5px';

    countEl = document.createElement('div');
    countEl.style.cssText = 'font-size:11px;color:#64717d;line-height:1.4;margin-bottom:8px';

    button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Cruzar e sincronizar registros';
    button.style.cssText = 'width:100%;border:0;border-radius:7px;padding:9px 10px;background:#147a42;color:#fff;font-size:12px;font-weight:700;cursor:pointer';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      synchronizeDetected();
    });

    statusEl = document.createElement('div');
    statusEl.style.cssText = 'font-size:10px;line-height:1.45;margin-top:7px;color:#64717d';

    panel.append(title, countEl, button, statusEl);
    document.body.appendChild(panel);
    refreshCount();
  }

  function observeTable() {
    const observer = new MutationObserver(mutations => {
      if (mutations.every(mutation => panel && panel.contains(mutation.target))) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refreshCount, 200);
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href', 'onclick', 'data-url', 'data-href', 'data-action', 'data-link']
    });
  }

  function init() {
    buildPanel();
    observeTable();
    setTimeout(refreshCount, 500);
    setTimeout(refreshCount, 1500);
    setTimeout(refreshCount, 3500);
  }

  init();
})();
