# Importador BigMidia

Extensão Chrome do Yoka para auxiliar o cadastro de atletas na Liga Paulista / BigMidia.

## Versão atual

**v1.4.7**

Página oficial de inclusão de atleta:

`https://ligapaulistafutsal.bigmidia.com/atleta/create`

A extensão prepara os dados e documentos para conferência. O botão final **Cadastrar** permanece sob controle humano.

## Fonte dos dados

Na versão atual, a extensão pode carregar os atletas diretamente do cadastro do Yoka no Google Sheets, através da API do Google Apps Script. O CSV continua disponível como contingência.

A partir da v1.4.4, a API devolve dinamicamente todas as colunas existentes na aba `Atletas`, em vez de manter uma lista fechada. Assim, campos como `Nome ou apelido na camisa`, `Número da camisa`, `Tamanho da camisa` e futuras colunas passam a ficar disponíveis na extensão automaticamente.

O backend dessa integração pertence ao projeto `cadastro-yoka`; este repositório contém somente a extensão Chrome.

## Cadastro por categoria

A partir da v1.4.3, o painel possui o filtro **Cadastrar por categoria**. As categorias são descobertas dinamicamente a partir dos campos `Equipe atual` / `Categoria calculada` do Google Sheets. Ao selecionar uma categoria, a extensão mostra somente os atletas daquele grupo e a navegação Anterior/Próximo fica restrita a eles.

## Endereço

Na v1.4.4, o campo **Tipo Logradouro** deixou de participar do mapeamento fuzzy com a coluna `Logradouro`. Quando necessário, a extensão deriva somente o tipo do endereço, como `Rua`, `Avenida`, `Travessa` etc., evitando enviar o logradouro completo para esse campo.

## Mapeamento persistente

A v1.4.6 corrige a persistência do mapeamento manual. Depois de clicar em **Salvar mapeamento** ou importar um JSON, o mapeamento passa a ser tratado como uma especificação completa e bloqueada. Campos deixados em **— não preencher —** também são preservados e não voltam a ser preenchidos pelo automapeamento ao trocar de atleta, recarregar a página ou voltar do cadastro.

Ao atualizar da v1.4.5, um mapeamento que já possua `mappingSavedAt` é migrado automaticamente para o modo bloqueado. O botão **Automapear** continua disponível, mas apenas como uma ação explícita do operador; depois de usá-lo é necessário revisar e clicar em **Salvar mapeamento** novamente.

## Notificações sem bloqueio

A v1.4.7 remove os `alert()` usados nas confirmações de sucesso do preenchimento e da inclusão de documentos. Esses avisos podiam ficar pendentes até uma interação do usuário e bloquear a continuação do cadastro.

Agora o painel mostra notificações não bloqueantes dentro da própria extensão. Os controles são liberados imediatamente quando a etapa termina, e o operador pode continuar conferindo ou cadastrando sem precisar clicar no site para liberar a mensagem.

Erros de preenchimento ou documentos também são mostrados no painel, sem travar a página.

## Retorno pós-cadastro

Depois que o operador clica no botão **Cadastrar** do BigMidia, o portal normalmente volta para a tela inicial. A extensão acompanha todo o domínio BigMidia para detectar esse retorno. Quando um cadastro pendente é confirmado, ela atualiza o status, avança para o próximo atleta e retorna automaticamente para `/atleta/create`. O próximo cadastro continua dependendo do clique manual em **Preencher atleta**.

O popup da extensão também possui o botão **Abrir cadastro de atleta** para abrir diretamente a página correta do BigMidia.

## Versões preservadas

Os pacotes de cada versão ficam em `versions/`:

- v1.0.0
- v1.1.0
- v1.2.0
- v1.3.0
- v1.4.0
- v1.4.1
- v1.4.2
- v1.4.3
- v1.4.4
- v1.4.5
- v1.4.6
- v1.4.7

Consulte `CHANGELOG.md` para a evolução funcional.

## Segurança e dados pessoais

Não versione CSVs reais de atletas, documentos, CPFs, tokens da API, cookies, sessões do Chrome ou arquivos baixados do Google Drive. Use somente dados fictícios em exemplos e testes.
