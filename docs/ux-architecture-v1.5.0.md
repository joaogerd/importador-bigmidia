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
- **Conferência documental LPF** — a marcação do resultado é persistente, mas a validação precisa da página `/atleta/update?id=...` para que o operador confira visualmente foto e documentos existentes no cadastro.

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

## Atualização de fotos em sequência

A atualização exclusiva de fotos é tratada como um **modo operacional opt-in**, separado do cadastro normal.

Na categoria, a extensão pode iniciar uma fila somente com atletas que possuem registro da Liga e foto no Drive. A fila é persistida entre páginas e usa a ordem alfabética da categoria.

Durante a edição ficam disponíveis:

- progresso da fila;
- **Ir para Salvar**;
- **Salvar e próximo**;
- **Pular**;
- **Encerrar**.

O retorno pós-salvamento é tratado mesmo quando a BigMidia redireciona para uma rota genérica, usando um bridge leve carregado fora das páginas de edição/listagem.

Fora desse modo, incluir uma foto não salva nem avança automaticamente.

## Conferência documental LPF

A preparação da planilha oficial da Liga é tratada como outro modo operacional específico, separado tanto do cadastro completo quanto da atualização de fotos.

### Objetivo

Permitir abrir todos os cadastros de uma categoria, conferir visualmente a documentação já existente na BigMidia e registrar o resultado sem obrigar o operador a retornar à listagem e procurar manualmente o próximo atleta.

### Itens conferidos

O resultado segue exatamente as colunas da planilha oficial utilizada pela Liga:

- QTD;
- Nome completo;
- Data cadastro;
- Foto;
- RG;
- Atestado;
- Autorização de menor.

A **Data cadastro** é capturada automaticamente do texto `Criado em:` da página de edição. Foto, RG, Atestado e Autorização são sempre validados manualmente: a simples existência de link ou arquivo não significa que o documento esteja correto.

### Estados

Cada documento possui dois estados explícitos:

- **OK**;
- **Pendência**.

Enquanto algum dos quatro itens estiver sem marcação, o atleta não pode ser finalizado na conferência.

### Fluxo

Na categoria aparece o card **Conferência LPF** com progresso e pendências.

Ao iniciar/continuar:

1. abre o primeiro atleta ainda não conferido da categoria;
2. mostra progresso `N de total`;
3. permite marcar os quatro itens individualmente ou usar **Tudo OK**;
4. oferece atalho **Ir para documentos**;
5. **Salvar conferência e próximo** persiste o resultado localmente e abre diretamente o próximo `/atleta/update?id=...`;
6. **Anterior**, **Pular** e **Encerrar** dão controle manual da fila.

Não existe clique automático no `Salvar` da BigMidia nesse modo, porque a conferência não altera o cadastro.

### Planilha oficial

Os resultados são armazenados em `chrome.storage.local` na chave `yklLpfAuditV150` e sobrevivem à navegação entre atletas.

A extensão libera **Copiar para planilha LPF** somente quando todos os atletas considerados na seleção estão conferidos, sem pendências e com data de cadastro detectada.

O conteúdo copiado usa sete colunas tabuladas, na ordem da planilha oficial. O operador abre o arquivo da Liga, seleciona a primeira célula de dados (B5 no modelo recebido) e cola. Assim a formatação, validações e estrutura do arquivo oficial permanecem intactas.

A visão geral também apresenta grupos KIDS (Sub-7 a Sub-10) e JUNIOR (Sub-11, Sub-13, Sub-15 e Sub-17) para acompanhar o progresso agregado.

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
- verde: ação primária de preenchimento do cadastro ou finalização da conferência atual;
- vermelho: interrupção/ações destrutivas;
- botões neutros: navegação e ações secundárias.

Ações finais da BigMidia continuam manuais. A extensão não clica automaticamente no botão final `Cadastrar` do cadastro ou da transferência.
