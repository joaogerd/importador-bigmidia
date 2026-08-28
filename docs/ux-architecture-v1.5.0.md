# Arquitetura de UX — v1.5.0

## Objetivo

Separar claramente duas responsabilidades da extensão:

1. **Configuração da extensão** — estado persistente, independente da página atual da BigMidia.
2. **Execução sobre a BigMidia** — ações que dependem do DOM e de uma rota específica do sistema externo.

## Diagnóstico da arquitetura anterior

O `content.js` foi originalmente construído como um executor do formulário `#Atleta`. O `init()` encerrava a execução quando esse formulário não estava presente. Como Cadastro, Mapeamento e Dados eram montados pelo mesmo `buildUi()`, Mapeamento/Dados herdaram uma dependência que não era necessária.

Essa arquitetura também fazia o painel crescer por adição de funcionalidades: cadastro, busca, registros da Liga e transferência passaram a coexistir em módulos separados, nem sempre com a mesma navegação.

## Dependências reais da BigMidia

### Dependem de uma página específica

- **Preencher cadastro** — precisa do formulário `#Atleta` e dos controles reais da BigMidia.
- **Enviar foto/documentos** — precisa dos inputs/modais de upload da página de atleta.
- **Descobrir o esquema de campos** — precisa inspecionar os IDs/labels do formulário da Liga. Essa descoberta é feita uma vez e o catálogo é persistido.
- **Sincronizar IDs da Liga** — precisa da listagem `/atleta/index`, onde os links/IDs estão disponíveis.
- **Selecionar atleta para transferência** — precisa de `/bid/create`, do modal `#selAtleta`, da busca `#generalSearchAtl` e da tabela da BigMidia.

### Não dependem de uma página específica

- URL/token do Apps Script;
- teste da API;
- atualização da cópia local dos atletas;
- importação CSV de contingência;
- edição do mapeamento já conhecido;
- importação/exportação do mapeamento;
- preferências de pausa e identidade visual;
- busca/navegação de atletas do Yoka;
- seleção do atleta que será usado na próxima operação.

## Decisão de arquitetura

O Manifest V3 passa a separar os scripts por rota:

- páginas de criação/edição de atleta recebem o executor `content.js` e módulos de arquivos;
- `/atleta/index` recebe o sincronizador de registros;
- `/bid/create` recebe o módulo de transferência;
- todas as páginas recebem o shell operacional e Configurações.

Isso impede que o executor de cadastro rode em páginas que não possuem o formulário e elimina redirecionamentos/efeitos colaterais de código operacional durante tarefas de configuração.

## Catálogo persistente de campos

A única dependência legítima do Mapeamento é conhecer os campos de destino da Liga. A v1.5.0 captura esse esquema em `yklFieldCatalogV150` quando um formulário de atleta é aberto.

Depois da captura:

- o usuário pode revisar/editar/salvar o mapeamento em qualquer página da BigMidia;
- não há redirecionamento automático para cadastro;
- a página de cadastro só é necessária novamente se o esquema da Liga mudar e o usuário quiser recapturá-lo.

## Arquitetura de informação do painel

A navegação principal usa quatro áreas:

1. **Atletas**
2. **Cadastro**
3. **Transferir**
4. **Config.**

A sincronização dos IDs da Liga fica dentro de **Atletas**, porque é uma operação de manutenção dos registros dos atletas, não uma área conceitual independente.

Configurações possui três subáreas:

- **Mapeamento**
- **Dados**
- **Preferências**

## Atletas e progressive disclosure

A extensão não renderiza todos os atletas na visão inicial.

A tela apresenta:

- busca global por nome;
- cards de categorias com contagem de atletas e quantidade com registro na Liga;
- drill-down para uma lista somente da categoria escolhida;
- seleção de um atleta seguida das ações contextuais `Editar/Cadastrar` e `Transferir`.

A escolha por cards + drill-down foi preferida a tabs horizontais ou dropdown porque:

- evita overflow de muitas categorias;
- mostra contagens sem exigir abrir um seletor;
- funciona melhor em painel estreito;
- reduz densidade inicial;
- mantém a busca global como caminho rápido.

Não foi criado mapeamento por categoria porque o formulário-alvo da BigMidia usa o mesmo esquema de campos para todas as categorias. Criar perfis por categoria adicionaria complexidade sem uma diferença técnica de destino.

## Responsividade

A v1.5.0 preserva o comportamento introduzido na v1.4.9 para telas baixas:

- painel limitado à viewport;
- corpo com scroll próprio;
- navegação sticky;
- ações principais de Cadastro em dock fixo na parte inferior;
- compactação automática por altura;
- redução de textos auxiliares/densidade antes de reduzir controles principais.

### Invariante responsiva das ações críticas

As ações **Preencher atleta**, **Interromper**, **Registrar cadastrado e próximo**, **Anterior** e **Próximo** não podem depender de o usuário rolar até o final do painel quando houver pouco espaço útil.

O dock é ativado quando:

- a altura útil da janela é reduzida; ou
- o conteúdo do painel ultrapassa a área rolável disponível.

A decisão não deve depender somente da resolução nominal da tela. Barras do navegador, zoom, janela dividida e outros fatores que reduzam a viewport também devem acionar o comportamento responsivo.

Esse requisito deve ser tratado como prevenção de regressão funcional, e não como preferência estética.

A reserva de espaço do dock existe apenas quando as ações de Cadastro estão presentes; telas como Atletas e Configurações não perdem espaço vertical desnecessariamente.

Listas extensas (atletas e mapeamento) possuem áreas internas de scroll, evitando que todo o painel cresça indefinidamente.

## Hierarquia visual

- azul: navegação/ações contextuais da Liga;
- verde: ação primária de preenchimento do cadastro;
- vermelho: interrupção/ações destrutivas;
- botões neutros: navegação e ações secundárias.

Ações finais da BigMidia continuam manuais. A extensão não clica automaticamente no botão final `Cadastrar` do cadastro ou da transferência.
