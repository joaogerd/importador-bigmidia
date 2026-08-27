# Importador BigMidia

Extensão Chrome do Yoka para auxiliar o cadastro de atletas na Liga Paulista / BigMidia.

## Versão atual

**v1.4.7**

Página oficial de inclusão de atleta:

`https://ligapaulistafutsal.bigmidia.com/atleta/create`

A branch `main` contém o **código-fonte carregável da versão operacional atual**. Os ZIPs não são mais usados como fonte do projeto.

## Instalação

### Pela Release

1. Abra a página **Releases** deste repositório.
2. Baixe `importador-bigmidia-vX.Y.Z.zip`.
3. Extraia o arquivo.
4. Abra `chrome://extensions`.
5. Ative **Modo do desenvolvedor**.
6. Clique em **Carregar sem compactação** e selecione a pasta extraída.

### Pelo código da `main`

Também é possível clonar o repositório e carregar a própria raiz da `main` como extensão sem compactação, pois o `manifest.json` está na raiz.

## Organização do repositório

- `main`: código-fonte da versão operacional mais recente.
- `source-history`: histórico reconstruído das versões preservadas, com um commit por versão.
- tags `vX.Y.Z`: apontam para o código correspondente daquela versão.
- **Releases**: local correto para os ZIPs instaláveis.
- `archive/zip-imports-2026-08-27`: preserva, sem alteração, o lote de ZIPs que existia no laptop antes da migração.

A antiga pasta `versions/` foi removida da `main`; manter vários ZIPs binários dentro da linha principal do Git só aumentava o repositório e escondia as diferenças reais de código.

## Histórico reconstruído

Foram reconstruídas a partir dos pacotes do laptop, com validação do número da versão no `manifest.json`:

- v1.0.0
- v1.1.0
- v1.2.0
- v1.3.0
- v1.4.0
- v1.4.1
- v1.4.2
- v1.4.4
- v1.4.5
- v1.4.7

Os pacotes **v1.4.3** e **v1.4.6** não estavam no lote importado do laptop. Eles aparecem no `CHANGELOG.md` porque existiram durante o desenvolvimento, mas não foram publicados automaticamente nesta reconstrução para evitar inventar ou substituir uma versão histórica sem um pacote-fonte confiável no GitHub.

## Novas versões

Para uma nova versão:

1. altere o código na `main`;
2. atualize a versão em `manifest.json` e `VERSION`;
3. teste a extensão no BigMidia;
4. faça commit/push;
5. crie e envie a tag, por exemplo `v1.4.8`.

O workflow `.github/workflows/release.yml` valida se a tag, `VERSION` e `manifest.json` possuem a mesma versão, gera o ZIP instalável e publica/atualiza a Release automaticamente.

## Fonte dos dados

A extensão pode carregar os atletas diretamente do cadastro do Yoka no Google Sheets por meio da API do Google Apps Script. O CSV continua disponível como contingência.

A partir da v1.4.4, a API devolve dinamicamente as colunas existentes na aba `Atletas`, permitindo usar campos como nome na camisa, número, tamanho e futuras colunas sem manter uma lista fixa na extensão.

O backend dessa integração pertence ao projeto `cadastro-yoka`; este repositório contém a extensão Chrome.

## Recursos atuais

- carregamento de atletas pelo Google Sheets ou CSV;
- filtro de cadastro por categoria;
- preenchimento assistido dos dados do atleta e responsável;
- integração com consulta da RFB;
- download e inclusão assistida de documentos do Google Drive;
- `Autorização` cadastrada como **Termo Responsável (Menor de 18)**;
- mapeamento manual persistente, inclusive campos definidos como **— não preencher —**;
- correção do campo **Tipo Logradouro**;
- atualização de status na aba `Cadastro BigMidia`;
- retorno automático para `/atleta/create` depois do cadastro;
- notificações não bloqueantes para preenchimento e documentos;
- botão final **Cadastrar** mantido sob controle humano.

Consulte `CHANGELOG.md` para a evolução funcional detalhada.

## Segurança e dados pessoais

Este projeto trabalha com dados de atletas, inclusive menores de idade. Não versione:

- CSVs reais de atletas;
- CPF, endereço, telefone ou outros dados pessoais reais;
- RG, atestados, autorizações ou fotos;
- token da API do Apps Script;
- cookies ou sessões do Chrome;
- arquivos temporários baixados do Google Drive.

Use somente dados fictícios em exemplos e testes.
