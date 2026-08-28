(() => {
  'use strict';

  const CATALOG_KEY = 'yklFieldCatalogV150';
  const FORM_ID = 'Atleta';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function fieldLabel(el) {
    const form = document.getElementById(FORM_ID);
    const direct = form?.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (direct?.textContent.trim()) return direct.textContent.replace(/\s+/g, ' ').trim();
    const group = el.closest('.form-group, [class*="field-"]');
    const label = group?.querySelector('label');
    if (label?.textContent.trim()) return label.textContent.replace(/\s+/g, ' ').trim();
    return el.getAttribute('placeholder') || el.name || el.id;
  }

  function fieldGroup(id) {
    if (id.startsWith('atletaresponsavel-')) return 'Responsável';
    if (id.startsWith('atletaendereco-')) return 'Endereço do atleta';
    if (id.startsWith('atletadadosmedicos-')) return 'Dados médicos';
    if (id.startsWith('atletamedida-') || id === 'atleta-medidas') return 'Medidas e uniforme';
    if (id.startsWith('atletabanco-')) return 'Dados bancários';
    if (id.startsWith('atletahistorico-') || ['atleta-nome_evento','atleta-nome_internacional','atleta-lado_dominante','atleta-id_posicao','atleta-registro_federacao'].includes(id)) return 'Dados esportivos';
    return 'Dados do atleta';
  }

  function discover() {
    const form = document.getElementById(FORM_ID);
    if (!form) return [];
    const excludedNames = new Set(['website', 'url', 'email_confirm']);
    return $$('input[id], select[id], textarea[id]', form)
      .filter(el => {
        const type = String(el.type || '').toLowerCase();
        if (['hidden','file','submit','button','reset','password'].includes(type)) return false;
        if (excludedNames.has(el.name)) return false;
        if (!el.id || el.id.startsWith('mceu_') || el.id.startsWith('generalSearch')) return false;
        if (el.id.startsWith('atletamedida-') || el.id === 'atleta-medidas') return false;
        return true;
      })
      .map(el => ({
        id: el.id,
        label: fieldLabel(el),
        group: fieldGroup(el.id),
        tag: el.tagName.toLowerCase(),
        type: el.type || ''
      }));
  }

  function saveCatalog(fields) {
    if (!fields.length) return;
    const payload = {
      version: 1,
      capturedAt: Date.now(),
      sourcePath: location.pathname,
      fields
    };
    chrome.storage.local.set({ [CATALOG_KEY]: payload });
  }

  function capture() {
    const fields = discover();
    if (fields.length) saveCatalog(fields);
  }

  if (!document.getElementById(FORM_ID)) return;
  capture();
  setTimeout(capture, 700);
  setTimeout(capture, 2200);
})();
