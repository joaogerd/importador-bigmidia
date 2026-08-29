(() => {
  'use strict';

  const STATE_KEY = 'yklStateV2';
  const SEGMENT_KEY = 'yklSegmentV151';
  const CACHE_KEY = 'yklLeagueReferencesV149';

  let activeSegment = 'KIDS';
  let currentDetail = null;
  let renderTimer = null;
  let rendering = false;
  let cache = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const storageGet = keys => new Promise(resolve => chrome.storage.local.get(keys, resolve));
  const storageSet = values => new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });

  function normalize(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[ch]));
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

  function normalizeSegment(valueRaw, category) {
    const valueNormalized = normalize(valueRaw).replace(/\s+/g, '');
    if (valueNormalized === 'kids' || valueNormalized === 'kid') return 'KIDS';
    if (valueNormalized === 'masculino' || valueNormalized === 'masc') return 'MASCULINO';
    if (
      valueNormalized === 'feminino' ||
      valueNormalized === 'fem' ||
      valueNormalized === 'mulheres' ||
      valueNormalized === 'mulher'
    ) return 'FEMININO';

    // Compatibilidade com a planilha anterior à coluna Segmento.
    const cat = normalize(category).replace(/\s+/g, '');
    if (['sub7', 'sub8', 'sub9', 'sub10'].includes(cat)) return 'KIDS';
    if (['sub11', 'sub13', 'sub15', 'sub17'].includes(cat)) return 'MASCULINO';
    return '';
  }

  function labelSegment(segment) {
    if (segment === 'KIDS') return 'Kids';
    if (segment === 'MASCULINO') return 'Masculino';
    if (segment === 'FEMININO') return 'Feminino';
    return 'Sem segmento';
  }

  function leagueLabel(segment) {
    return segment === 'FEMININO' ? 'Mulheres' : labelSegment(segment);
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
    if (!force && cache) return cache;

    const stored = await storageGet([STATE_KEY, CACHE_KEY]);
    const saved = stored?.[STATE_KEY] || {};
    let rows = Array.isArray(saved.rows) ? saved.rows : [];
    let headers = Array.isArray(saved.headers) ? saved.headers : [];
    let statuses = saved.serverStatuses || {};
    let references = stored?.[CACHE_KEY] || {};

    if (saved.apiUrl && saved.apiToken) {
      try {
        const data = await api(saved, 'listAthletes', {});
        rows = Array.isArray(data?.athletes) ? data.athletes : rows;
        headers = Array.isArray(data?.headers) && data.headers.length
          ? data.headers
          : (rows.length ? Object.keys(rows[0]) : headers);
        statuses = data?.statuses || statuses;
        references = { ...references, ...(data?.references || {}) };
      } catch (error) {
        if (!rows.length) throw error;
      }
    }

    const athletes = rows.map((row, sourceIndex) => {
      const athleteId = value(row, headers, ['ID', 'ID do atleta']);
      const name = value(row, headers, ['Nome completo do atleta', 'Nome completo', 'Nome']);
      const category = categoryOf(row, headers);
      const segmentRaw = value(row, headers, ['Segmento', 'segmentCode', 'Segment']);
      const segment = normalizeSegment(segmentRaw, category);
      return {
        athleteId,
        name,
        category,
        segment,
        sourceIndex,
        status: statuses?.[athleteId] || '',
        reference: references?.[athleteId] || null
      };
    }).filter(item => item.athleteId && item.name);

    cache = { saved, rows, headers, statuses, references, athletes };
    return cache;
  }

  function segmentStats(athletes) {
    const order = ['KIDS', 'MASCULINO', 'FEMININO'];
    return order.map(code => ({
      code,
      label: labelSegment(code),
      items: athletes.filter(item => item.segment === code)
    }));
  }

  function categoryStats(athletes, segment) {
    const groups = new Map();
    for (const athlete of athletes.filter(item => item.segment === segment)) {
      if (!groups.has(athlete.category)) groups.set(athlete.category, []);
      groups.get(athlete.category).push(athlete);
    }
    return [...groups.entries()]
      .map(([name, items]) => ({
        name,
        items: items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
        registered: items.filter(item => item.reference?.bigmidiaId).length
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', {
        numeric: true,
        sensitivity: 'base'
      }));
  }

  async function persistSelection(item, data) {
    const stored = await storageGet([STATE_KEY]);
    const saved = stored?.[STATE_KEY] || {};
    await storageSet({
      [STATE_KEY]: {
        ...saved,
        headers: data.headers,
        rows: data.rows,
        currentIndex: item.sourceIndex,
        dataSource: 'sheets',
        serverStatuses: data.statuses || {},
        categoryFilter: '',
        availableCategories: [...new Set(data.athletes.map(a => a.category).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
        documentStatus: {},
        pendingRegistration: null
      }
    });
  }

  function athleteButton(item, data) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ykl-v150-athlete-row';
    const league = item.reference?.bigmidiaId
      ? `Liga #${item.reference.bigmidiaId}`
      : 'Sem registro na Liga';
    button.innerHTML = `
      <strong>${escapeHtml(item.name)}</strong>
      <span>${escapeHtml(labelSegment(item.segment))} · ${escapeHtml(item.category)} · ${escapeHtml(league)}</span>`;
    button.addEventListener('click', async () => {
      try {
        await persistSelection(item, data);
      } catch (error) {
        console.error('[Importador Yoka][Segmentos]', error);
      }
    });
    return button;
  }

  function ensureStyles() {
    if ($('#ykl-v151-segment-style')) return;
    const style = document.createElement('style');
    style.id = 'ykl-v151-segment-style';
    style.textContent = `
      .ykl-v151-segment-nav{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:8px 0 10px}
      .ykl-v151-segment-button{border:1px solid #d6dce5;background:#fff;border-radius:8px;padding:8px 6px;text-align:left;cursor:pointer;color:#1f2937}
      .ykl-v151-segment-button strong{display:block;font-size:12px}
      .ykl-v151-segment-button span{display:block;font-size:10px;color:#6b7280;margin-top:2px}
      .ykl-v151-segment-button.active{border-color:#2563eb;background:#eff6ff}
      .ykl-v151-lpf{font-size:10px;color:#6b7280;margin-top:-4px;margin-bottom:8px}
      @media (max-width:520px){.ykl-v151-segment-nav{grid-template-columns:1fr}}
    `;
    document.documentElement.appendChild(style);
  }

  function ensureSegmentNav(overview) {
    let nav = $('#ykl-v151-segment-nav', overview);
    if (nav) return nav;
    nav = document.createElement('div');
    nav.id = 'ykl-v151-segment-nav';
    nav.className = 'ykl-v151-segment-nav';
    const grid = $('#ykl-v150-category-grid', overview);
    grid?.before(nav);
    return nav;
  }

  function showOverview() {
    const overview = $('#ykl-v150-category-view');
    const detail = $('#ykl-v150-category-detail');
    if (overview) overview.hidden = false;
    if (detail) detail.hidden = true;
    currentDetail = null;
  }

  async function openCategory(segment, category, data) {
    const overview = $('#ykl-v150-category-view');
    const detail = $('#ykl-v150-category-detail');
    if (!overview || !detail) return;

    const items = data.athletes
      .filter(item => item.segment === segment && item.category === category)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    currentDetail = { segment, category };
    overview.hidden = true;
    detail.hidden = false;
    const title = $('#ykl-v150-category-title');
    const count = $('#ykl-v150-category-count');
    const list = $('#ykl-v150-category-athletes');
    if (title) title.textContent = `${labelSegment(segment)} · ${category}`;
    if (count) count.textContent = `${items.length} atleta(s)`;
    if (list) {
      list.innerHTML = '';
      items.forEach(item => list.appendChild(athleteButton(item, data)));
    }
  }

  function wireBackButton() {
    const back = $('#ykl-v150-category-back');
    if (!back || back.dataset.v151Ready === '1') return;
    back.dataset.v151Ready = '1';
    back.addEventListener('click', event => {
      event.stopImmediatePropagation();
      showOverview();
      scheduleRender();
    }, true);
  }

  async function render(force = false) {
    if (rendering) return;
    const overview = $('#ykl-v150-category-view');
    const grid = $('#ykl-v150-category-grid');
    if (!overview || !grid) return;

    rendering = true;
    try {
      ensureStyles();
      wireBackButton();
      const stored = await storageGet([SEGMENT_KEY]);
      const data = await loadDataset(force);
      const segments = segmentStats(data.athletes);
      const availableCodes = segments.filter(item => item.items.length).map(item => item.code);
      const storedSegment = stored?.[SEGMENT_KEY];
      if (availableCodes.includes(storedSegment)) activeSegment = storedSegment;
      else if (!availableCodes.includes(activeSegment)) activeSegment = availableCodes[0] || 'KIDS';

      const nav = ensureSegmentNav(overview);
      nav.innerHTML = '';
      segments.forEach(segment => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ykl-v151-segment-button';
        button.classList.toggle('active', segment.code === activeSegment);
        button.innerHTML = `<strong>${escapeHtml(segment.label)}</strong><span>${segment.items.length} atleta(s)</span>`;
        button.addEventListener('click', async () => {
          activeSegment = segment.code;
          currentDetail = null;
          await storageSet({ [SEGMENT_KEY]: activeSegment });
          showOverview();
          scheduleRender();
        });
        nav.appendChild(button);
      });

      let note = $('#ykl-v151-lpf-note', overview);
      if (!note) {
        note = document.createElement('div');
        note.id = 'ykl-v151-lpf-note';
        note.className = 'ykl-v151-lpf';
        nav.after(note);
      }
      note.textContent = activeSegment === 'FEMININO'
        ? 'Na Liga Paulista este segmento aparece como “Mulheres”.'
        : '';

      const categories = categoryStats(data.athletes, activeSegment);
      const total = $('#ykl-v150-athlete-total');
      if (total) {
        total.textContent = `${labelSegment(activeSegment)} · ${segments.find(s => s.code === activeSegment)?.items.length || 0} atletas · ${categories.length} categorias`;
      }

      grid.innerHTML = '';
      categories.forEach(group => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ykl-v150-category-card';
        button.innerHTML = `
          <strong>${escapeHtml(group.name)}</strong>
          <span>${group.items.length} atletas</span>
          <small>${group.registered} com registro na Liga</small>`;
        button.addEventListener('click', () => openCategory(activeSegment, group.name, data));
        grid.appendChild(button);
      });

      if (!categories.length) {
        grid.innerHTML = '<div class="ykl-note">Nenhum atleta neste segmento.</div>';
      }

      if (currentDetail) {
        if (currentDetail.segment === activeSegment) {
          await openCategory(currentDetail.segment, currentDetail.category, data);
        } else {
          showOverview();
        }
      }
    } catch (error) {
      console.error('[Importador Yoka][Segmentos]', error);
    } finally {
      rendering = false;
    }
  }

  function scheduleRender(force = false) {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => render(force), 80);
  }

  const observer = new MutationObserver(() => {
    if (!rendering && $('#ykl-v150-category-grid')) scheduleRender();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[STATE_KEY] || changes[CACHE_KEY]) {
      cache = null;
      scheduleRender(true);
    }
  });

  scheduleRender(true);
})();
