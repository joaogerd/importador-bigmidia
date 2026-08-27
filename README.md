# Importador Yoka – Liga Paulista

Extensão local do Chrome para preencher um atleta por vez no formulário da Liga Paulista usando o CSV exportado da planilha do Yoka.

## Fluxo automatizado

Ao clicar em **Preencher atleta**, a extensão:

1. preenche CPF e data de nascimento do atleta;
2. clica no botão oficial **Buscar Dados na RFB**;
3. aguarda o site preencher o nome;
4. preenche lentamente os demais dados;
5. seleciona o responsável principal entre mãe e pai;
6. deixa foto, documentos, conferência e o botão **Cadastrar** sob controle do operador.

A extensão não usa coordenadas da tela e não depende da resolução do computador.

## Instalação

1. Descompacte o ZIP em uma pasta permanente.
2. Abra `chrome://extensions` no Chrome.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Selecione a pasta `importador-yoka-liga`, na qual está o arquivo `manifest.json`.
6. Entre normalmente na Liga Paulista.
7. Abra `https://ligapaulistafutsal.bigmidia.com/atleta/create`.
8. O painel **Importador Yoka** aparecerá no lado direito.

Após substituir os arquivos de uma versão anterior, abra `chrome://extensions` e clique no botão de recarregar da extensão.

## Importar a planilha

No Google Sheets, use:

**Arquivo → Fazer download → Valores separados por vírgulas (.csv)**

Na página da Liga:

1. abra a aba **Dados** do painel;
2. selecione o CSV;
3. confira a aba **Mapeamento**;
4. faça o primeiro teste com um único atleta;
5. volte à aba **Cadastro** e clique em **Preencher atleta**.

O CSV pode usar vírgula, ponto e vírgula ou tabulação como separador.

## Colunas reconhecidas diretamente

A versão 1.1 reconhece automaticamente os nomes usados na planilha do Yoka:

| Coluna do CSV | Campo da Liga |
|---|---|
| CPF do atleta | CPF/documento do atleta |
| Data de nascimento | Data de nascimento |
| Nome completo do atleta | Identificação no painel; o nome no formulário vem da RFB |
| Telefone do atleta | Celular do atleta |
| Posição | Posição |
| Nome da mãe | Nome da mãe |
| Nome do pai | Nome do pai |
| Cidade de nascimento | Naturalidade |
| E-mail principal para contato | E-mail do atleta e do responsável |
| Nome ou apelido na camisa | Apelido/nome para evento |
| Pé predominante | Lado dominante |
| Equipe atual | Vínculo/clube |
| CEP, Logradouro, Número do endereço, Complemento, Bairro, Cidade do endereço e Estado | Endereço do atleta |
| Tamanho da camisa | Camiseta |

## Responsável principal

A planilha possui os dados da mãe e do pai em colunas separadas. A extensão cria internamente quatro colunas derivadas:

- `Gerado: nome do responsável principal`;
- `Gerado: CPF do responsável principal`;
- `Gerado: telefone do responsável principal`;
- `Gerado: parentesco do responsável principal`.

A coluna **Responsável principal** pode conter:

- `Mãe`;
- `Pai`;
- o nome completo da mãe;
- o nome completo do pai.

Como o CSV atual não contém a data de nascimento dos pais, a extensão não executa a consulta RFB do responsável. Ela preenche nome, CPF, telefone e parentesco diretamente. A consulta RFB do atleta continua automática.

## Colunas mantidas apenas na planilha

Estas informações não possuem um campo direto e seguro no formulário analisado ou exigem upload manual:

- ID e datas de controle;
- Categoria calculada;
- Número da camisa;
- Origem;
- Restrições/observações;
- Número do RG;
- links de RG, atestado, autorização e foto;
- datas de envio de documentos e foto.

Foto, RG, atestado e autorização continuam manuais porque o navegador não permite que uma extensão escolha arquivos locais automaticamente e os links da planilha não equivalem ao arquivo selecionado no formulário.

## Pausa entre campos

A pausa padrão é **750 ms**. Recomenda-se manter entre **700 e 900 ms**. O mínimo permitido pela extensão é 550 ms.

## Depois do preenchimento

1. confira todos os campos;
2. anexe foto e documentos;
3. clique em **Marcar pronto e próximo** no painel;
4. clique manualmente em **Cadastrar** na Liga;
5. ao abrir um novo cadastro, o próximo atleta estará selecionado.

## Atualização e solução de problemas

- Se o painel não aparecer, recarregue a página da Liga.
- Depois de alterar ou substituir os arquivos da extensão, clique em **Recarregar** em `chrome://extensions`.
- Se a RFB não encontrar o atleta, confira CPF e nascimento no CSV.
- Se uma lista não selecionar posição, equipe ou pé dominante, abra **Mapeamento** e confirme a coluna correspondente.
- Se **Responsável principal** estiver vazio ou diferente de mãe, pai ou nome de um deles, os dados do responsável poderão ficar em branco para evitar escolher a pessoa errada.
- O botão **Cadastrar** nunca é acionado pela extensão.

## Privacidade

O CSV, o mapeamento e o progresso ficam no armazenamento local da extensão neste Chrome. A extensão não possui servidor próprio.
