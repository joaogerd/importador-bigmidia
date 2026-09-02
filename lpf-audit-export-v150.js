(() => {
  'use strict';

  if (location.pathname.replace(/\/$/, '') !== '/atleta/index') return;

  const STATE_KEY = 'yklStateV2';
  const AUDIT_KEY = 'yklLpfAuditV150';
  const GROUPS = {
    kids: ['Sub-7', 'Sub-8', 'Sub-9', 'Sub-10'],
    junior: ['Sub-11', 'Sub-13', 'Sub-15', 'Sub-17']
  };

  const get = keys => new Promise(resolve => chrome.storage.local.get(keys, resolve));

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

  function categoryOf(row, headers) {
    return value(row, headers, ['Equipe atual', 'Categoria calculada', 'Categoria', 'Equipe']) || 'Sem categoria';
  }

  function athleteIdOf(row, headers) {
    return value(row, headers, ['ID', 'ID do atleta']);
  }

  function athleteNameOf(row, headers) {
    return value(row, headers, ['Nome completo do atleta', 'Nome completo', 'Nome']);
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
      textarea.style.pointerEvents = 'none';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      return ok;
    }
  }

  function currentCategory() {
    return String(document.querySelector('#ykl-v150-category-title')?.textContent || '').trim();
  }

  function rowsForExport(rows, headers, auditResults) {
    return rows.map((row, index) => {
      const athleteId = athleteIdOf(row, headers);
      const result = auditResults?.[athleteId] || {};
      return [
        index + 1,
        athleteNameOf(row, headers),
        result.registrationDate || '',
        result.photo === 'ok' ? 'X' : '',
        result.rg === 'ok' ? 'X' : '',
        result.medical === 'ok' ? 'X' : '',
        result.authorization === 'ok' ? 'X' : ''
      ];
    });
  }

  async function exportRows(predicate) {
    const stored = await get([STATE_KEY, AUDIT_KEY]);
    const saved = stored?.[STATE_KEY] || {};
    const headers = Array.isArray(saved.headers) ? saved.headers : [];
    const sourceRows = Array.isArray(saved.rows) ? saved.rows : [];
    const results = stored?.[AUDIT_KEY]?.results || {};

    const rows = sourceRows
      .filter(row => athleteIdOf(row, headers) && athleteNameOf(row, headers))
      .filter(row => predicate(categoryOf(row, headers)))
      .sort((a, b) => {
        const cat = categoryOf(a, headers).localeCompare(categoryOf(b, headers), 'pt-BR', { numeric: true, sensitivity: 'base' });
        return cat || athleteNameOf(a, headers).localeCompare(athleteNameOf(b, headers), 'pt-BR', { sensitivity: 'base' });
      });

    if (!rows.length) throw new Error('Nenhum atleta encontrado para esta planilha.');

    const text = rowsForExport(rows, headers, results).map(row => row.join('\t')).join('\n');
    const copied = await copyText(text);
    if (!copied) throw new Error('Não foi possível copiar os dados para a área de transferência.');

    const pending = rows.filter(row => {
      const result = results?.[athleteIdOf(row, headers)] || {};
      return !result.registrationDate || ['photo', 'rg', 'medical', 'authorization'].some(key => result[key] !== 'ok');
    }).length;

    return { total: rows.length, pending };
  }

  function setMessage(host, text) {
    const target = host?.querySelector('.ykl-lpf-index-message, .ykl-lpf-overview-message');
    if (target) target.textContent = text;
  }

  function unlockButtons() {
    const categoryButton = document.querySelector('#ykl-lpf-copy-category');
    if (categoryButton) {
      categoryButton.disabled = false;
      categoryButton.title = 'Copia o estado atual da conferência. Pendências ficam em branco.';
    }

    document.querySelectorAll('[data-lpf-copy-group]').forEach(button => {
      button.disabled = false;
      button.title = 'Copia o estado atual da conferência. Pendências ficam em branco.';
    });
  }

  document.addEventListener('pointerdown', async event => {
    const categoryButton = event.target.closest?.('#ykl-lpf-copy-category');
    const groupButton = event.target.closest?.('[data-lpf-copy-group]');
    const button = categoryButton || groupButton;
    if (!button) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    button.disabled = true;

    const host = button.closest('#ykl-lpf-index-card, #ykl-lpf-overview');
    const original = button.textContent;
    button.textContent = 'Copiando…';

    try {
      let result;
      if (categoryButton) {
        const category = currentCategory();
        if (!category) throw new Error('Abra uma categoria antes de copiar a planilha.');
        result = await exportRows(itemCategory => itemCategory === category);
      } else {
        const groupId = String(groupButton.dataset.lpfCopyGroup || '').trim();
        const categories = GROUPS[groupId];
        if (!categories) throw new Error('Grupo de categorias não reconhecido.');
        result = await exportRows(itemCategory => categories.includes(itemCategory));
      }

      setMessage(host, `✓ ${result.total} linha(s) copiadas. ${result.pending ? `${result.pending} ainda têm pendência(s); essas células ficaram em branco.` : 'Todos os itens copiados estão OK.'} Cole na planilha LPF a partir de B5.`);
    } catch (error) {
      setMessage(host, error?.message || String(error));
    } finally {
      button.textContent = original;
      button.disabled = false;
    }
  }, true);

  const observer = new MutationObserver(() => unlockButtons());
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
  unlockButtons();
})();
