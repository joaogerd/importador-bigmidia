# Importador Yoka – Liga Paulista

Extensão local para preencher, um atleta por vez, o formulário de cadastro da Liga Paulista a partir de um arquivo CSV.

## O que ela faz

- Importa CSV separado por vírgula, ponto e vírgula ou tabulação.
- Detecta os campos existentes no formulário da Liga.
- Tenta mapear automaticamente as colunas da planilha.
- Permite corrigir o mapeamento campo por campo.
- Preenche CPF e nascimento do atleta.
- Clica no botão oficial **Buscar dados na RFB** e aguarda o nome aparecer.
- Preenche os demais campos lentamente.
- Pode clicar nos botões oficiais de busca de CEP.
- Pode consultar também o responsável na RFB, quando CPF e nascimento estiverem disponíveis.
- Mantém o botão **Cadastrar** manual.
- Guarda CSV, mapeamento e progresso apenas no armazenamento local do Chrome.

## Instalação no Google Chrome

1. Descompacte o arquivo ZIP em uma pasta permanente. Não apague essa pasta depois.
2. No Chrome, abra `chrome://extensions`.
3. Ative **Modo do desenvolvedor**, no canto superior direito.
4. Clique em **Carregar sem compactação**.
5. Escolha a pasta `importador-yoka-liga` que contém o arquivo `manifest.json`.
6. Entre normalmente no sistema da Liga Paulista.
7. Abra `https://ligapaulistafutsal.bigmidia.com/atleta/create`.
8. O painel **Importador Yoka** aparecerá à direita.

## Primeiro uso

1. No painel, abra a aba **Dados**.
2. Selecione o CSV exportado do Google Sheets.
3. A extensão abrirá a aba **Mapeamento**.
4. Confira principalmente:
   - CPF do atleta;
   - data de nascimento do atleta;
   - CPF do responsável;
   - data de nascimento do responsável;
   - telefone, e-mail, endereço, posição e medidas.
5. Volte à aba **Cadastro**.
6. Escolha uma pausa de 700 a 900 ms por campo.
7. Clique em **Preencher atleta**.
8. Confira tudo, anexe foto/documentos e clique manualmente em **Cadastrar**.
9. Antes de cadastrar, use **Marcar pronto e próximo** para deixar o próximo atleta selecionado após recarregar a página.

## CSV

A primeira linha precisa conter os títulos das colunas. Exemplo:

```csv
Nome do atleta;CPF do atleta;Data de nascimento;Sexo;Nome da mãe;Nome do pai;E-mail;Celular;CEP;Número;Nome do responsável;CPF responsável;Nascimento responsável;Telefone responsável;Posição
ATLETA TESTE;000.000.000-00;01/01/2018;Masculino;MÃE TESTE;PAI TESTE;teste@example.com;(12) 99999-9999;00000-000;100;RESPONSÁVEL TESTE;111.111.111-11;01/01/1990;(12) 98888-8888;Ala
```

Use dados fictícios para testar inicialmente.

## Mapeamento

A página da Liga possui muitos campos. A extensão descobre esses campos diretamente no formulário. Na aba **Mapeamento**, cada campo da Liga recebe uma coluna do CSV.

Campos sem coluna correspondente devem permanecer em **— não preencher —**.

O botão **Exportar mapeamento** salva um JSON para usar em outro computador. No novo computador:

1. instale a extensão;
2. importe o CSV;
3. clique em **Importar mapeamento**;
4. escolha o JSON exportado.

## Observações

- A extensão não usa coordenadas da tela.
- Ela depende dos identificadores HTML do formulário. Se o site alterar esses identificadores, alguns campos podem precisar de atualização.
- Não feche ou recarregue a página enquanto o preenchimento estiver ocorrendo.
- Não clique em **Cadastrar** antes de a consulta à RFB e o preenchimento terminarem.
- Se a RFB não encontrar o CPF, o processo é interrompido para você corrigir os dados.
- Foto e documentos continuam manuais.
