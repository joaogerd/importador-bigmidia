# Changelog

Histórico das versões conhecidas do Importador BigMidia / Importador Yoka.

## 1.4.8
- Adiciona **busca de atleta pelo nome** no painel principal para o fluxo de correção pontual de cadastros/documentos.
- A busca consulta todos os atletas do Google Sheets, independentemente do filtro de categoria atualmente selecionado.
- Permite pesquisar por partes do nome; ao selecionar um resultado, aquele atleta passa a ser o atleta atual da extensão.
- Exibe categoria e status BigMidia nos resultados da busca quando disponíveis.
- Adiciona a **Foto do atleta** à área de arquivos, usando a coluna `Link da foto do atleta` do Google Sheets.
- Permite abrir, baixar e incluir a foto diretamente a partir do Drive.
- Padroniza a linha da foto com RG, atestado e autorização: botões **Abrir / Baixar / Incluir**, estados **Link disponível / Sem link / Baixando... / Incluído / Erro** e as mesmas classes visuais do `content.js`.
- O botão coletivo passa a se chamar **Incluir todos os arquivos** e processa, em sequência, **Foto + RG + Atestado + Autorização**, aguardando cada item terminar antes de iniciar o próximo.
- A foto é tratada separadamente de RG/atestado/termo e nunca é enviada como tipo de documento.
- Detecta o campo de foto do BigMidia por identificadores/labels relacionados a foto, imagem ou avatar, excluindo explicitamente o campo do modal de documentos.
- Aceita foto em JPG/JPEG ou PNG e usa o mesmo aviso não bloqueante do restante do painel.

## 1.4.7
- Remove os `alert()` usados para confirmar sucesso depois do preenchimento dos dados e da inclusão de documentos.
- Adiciona notificações não bloqueantes dentro do painel da extensão.
- Libera os controles imediatamente ao término de cada etapa, antes de mostrar a confirmação visual.
- Evita depender de um clique posterior no site para exibir a mensagem e liberar a continuação do cadastro.
- A inclusão individual de RG, atestado ou termo também passa a mostrar confirmação não bloqueante.
- Erros de preenchimento/documentos são mostrados no painel sem travar a página.

## 1.4.6
- Corrige a persistência do mapeamento manual entre páginas e cadastros.
- Depois de **Salvar mapeamento** ou importar um JSON, o mapeamento passa a ser tratado como uma especificação completa e bloqueada.
- Campos deixados em **— não preencher —** permanecem assim e não são remapeados automaticamente.
- Impede que `autoMap()` sobrescreva o mapeamento salvo ao carregar atletas, trocar de página ou reinicializar a extensão.
- Migra automaticamente mapeamentos salvos na v1.4.5: se houver `mappingSavedAt`, eles passam a ser considerados bloqueados.
- O botão **Automapear** continua disponível como ação explícita; após usá-lo é necessário revisar e salvar novamente.
- Exportações de mapeamento passam a usar formato versão 2 e registram a intenção de manter o mapeamento bloqueado.

## 1.4.5
- Adiciona o botão **Salvar mapeamento** na aba Mapeamento.
- O mapeamento confirmado fica persistido explicitamente no `chrome.storage.local` e tem prioridade sobre as sugestões do automapeamento nas próximas páginas/sessões.
- Exibe confirmação visual com o horário em que o mapeamento foi salvo.
- O content script passa a acompanhar todo o domínio `ligapaulistafutsal.bigmidia.com` para completar o fluxo depois do botão final **Cadastrar**.
- Quando o BigMidia retorna para a tela inicial após um cadastro, a extensão confirma o status, avança para o próximo atleta e volta automaticamente para `/atleta/create`.
- O próximo atleta fica selecionado, mas o preenchimento continua manual.
- O popup da extensão ganha o botão **Abrir cadastro de atleta**.

## 1.4.4
- Corrige o mapeamento do campo **Tipo Logradouro** para impedir que ele receba o conteúdo completo da coluna `Logradouro`.
- Remove automaticamente mapeamentos antigos incorretos de Tipo Logradouro salvos no Chrome.
- Quando necessário, deriva somente o tipo do endereço, como `Rua`, `Avenida`, `Travessa`, `Alameda`, `Rodovia` ou `Estrada`.
- A ficha do atleta passa a mostrar `Nome ou apelido na camisa`, `Número da camisa` e `Tamanho da camisa`.
- A API do Apps Script passa a devolver dinamicamente todas as colunas existentes na aba `Atletas`, preservando a ordem da planilha.
- Novas colunas criadas no Google Sheets passam a ficar disponíveis na extensão sem nova alteração na lista de campos da API.

## 1.4.3
- Adiciona o filtro **Cadastrar por categoria** no painel principal.
- Descobre automaticamente as categorias existentes a partir de `Equipe atual` / `Categoria calculada` do Google Sheets.
- Ao selecionar uma categoria, recarrega os atletas e exibe somente os integrantes daquele grupo.
- Restringe a navegação Anterior/Próximo ao conjunto filtrado.
- Exibe a categoria do atleta atual logo abaixo do nome.

## 1.4.2
- Define `https://ligapaulistafutsal.bigmidia.com/atleta/create` como página oficial de inclusão de atleta.
- O preenchimento é bloqueado fora da página de criação.
- Mapeia o documento de autorização para o tipo exato do BigMidia: **Termo Responsável (Menor de 18)**.
- Mantém a extensão ativa em `/atleta/*` apenas para acompanhar o fluxo após o salvamento.

## 1.4.1
- Corrige envio de documentos obtidos do Google Drive.
- Detecta o tipo real do arquivo por assinatura (magic bytes), sem depender apenas do MIME retornado pelo Drive.
- Normaliza nome, extensão e MIME antes de entregar o arquivo ao BigMidia.
- Evita que PDFs reais sejam enviados como `application/octet-stream` e rejeitados pelo portal.

## 1.4.0
- Integra a extensão ao cadastro do Yoka por meio da API do Google Apps Script.
- Permite carregar atletas diretamente da aba `Atletas` do Google Sheets.
- Registra andamento do cadastro na aba `Cadastro BigMidia`.
- Mantém importação CSV como contingência.
- Mantém a confirmação final do botão `Cadastrar` sob controle humano.

## 1.3.0
- Adiciona `background.js`.
- Integra download de documentos do Google Drive.
- Adiciona inclusão assistida de documentos no BigMidia.

## 1.2.0
- Adiciona suporte ao logo do Yoka.
- Passa a reconhecer links de RG, atestado e autorização no CSV.

## 1.1.0
- Adapta o importador ao CSV do cadastro do Yoka.
- Adiciona tratamento de responsável principal e dados dos responsáveis.

## 1.0.0
- Primeira versão preservada.
- Importação CSV.