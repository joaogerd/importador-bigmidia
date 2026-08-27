# Importador Yoka – Liga Paulista v1.3

Extensão local para o Chrome que preenche o cadastro de atletas da Liga Paulista a partir de um CSV do Yoka. Ela usa os identificadores HTML do formulário, portanto não depende da resolução da tela nem da posição visual dos campos.

## Novidades da versão 1.3

- baixa RG, atestado e autorização diretamente dos links do Google Drive;
- coloca o arquivo no campo de upload da Liga;
- seleciona automaticamente o tipo de documento;
- aguarda a confirmação do upload;
- clica em **Salvar documento** dentro do modal;
- oferece **Incluir** para cada documento e **Incluir todos os documentos**;
- mantém o botão final **Cadastrar** exclusivamente manual;
- rejeita arquivos maiores que 10 MB;
- mantém os botões Abrir e Baixar como alternativas.

## Instalação

1. Descompacte o ZIP em uma pasta permanente.
2. Abra `chrome://extensions` no Chrome.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Selecione a pasta `importador-yoka-liga-v1.3`, que contém o arquivo `manifest.json`.
6. O Chrome exibirá permissões de acesso à página da Liga e ao Google Drive. Elas são necessárias para obter os documentos indicados no CSV.
7. Entre normalmente na Liga Paulista e no Google Drive, no mesmo perfil do Chrome.
8. Abra `https://ligapaulistafutsal.bigmidia.com/atleta/create`.

### Atualizar uma instalação anterior

1. Remova ou substitua a pasta antiga pela pasta da versão 1.3.
2. Abra `chrome://extensions`.
3. Clique no ícone de recarregar da extensão.
4. Recarregue a página da Liga.

Como a versão 1.3 adiciona permissões para o Google Drive, o Chrome pode pedir que a extensão seja reativada ou que as novas permissões sejam aceitas.

## CSV reconhecido

A extensão reconhece, entre outras, estas colunas:

- `Nome completo do atleta`;
- `Data de nascimento`;
- `CPF do atleta`;
- `Telefone do atleta`;
- `Posição`;
- `Nome da mãe`, `CPF da mãe`, `Telefone/WhatsApp da mãe`;
- `Nome do pai`, `CPF do pai`, `Telefone/WhatsApp do pai`;
- `Responsável principal`;
- `E-mail principal para contato`;
- `Cidade de nascimento`;
- `Pé predominante`;
- `CEP`, `Logradouro`, `Número do endereço`, `Complemento`, `Bairro`, `Cidade do endereço`, `Estado`;
- `Link do RG`;
- `Link do atestado`;
- `Link da autorização`.

O tamanho da camisa não é preenchido.

## Fluxo do atleta

1. Importe o CSV na aba **Dados**.
2. Confira o mapeamento no primeiro uso.
3. Na aba **Cadastro**, clique em **Preencher atleta**.
4. A extensão preenche CPF e nascimento, clica em **Buscar Dados na RFB**, aguarda o nome e continua os demais campos lentamente.
5. Confira os dados.
6. Clique em **Incluir todos os documentos** ou use o botão **Incluir** de cada item.
7. Confira a tabela de documentos da Liga.
8. Clique manualmente em **Cadastrar**.

## Inclusão de documentos

Para cada documento, a extensão executa:

1. extrai o ID do arquivo do link do Drive;
2. baixa o arquivo em memória;
3. verifica o limite de 10 MB;
4. abre **Adicionar documento**;
5. procura o tipo correspondente, como RG, Atestado Médico ou Autorização;
6. coloca o arquivo no primeiro campo de upload;
7. aciona o upload quando necessário;
8. aguarda o campo de confirmação da Liga;
9. clica em **Salvar documento**.

O arquivo não precisa ser salvo em uma pasta local antes do envio.

### Links privados do Drive

O arquivo precisa estar acessível à conta Google conectada no mesmo perfil do Chrome. Quando a extensão receber uma página de login ou de acesso negado no lugar do arquivo, ela interromperá e mostrará uma mensagem. Nesse caso:

1. clique em **Abrir** no documento;
2. confirme que o arquivo abre com a conta atual;
3. confirme que o proprietário permite download;
4. volte à Liga e tente **Incluir** novamente.

### Tipos de documento

A extensão procura nomes aproximados:

- RG, Registro Geral, Carteira de Identidade ou Documento de Identidade;
- Atestado, Atestado Médico ou Atestado de Saúde;
- Autorização, Autorização do Responsável ou Termo de Autorização.

Se a Liga usar outro nome, a extensão deixará o modal aberto e mostrará os tipos encontrados. Isso permite ajustar o nome no código sem perder o arquivo ou o cadastro em andamento.

### Limitações

- O primeiro teste deve ser feito com um atleta e conferido cuidadosamente.
- Mudanças futuras no modal de documentos da Liga podem exigir atualização dos seletores.
- Se o site exigir uma etapa manual adicional, o modal permanece aberto para conclusão.
- Um documento já incluído pode ser duplicado se o botão for acionado novamente; confira a tabela antes do cadastro final.

## Logo do Yoka

Na aba **Dados**, selecione uma imagem PNG, JPG, WEBP ou SVG de até 2 MB. O logo fica salvo somente no armazenamento local do Chrome.

## Privacidade

O CSV, o mapeamento, o progresso e o logo ficam no armazenamento local do Chrome. Os documentos são obtidos diretamente do Google Drive e enviados ao sistema da Liga pelo próprio navegador. A extensão não possui servidor intermediário.
