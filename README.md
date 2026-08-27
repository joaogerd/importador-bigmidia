# Importador Yoka — Liga Paulista v1.4.5

Extensão Chrome (Manifest V3) para preenchimento assistido do cadastro de atletas no BigMidia / Liga Paulista.

## Novidades da v1.4

- Usa o **Google Sheets do Yoka como fonte principal** de dados.
- Mantém o **CSV como modo de contingência**.
- Registra o andamento na aba **Cadastro BigMidia** da planilha administrativa.
- Marca o atleta como **Em preenchimento** ao concluir o preenchimento do formulário.
- Antes do envio final, guarda localmente qual atleta está sendo cadastrado.
- Ao navegar para fora da tela de criação após o envio, tenta confirmar automaticamente o status **Cadastrado** no Sheets.
- Mantém o botão **Registrar cadastrado e próximo** como confirmação manual de contingência.
- Registra situação de RG, atestado e autorização.

## Fluxo recomendado

1. Abra o cadastro de atleta no BigMidia.
2. Na aba **Dados** do painel da extensão, informe a URL da implantação do Apps Script e a chave da API.
3. Clique em **Testar conexão**.
4. Clique em **Carregar atletas**.
5. Selecione o atleta e clique em **Preencher atleta**.
6. Inclua os documentos e confira os dados.
7. Clique manualmente em **Cadastrar** no BigMidia.
8. A extensão tentará registrar a conclusão no Google Sheets quando a navegação confirmar que o formulário foi enviado.
9. Se a confirmação automática não ocorrer, use **Registrar cadastrado e próximo**.

## API no Apps Script

O backend fica no arquivo `src/BigMidiaApi.js` do repositório `cadastro-yoka`.

No editor do Apps Script, execute uma vez:

```text
configurarBigMidiaApi()
```

A função grava uma chave aleatória em `ScriptProperties` e imprime a chave no log. Depois atualize a implantação do aplicativo da Web.

A extensão precisa de:

- URL da implantação terminada em `/exec`;
- chave gerada por `configurarBigMidiaApi()`.

## Segurança

A API exige uma chave armazenada em `ScriptProperties`. A chave e a URL ficam no `chrome.storage.local` da instalação do Chrome. A API expõe somente os campos necessários para o cadastro e permite atualizar somente a aba de controle do BigMidia.

## Instalação da extensão

1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta desta extensão.

## Observação

O botão final **Cadastrar** continua manual. A automação preenche e envia documentos, mas a decisão final continua com o operador.


## Correção 1.4.1
- Detecta PDF/JPG/PNG pela assinatura real dos bytes baixados do Drive.
- Normaliza MIME e extensão antes de entregar o arquivo ao BigMidia.
- Evita o erro “Tipo de arquivo inválido” quando o Drive responde como application/octet-stream.

## BigMidia — cadastro de atleta

Endereço oficial usado para inclusão de atleta:

`https://ligapaulistafutsal.bigmidia.com/atleta/create`

No envio dos documentos, o arquivo de autorização do responsável deve ser cadastrado no BigMidia com o tipo exato **Termo Responsável (Menor de 18)**.


## Novidades da v1.4.5

- filtro dinâmico **Cadastrar por categoria** no painel principal;
- categorias são descobertas automaticamente a partir de `Equipe atual` / `Categoria calculada` da planilha;
- ao selecionar uma categoria, a extensão recarrega o Google Sheets e mostra somente os atletas daquela categoria;
- a categoria do atleta atual aparece logo abaixo do nome;
- o filtro não exige alteração futura quando novas categorias forem criadas na planilha.


## Correções da v1.4.5

- Corrige o campo **Tipo Logradouro**: ele não recebe mais o logradouro completo; quando necessário, usa somente o tipo (Rua, Avenida, Travessa etc.).
- Remove automaticamente mapeamentos antigos incorretos de Tipo Logradouro salvos no Chrome.
- Mostra Nome na camisa, Número e Tamanho na ficha do atleta.
- Compatível com a API atualizada que devolve todas as colunas da aba `Atletas`.


## Novidades da v1.4.5

- Botão **Salvar mapeamento** com confirmação visual e persistência explícita no Chrome.
- O mapeamento salvo passa a ter prioridade sobre o automapeamento sugerido.
- Após clicar em **Cadastrar** e o BigMidia retornar à tela inicial, a extensão confirma o status, avança para o próximo atleta e volta automaticamente para `/atleta/create`.
- O content script passa a acompanhar todo o domínio BigMidia apenas para completar esse retorno pós-cadastro; o painel completo continua sendo exibido somente no formulário de criação.
- O popup da extensão possui o botão **Abrir cadastro de atleta**.
