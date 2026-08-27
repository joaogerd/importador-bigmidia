# Importador BigMidia

Extensão Chrome do Yoka para auxiliar o cadastro de atletas na Liga Paulista / BigMidia.

## Versão atual

**v1.4.2**

Página oficial de inclusão de atleta:

`https://ligapaulistafutsal.bigmidia.com/atleta/create`

A extensão prepara os dados e documentos para conferência. O botão final **Cadastrar** permanece sob controle humano.

## Fonte dos dados

Na versão atual, a extensão pode carregar os atletas diretamente do cadastro do Yoka no Google Sheets, através da API do Google Apps Script. O CSV continua disponível como contingência.

O backend dessa integração pertence ao projeto `cadastro-yoka`; este repositório contém somente a extensão Chrome.

## Versões preservadas

Os pacotes originais recebidos durante o desenvolvimento ficam em `versions/`:

- v1.0.0
- v1.1.0
- v1.2.0
- v1.3.0
- v1.4.0
- v1.4.1
- v1.4.2

Consulte `CHANGELOG.md` para a evolução funcional.

## Segurança e dados pessoais

Não versione CSVs reais de atletas, documentos, CPFs, tokens da API, cookies, sessões do Chrome ou arquivos baixados do Google Drive. Use somente dados fictícios em exemplos e testes.
