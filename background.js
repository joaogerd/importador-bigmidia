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

  const mimeType = response.headers.get('content-type') || 'application/octet-stream';
  const filename = filenameFromResponse(response, message.fallbackName, mimeType);
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

  port.postMessage({ type: 'meta', filename, mimeType, size: total });

  let buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

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

function bytesToBase64(bytes) {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + step, bytes.length)));
  }
  return btoa(binary);
}
