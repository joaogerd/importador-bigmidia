(() => {
  'use strict';

  const STATE = 'yklStateV2';
  const SCAN = 'yklLeagueIndexScanV149';
  const CACHE = 'yklLeagueReferencesV149';
  const ORIGIN = 'https://ligapaulistafutsal.bigmidia.com';
  const INDEX_PATH = '/atleta/index';
  const MAX_PAGES = 100;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  if (location.pathname.replace(/\/$/, '') !== INDEX_PATH) return;

  let busy = false;
  let dataCache = null;

  const normalize = value => String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const digits = value => String(value || '').replace(/\D+/g, '');
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[ch]));

  const storageGet = keys => new Promise(resolve => chrome.storage.local.get(keys, resolve));
  const storageSet = values => new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });

  async function savedState() {
    return (await storageGet([STATE]))?.[STATE] || {};
  }

  function api(saved, action, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'ykl-api-request', apiUrl: saved.apiUrl || '', token: saved.apiToken || '', action, payload
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
    const h = findHeader(headers, candidates);
    return h ? String(row?.[h] ?? '').trim() : '';
  }

  async function dataset(force = false) {
    if (dataCache && !force) return dataCache;
    const saved = await savedState();
    if (!saved.apiUrl || !saved.apiToken) {
      throw new Error('Configure a API do Google Sheets na aba Dados antes de sincronizar registros da Liga.');
    }
    const data = await api(saved, 'listAthletes', {});
    const rows = Array.isArray(data?.athletes) ? data.athletes : [];
    const headers = Array.isArray(data?.headers) && data.headers.length ? data.headers : Object.keys(rows[0] || {});
    dataCache = {
      saved,
      references: data?.references || {},
      athletes: rows.map(row => {
        const athleteId = value(row, headers, ['ID', 'ID do atleta']);
        const name = value(row, headers, ['Nome completo do atleta', 'Nome completo', 'Nome']);
        return {
          athleteId,
          name,
          normalizedName: normalize(name),
          cpf: digits(value(row, headers, ['CPF do atleta', 'CPF']))
        };
      }).filter(item => item.athleteId && item.name)
    };
    return dataCache;
  }

  function canonicalReference(raw) {
    const text = String(raw || '').replace(/&amp;/g, '&');
    try {
      const url = new URL(text, location.href);
      if (url.origin === ORIGIN && url.pathname.replace(/\/$/, '') === '/atleta/update') {
        const id = String(url.searchParams.get('id') || '');
        if (/^\d+$/.test(id)) return { bigmidiaId: id, bigmidiaUrl: `${ORIGIN}/atleta/update?id=${id}` };
      }
    } catch { /* tenta regex abaixo */ }

    const patterns = [
      /\/atleta\/update\?[^'"\s<>]*\bid=(\d+)/i,
      /\/atleta\/update\?id=(\d+)/i,
      /atleta\/update\?id=(\d+)/i
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return { bigmidiaId: match[1], bigmidiaUrl: `${ORIGIN}/atleta/update?id=${match[1]}` };
    }
    return null;
  }

  function rowText(el) {
    const row = el.closest('tr') || el.closest('[role="row"]') || el.closest('.card,.list-group-item,.row') || el.parentElement || el;
    return String(row?.innerText || row?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 900);
  }

  function cpfFromText(text) {
    const matches = String(text || '').match(/(?:\d{3}[.\s-]?){2}\d{3}[-.\s]?\d{2}|\b\d{11}\b/g) || [];
    for (const match of matches) {
      const result = digits(match);
      if (result.length === 11) return result;
    }
    return '';
  }

  function records() {
    const found = new Map();
    const selectors = 'a[href],[onclick],[data-url],[data-href],[data-action],[data-link]';
    $$(selectors).forEach(el => {
      const candidates = [];
      if (el instanceof HTMLAnchorElement) candidates.push(el.getAttribute('href') || el.href || '');
      for (const attr of ['onclick', 'data-url', 'data-href', 'data-action', 'data-link']) {
        const raw = el.getAttribute?.(attr);
        if (raw) candidates.push(raw);
      }
      let ref = null;
      for (const raw of candidates) {
        ref = canonicalReference(raw);
        if (ref) break;
      }
      if (!ref || found.has(ref.bigmidiaId)) return;
      const text = rowText(el);
      found.set(ref.bigmidiaId, { ...ref, text, cpf: cpfFromText(text) });
    });
    return [...found.values()];
  }

  function matchRecord(record, data) {
    if (record.cpf) {
      const sameCpf = data.athletes.filter(a => a.cpf && a.cpf === record.cpf);
      if (sameCpf.length === 1) return { kind: 'matched', athlete: sameCpf[0], method: 'CPF' };
      if (sameCpf.length > 1) return { kind: 'ambiguous', candidates: sameCpf };
    }

    const text = normalize(record.text);
    const byName = data.athletes.filter(a => a.normalizedName.length >= 5 && text.includes(a.normalizedName));
    if (byName.length === 1) return { kind: 'matched', athlete: byName[0], method: 'nome' };
    if (byName.length > 1) {
      const sorted = [...byName].sort((a, b) => b.normalizedName.length - a.normalizedName.length);
      if (sorted[0].normalizedName.length > sorted[1].normalizedName.length) {
        return { kind: 'matched', athlete: sorted[0], method: 'nome específico' };
      }
      return { kind: 'ambiguous', candidates: byName };
    }
    return { kind: 'unmatched' };
  }

  const freshScan = () => ({
    running: true, pages: 0, signatures: [], matches: {}, unmatched: [], ambiguous: [], conflicts: [], error: '', result: null
  });

  async function loadScan() {
    return (await storageGet([SCAN]))?.[SCAN] || null;
  }

  async function saveScan(scan) {
    await storageSet({ [SCAN]: scan });
    render(scan);
  }

  function signature(items) {
    return items.map(item => item.bigmidiaId).sort().join(',');
  }

  function mergePage(scan, items, data) {
    const sig = signature(items);
    if (sig && !scan.signatures.includes(sig)) {
      scan.signatures.push(sig);
      scan.pages += 1;
    }
    for (const record of items) {
      const match = matchRecord(record, data);
      if (match.kind === 'matched') {
        const athlete = match.athlete;
        const previous = scan.matches[athlete.athleteId];
        if (previous && previous.bigmidiaId !== record.bigmidiaId) {
          scan.conflicts.push({ athleteId: athlete.athleteId, name: athlete.name, first: previous.bigmidiaId, second: record.bigmidiaId });
          continue;
        }
        scan.matches[athlete.athleteId] = {
          athleteId: athlete.athleteId,
          athleteName: athlete.name,
          bigmidiaId: record.bigmidiaId,
          bigmidiaUrl: record.bigmidiaUrl,
          method: match.method
        };
      } else if (match.kind === 'ambiguous') {
        if (!scan.ambiguous.some(item => item.bigmidiaId === record.bigmidiaId)) {
          scan.ambiguous.push({ bigmidiaId: record.bigmidiaId, text: record.text.slice(0, 240), candidates: match.candidates.map(a => a.name).slice(0, 5) });
        }
      } else if (!scan.unmatched.some(item => item.bigmidiaId === record.bigmidiaId)) {
        scan.unmatched.push({ bigmidiaId: record.bigmidiaId, text: record.text.slice(0, 240) });
      }
    }
  }

  function disabled(el) {
    return !el || el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('li,.page-item')?.classList.contains('disabled');
  }

  function nextControl() {
    const selectors = [
      '.dataTables_paginate .paginate_button.next:not(.disabled)',
      '.dataTables_paginate li.next:not(.disabled) a',
      '[id$="_next"]:not(.disabled) a',
      '[id$="_next"]:not(.disabled)',
      'a[rel="next"]',
      '.pagination li.next:not(.disabled) a',
      '.pagination .page-item.next:not(.disabled) a'
    ];
    for (const selector of selectors) {
      const el = $(selector);
      if (el && !disabled(el)) return el;
    }
    return $$('.dataTables_paginate a,.dataTables_paginate button,.pagination a,.pagination button').find(el => {
      if (disabled(el)) return false;
      const raw = `${el.textContent || ''} ${el.getAttribute('aria-label') || ''} ${el.title || ''}`.trim();
      const text = normalize(raw);
      return text.includes('proximo') || text.includes('proxima') || text.includes('next') || /[»›>]\s*$/.test(raw);
    }) || null;
  }

  function nextHref(el) {
    if (!(el instanceof HTMLAnchorElement)) return '';
    const raw = String(el.getAttribute('href') || '').trim();
    if (!raw || raw === '#' || /^javascript:/i.test(raw)) return '';
    try {
      const url = new URL(raw, location.href);
      return url.origin === location.origin && url.href !== location.href ? url.href : '';
    } catch { return ''; }
  }

  async function waitForRecords(timeout = 12000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const current = records();
      if (current.length) return current;
      await sleep(200);
    }
    return [];
  }

  async function waitForPageChange(before, timeout = 12000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      await sleep(200);
      const now = signature(records());
      if (now && now !== before) return true;
    }
    return false;
  }

  async function synchronize(scan, data) {
    const references = Object.values(scan.matches).map(item => ({
      athleteId: item.athleteId, bigmidiaId: item.bigmidiaId, bigmidiaUrl: item.bigmidiaUrl
    }));
    if (!references.length) {
      scan.running = false;
      scan.error = 'Nenhuma correspondência segura foi encontrada para sincronizar.';
      return saveScan(scan);
    }
    try {
      const result = await api(data.saved, 'syncBigMidiaReferences', { references });
      scan.running = false;
      scan.error = '';
      scan.result = result;
      const cache = (await storageGet([CACHE]))?.[CACHE] || {};
      for (const item of references) cache[item.athleteId] = { bigmidiaId: item.bigmidiaId, bigmidiaUrl: item.bigmidiaUrl };
      await storageSet({ [CACHE]: cache, [SCAN]: scan });
      render(scan);
    } catch (error) {
      scan.running = false;
      scan.error = error.message || String(error);
      await saveScan(scan);
    }
  }

  async function scanAll(scan, data) {
    if (busy) return;
    busy = true;
    try {
      while (scan.running && scan.pages < MAX_PAGES) {
        const current = await waitForRecords();
        if (!current.length) {
          scan.running = false;
          scan.error = 'A tabela carregou, mas não encontrei nenhuma URL /atleta/update?id=... nos elementos da página. Envie o HTML de uma linha <tr> para ajustar o seletor.';
          await saveScan(scan);
          return;
        }
        const sig = signature(current);
        if (!scan.signatures.includes(sig)) {
          mergePage(scan, current, data);
          await saveScan(scan);
        }

        const next = nextControl();
        if (!next) {
          await synchronize(scan, data);
          return;
        }
        const href = nextHref(next);
        if (href) {
          await storageSet({ [SCAN]: scan });
          location.href = href;
          return;
        }
        next.click();
        if (!await waitForPageChange(sig)) {
          scan.running = false;
          scan.error = 'Encontrei os IDs desta página, mas não consegui avançar automaticamente no DataTables. A coleta atual ficou salva.';
          await saveScan(scan);
          return;
        }
      }
      if (scan.pages >= MAX_PAGES) {
        scan.running = false;
        scan.error = `A varredura atingiu ${MAX_PAGES} páginas por segurança.`;
        await saveScan(scan);
      }
    } finally {
      busy = false;
    }
  }

  function counts(scan) {
    return {
      matched: Object.keys(scan?.matches || {}).length,
      unmatched: scan?.unmatched?.length || 0,
      ambiguous: scan?.ambiguous?.length || 0,
      conflicts: scan?.conflicts?.length || 0
    };
  }

  function render(scan = null) {
    $('#ykl-v149-registry')?.style && ($('#ykl-v149-registry').style.display = 'none');
    let panel = $('#ykl-v149-index-registry');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'ykl-v149-index-registry';
      panel.style.cssText = 'position:fixed;z-index:2147483000;right:12px;bottom:12px;width:350px;background:#fff;border:1px solid #cfd6dd;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.2);font-family:Arial,Helvetica,sans-serif;color:#17212b;padding:10px';
      document.body.appendChild(panel);
    }

    const detected = records().length;
    const c = counts(scan);
    const issues = c.unmatched + c.ambiguous + c.conflicts;
    let message = detected
      ? `${detected} ID(s) detectado(s) na página atual.`
      : 'Aguardando o DataTables carregar os atletas…';
    if (scan?.running) message = `${scan.pages} página(s) processada(s) · ${c.matched} atleta(s) vinculados.`;
    else if (scan?.error) message = scan.error;
    else if (scan?.result) message = `Sincronização concluída: ${Number(scan.result.updated || 0) + Number(scan.result.created || 0)} gravados, ${scan.result.skipped || 0} já estavam corretos.`;

    panel.innerHTML = `
      <div style="font-size:13px;font-weight:800;color:#174a7e;margin-bottom:5px">Registros da Liga</div>
      <div style="font-size:11px;color:#64717d;line-height:1.4;margin-bottom:5px">${detected} ID(s) nesta página${scan ? ` · ${c.matched} vinculados` : ''}${issues ? ` · ${issues} para conferir` : ''}</div>
      <button id="ykl-v149-index-scan" type="button" style="width:100%;border:0;border-radius:7px;padding:9px 10px;background:#147a42;color:#fff;font-size:12px;font-weight:700;cursor:pointer" ${scan?.running ? 'disabled' : ''}>${scan?.running ? 'Varrendo páginas...' : 'Varrer páginas e sincronizar'}</button>
      <div style="font-size:10px;line-height:1.45;margin-top:7px;color:${scan?.error ? '#b42318' : '#64717d'}">${escapeHtml(message)}</div>
      ${!detected && !scan?.running ? '<div style="font-size:10px;line-height:1.4;margin-top:5px;color:#64717d">Se permanecer em 0, copie somente uma linha <strong>&lt;tr&gt;...&lt;/tr&gt;</strong> da tabela e envie aqui.</div>' : ''}
    `;
    $('#ykl-v149-index-scan', panel)?.addEventListener('click', start);
  }

  async function start() {
    if (busy) return;
    try {
      const data = await dataset(true);
      const scan = freshScan();
      await saveScan(scan);
      await scanAll(scan, data);
    } catch (error) {
      const scan = freshScan();
      scan.running = false;
      scan.error = error.message || String(error);
      await saveScan(scan);
    }
  }

  async function init() {
    const previous = await loadScan();
    render(previous);

    let timer = null;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => render(previous), 150);
    });
    observer.observe(document.body || document.documentElement, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['href', 'onclick', 'data-url', 'data-href', 'data-action', 'data-link']
    });

    setTimeout(() => render(previous), 500);
    setTimeout(() => render(previous), 1500);
    setTimeout(() => render(previous), 3500);

    if (previous?.running) {
      try {
        await sleep(600);
        await scanAll(previous, await dataset(true));
      } catch (error) {
        previous.running = false;
        previous.error = error.message || String(error);
        await saveScan(previous);
      }
    }
  }

  init();
})();
