# Importador BigMidia

Extensão Chrome do Yoka para auxiliar o cadastro e a correção de dados/documentos de atletas na Liga Paulista / BigMidia.

## Versão atual

**v1.4.9**

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

## Fonte dos dados

A extensão pode carregar os atletas diretamente do cadastro do Yoka no Google Sheets por meio da API do Google Apps Script. O CSV continua disponível como contingência.

A partir da v1.4.4, a API devolve dinamicamente as colunas existentes na aba `Atletas`, permitindo usar campos como nome na camisa, número, tamanho, `Link da foto do atleta` e futuras colunas sem manter uma lista fixa na extensão.

O backend dessa integração pertence ao projeto `cadastro-yoka`; este repositório contém a extensão Chrome.

## Busca de atleta

A partir da **v1.4.8**, o painel possui **Buscar atleta pelo nome** para correções pontuais de documentação e dados.

- aceita partes do nome e múltiplas palavras;
- pesquisa em todos os atletas retornados pelo Google Sheets;
- independe do filtro de categoria atual;
- mostra categoria e status BigMidia quando disponíveis;
- ao selecionar um resultado, aquele atleta passa a ser o atleta atual da extensão.

## Arquivos do atleta

A v1.4.8 incorporou a coluna **`Link da foto do atleta`** ao painel de arquivos.

A seção **Arquivos no Drive** usa o mesmo padrão para Foto, RG, Atestado e Autorização, com **Abrir**, **Baixar** e **Incluir**, e os estados **Link disponível**, **Sem link**, **Baixando...**, **Incluído** e **Erro**.

Na v1.4.9, a **Foto é opcional** e permanece somente no fluxo individual. O botão coletivo volta a se chamar **Incluir todos os documentos** e processa em sequência apenas:

1. RG;
2. Atestado;
3. Autorização.

Se houver foto disponível, ela pode ser incluída separadamente pelo botão **Incluir** da própria linha.

## Registros da Liga — v1.4.9

A página `https://ligapaulistafutsal.bigmidia.com/atleta/index` expõe os links de edição dos atletas no formato `/atleta/update?id=XXXXX`.

A v1.4.9 detecta esses IDs diretamente no DOM da listagem e apresenta o painel **Registros da Liga**. No comportamento atual do BigMidia, todos os registros da listagem ficam disponíveis no DOM de uma só vez, então a extensão não precisa navegar automaticamente entre páginas para capturá-los.

O botão **Cruzar e sincronizar registros** executa estas etapas com feedback visual imediato:

1. detecta todos os IDs BigMidia presentes na listagem;
2. carrega os atletas do Yoka pela API;
3. cruza os registros por CPF e, como fallback, por nome completo normalizado;
4. separa correspondências ambíguas, conflitos e registros sem correspondência;
5. envia somente as associações seguras para `syncBigMidiaReferences`;
6. grava `ID BigMidia` e `URL/Referência BigMidia` na aba `Cadastro BigMidia`.

A sincronização não altera automaticamente o status do atleta para `Cadastrado`.

Depois de sincronizado, o painel de busca passa a mostrar **Liga #XXXXX** e o atleta selecionado recebe o botão **Abrir na Liga**, que abre diretamente `/atleta/update?id=XXXXX`.

## Recursos atuais

- carregamento de atletas pelo Google Sheets ou CSV;
- busca de atleta pelo nome;
- filtro por categoria;
- preenchimento assistido dos dados do atleta e responsável;
- integração com consulta da RFB;
- inclusão assistida de Foto, RG, Atestado e Autorização;
- inclusão coletiva de **RG + Atestado + Autorização**;
- foto opcional, incluída somente quando desejado;
- sincronização dos números de registro da Liga;
- acesso direto ao cadastro de edição do atleta pelo ID BigMidia;
- mapeamento manual persistente;
- atualização de status na aba `Cadastro BigMidia`;
- notificações não bloqueantes;
- botão final **Cadastrar** mantido sob controle humano.

Consulte `CHANGELOG.md` para a evolução funcional detalhada.

## Segurança e dados pessoais

Este projeto trabalha com dados de atletas, inclusive menores de idade. Não versione CSVs reais, CPF, endereço, telefone, RG, atestados, autorizações, fotos, token da API, cookies ou sessões do Chrome.