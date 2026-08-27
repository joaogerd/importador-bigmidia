# Importador Yoka — Liga Paulista v1.4.2

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
configurarBigMidiaApi_()
```

A função grava uma chave aleatória em `ScriptProperties` e imprime a chave no log. Depois atualize a implantação do aplicativo da Web.

A extensão precisa de:

- URL da implantação terminada em `/exec`;
- chave gerada por `configurarBigMidiaApi_()`.

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
