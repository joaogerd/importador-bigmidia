(() => {
  'use strict';

  const STORAGE_KEY = 'yklStateV2';
  const DEFAULT_DELAY = 750;
  const MIN_DELAY = 550;
  const FORM_ID = 'Atleta';
  const state = {
    headers: [], rows: [], mapping: {}, currentIndex: 0,
    completed: {}, delay: DEFAULT_DELAY, running: false, abort: false,
    fields: [], filter: '', logoDataUrl: '',
    documentRunning: false, documentStatus: {},
    apiUrl: '', apiToken: '', dataSource: 'csv', serverStatuses: {},
    categoryFilter: '', availableCategories: [],
    pendingRegistration: null, savedMapping: {}, mappingSavedAt: 0
  };

  const SPECIAL = {
    athleteCpf: 'atletadocumento-numero',
    athleteBirthDisplay: 'atleta-data_nascimento-disp',
    athleteBirthHidden: 'atleta-data_nascimento',
    athleteName: 'atleta-nome_completo',
    athleteRfbButton: 'cpfReceita',
    athleteCep: 'atletaendereco-endereco-cep',
    athleteMunicipio: 'atletaendereco-id_municipio',
    responsibleCpf: 'atletaresponsavel-cpf',
    responsibleBirthDisplay: 'atletaresponsavel-data_nascimento-disp',
    responsibleBirthHidden: 'atletaresponsavel-data_nascimento',
    responsibleName: 'atletaresponsavel-nome_completo',
    responsibleRfbButton: 'cpfReceitaResp',
    responsibleCep: 'atletaresponsavel-endereco-cep',
    responsibleMunicipio: 'atletaresponsavel-id_municipio'
  };

  const ALIASES = {
    'atletadocumento-numero': ['cpf atleta','cpf do atleta','cpf','documento atleta'],
    'atleta-data_nascimento-disp': ['data nascimento atleta','data de nascimento atleta','nascimento atleta','data nascimento','data de nascimento','nascimento'],
    'atleta-nome_completo': ['nome completo atleta','nome do atleta','atleta','nome completo','nome'],
    'atleta-sexo': ['sexo atleta','genero atleta','gênero atleta','sexo','genero','gênero'],
    'atleta-escolaridade': ['escolaridade atleta','escolaridade'],
    'atleta-nome_mae': ['nome da mae','nome da mãe','mae','mãe'],
    'atleta-nome_pai': ['nome do pai','pai'],
    'atleta-cidade_natu': ['naturalidade','cidade nascimento','cidade natal'],
    'atleta-email': ['email atleta','e-mail atleta','email','e-mail'],
    'atleta-telefone_celular': ['celular atleta','telefone atleta','whatsapp atleta','celular'],
    'atleta-nome_evento': ['apelido','nome evento','nome para evento'],
    'atleta-lado_dominante': ['lado dominante','pe dominante','pé dominante'],
    'atleta-id_posicao': ['posicao','posição','posicoes','posições'],
    'atletahistorico-id_estabelecimento': ['clube','equipe','estabelecimento','vinculo','vínculo'],
    'atletaendereco-endereco-cep': ['cep atleta','cep'],
    'atletaendereco-logradouro': ['logradouro atleta','endereco atleta','endereço atleta','rua atleta','logradouro','endereco','endereço','rua'],
    'atletaendereco-numero': ['numero endereco atleta','número endereço atleta','numero atleta','número atleta','numero','número'],
    'atletaendereco-complemento': ['complemento atleta','complemento'],
    'atletaendereco-bairro': ['bairro atleta','bairro'],
    'atletaendereco-city': ['cidade atleta','cidade'],
    'atletaendereco-state': ['estado atleta','uf atleta','estado','uf'],
    'atletaresponsavel-cpf': ['cpf responsavel','cpf responsável','cpf do responsavel','cpf do responsável'],
    'atletaresponsavel-data_nascimento-disp': ['nascimento responsavel','nascimento responsável','data nascimento responsavel','data nascimento responsável','data de nascimento responsavel','data de nascimento responsável'],
    'atletaresponsavel-nome_completo': ['nome responsavel','nome responsável','responsavel','responsável','nome do responsavel','nome do responsável'],
    'atletaresponsavel-parentesco': ['parentesco','grau parentesco','grau de parentesco'],
    'atletaresponsavel-email': ['email responsavel','email responsável','e-mail responsavel','e-mail responsável'],
    'atletaresponsavel-telefone_celular': ['celular responsavel','celular responsável','telefone responsavel','telefone responsável','whatsapp responsavel','whatsapp responsável'],
    'atletaresponsavel-endereco-cep': ['cep responsavel','cep responsável'],
    'atletaresponsavel-logradouro': ['logradouro responsavel','logradouro responsável','endereco responsavel','endereço responsável','rua responsavel','rua responsável'],
    'atletaresponsavel-numero': ['numero responsavel','número responsável','numero endereco responsavel','número endereço responsável'],
    'atletaresponsavel-complemento': ['complemento responsavel','complemento responsável'],
    'atletaresponsavel-bairro': ['bairro responsavel','bairro responsável'],
    'atletaresponsavel-city': ['cidade responsavel','cidade responsável'],
    'atletaresponsavel-state': ['estado responsavel','estado responsável','uf responsavel','uf responsável'],
    'atletadadosmedicos-plano_saude': ['plano de saude','plano de saúde','plano saude','plano saúde'],
    'atletadadosmedicos-carteira_sus': ['cartao sus','cartão sus','carteira sus','sus'],
    'atletadadosmedicos-alergia_medicamento': ['alergia medicamento','alergia a medicamento','alergias'],
    'atletadadosmedicos-doencas_conhecidas': ['doencas conhecidas','doenças conhecidas','doencas','doenças']
  };


  const EXACT_HEADER_PRESET = {
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

  const DERIVED_RESP_HEADERS = {
    name: 'Gerado: nome do responsável principal',
    cpf: 'Gerado: CPF do responsável principal',
    phone: 'Gerado: telefone do responsável principal',
    relation: 'Gerado: parentesco do responsável principal'
  };

  const DOCUMENT_HEADERS = {
    rg: ['Link do RG'],
    atestado: ['Link do atestado'],
    autorizacao: ['Link da autorização', 'Link da autorizacao']
  };

  const DOCUMENT_CONFIG = {
    rg: {
      label: 'RG',
      fallbackName: 'RG',
      typeLabels: ['RG', 'Registro Geral', 'Carteira de identidade', 'Documento de identidade', 'Identidade']
    },
    atestado: {
      label: 'Atestado',
      fallbackName: 'Atestado médico',
      typeLabels: ['Atestado médico', 'Atestado de saúde', 'Atestado']
    },
    autorizacao: {
      label: 'Termo Responsável (Menor de 18)',
      fallbackName: 'Termo Responsável (Menor de 18)',
      typeLabels: [
        'Termo Responsável (Menor de 18)',
        'Termo Responsavel (Menor de 18)'
      ]
    }
  };

  const BIGMIDIA_ATHLETE_CREATE_URL = 'https://ligapaulistafutsal.bigmidia.com/atleta/create';
  const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

  function isBigMidiaAthleteCreatePage() {
    try {
      const expected = new URL(BIGMIDIA_ATHLETE_CREATE_URL);
      return location.origin === expected.origin && location.pathname === expected.pathname;
    } catch {
      return false;
    }
  }

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function normalize(value) {
    return String(value ?? '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }


  function findHeader(headers, candidates) {
    const normalized = headers.map(h => ({ raw: h, n: normalize(h) }));
    for (const candidate of candidates) {
      const found = normalized.find(h => h.n === normalize(candidate));
      if (found) return found.raw;
    }
    return '';
  }

  function athleteCategory(row, headers = state.headers) {
    const teamHeader = findHeader(headers, ['Equipe atual', 'Equipe']);
    const calculatedHeader = findHeader(headers, ['Categoria calculada', 'Categoria']);
    return String((teamHeader && row[teamHeader]) || (calculatedHeader && row[calculatedHeader]) || '').trim();
  }

  function collectCategories(rows, headers = state.headers) {
    return [...new Set(rows.map(row => athleteCategory(row, headers)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  }

  function filterRowsByCategory(rows, category, headers = state.headers) {
    const selected = String(category || '').trim();
    if (!selected) return [...rows];
    const wanted = normalize(selected);
    return rows.filter(row => normalize(athleteCategory(row, headers)) === wanted);
  }

  function renderCategoryFilter() {
    const select = $('#ykl-category-filter');
    if (!select) return;
    const categories = Array.isArray(state.availableCategories) ? state.availableCategories : [];
    select.innerHTML = '<option value="">Todas as categorias</option>' + categories
      .map(category => `<option value="${escapeAttr(category)}">${escapeHtml(category)}</option>`)
      .join('');
    select.value = categories.includes(state.categoryFilter) ? state.categoryFilter : '';
    $('#ykl-category-summary').textContent = state.categoryFilter
      ? `Exibindo somente ${state.categoryFilter}.`
      : 'Exibindo atletas de todas as categorias.';
  }

  function addDerivedResponsibleColumns(headers, rows) {
    const principalH = findHeader(headers, ['Responsável principal', 'Responsavel principal']);
    const motherNameH = findHeader(headers, ['Nome da mãe', 'Nome da mae']);
    const motherCpfH = findHeader(headers, ['CPF da mãe', 'CPF da mae']);
    const motherPhoneH = findHeader(headers, ['Telefone/WhatsApp da mãe', 'Telefone WhatsApp da mãe', 'Telefone da mãe']);
    const fatherNameH = findHeader(headers, ['Nome do pai']);
    const fatherCpfH = findHeader(headers, ['CPF do pai']);
    const fatherPhoneH = findHeader(headers, ['Telefone/WhatsApp do pai', 'Telefone WhatsApp do pai', 'Telefone do pai']);

    if (!principalH && !motherNameH && !fatherNameH) return { headers, rows };

    const outputHeaders = [...headers];
    Object.values(DERIVED_RESP_HEADERS).forEach(h => {
      if (!outputHeaders.includes(h)) outputHeaders.push(h);
    });

    const outputRows = rows.map(row => {
      const principal = String(row[principalH] || '').trim();
      const p = normalize(principal);
      const motherName = String(row[motherNameH] || '').trim();
      const fatherName = String(row[fatherNameH] || '').trim();
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
        [DERIVED_RESP_HEADERS.name]: useMother ? motherName : fatherName,
        [DERIVED_RESP_HEADERS.cpf]: String(row[useMother ? motherCpfH : fatherCpfH] || '').trim(),
        [DERIVED_RESP_HEADERS.phone]: String(row[useMother ? motherPhoneH : fatherPhoneH] || '').trim(),
        [DERIVED_RESP_HEADERS.relation]: useMother ? 'Mãe' : role === 'pai' ? 'Pai' : ''
      };
    });

    return { headers: outputHeaders, rows: outputRows };
  }

  function isStreetTypeField(field) {
    const label = normalize(field?.label || '');
    const id = normalize(field?.id || '').replace(/[_-]+/g, ' ');
    return label.includes('tipo logradouro') || id.includes('tipo logradouro');
  }

  function deriveStreetType(row) {
    const explicit = getHeaderValue(row, ['Tipo Logradouro', 'Tipo de Logradouro']);
    if (explicit && explicit.length <= 50) return explicit;

    const raw = getHeaderValue(row, ['Logradouro', 'Endereço completo', 'Endereco completo']);
    if (!raw) return '';

    const clean = String(raw).trim().replace(/^[,;\s]+/, '');
    const types = [
      'Avenida', 'Av.', 'Rua', 'R.', 'Travessa', 'Tv.', 'Alameda', 'Al.',
      'Rodovia', 'Estrada', 'Praça', 'Praca', 'Largo', 'Viela', 'Servidão',
      'Servidao', 'Passagem', 'Via', 'Acesso', 'Quadra', 'Condomínio', 'Condominio'
    ];
    const normalizedClean = normalize(clean);
    const found = types.find(type => {
      const n = normalize(type.replace(/\.$/, ''));
      return normalizedClean === n || normalizedClean.startsWith(`${n} `);
    });
    if (!found) return '';
    return found.replace(/\.$/, '');
  }

  async function fillStreetTypeIfNeeded(prefix) {
    const row = currentRow();
    const value = deriveStreetType(row);
    if (!value) return;

    const fields = state.fields.filter(field => field.id.startsWith(prefix) && isStreetTypeField(field));
    for (const field of fields) {
      const el = document.getElementById(field.id);
      if (!el || String(el.value || '').trim()) continue;
      await setField(field.id, value, field.label || 'Tipo Logradouro');
    }
  }

  function applyExactPreset() {
    for (const [fieldId, candidates] of Object.entries(EXACT_HEADER_PRESET)) {
      const header = findHeader(state.headers, candidates);
      if (header) state.mapping[fieldId] = header;
    }
  }

  function csvParse(text) {
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const delimiters = [',', ';', '\t'];
    let delimiter = ',';
    let best = -1;
    for (const d of delimiters) {
      const count = (firstLine.match(new RegExp(d === '\t' ? '\\t' : `\\${d}`, 'g')) || []).length;
      if (count > best) { best = count; delimiter = d; }
    }
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') quoted = false;
        else field += c;
      } else if (c === '"') quoted = true;
      else if (c === delimiter) { row.push(field.trim()); field = ''; }
      else if (c === '\n') { row.push(field.trim().replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
      else field += c;
    }
    if (field.length || row.length) { row.push(field.trim().replace(/\r$/, '')); rows.push(row); }
    const cleaned = rows.filter(r => r.some(v => String(v).trim() !== ''));
    if (!cleaned.length) return { headers: [], rows: [] };
    const headers = cleaned[0].map((h, i) => h || `Coluna ${i + 1}`);
    const data = cleaned.slice(1).map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ''])));
    return { headers, rows: data };
  }

  function getFieldLabel(el) {
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

  function discoverFields() {
    const form = document.getElementById(FORM_ID);
    if (!form) return [];
    const excludedNames = new Set(['website', 'url', 'email_confirm']);
    return $$('input[id], select[id], textarea[id]', form)
      .filter(el => {
        const type = (el.type || '').toLowerCase();
        if (['hidden','file','submit','button','reset','password'].includes(type)) return false;
        if (excludedNames.has(el.name)) return false;
        if (!el.id || el.id.startsWith('mceu_') || el.id.startsWith('generalSearch')) return false;
        if (el.id.startsWith('atletamedida-') || el.id === 'atleta-medidas') return false;
        return true;
      })
      .map(el => ({ id: el.id, label: getFieldLabel(el), group: fieldGroup(el.id), tag: el.tagName.toLowerCase(), type: el.type || '' }));
  }

  function autoMap() {
    applyExactPreset();
    const normalizedHeaders = state.headers.map(h => ({ raw: h, n: normalize(h) }));
    for (const field of state.fields) {
      // “Tipo Logradouro” não pode receber a coluna “Logradouro” completa.
      // Remove inclusive mapeamentos antigos salvos no Chrome.
      if (isStreetTypeField(field)) {
        delete state.mapping[field.id];
        continue;
      }
      if (state.mapping[field.id] && state.headers.includes(state.mapping[field.id])) continue;
      // Os dados do responsável são derivados de mãe/pai. Evita usar, por engano,
      // a data de nascimento ou o endereço do atleta nos campos do responsável.
      if (field.id.startsWith('atletaresponsavel-')) continue;
      const candidates = [field.label, field.id, field.id.replace(/^(atleta|atletaendereco|atletaresponsavel|atletadadosmedicos|atletamedida|atletabanco)-/, '').replace(/[_-]/g, ' '), ...(ALIASES[field.id] || [])].map(normalize);
      let found = normalizedHeaders.find(h => candidates.includes(h.n));
      if (!found) {
        found = normalizedHeaders.find(h => candidates.some(c => c.length >= 5 && (h.n.includes(c) || c.includes(h.n))));
      }
      if (found) state.mapping[field.id] = found.raw;
    }
  }

  function getMappedValue(row, fieldId) {
    const header = state.mapping[fieldId];
    return header ? String(row?.[header] ?? '').trim() : '';
  }

  function nativeSet(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype :
      el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor?.set) descriptor.set.call(el, value); else el.value = value;
  }

  function emit(el, eventName) {
    el.dispatchEvent(new Event(eventName, { bubbles: true, composed: true }));
  }

  function brDate(value) {
    const s = String(value || '').trim();
    if (!s) return '';
    let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return `${m[3].padStart(2,'0')}/${m[2].padStart(2,'0')}/${m[1]}`;
    m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
    if (m) return `${m[1].padStart(2,'0')}/${m[2].padStart(2,'0')}/${m[3].length === 2 ? '20' + m[3] : m[3]}`;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    return s;
  }

  function isoDate(value) {
    const s = brDate(value);
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : value;
  }

  function findOptionValue(select, raw) {
    const wanted = normalize(raw);
    if (!wanted) return '';
    const options = [...select.options];
    let option = options.find(o => String(o.value) === String(raw));
    if (!option) option = options.find(o => normalize(o.textContent) === wanted);
    if (!option) option = options.find(o => normalize(o.textContent).includes(wanted) || wanted.includes(normalize(o.textContent)));
    if (!option && select.id === 'atleta-id_posicao') {
      const aliases = { goleiro: 'goleiro', linha: 'ala', jogador: 'ala', pivo: 'pivo', fixo: 'fixo', ala: 'ala' };
      const key = Object.keys(aliases).find(k => wanted.includes(k));
      if (key) option = options.find(o => normalize(o.textContent).includes(aliases[key]));
    }
    if (!option && select.id === 'atleta-sexo') {
      if (/^(m|masculino|homem)$/.test(wanted)) option = options.find(o => o.value === 'M');
      if (/^(f|feminino|mulher)$/.test(wanted)) option = options.find(o => o.value === 'F');
    }
    if (!option && select.id === 'atleta-lado_dominante') {
      if (/destro|direit/.test(wanted)) option = options.find(o => o.value === 'D');
      if (/canhoto|esquerd/.test(wanted)) option = options.find(o => o.value === 'E');
      if (/ambidestro|ambos/.test(wanted)) option = options.find(o => o.value === 'A');
    }
    return option?.value ?? '';
  }

  async function setField(id, rawValue, labelOverride) {
    if (state.abort) throw new Error('Preenchimento interrompido pelo usuário.');
    const value = String(rawValue ?? '').trim();
    if (!value) return false;
    const el = document.getElementById(id);
    if (!el) { log(`⚠ Campo não encontrado: ${id}`); return false; }
    const label = labelOverride || getFieldLabel(el);
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await sleep(120);
    el.focus();

    if (el instanceof HTMLSelectElement) {
      const selected = findOptionValue(el, value);
      if (!selected) { log(`⚠ Opção não encontrada em ${label}: “${value}”`); return false; }
      nativeSet(el, selected);
      emit(el, 'input'); emit(el, 'change');
    } else if (el.type === 'checkbox') {
      const checked = ['1','sim','true','x','yes'].includes(normalize(value));
      el.checked = checked; emit(el, 'input'); emit(el, 'change');
    } else if (el.type === 'radio') {
      const group = $$(`input[type="radio"][name="${CSS.escape(el.name)}"]`);
      const wanted = normalize(value);
      const radio = group.find(r => normalize(r.value) === wanted || normalize(r.closest('label')?.textContent || '') === wanted);
      if (radio) { radio.checked = true; emit(radio, 'change'); }
    } else {
      const finalValue = id.includes('data_nascimento-disp') || id.includes('data_emissao-disp') ? brDate(value) : value;
      nativeSet(el, finalValue);
      emit(el, 'input'); emit(el, 'change');
    }
    el.blur(); emit(el, 'blur');
    log(`✓ ${label}`);
    await sleep(Math.max(MIN_DELAY, state.delay));
    return true;
  }

  async function setDatePair(displayId, hiddenId, value) {
    if (!value) return;
    await setField(displayId, brDate(value));
    await sleep(300);
    const hidden = document.getElementById(hiddenId);
    if (hidden && !hidden.value) {
      nativeSet(hidden, isoDate(value));
      emit(hidden, 'input'); emit(hidden, 'change');
      await sleep(Math.max(MIN_DELAY, state.delay));
    }
  }

  async function clickAndWaitForValue(buttonId, outputId, description, timeout = 30000) {
    const button = document.getElementById(buttonId);
    const output = document.getElementById(outputId);
    if (!button) throw new Error(`Botão ${description} não encontrado.`);
    if (!output) throw new Error(`Campo de retorno de ${description} não encontrado.`);
    const previous = output.value.trim();
    if (previous) nativeSet(output, '');
    log(`→ ${description}...`);
    button.click();
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (state.abort) throw new Error('Preenchimento interrompido pelo usuário.');
      const current = output.value.trim();
      if (current && (current !== previous || previous === '')) {
        log(`✓ ${description}: ${current}`);
        await sleep(900);
        return current;
      }
      await sleep(300);
    }
    throw new Error(`${description} não retornou dados. Confira CPF e nascimento.`);
  }

  function findCepButton(prefix) {
    return $$('button[type="button"]', document.getElementById(FORM_ID)).find(b => (b.getAttribute('onclick') || '').includes(`buscarCep($('#${prefix}-endereco-cep')`));
  }

  async function searchCep(prefix, municipioId) {
    const cepId = `${prefix}-endereco-cep`;
    const cepValue = getMappedValue(currentRow(), cepId);
    if (!cepValue) return;
    await setField(cepId, cepValue, prefix === 'atletaendereco' ? 'CEP do atleta' : 'CEP do responsável');
    const button = findCepButton(prefix);
    if (!button) { log('⚠ Botão Buscar CEP não encontrado; continuei sem clicar.'); return; }
    log('→ Buscando CEP...');
    button.click();
    const start = Date.now();
    while (Date.now() - start < 20000) {
      if (state.abort) throw new Error('Preenchimento interrompido pelo usuário.');
      const municipio = document.getElementById(municipioId);
      const city = document.getElementById(`${prefix}-city`);
      if ((municipio?.value || '').trim() || (city?.value || '').trim()) {
        log('✓ CEP localizado');
        await sleep(900);
        return;
      }
      await sleep(300);
    }
    log('⚠ A busca de CEP não confirmou o município. Confira manualmente.');
  }

  function currentRow() { return state.rows[state.currentIndex] || null; }


  function currentAthleteId() {
    return getHeaderValue(currentRow(), ['ID', 'ID do atleta']);
  }

  function currentServerStatus() {
    const id = currentAthleteId();
    return id ? (state.serverStatuses[id] || '') : '';
  }

  function apiRequest(action, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'ykl-api-request',
        apiUrl: state.apiUrl,
        token: state.apiToken,
        action,
        payload
      }, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || 'Falha na comunicação com o Yoka.'));
          return;
        }
        resolve(response.data);
      });
    });
  }

  function documentSyncStatus(key) {
    const custom = state.documentStatus[key];
    if (custom?.kind === 'success') return 'Incluído';
    if (custom?.kind === 'error') return 'Erro';
    return normalizeExternalUrl(currentDocuments()[key]) ? 'Pendente' : 'Não disponível';
  }

  async function syncCurrentStatus(status, extra = {}) {
    const id = currentAthleteId();
    if (!id || !state.apiUrl || !state.apiToken) return;
    const row = currentRow();
    const payload = {
      athleteId: id,
      status,
      rg: documentSyncStatus('rg'),
      atestado: documentSyncStatus('atestado'),
      autorizacao: documentSyncStatus('autorizacao'),
      bigmidiaUrl: extra.bigmidiaUrl || '',
      bigmidiaId: extra.bigmidiaId || '',
      observation: extra.observation || '',
      athleteName: displayName(row)
    };
    await apiRequest('updateStatus', payload);
    state.serverStatuses[id] = status;
    if (status === 'Cadastrado') state.completed[state.currentIndex] = true;
    saveState();
    updateAthleteCard();
  }

  async function loadAthletesFromSheets() {
    const urlInput = $('#ykl-api-url');
    const tokenInput = $('#ykl-api-token');
    state.apiUrl = String(urlInput?.value || state.apiUrl || '').trim();
    state.apiToken = String(tokenInput?.value || state.apiToken || '').trim();
    saveState();
    updateConnectionStatus('working', 'Conectando ao Google Sheets...');
    try {
      const data = await apiRequest('listAthletes', {});
      const athletes = Array.isArray(data.athletes) ? data.athletes : [];
      if (!athletes.length) throw new Error('Nenhum atleta foi retornado pela planilha.');
      const headers = Array.isArray(data.headers) && data.headers.length
        ? data.headers
        : Object.keys(athletes[0] || {});
      const enriched = addDerivedResponsibleColumns(headers, athletes);
      state.headers = enriched.headers;
      state.availableCategories = collectCategories(enriched.rows, enriched.headers);
      if (state.categoryFilter && !state.availableCategories.includes(state.categoryFilter)) {
        state.categoryFilter = '';
      }
      state.rows = filterRowsByCategory(enriched.rows, state.categoryFilter, enriched.headers);
      if (!state.rows.length) throw new Error(`Nenhum atleta encontrado na categoria ${state.categoryFilter || 'selecionada'}.`);
      state.currentIndex = 0;
      state.dataSource = 'sheets';
      state.serverStatuses = data.statuses || {};
      state.completed = {};
      state.documentStatus = {};
      state.rows.forEach((row, index) => {
        const idHeader = findHeader(state.headers, ['ID', 'ID do atleta']);
        const id = idHeader ? String(row[idHeader] || '').trim() : '';
        if (id && state.serverStatuses[id] === 'Cadastrado') state.completed[index] = true;
      });
      state.savedMapping = Object.fromEntries(Object.entries(state.savedMapping || {}).filter(([,h]) => state.headers.includes(h)));
      state.mapping = { ...state.savedMapping };
      autoMap();
      saveState();
      renderMapping();
      updateAthleteCard();
      updateControls();
      renderCategoryFilter();
      const categoryText = state.categoryFilter ? ` da categoria ${state.categoryFilter}` : '';
      updateConnectionStatus('ok', `${state.rows.length} atletas${categoryText} carregados do Google Sheets.`);
      switchTab('cadastro');
      log(`✓ ${state.rows.length} atletas${categoryText} carregados diretamente do Google Sheets.`);
    } catch (error) {
      updateConnectionStatus('error', error.message);
      alert(error.message);
    }
  }

  async function testApiConnection() {
    state.apiUrl = String($('#ykl-api-url')?.value || state.apiUrl || '').trim();
    state.apiToken = String($('#ykl-api-token')?.value || state.apiToken || '').trim();
    saveState();
    updateConnectionStatus('working', 'Testando conexão...');
    try {
      await apiRequest('ping', {});
      updateConnectionStatus('ok', 'Conexão com o Yoka OK.');
    } catch (error) {
      updateConnectionStatus('error', error.message);
    }
  }

  function updateConnectionStatus(kind = '', text = '') {
    const dot = $('#ykl-api-dot');
    const label = $('#ykl-api-status');
    if (!dot || !label) return;
    dot.className = `ykl-dot ${kind === 'ok' ? 'ykl-ok' : kind === 'error' ? 'ykl-error' : ''}`;
    label.textContent = text || (state.apiUrl && state.apiToken ? 'Configuração salva.' : 'API ainda não configurada.');
  }

  function extractBigMidiaId(url = location.href) {
    const match = String(url).match(/\/atleta\/(?:view|update|edit)\/(\d+)/i) || String(url).match(/[?&]id=(\d+)/i);
    return match ? match[1] : '';
  }

  function rememberPendingRegistration() {
    if (!state.rows.length) return;
    const athleteId = currentAthleteId();
    if (state.dataSource === 'sheets' && !athleteId) return;
    state.pendingRegistration = {
      athleteId: athleteId || '',
      index: state.currentIndex,
      submittedAt: Date.now(),
      dataSource: state.dataSource,
      documents: {
        rg: documentSyncStatus('rg'),
        atestado: documentSyncStatus('atestado'),
        autorizacao: documentSyncStatus('autorizacao')
      }
    };
    saveState();
  }

  async function finalizePendingRegistrationIfPossible() {
    const pending = state.pendingRegistration;
    if (!pending) return false;
    const age = Date.now() - Number(pending.submittedAt || 0);
    if (age > 10 * 60 * 1000) {
      state.pendingRegistration = null;
      saveState();
      return false;
    }

    const onCreateForm = Boolean(document.getElementById(FORM_ID));
    const successAlert = [...document.querySelectorAll('.alert-success, .alert.alert-success, [class*="success"]')]
      .some(el => /cadastr|salv|sucesso/i.test(el.textContent || ''));
    if (onCreateForm && !successAlert) return false;

    try {
      if (pending.dataSource === 'sheets') {
        if (!state.apiUrl || !state.apiToken) return false;
        await apiRequest('updateStatus', {
          athleteId: pending.athleteId,
          status: 'Cadastrado',
          rg: pending.documents?.rg || 'Pendente',
          atestado: pending.documents?.atestado || 'Pendente',
          autorizacao: pending.documents?.autorizacao || 'Pendente',
          bigmidiaUrl: location.href,
          bigmidiaId: extractBigMidiaId(location.href),
          observation: 'Cadastro confirmado automaticamente após o envio do formulário do BigMidia.'
        });
        state.serverStatuses[pending.athleteId] = 'Cadastrado';
      }

      if (Number.isInteger(pending.index)) {
        state.completed[pending.index] = true;
        if (state.currentIndex === pending.index && state.currentIndex < state.rows.length - 1) {
          state.currentIndex++;
        }
      }
      state.pendingRegistration = null;
      await saveState();
      return true;
    } catch (error) {
      console.warn('[Importador Yoka] Não foi possível confirmar o cadastro:', error);
      return false;
    }
  }

  function orderedFields(predicate) {
    const form = document.getElementById(FORM_ID);
    return state.fields
      .filter(f => predicate(f) && getMappedValue(currentRow(), f.id))
      .sort((a,b) => {
        const ea = document.getElementById(a.id), eb = document.getElementById(b.id);
        if (!ea || !eb) return 0;
        return ea.compareDocumentPosition(eb) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });
  }

  async function fillList(fields, excluded = new Set()) {
    for (const field of fields) {
      if (excluded.has(field.id)) continue;
      await setField(field.id, getMappedValue(currentRow(), field.id));
    }
  }

  async function fillAthlete() {
    if (state.running) return;
    if (!isBigMidiaAthleteCreatePage()) {
      return alert(`Abra a página oficial de inclusão de atleta antes de preencher:
${BIGMIDIA_ATHLETE_CREATE_URL}`);
    }
    const row = currentRow();
    if (!row) return alert('Carregue os atletas do Google Sheets ou importe um CSV e selecione um atleta.');
    const cpf = getMappedValue(row, SPECIAL.athleteCpf);
    const birth = getMappedValue(row, SPECIAL.athleteBirthDisplay);
    if (!cpf || !birth) return alert('Mapeie as colunas de CPF e data de nascimento do atleta.');

    state.running = true; state.abort = false; updateControls(); clearLog(); setProgress(0);
    try {
      log(`Iniciando: ${displayName(row)}`);
      await setField('atleta-id_pais', getMappedValue(row, 'atleta-id_pais') || 'Brazil', 'Nacionalidade');
      await setField(SPECIAL.athleteCpf, cpf, 'CPF do atleta');
      await setDatePair(SPECIAL.athleteBirthDisplay, SPECIAL.athleteBirthHidden, birth);
      await clickAndWaitForValue(SPECIAL.athleteRfbButton, SPECIAL.athleteName, 'Consulta do atleta na RFB');
      setProgress(20);

      const personalExcluded = new Set([
        SPECIAL.athleteCpf, SPECIAL.athleteBirthDisplay, SPECIAL.athleteName,
        SPECIAL.athleteCep, SPECIAL.responsibleCpf, SPECIAL.responsibleBirthDisplay,
        SPECIAL.responsibleName, SPECIAL.responsibleCep
      ]);
      await fillList(orderedFields(f => f.group === 'Dados do atleta' || f.group === 'Dados esportivos'), personalExcluded);
      setProgress(45);

      await searchCep('atletaendereco', SPECIAL.athleteMunicipio);
      await fillStreetTypeIfNeeded('atletaendereco');
      await fillList(orderedFields(f => f.group === 'Endereço do atleta'), new Set([SPECIAL.athleteCep, 'atletaendereco-municipio-descricao']));
      setProgress(62);

      const respCpf = getMappedValue(row, SPECIAL.responsibleCpf);
      const respBirth = getMappedValue(row, SPECIAL.responsibleBirthDisplay);
      const respName = getMappedValue(row, SPECIAL.responsibleName);
      if (!respName && (row['CPF da mãe'] || row['CPF do pai'])) {
        log('⚠ Não consegui identificar o responsável principal. Confira a coluna “Responsável principal”.');
      }
      let responsibleConsulted = false;
      if (respCpf && respBirth) {
        await setDatePair(SPECIAL.responsibleBirthDisplay, SPECIAL.responsibleBirthHidden, respBirth);
        await setField(SPECIAL.responsibleCpf, respCpf, 'CPF do responsável');
        await clickAndWaitForValue(SPECIAL.responsibleRfbButton, SPECIAL.responsibleName, 'Consulta do responsável na RFB');
        responsibleConsulted = true;
      } else if (respCpf) {
        log('ℹ O CSV não possui nascimento do responsável; CPF, nome e telefone serão preenchidos sem consulta à RFB.');
      }
      await searchCep('atletaresponsavel', SPECIAL.responsibleMunicipio);
      await fillStreetTypeIfNeeded('atletaresponsavel');
      const responsibleExcluded = new Set([
        SPECIAL.responsibleBirthDisplay, SPECIAL.responsibleCep, 'atletaresponsavel-municipio-descricao'
      ]);
      if (responsibleConsulted) {
        responsibleExcluded.add(SPECIAL.responsibleCpf);
        responsibleExcluded.add(SPECIAL.responsibleName);
      }
      await fillList(orderedFields(f => f.group === 'Responsável'), responsibleExcluded);
      setProgress(82);

      await fillList(orderedFields(f => ['Dados médicos','Dados bancários'].includes(f.group)));
      const club = document.getElementById('atletahistorico-id_estabelecimento');
      if (club && !club.value) {
        const choices = [...club.options].filter(o => o.value);
        if (choices.length === 1) {
          nativeSet(club, choices[0].value); emit(club, 'input'); emit(club, 'change');
          log(`✓ Vínculo: ${choices[0].textContent.trim()}`);
        }
      }
      setProgress(100);
      if (state.dataSource === 'sheets') {
        try { await syncCurrentStatus('Em preenchimento'); }
        catch (syncError) { log(`⚠ Planilha: ${syncError.message}`); }
      }
      log('✅ Preenchimento concluído. Confira os dados e clique manualmente em Cadastrar.');
      alert('Preenchimento concluído. Confira os dados e use “Incluir todos os documentos” no painel. O botão Cadastrar permanece manual.');
    } catch (error) {
      log(`❌ ${error.message}`);
      alert(error.message);
    } finally {
      state.running = false; updateControls(); saveState();
    }
  }

  function displayName(row) {
    const mapped = getMappedValue(row, SPECIAL.athleteName);
    if (mapped) return mapped;
    const h = findHeader(state.headers, ['Nome completo do atleta', 'Nome do atleta', 'Nome completo', 'Nome']);
    return h ? row[h] : `Atleta ${state.currentIndex + 1}`;
  }


  function getHeaderValue(row, candidates) {
    const header = findHeader(state.headers, candidates);
    return header ? String(row?.[header] ?? '').trim() : '';
  }

  function currentDocuments() {
    const row = currentRow();
    return {
      rg: getHeaderValue(row, DOCUMENT_HEADERS.rg),
      atestado: getHeaderValue(row, DOCUMENT_HEADERS.atestado),
      autorizacao: getHeaderValue(row, DOCUMENT_HEADERS.autorizacao)
    };
  }

  function setDocumentStatus(key, text, kind = '') {
    state.documentStatus[key] = { text, kind };
    updateDocumentCard();
  }

  function waitForCondition(check, timeout = 20000, interval = 250) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        try {
          const value = check();
          if (value) {
            clearInterval(timer);
            resolve(value);
          } else if (Date.now() - started >= timeout) {
            clearInterval(timer);
            reject(new Error('Tempo limite excedido.'));
          }
        } catch (error) {
          clearInterval(timer);
          reject(error);
        }
      }, interval);
    });
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function fetchDocumentFromExtension(url, fallbackName, onProgress) {
    return new Promise((resolve, reject) => {
      const port = chrome.runtime.connect({ name: 'ykl-drive-fetch' });
      const parts = [];
      let meta = null;
      let received = 0;
      let settled = false;

      const finishReject = error => {
        if (settled) return;
        settled = true;
        try { port.disconnect(); } catch { /* nada */ }
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      port.onDisconnect.addListener(() => {
        if (!settled && chrome.runtime.lastError) {
          finishReject(new Error(chrome.runtime.lastError.message));
        }
      });

      port.onMessage.addListener(message => {
        if (message?.type === 'error') {
          finishReject(new Error(message.message || 'Falha ao baixar o documento.'));
          return;
        }
        if (message?.type === 'meta') {
          meta = message;
          if (Number(meta.size) > MAX_DOCUMENT_BYTES) {
            finishReject(new Error('O documento tem mais de 10 MB.'));
          }
          return;
        }
        if (message?.type === 'chunk') {
          const bytes = base64ToBytes(message.data || '');
          parts.push(bytes);
          received += bytes.byteLength;
          if (meta?.size && typeof onProgress === 'function') {
            onProgress(Math.min(100, Math.round((received / meta.size) * 100)));
          }
          return;
        }
        if (message?.type === 'done') {
          if (!meta) return finishReject(new Error('O download terminou sem informações do arquivo.'));
          settled = true;
          try { port.disconnect(); } catch { /* nada */ }
          const blob = new Blob(parts, { type: meta.mimeType || 'application/octet-stream' });
          resolve(new File([blob], meta.filename || fallbackName || 'documento', {
            type: meta.mimeType || blob.type || 'application/octet-stream',
            lastModified: Date.now()
          }));
        }
      });

      port.postMessage({ type: 'fetch-document', url, fallbackName });
    });
  }

  function findAddDocumentButton() {
    return $$('button', document).find(button => {
      const text = normalize(button.textContent || '');
      const onclick = button.getAttribute('onclick') || '';
      return text.includes('adicionar documento') || onclick.includes('docCreateAbrir(0)');
    });
  }

  async function openDocumentModal() {
    const button = findAddDocumentButton();
    if (!button) throw new Error('Não encontrei o botão “Adicionar documento” na página.');
    button.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(250);
    button.click();
    try {
      return await waitForCondition(() => {
        const modal = document.getElementById('modalFormDoc');
        const body = modal?.querySelector('.modal-body');
        const type = body?.querySelector('#atletadocumento-id_tipo');
        return modal && body && type ? modal : null;
      }, 20000, 250);
    } catch {
      throw new Error('O formulário de documento não terminou de carregar.');
    }
  }

  function selectDocumentType(modal, key) {
    const config = DOCUMENT_CONFIG[key];
    const select = modal.querySelector('#atletadocumento-id_tipo');
    if (!select) throw new Error('Não encontrei a lista de tipos de documento.');
    const wanted = config.typeLabels.map(normalize);
    const options = [...select.options].filter(option => option.value);
    let option = options.find(item => wanted.includes(normalize(item.textContent)));
    if (!option) {
      option = options.find(item => wanted.some(label => {
        const text = normalize(item.textContent);
        return text.includes(label) || label.includes(text);
      }));
    }
    if (!option) {
      const available = options.map(item => item.textContent.trim()).filter(Boolean).join(', ');
      throw new Error(`Não encontrei o tipo “${config.label}” na lista da Liga. Tipos disponíveis: ${available || 'nenhum'}.`);
    }
    nativeSet(select, option.value);
    emit(select, 'input');
    emit(select, 'change');
    return option.textContent.trim();
  }

  function chooseDocumentFileInput(modal) {
    const inputs = [...modal.querySelectorAll('input[type="file"]')]
      .filter(input => !input.disabled && !input.closest('.file-input')?.classList.contains('file-input-disabled'));
    if (!inputs.length) throw new Error('Não encontrei o campo para selecionar o arquivo.');
    return inputs.find(input => /imagem1|frente|arquivo|file/i.test(`${input.id} ${input.name}`)) || inputs[0];
  }

  function assignFileToInput(input, file) {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');
    if (descriptor?.set) descriptor.set.call(input, transfer.files);
    else input.files = transfer.files;
    emit(input, 'input');
    emit(input, 'change');
  }

  function findUploadButton(modal) {
    const candidates = [...modal.querySelectorAll('button, a')];
    return candidates.find(element => {
      const text = normalize(`${element.textContent || ''} ${element.title || ''}`);
      return element.matches('.fileinput-upload-button, .kv-file-upload') || text === 'enviar' || text.includes('fazer upload') || text === 'upload';
    });
  }

  async function waitForDocumentUpload(modal, previousValue = '') {
    const getUploadedValue = () => {
      const field = modal.querySelector('#doc_obj_imagem1') || document.getElementById('doc_obj_imagem1');
      return String(field?.value || '').trim();
    };

    await sleep(1800);
    if (!getUploadedValue()) {
      const uploadButton = findUploadButton(modal);
      if (uploadButton && !uploadButton.disabled) uploadButton.click();
    }

    try {
      return await waitForCondition(() => {
        const value = getUploadedValue();
        if (value && value !== previousValue) return value;
        const error = modal.querySelector('.file-error-message:not(:empty), .kv-fileinput-error:not(:empty), .file-preview-status.text-danger');
        if (error?.textContent.trim()) throw new Error(error.textContent.trim());
        return null;
      }, 60000, 350);
    } catch (error) {
      if (error.message === 'Tempo limite excedido.') {
        throw new Error('O upload não foi confirmado em 60 segundos. O modal ficou aberto para você conferir ou concluir manualmente.');
      }
      throw error;
    }
  }

  async function saveDocumentModal(modal) {
    const save = document.getElementById('btnSalvarDocumentoModal');
    if (!save) throw new Error('Não encontrei o botão “Salvar documento”.');
    save.click();
    try {
      await waitForCondition(() => {
        const visible = modal.classList.contains('show') || getComputedStyle(modal).display !== 'none';
        return visible ? null : true;
      }, 15000, 250);
    } catch {
      throw new Error('O arquivo foi enviado, mas o modal não confirmou o salvamento. Confira e clique em “Salvar documento”.');
    }
  }

  async function includeDocumentInternal(key) {
    const config = DOCUMENT_CONFIG[key];
    const url = currentDocuments()[key];
    if (!normalizeExternalUrl(url)) throw new Error(`${config.label}: este atleta não possui link válido.`);

    setDocumentStatus(key, 'Baixando 0%…', 'working');
    log(`→ Baixando ${config.label} do Drive...`);
    const athlete = displayName(currentRow()).replace(/[^a-zA-Z0-9À-ÿ _-]+/g, '').trim();
    const file = await fetchDocumentFromExtension(url, `${config.fallbackName} - ${athlete || 'atleta'}`, percent => {
      setDocumentStatus(key, `Baixando ${percent}%…`, 'working');
    });
    if (file.size > MAX_DOCUMENT_BYTES) throw new Error(`${config.label}: arquivo maior que 10 MB.`);

    setDocumentStatus(key, 'Abrindo formulário…', 'working');
    const modal = await openDocumentModal();
    const selectedType = selectDocumentType(modal, key);
    await sleep(500);

    const previousUploaded = String((modal.querySelector('#doc_obj_imagem1') || document.getElementById('doc_obj_imagem1'))?.value || '').trim();
    const input = chooseDocumentFileInput(modal);
    assignFileToInput(input, file);
    setDocumentStatus(key, 'Enviando…', 'working');
    log(`→ Enviando ${config.label}: ${file.name} (${Math.ceil(file.size / 1024)} KB, ${file.type || 'sem MIME'})`);
    await waitForDocumentUpload(modal, previousUploaded);
    setDocumentStatus(key, 'Salvando…', 'working');
    await saveDocumentModal(modal);
    setDocumentStatus(key, 'Incluído', 'success');
    log(`✓ ${config.label} incluído como “${selectedType}”.`);
  }

  async function includeDocument(key) {
    if (state.documentRunning || state.running) return;
    state.documentRunning = true;
    updateControls();
    try {
      await includeDocumentInternal(key);
    } catch (error) {
      setDocumentStatus(key, 'Erro', 'error');
      log(`❌ ${DOCUMENT_CONFIG[key].label}: ${error.message}`);
      alert(error.message);
    } finally {
      state.documentRunning = false;
      updateControls();
      updateDocumentCard();
    }
  }

  async function includeAllDocuments() {
    if (state.documentRunning || state.running) return;
    const docs = currentDocuments();
    const keys = Object.keys(DOCUMENT_CONFIG).filter(key => normalizeExternalUrl(docs[key]));
    if (!keys.length) return alert('Este atleta não possui links válidos para RG, atestado ou autorização.');
    state.documentRunning = true;
    updateControls();
    const errors = [];
    try {
      for (const key of keys) {
        try {
          await includeDocumentInternal(key);
        } catch (error) {
          setDocumentStatus(key, 'Erro', 'error');
          log(`❌ ${DOCUMENT_CONFIG[key].label}: ${error.message}`);
          errors.push(`${DOCUMENT_CONFIG[key].label}: ${error.message}`);
          const modal = document.getElementById('modalFormDoc');
          const visible = modal && (modal.classList.contains('show') || getComputedStyle(modal).display !== 'none');
          if (visible) break;
        }
      }
      if (!errors.length) alert('Todos os documentos disponíveis foram incluídos. Confira a tabela de documentos antes de cadastrar o atleta.');
      else alert(`A inclusão terminou com problema:\n\n${errors.join('\n')}`);
    } finally {
      state.documentRunning = false;
      updateControls();
      updateDocumentCard();
    }
  }

  function normalizeExternalUrl(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    try {
      const url = new URL(value);
      if (!/^https?:$/.test(url.protocol)) return '';
      return url.href;
    } catch {
      return '';
    }
  }

  function driveFileId(raw) {
    const url = normalizeExternalUrl(raw);
    if (!url) return '';
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]+)/,
      /[?&]id=([a-zA-Z0-9_-]+)/,
      /\/d\/([a-zA-Z0-9_-]+)/
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return '';
  }

  function driveDownloadUrl(raw) {
    const url = normalizeExternalUrl(raw);
    if (!url) return '';
    const id = driveFileId(url);
    return id ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}` : url;
  }

  function openExternal(raw, download = false) {
    const url = download ? driveDownloadUrl(raw) : normalizeExternalUrl(raw);
    if (!url) return alert('Este atleta não possui um link válido para esse documento.');
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function updateDocumentCard() {
    const docs = currentDocuments();
    for (const key of Object.keys(DOCUMENT_HEADERS)) {
      const has = Boolean(normalizeExternalUrl(docs[key]));
      const status = $(`#ykl-doc-${key}-status`);
      const open = $(`#ykl-doc-${key}-open`);
      const download = $(`#ykl-doc-${key}-download`);
      const include = $(`#ykl-doc-${key}-include`);
      const custom = state.documentStatus[key];
      if (status) {
        status.textContent = custom?.text || (has ? 'Link disponível' : 'Sem link');
        status.className = `ykl-doc-status ${custom?.kind ? `ykl-doc-${custom.kind}` : has ? 'ykl-doc-ok' : ''}`;
      }
      if (open) open.disabled = !has || state.documentRunning;
      if (download) download.disabled = !has || state.documentRunning;
      if (include) include.disabled = !has || state.documentRunning || state.running;
    }
    const includeAll = $('#ykl-doc-include-all');
    if (includeAll) {
      includeAll.disabled = state.documentRunning || state.running || !Object.values(docs).some(value => normalizeExternalUrl(value));
    }
  }

  function updateLogo() {
    const img = $('#ykl-logo-img');
    const fallback = $('#ykl-logo-fallback');
    const preview = $('#ykl-logo-preview');
    if (!img || !fallback) return;
    const has = Boolean(state.logoDataUrl);
    img.hidden = !has;
    fallback.hidden = has;
    if (has) img.src = state.logoDataUrl;
    if (preview) {
      preview.innerHTML = has
        ? `<img src="${escapeAttr(state.logoDataUrl)}" alt="Logo do Yoka">`
        : '<span>Nenhum logo selecionado</span>';
    }
  }

  async function handleLogoFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return alert('Selecione uma imagem PNG, JPG, WEBP ou SVG.');
    if (file.size > 2 * 1024 * 1024) return alert('Use um logo de até 2 MB.');
    state.logoDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    saveState();
    updateLogo();
    event.target.value = '';
  }

  function removeLogo() {
    state.logoDataUrl = '';
    saveState();
    updateLogo();
  }

  function mappedCount() { return Object.values(state.mapping).filter(h => state.headers.includes(h)).length; }

  function saveState() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [STORAGE_KEY]: {
        headers: state.headers, rows: state.rows, mapping: state.savedMapping,
        currentIndex: state.currentIndex, completed: state.completed, delay: state.delay, logoDataUrl: state.logoDataUrl,
        apiUrl: state.apiUrl, apiToken: state.apiToken, dataSource: state.dataSource,
        serverStatuses: state.serverStatuses, pendingRegistration: state.pendingRegistration,
        categoryFilter: state.categoryFilter, availableCategories: state.availableCategories,
        mappingSavedAt: state.mappingSavedAt
      }}, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      });
    });
  }

  function loadState() {
    return new Promise(resolve => chrome.storage.local.get([STORAGE_KEY], result => {
      const saved = result[STORAGE_KEY];
      if (saved) {
        Object.assign(state, saved);
        state.savedMapping = { ...(saved.mapping || {}) };
        state.mapping = { ...(saved.mapping || {}) };
      }
      resolve();
    }));
  }

  function mappingIsDirty() {
    return JSON.stringify(state.mapping) !== JSON.stringify(state.savedMapping);
  }

  function updateMappingSaveStatus(message = '') {
    const el = $('#ykl-map-save-status');
    if (!el) return;
    if (message) { el.textContent = message; return; }
    if (mappingIsDirty()) {
      el.textContent = 'Alterações ainda não salvas.';
      return;
    }
    if (state.mappingSavedAt) {
      el.textContent = `Mapeamento salvo às ${new Date(state.mappingSavedAt).toLocaleTimeString('pt-BR')}.`;
    } else {
      el.textContent = 'Mapeamento ainda não foi salvo manualmente.';
    }
  }

  async function saveMappingNow() {
    state.savedMapping = { ...state.mapping };
    state.mappingSavedAt = Date.now();
    try {
      await saveState();
      updateMappingSaveStatus();
      log('✓ Mapeamento salvo neste Chrome.');
    } catch (error) {
      updateMappingSaveStatus(`Erro ao salvar: ${error.message}`);
      alert(`Não consegui salvar o mapeamento: ${error.message}`);
    }
  }

  function log(message) {
    const el = $('#ykl-log');
    if (!el) return;
    const time = new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    el.textContent += `[${time}] ${message}\n`;
    el.scrollTop = el.scrollHeight;
  }
  function clearLog() { const el = $('#ykl-log'); if (el) el.textContent = ''; }
  function setProgress(value) { const el = $('#ykl-progress-bar'); if (el) el.style.width = `${value}%`; }

  function updateAthleteCard() {
    const row = currentRow();
    $('#ykl-athlete-name').textContent = row ? displayName(row) : 'Nenhum atleta carregado';
    $('#ykl-athlete-category').textContent = row ? (athleteCategory(row) || 'Categoria não informada') : '';
    const uniformParts = row ? [
      ['Camisa', getHeaderValue(row, ['Nome ou apelido na camisa'])],
      ['Nº', getHeaderValue(row, ['Número da camisa', 'Numero da camisa'])],
      ['Tam.', getHeaderValue(row, ['Tamanho da camisa'])]
    ].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`) : [];
    $('#ykl-athlete-uniform').textContent = uniformParts.join(' · ');
    $('#ykl-counter').textContent = state.rows.length ? `${state.currentIndex + 1} de ${state.rows.length}` : '0 de 0';
    const status = $('#ykl-status');
    const serverStatus = currentServerStatus();
    const done = Boolean(state.completed[state.currentIndex]) || serverStatus === 'Cadastrado';
    status.textContent = done ? 'Cadastrado' : (serverStatus || 'Pendente');
    status.className = `ykl-badge ${done ? 'ykl-success-badge' : ''}`;
    $('#ykl-map-count').textContent = `${mappedCount()} campos mapeados · ${state.dataSource === 'sheets' ? 'Google Sheets' : 'CSV'}`;
    $('#ykl-delay').value = state.delay;
    updateDocumentCard();
  }

  function updateControls() {
    const hasRows = state.rows.length > 0;
    const busy = state.running || state.documentRunning;
    $('#ykl-fill').disabled = !hasRows || busy;
    $('#ykl-abort').disabled = !state.running;
    $('#ykl-prev').disabled = !hasRows || state.currentIndex <= 0 || busy;
    $('#ykl-next').disabled = !hasRows || state.currentIndex >= state.rows.length - 1 || busy;
    $('#ykl-done-next').disabled = !hasRows || busy;
    updateDocumentCard();
  }

  function renderMapping() {
    const list = $('#ykl-map-list');
    if (!list) return;
    list.textContent = '';
    const filter = normalize(state.filter);
    const fields = [...state.fields].sort((a,b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
    let previousGroup = '';
    for (const field of fields) {
      const mapped = state.mapping[field.id] || '';
      const searchable = normalize(`${field.group} ${field.label} ${field.id} ${mapped}`);
      if (filter && !searchable.includes(filter)) continue;
      if (field.group !== previousGroup) {
        const header = document.createElement('div');
        header.className = 'ykl-map-row';
        header.style.background = '#f0f4f7';
        header.innerHTML = `<strong style="font-size:11px;color:#174a7e">${escapeHtml(field.group)}</strong>`;
        list.appendChild(header); previousGroup = field.group;
      }
      const row = document.createElement('div'); row.className = 'ykl-map-row';
      const label = document.createElement('div'); label.className = 'ykl-map-field';
      label.innerHTML = `${escapeHtml(field.label)} <span class="ykl-map-id">${escapeHtml(field.id)}</span>`;
      const select = document.createElement('select'); select.dataset.fieldId = field.id;
      select.innerHTML = `<option value="">— não preencher —</option>` + state.headers.map(h => `<option value="${escapeAttr(h)}" ${h === mapped ? 'selected' : ''}>${escapeHtml(h)}</option>`).join('');
      select.addEventListener('change', () => { if (select.value) state.mapping[field.id] = select.value; else delete state.mapping[field.id]; updateMappingSaveStatus(); updateAthleteCard(); });
      row.append(label, select); list.appendChild(row);
    }
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
  function escapeAttr(s) { return escapeHtml(s); }

  function switchTab(name) {
    $$('.ykl-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $$('.ykl-section').forEach(s => s.classList.toggle('active', s.dataset.section === name));
  }

  function buildUi() {
    if ($('#ykl-root')) return;
    const root = document.createElement('div'); root.id = 'ykl-root';
    root.innerHTML = `
      <div class="ykl-header">
        <div class="ykl-title"><div class="ykl-logo"><img id="ykl-logo-img" alt="Logo do Yoka" hidden><span id="ykl-logo-fallback">YK</span></div><div class="ykl-title-text"><strong>Importador Yoka</strong><span>Liga Paulista · preenchimento assistido</span></div></div>
        <button class="ykl-icon-btn" id="ykl-toggle" title="Recolher">−</button>
      </div>
      <div class="ykl-body">
        <div class="ykl-tabs">
          <button class="ykl-tab active" data-tab="cadastro">Cadastro</button>
          <button class="ykl-tab" data-tab="mapeamento">Mapeamento</button>
          <button class="ykl-tab" data-tab="dados">Dados</button>
        </div>
        <section class="ykl-section active" data-section="cadastro">
          <div class="ykl-card">
            <div class="ykl-row"><span id="ykl-counter" class="ykl-muted">0 de 0</span><span id="ykl-status" class="ykl-badge">Pendente</span></div>
            <div id="ykl-athlete-name" class="ykl-athlete">Nenhum atleta carregado</div>
            <div id="ykl-athlete-category" class="ykl-muted"></div>
            <div id="ykl-athlete-uniform" class="ykl-muted"></div>
            <div id="ykl-map-count" class="ykl-muted">0 campos mapeados</div>
          </div>
          <div class="ykl-card">
            <label class="ykl-label" for="ykl-category-filter">Cadastrar por categoria</label>
            <select id="ykl-category-filter">
              <option value="">Todas as categorias</option>
            </select>
            <div id="ykl-category-summary" class="ykl-muted" style="margin-top:5px">Exibindo atletas de todas as categorias.</div>
          </div>
          <div class="ykl-card ykl-doc-card">
            <h3>Documentos no Drive</h3>
            <div class="ykl-doc-row"><span><strong>RG</strong><small id="ykl-doc-rg-status" class="ykl-doc-status">Sem link</small></span><div><button id="ykl-doc-rg-open" class="ykl-btn" type="button">Abrir</button><button id="ykl-doc-rg-download" class="ykl-btn" type="button">Baixar</button><button id="ykl-doc-rg-include" class="ykl-btn ykl-blue" type="button">Incluir</button></div></div>
            <div class="ykl-doc-row"><span><strong>Atestado</strong><small id="ykl-doc-atestado-status" class="ykl-doc-status">Sem link</small></span><div><button id="ykl-doc-atestado-open" class="ykl-btn" type="button">Abrir</button><button id="ykl-doc-atestado-download" class="ykl-btn" type="button">Baixar</button><button id="ykl-doc-atestado-include" class="ykl-btn ykl-blue" type="button">Incluir</button></div></div>
            <div class="ykl-doc-row"><span><strong>Autorização</strong><small id="ykl-doc-autorizacao-status" class="ykl-doc-status">Sem link</small></span><div><button id="ykl-doc-autorizacao-open" class="ykl-btn" type="button">Abrir</button><button id="ykl-doc-autorizacao-download" class="ykl-btn" type="button">Baixar</button><button id="ykl-doc-autorizacao-include" class="ykl-btn ykl-blue" type="button">Incluir</button></div></div>
            <button id="ykl-doc-include-all" class="ykl-btn ykl-primary ykl-full" type="button">Incluir todos os documentos</button>
            <button id="ykl-go-docs" class="ykl-btn ykl-full" type="button" style="margin-top:6px">Ir para a seção de documentos</button>
            <div class="ykl-muted" style="margin-top:6px">A extensão baixa o arquivo em memória, seleciona o tipo, envia e salva o documento. O cadastro final do atleta continua manual.</div>
          </div>
          <div class="ykl-card">
            <label class="ykl-label" for="ykl-delay">Pausa por campo (milissegundos)</label>
            <input id="ykl-delay" type="number" min="550" max="3000" step="50" value="750">
            <div class="ykl-muted">Recomendado: 700–900 ms. O mínimo aplicado é 550 ms.</div>
          </div>
          <button id="ykl-fill" class="ykl-btn ykl-primary ykl-full">Preencher atleta</button>
          <div class="ykl-row">
            <button id="ykl-abort" class="ykl-btn ykl-danger ykl-grow" disabled>Interromper</button>
            <button id="ykl-done-next" class="ykl-btn ykl-blue ykl-grow">Registrar cadastrado e próximo</button>
          </div>
          <div class="ykl-row">
            <button id="ykl-prev" class="ykl-btn ykl-grow">← Anterior</button>
            <button id="ykl-next" class="ykl-btn ykl-grow">Próximo →</button>
          </div>
          <div class="ykl-progress"><div id="ykl-progress-bar"></div></div>
          <div id="ykl-log" class="ykl-log"></div>
          <div class="ykl-note" style="margin-top:9px">A extensão consulta a RFB e o CEP pelos botões do próprio site. O botão <strong>Cadastrar</strong> permanece manual.</div>
        </section>
        <section class="ykl-section" data-section="mapeamento">
          <div class="ykl-row"><input id="ykl-map-search" type="search" class="ykl-grow" placeholder="Buscar campo..."><button id="ykl-auto-map" class="ykl-btn ykl-blue">Automapear</button></div>
          <div class="ykl-row" style="margin-top:7px"><button id="ykl-save-map" class="ykl-btn ykl-primary ykl-grow" type="button">Salvar mapeamento</button></div>
          <div id="ykl-map-save-status" class="ykl-muted" style="margin:6px 0 4px">Mapeamento ainda não foi salvo manualmente.</div>
          <div id="ykl-map-list" class="ykl-map-list"></div>
        </section>
        <section class="ykl-section" data-section="dados">
          <div class="ykl-card">
            <h3>Google Sheets do Yoka</h3>
            <label class="ykl-label" for="ykl-api-url">URL da API (Apps Script)</label>
            <input id="ykl-api-url" type="text" placeholder="https://script.google.com/macros/s/.../exec">
            <label class="ykl-label" for="ykl-api-token" style="margin-top:7px">Chave da API</label>
            <input id="ykl-api-token" type="password" placeholder="Chave gerada no Apps Script">
            <div class="ykl-row"><button id="ykl-api-test" class="ykl-btn ykl-grow" type="button">Testar conexão</button><button id="ykl-load-sheets" class="ykl-btn ykl-blue ykl-grow" type="button">Carregar atletas</button></div>
            <div class="ykl-connection"><span id="ykl-api-dot" class="ykl-dot"></span><span id="ykl-api-status">API ainda não configurada.</span></div>
          </div>
          <div class="ykl-card">
            <label class="ykl-label" for="ykl-file">CSV (modo de contingência)</label>
            <input id="ykl-file" type="file" accept=".csv,text/csv,text/plain">
            <div class="ykl-muted">Use o CSV somente se a integração com o Google Sheets estiver indisponível.</div>
          </div>
          <div class="ykl-card">
            <label class="ykl-label" for="ykl-logo-file">Logo do Yoka</label>
            <div id="ykl-logo-preview" class="ykl-logo-preview"><span>Nenhum logo selecionado</span></div>
            <input id="ykl-logo-file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml">
            <button id="ykl-logo-remove" class="ykl-btn ykl-full" type="button" style="margin-top:7px">Remover logo</button>
            <div class="ykl-muted" style="margin-top:5px">O logo fica salvo somente neste Chrome.</div>
          </div>
          <div class="ykl-row"><button id="ykl-export-map" class="ykl-btn ykl-grow">Exportar mapeamento</button><button id="ykl-import-map" class="ykl-btn ykl-grow">Importar mapeamento</button></div>
          <input id="ykl-map-file" class="ykl-hidden" type="file" accept=".json,application/json">
          <button id="ykl-clear" class="ykl-btn ykl-danger ykl-full">Apagar dados locais</button>
          <div class="ykl-note" style="margin-top:9px">A configuração da API e a cópia de trabalho dos atletas ficam neste Chrome. Quando conectado ao Sheets, a extensão envia apenas atualizações de status para o Apps Script do Yoka.</div>
        </section>
      </div>`;
    document.body.appendChild(root);

    $('#ykl-toggle').addEventListener('click', () => { root.classList.toggle('ykl-collapsed'); $('#ykl-toggle').textContent = root.classList.contains('ykl-collapsed') ? '+' : '−'; });
    $$('.ykl-tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    $('#ykl-file').addEventListener('change', handleCsvFile);
    $('#ykl-api-url').value = state.apiUrl || '';
    $('#ykl-api-token').value = state.apiToken || '';
    $('#ykl-api-url').addEventListener('change', e => { state.apiUrl = e.target.value.trim(); saveState(); updateConnectionStatus(); });
    $('#ykl-api-token').addEventListener('change', e => { state.apiToken = e.target.value.trim(); saveState(); updateConnectionStatus(); });
    $('#ykl-api-test').addEventListener('click', testApiConnection);
    $('#ykl-load-sheets').addEventListener('click', loadAthletesFromSheets);
    $('#ykl-category-filter').addEventListener('change', async e => {
      state.categoryFilter = e.target.value;
      saveState();
      renderCategoryFilter();
      if (state.dataSource === 'sheets' && state.apiUrl && state.apiToken) {
        await loadAthletesFromSheets();
      }
    });
    $('#ykl-fill').addEventListener('click', fillAthlete);
    $('#ykl-abort').addEventListener('click', () => { state.abort = true; log('Solicitação de interrupção enviada...'); });
    $('#ykl-prev').addEventListener('click', () => changeIndex(-1));
    $('#ykl-next').addEventListener('click', () => changeIndex(1));
    $('#ykl-done-next').addEventListener('click', async () => {
      if (!state.rows.length) return;
      if (state.dataSource === 'sheets') {
        try { await syncCurrentStatus('Cadastrado', { bigmidiaUrl: location.href, bigmidiaId: extractBigMidiaId(location.href), observation: 'Confirmação manual pelo operador da extensão.' }); }
        catch (error) { alert(`Não consegui registrar na planilha: ${error.message}`); return; }
      } else {
        state.completed[state.currentIndex] = true;
      }
      if (state.currentIndex < state.rows.length - 1) state.currentIndex++;
      saveState(); updateAthleteCard(); updateControls(); setProgress(0); clearLog();
    });
    $('#ykl-delay').addEventListener('change', e => { state.delay = Math.max(MIN_DELAY, Math.min(3000, Number(e.target.value) || DEFAULT_DELAY)); e.target.value = state.delay; saveState(); });
    $('#ykl-auto-map').addEventListener('click', () => { autoMap(); renderMapping(); updateAthleteCard(); updateMappingSaveStatus(); });
    $('#ykl-save-map').addEventListener('click', saveMappingNow);
    $('#ykl-map-search').addEventListener('input', e => { state.filter = e.target.value; renderMapping(); });
    $('#ykl-logo-file').addEventListener('change', handleLogoFile);
    $('#ykl-logo-remove').addEventListener('click', removeLogo);
    for (const key of Object.keys(DOCUMENT_HEADERS)) {
      $(`#ykl-doc-${key}-open`).addEventListener('click', () => openExternal(currentDocuments()[key], false));
      $(`#ykl-doc-${key}-download`).addEventListener('click', () => openExternal(currentDocuments()[key], true));
      $(`#ykl-doc-${key}-include`).addEventListener('click', () => includeDocument(key));
    }
    $('#ykl-doc-include-all').addEventListener('click', includeAllDocuments);
    $('#ykl-go-docs').addEventListener('click', () => {
      const target = document.getElementById('portlet_doc');
      if (!target) return alert('A seção de documentos não foi encontrada nesta página.');
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('#ykl-clear').addEventListener('click', clearLocalData);
    $('#ykl-export-map').addEventListener('click', exportMapping);
    $('#ykl-import-map').addEventListener('click', () => $('#ykl-map-file').click());
    $('#ykl-map-file').addEventListener('change', importMapping);
    updateConnectionStatus();
  }

  function changeIndex(delta) {
    state.currentIndex = Math.max(0, Math.min(state.rows.length - 1, state.currentIndex + delta));
    state.documentStatus = {};
    saveState(); updateAthleteCard(); updateControls(); setProgress(0); clearLog();
  }

  async function handleCsvFile(event) {
    const file = event.target.files?.[0]; if (!file) return;
    const text = await file.text();
    const parsedRaw = csvParse(text);
    if (!parsedRaw.headers.length || !parsedRaw.rows.length) return alert('Não encontrei cabeçalho e registros nesse CSV.');
    const parsed = addDerivedResponsibleColumns(parsedRaw.headers, parsedRaw.rows);
    state.headers = parsed.headers; state.rows = parsed.rows; state.currentIndex = 0; state.completed = {}; state.documentStatus = {}; state.dataSource = 'csv'; state.serverStatuses = {}; state.categoryFilter = ''; state.availableCategories = [];
    state.savedMapping = Object.fromEntries(Object.entries(state.savedMapping || {}).filter(([,h]) => state.headers.includes(h)));
    state.mapping = { ...state.savedMapping };
    autoMap(); saveState(); renderMapping(); renderCategoryFilter(); updateAthleteCard(); updateControls(); updateMappingSaveStatus(); switchTab('mapeamento');
    const modeloYoka = findHeader(state.headers, ['CPF do atleta']) && findHeader(state.headers, ['Responsável principal']);
    alert(modeloYoka
      ? `${state.rows.length} atletas importados. O modelo de colunas do Yoka foi reconhecido e mapeado automaticamente. Confira o mapeamento antes do primeiro teste.`
      : `${state.rows.length} atletas importados. Confira o mapeamento das colunas antes de preencher.`);
  }

  function clearLocalData() {
    if (!confirm('Apagar o CSV, o mapeamento e o progresso armazenados neste Chrome?')) return;
    Object.assign(state, { headers: [], rows: [], mapping: {}, currentIndex: 0, completed: {}, delay: DEFAULT_DELAY, logoDataUrl: '', documentStatus: {}, apiUrl: '', apiToken: '', dataSource: 'csv', serverStatuses: {}, categoryFilter: '', availableCategories: [], pendingRegistration: null, savedMapping: {}, mappingSavedAt: 0 });
    chrome.storage.local.remove(STORAGE_KEY, () => { renderMapping(); renderCategoryFilter(); updateAthleteCard(); updateControls(); updateLogo(); clearLog(); setProgress(0); });
  }

  function exportMapping() {
    const blob = new Blob([JSON.stringify({ version: 1, mapping: state.mapping, delay: state.delay }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'mapeamento-liga-yoka.json'; a.click(); URL.revokeObjectURL(url);
  }

  async function importMapping(event) {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      state.mapping = data.mapping || {}; state.savedMapping = { ...state.mapping }; state.mappingSavedAt = Date.now(); state.delay = Math.max(MIN_DELAY, Number(data.delay) || state.delay);
      await saveState(); renderMapping(); updateAthleteCard(); updateMappingSaveStatus(); alert('Mapeamento importado e salvo.');
    } catch { alert('Arquivo de mapeamento inválido.'); }
    event.target.value = '';
  }

  async function init() {
    await loadState();
    const finalized = await finalizePendingRegistrationIfPossible();
    const form = document.getElementById(FORM_ID);
    if (!form) {
      if (finalized && location.href !== BIGMIDIA_ATHLETE_CREATE_URL) {
        location.replace(BIGMIDIA_ATHLETE_CREATE_URL);
      }
      return;
    }
    state.delay = Math.max(MIN_DELAY, Number(state.delay) || DEFAULT_DELAY);
    state.fields = discoverFields();
    if (state.headers.length) {
      const enriched = addDerivedResponsibleColumns(state.headers, state.rows);
      state.headers = enriched.headers;
      state.rows = enriched.rows;
      autoMap();
    }
    buildUi(); renderMapping(); renderCategoryFilter(); updateAthleteCard(); updateControls(); updateLogo(); updateMappingSaveStatus();
    const saveButton = document.getElementById('save-Atleta');
    if (saveButton) saveButton.addEventListener('click', rememberPendingRegistration, true);
    form.addEventListener('submit', rememberPendingRegistration, true);
    log('Extensão pronta. Carregue os atletas do Google Sheets ou use o CSV de contingência.');
  }

  init();
})();
