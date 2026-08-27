# Importador Yoka – Liga Paulista 1.2

Extensão local do Chrome para preencher um atleta por vez no formulário da Liga Paulista usando o CSV exportado da planilha do Yoka.

## Novidades da versão 1.2

- remove o preenchimento de tamanho da camisa;
- permite escolher o logo do Yoka para o painel;
- reconhece `Link do RG`, `Link do atestado` e `Link da autorização`;
- mostra, para o atleta atual, botões **Abrir** e **Baixar** para cada documento;
- possui botão para ir diretamente à seção de documentação da Liga.

## Fluxo automatizado

Ao clicar em **Preencher atleta**, a extensão:

1. preenche CPF e data de nascimento do atleta;
2. clica no botão oficial **Buscar Dados na RFB**;
3. aguarda o site preencher o nome;
4. preenche lentamente os demais dados;
5. seleciona o responsável principal entre mãe e pai;
6. deixa documentos, conferência e o botão **Cadastrar** sob controle do operador.

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

No Google Sheets, use **Arquivo → Fazer download → Valores separados por vírgulas (.csv)**.

Na página da Liga:

1. abra a aba **Dados** do painel;
2. selecione o CSV;
3. confira a aba **Mapeamento**;
4. faça o primeiro teste com um único atleta;
5. volte à aba **Cadastro** e clique em **Preencher atleta**.

O CSV pode usar vírgula, ponto e vírgula ou tabulação como separador.

## Logo do Yoka

Na aba **Dados**:

1. localize **Logo do Yoka**;
2. selecione uma imagem PNG, JPG, WEBP ou SVG de até 2 MB;
3. o logo aparecerá no cabeçalho do painel e no popup da extensão.

O logo fica salvo apenas no armazenamento local do Chrome. Para embutir o logo definitivamente no pacote, substitua os ícones e a arte da extensão por arquivos fornecidos pelo clube.

## Documentos do Drive

A extensão reconhece estas colunas exatamente:

- `Link do RG`;
- `Link do atestado`;
- `Link da autorização`.

Na aba **Cadastro**, cada documento mostra:

- **Abrir**: abre a página normal do Drive;
- **Baixar**: tenta abrir o endereço de download direto do Drive;
- **Ir para a seção de documentos**: desloca a página até a documentação da Liga.

O arquivo ainda precisa ser selecionado manualmente no modal **Adicionar documento**. Isso evita manipular o mecanismo de upload e o envio final da Liga. Se o Drive pedir login ou autorização, conclua o acesso na guia aberta.

## Colunas reconhecidas diretamente

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

O tamanho da camisa não é mapeado nem preenchido.

## Responsável principal

A planilha possui os dados da mãe e do pai em colunas separadas. A extensão cria internamente quatro colunas derivadas:

- `Gerado: nome do responsável principal`;
- `Gerado: CPF do responsável principal`;
- `Gerado: telefone do responsável principal`;
- `Gerado: parentesco do responsável principal`.

A coluna **Responsável principal** pode conter `Mãe`, `Pai`, o nome completo da mãe ou o nome completo do pai.

Como o CSV atual não contém a data de nascimento dos pais, a extensão não executa a consulta RFB do responsável. Ela preenche nome, CPF, telefone e parentesco diretamente. A consulta RFB do atleta continua automática.

## Pausa entre campos

A pausa padrão é **750 ms**. Recomenda-se manter entre **700 e 900 ms**. O mínimo permitido pela extensão é 550 ms.

## Depois do preenchimento

1. confira todos os campos;
2. use os botões do painel para baixar RG, atestado e autorização;
3. clique em **Ir para a seção de documentos**;
4. adicione cada documento e aguarde a confirmação do site;
5. clique em **Marcar pronto e próximo** no painel;
6. clique manualmente em **Cadastrar** na Liga.

## Privacidade

O CSV, o mapeamento, o progresso e o logo ficam no armazenamento local desta instalação do Chrome. A extensão não possui servidor próprio.
