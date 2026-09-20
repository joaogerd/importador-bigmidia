'use strict';

importScripts('background.js');

(() => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const RETRY_DELAYS = [0, 700, 1800];
  const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

  function safeHost(rawUrl) {
    try { return new URL(String(rawUrl || '')).host || 'host desconhecido'; }
    catch { return 'host desconhecido'; }
  }

  async function callWithDiagnostics(message) {
    const apiUrl = normalizeHttpUrl(message.apiUrl);
    const token = String(message.token || '').trim();
    const action = String(message.action || '').trim();

    if (!apiUrl) throw new Error('URL da API do Yoka não configurada.');
    if (!token) throw new Error('Chave da API do Yoka não configurada.');
    if (!action) throw new Error('Ação da API não informada.');

    const requestBody = JSON.stringify({
      token,
      action,
      payload: message.payload || {}
    });

    let lastDiagnostic = '';

    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt += 1) {
      if (RETRY_DELAYS[attempt]) await sleep(RETRY_DELAYS[attempt]);

      let response;
      try {
        response = await fetch(apiUrl, {
          method: 'POST',
          redirect: 'follow',
          cache: 'no-store',
          credentials: 'omit',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: requestBody
        });
      } catch (error) {
        lastDiagnostic = `falha de rede: ${error?.message || 'erro desconhecido'}`;
        if (attempt + 1 < RETRY_DELAYS.length) continue;
        throw new Error(`Não foi possível acessar a API Yoka após ${RETRY_DELAYS.length} tentativas (${lastDiagnostic}).`);
      }

      const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const responseHost = safeHost(response.url || apiUrl);
      const text = await response.text();

      if (!response.ok) {
        lastDiagnostic = `HTTP ${response.status} de ${responseHost}`;
        if (RETRYABLE_STATUS.has(response.status) && attempt + 1 < RETRY_DELAYS.length) continue;
        throw new Error(`API Yoka respondeu ${lastDiagnostic}.`);
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        const kind = contentType || 'tipo de conteúdo não informado';
        lastDiagnostic = `${kind} de ${responseHost}`;
        if (attempt + 1 < RETRY_DELAYS.length) continue;
        throw new Error(
          `A API Yoka respondeu conteúdo não JSON após ${RETRY_DELAYS.length} tentativas (${lastDiagnostic}). ` +
          'Se o problema persistir, teste a conexão e confira a implantação do Apps Script.'
        );
      }

      if (!data?.ok) throw new Error(data?.error || 'A API Yoka rejeitou a operação.');
      return data;
    }

    throw new Error(`Falha na API Yoka (${lastDiagnostic || 'sem diagnóstico adicional'}).`);
  }

  // O listener registrado por background.js resolve callYokaApi no escopo global.
  // Substituímos a função por uma versão com retry e diagnóstico, preservando
  // todo o restante do service worker (Drive, documentos e mensagens existentes).
  self.callYokaApi = callWithDiagnostics;
})();
