# Importador Yoka — Liga Paulista

Extensão Chrome para preenchimento assistido do cadastro de atletas do Yoka na Liga Paulista / BigMidia.

## v1.4.8

A versão 1.4.8 adiciona busca por nome, foto do atleta e padronização da área de arquivos.

### Arquivos no Drive

A seção usa o mesmo padrão para todos os itens disponíveis:

- Foto
- RG
- Atestado
- Autorização

Cada linha apresenta **Abrir**, **Baixar** e **Incluir**, com estados visuais padronizados: **Link disponível**, **Sem link**, **Baixando...**, **Incluído** e **Erro**.

O botão coletivo é **Incluir todos os arquivos**. Ele processa, em sequência, Foto → RG → Atestado → Autorização, aguardando cada item terminar antes de iniciar o próximo. O coordenador reutiliza os botões individuais e as rotinas de upload já existentes, evitando duplicar a lógica de envio.

Se um item falhar, a extensão identifica o arquivo com problema e não exibe uma confirmação geral falsa de sucesso.

A foto é obtida da coluna `Link da foto do atleta`, aceita JPG/JPEG ou PNG e é inserida no campo de foto do BigMidia, sem passar pelo seletor de tipo de documento.

O botão final **Cadastrar** continua manual e sob controle do operador.
