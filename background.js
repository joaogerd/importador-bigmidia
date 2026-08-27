'use strict';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MESSAGE_CHUNK_BYTES = 384 * 1024;

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'ykl-drive-fetch') return;

  let cancelled = false;
  port.onDisconnect.addListener(() => { cancelled = true; });

  port.onMessage.addListener(message => {
    if (message?.type !== 'fetch-document') return;
    fetchAndStreamDocument(message, port, () => cancelled).catch(error => {
      if (!cancelled) {
        port.postMessage({ type: 'error', message: error?.message || 'Falha ao baixar o documento.' });
      }
    });
  });
});

async function fetchAndStreamDocument(message, port, isCancelled) {
  const rawUrl = normalizeHttpUrl(message.url);
  if (!rawUrl) throw new Error('O link do documento é inválido.');

  const candidates = buildDownloadCandidates(rawUrl);
  let response = null;
  let lastError = '';

  for (const url of candidates) {
    try {
      const attempt = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        redirect: 'follow',
        cache: 'no-store'
      });
      if (!attempt.ok) {
        lastError = `HTTP ${attempt.status}`;
        continue;
      }

      const contentType = (attempt.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('text/html')) {
        lastError = 'o Drive devolveu uma página HTML em vez do arquivo';
        continue;
      }

      response = attempt;
      break;
    } catch (error) {
      lastError = error?.message || 'erro de rede';
    }
  }

  if (!response) {
    throw new Error(`Não consegui obter o arquivo do Drive (${lastError || 'sem acesso'}). Entre no Drive neste mesmo Chrome e confirme que o link permite download.`);
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_FILE_BYTES) {
    throw new Error('O documento tem mais de 10 MB, limite informado pela Liga.');
  }

  const responseMimeType = response.headers.get('content-type') || 'application/octet-stream';
  const responseFilename = filenameFromResponse(response, message.fallbackName, responseMimeType);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('O navegador não conseguiu ler o conteúdo do documento.');

  const chunks = [];
  let total = 0;
  while (true) {
    if (isCancelled()) {
      try { await reader.cancel(); } catch { /* nada */ }
      return;
    }
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_FILE_BYTES) {
      try { await reader.cancel(); } catch { /* nada */ }
      throw new Error('O documento tem mais de 10 MB, limite informado pela Liga.');
    }
    chunks.push(value);
  }

  let buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const detected = detectSupportedDocumentType(buffer, responseFilename, responseMimeType);
  if (!detected) {
    throw new Error('O arquivo baixado não é PDF, JPG/JPEG ou PNG, formatos aceitos pela Liga.');
  }

  const mimeType = detected.mimeType;
  const filename = normalizeDocumentFilename(responseFilename, detected.extension);
  port.postMessage({ type: 'meta', filename, mimeType, size: total });

  let sequence = 0;
  for (let start = 0; start < buffer.byteLength; start += MESSAGE_CHUNK_BYTES) {
    if (isCancelled()) return;
    const part = buffer.subarray(start, Math.min(start + MESSAGE_CHUNK_BYTES, buffer.byteLength));
    port.postMessage({ type: 'chunk', sequence, data: bytesToBase64(part) });
    sequence += 1;
  }
  port.postMessage({ type: 'done', chunks: sequence });
}

function normalizeHttpUrl(raw) {
  try {
    const url = new URL(String(raw || '').trim());
    return /^https?:$/.test(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function driveFileId(rawUrl) {
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/
  ];
  for (const pattern of patterns) {
    const match = rawUrl.match(pattern);
    if (match) return match[1];
  }
  return '';
}

function buildDownloadCandidates(rawUrl) {
  const id = driveFileId(rawUrl);
  const result = [];
  if (id) {
    result.push(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`);
    result.push(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}&confirm=t`);
  }
  result.push(rawUrl);
  return [...new Set(result)];
}

function filenameFromResponse(response, fallbackName, mimeType) {
  const contentDisposition = response.headers.get('content-disposition') || '';
  let match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (match) {
    try { return sanitizeFilename(decodeURIComponent(match[1])); } catch { /* segue */ }
  }
  match = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (match) return sanitizeFilename(match[1]);

  const base = sanitizeFilename(fallbackName || 'documento');
  return hasExtension(base) ? base : `${base}${extensionForMime(mimeType)}`;
}

function sanitizeFilename(value) {
  const clean = String(value || 'documento')
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return clean || 'documento';
}

function hasExtension(filename) {
  return /\.[a-z0-9]{2,8}$/i.test(filename);
}

function extensionForMime(mimeType) {
  const mime = String(mimeType || '').split(';')[0].trim().toLowerCase();
  const map = {
    'application/pdf': '.pdf',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/heic': '.heic',
    'image/heif': '.heif'
  };
  return map[mime] || '';
}

function detectSupportedDocumentType(bytes, filename, responseMimeType) {
  if (bytes && bytes.length >= 5 &&
      bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 &&
      bytes[3] === 0x46 && bytes[4] === 0x2D) {
    return { mimeType: 'application/pdf', extension: '.pdf' };
  }

  if (bytes && bytes.length >= 3 &&
      bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return { mimeType: 'image/jpeg', extension: '.jpg' };
  }

  if (bytes && bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
      bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A) {
    return { mimeType: 'image/png', extension: '.png' };
  }

  const mime = String(responseMimeType || '').split(';')[0].trim().toLowerCase();
  if (mime === 'application/pdf') return { mimeType: 'application/pdf', extension: '.pdf' };
  if (mime === 'image/jpeg' || mime === 'image/jpg') return { mimeType: 'image/jpeg', extension: '.jpg' };
  if (mime === 'image/png') return { mimeType: 'image/png', extension: '.png' };

  const extension = (String(filename || '').match(/\.([a-z0-9]{2,8})$/i) || [])[1]?.toLowerCase();
  if (extension === 'pdf') return { mimeType: 'application/pdf', extension: '.pdf' };
  if (extension === 'jpg' || extension === 'jpeg') return { mimeType: 'image/jpeg', extension: '.jpg' };
  if (extension === 'png') return { mimeType: 'image/png', extension: '.png' };

  return null;
}

function normalizeDocumentFilename(filename, extension) {
  let base = sanitizeFilename(filename || 'documento');
  const current = base.match(/\.([a-z0-9]{2,8})$/i);
  if (current) {
    const ext = `.${current[1].toLowerCase()}`;
    const accepted = ['.pdf', '.jpg', '.jpeg', '.png'];
    if (accepted.includes(ext)) {
      if (extension === '.jpg' && ext === '.jpeg') return base;
      if (ext === extension) return base;
    }
    base = base.slice(0, -current[0].length);
  }
  return `${base}${extension}`;
}

function bytesToBase64(bytes) {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + step, bytes.length)));
  }
  return btoa(binary);
}


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'ykl-api-request') return;

  callYokaApi(message)
    .then(data => sendResponse({ ok: true, data }))
    .catch(error => sendResponse({ ok: false, error: error?.message || 'Falha na comunicação com o Yoka.' }));

  return true;
});

async function callYokaApi(message) {
  const apiUrl = normalizeHttpUrl(message.apiUrl);
  const token = String(message.token || '').trim();
  const action = String(message.action || '').trim();

  if (!apiUrl) throw new Error('URL da API do Yoka não configurada.');
  if (!token) throw new Error('Chave da API do Yoka não configurada.');
  if (!action) throw new Error('Ação da API não informada.');

  const response = await fetch(apiUrl, {
    method: 'POST',
    redirect: 'follow',
    cache: 'no-store',
    credentials: 'omit',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({
      token,
      action,
      payload: message.payload || {}
    })
  });

  if (!response.ok) throw new Error(`API Yoka respondeu HTTP ${response.status}.`);

  const text = await response.text();
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error('A API Yoka não devolveu JSON válido. Verifique a implantação do Apps Script.'); }

  if (!data?.ok) throw new Error(data?.error || 'A API Yoka rejeitou a operação.');
  return data;
}
