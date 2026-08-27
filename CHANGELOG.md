# Changelog

Histórico das versões conhecidas do Importador BigMidia / Importador Yoka.

## 1.4.2
- Define `https://ligapaulistafutsal.bigmidia.com/atleta/create` como página oficial de inclusão de atleta.
- O preenchimento é bloqueado fora da página de criação.
- Mapeia o documento de autorização para o tipo exato do BigMidia: **Termo Responsável (Menor de 18)**.
- Mantém a extensão ativa em `/atleta/*` apenas para acompanhar o fluxo após o salvamento.

## 1.4.1
- Corrige envio de documentos obtidos do Google Drive.
- Detecta o tipo real do arquivo por assinatura (magic bytes), sem depender apenas do MIME retornado pelo Drive.
- Normaliza nome, extensão e MIME antes de entregar o arquivo ao BigMidia.
- Evita que PDFs reais sejam enviados como `application/octet-stream` e rejeitados pelo portal.

## 1.4.0
- Integra a extensão ao cadastro do Yoka por meio da API do Google Apps Script.
- Permite carregar atletas diretamente da aba `Atletas` do Google Sheets.
- Registra andamento do cadastro na aba `Cadastro BigMidia`.
- Mantém importação CSV como contingência.
- Mantém a confirmação final do botão `Cadastrar` sob controle humano.

## 1.3.0
- Adiciona `background.js`.
- Integra download de documentos do Google Drive.
- Adiciona inclusão assistida de documentos no BigMidia.

## 1.2.0
- Adiciona suporte ao logo do Yoka.
- Passa a reconhecer links de RG, atestado e autorização no CSV.

## 1.1.0
- Adapta o importador ao CSV do cadastro do Yoka.
- Adiciona tratamento de responsável principal e dados dos responsáveis.

## 1.0.0
- Primeira versão preservada.
- Importação CSV.
- Preenchimento assistido do cadastro de atleta.
- Consulta à RFB.
- Conferência humana antes do cadastro final.
