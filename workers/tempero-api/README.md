# API independente — Tempero da Ilma

Este Worker substitui o Apps Script **somente como camada pública de API**. A planilha Google existente continua sendo a base de dados e permanece privada. O Worker lê e grava nela pela Google Sheets API usando uma conta de serviço.

> **Não altere ainda o endereço da API no site.** Primeiro publique o Worker, configure os segredos, teste catálogo, pedidos e painel. A troca do site acontece somente depois desses testes.

## 1. Preparar a planilha e a conta de serviço

1. Entre no Google Cloud Console e crie ou selecione um projeto.
2. Ative a **Google Sheets API** nesse projeto.
3. Crie uma conta de serviço e gere uma chave JSON.
4. Abra a planilha atualmente usada pelo painel Tempero da Ilma.
5. Compartilhe essa planilha com o endereço `client_email` que aparece no JSON da conta de serviço, com permissão **Editor**. Não torne a planilha pública.

A conta de serviço deve receber acesso somente a essa planilha. Não compartilhe o arquivo JSON da chave em conversas, GitHub ou no site.

## 2. Obter os valores de configuração

Você precisará de quatro valores privados:

- `GOOGLE_SERVICE_ACCOUNT_JSON`: conteúdo completo do arquivo JSON da conta de serviço.
- `SPREADSHEET_ID`: identificador entre `/d/` e `/edit` no endereço da planilha.
- `ADMIN_PASSWORD`: senha administrativa atual do painel. Para consultar a propriedade antiga, abra o projeto Apps Script, entre em **Configurações do projeto > Propriedades do script** e localize `TEMPERODA_ILMA_ADMIN_SECRET`.
- `REVIEW_HASH_SALT`: na mesma tela, localize `TEMPERODA_ILMA_REVIEWS_HASH_SALT`.

Copie os valores diretamente para os segredos do Cloudflare. **Não envie esses valores neste chat nem os coloque em arquivos do repositório.** A chave da conta de serviço e os dois valores do Apps Script são credenciais.

## 3. Criar o Worker no Cloudflare

1. Entre no painel Cloudflare e abra **Workers & Pages**.
2. Escolha **Create application > Connect to Git** e conecte o GitHub.
3. Selecione o repositório `fersahub/TemperodaIlma`.
4. Configure o diretório raiz como `workers/tempero-api`.
5. Confirme que o nome do Worker é exatamente `tempero-ilma-api`, conforme `wrangler.toml`.
6. Faça a primeira publicação. O Wrangler criará o Durable Object SQLite `OperationsCoordinator` pela migração `v1`.

O Durable Object organiza as gravações em sequência para impedir que dois pedidos simultâneos ou uma alteração de preço concorrente ultrapassem a validação. Ele também guarda temporariamente sessões administrativas, desafios de login, limites de consultas e chaves de idempotência.

## 4. Cadastrar os segredos

No Worker `tempero-ilma-api`, abra **Settings > Variables and Secrets** e crie os quatro itens como **Secrets**, não como variáveis públicas:

| Nome | Valor |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | JSON completo da chave da conta de serviço |
| `SPREADSHEET_ID` | ID da planilha atual |
| `ADMIN_PASSWORD` | Senha administrativa atual |
| `REVIEW_HASH_SALT` | Valor de `TEMPERODA_ILMA_REVIEWS_HASH_SALT` |

Salve e publique uma nova versão do Worker após adicionar os segredos.

## 5. Testes antes de ligar o site

O Cloudflare fornecerá um endereço parecido com:

`https://tempero-ilma-api.<subdominio-da-conta>.workers.dev`

Use o endereço com `/exec` no fim nos testes:

- `/exec?action=health` — deve retornar `ok:true`, `spreadsheetAccessible:true` e nenhuma aba obrigatória ausente.
- `/exec?action=catalog` — deve retornar os 6 combos e os 38 itens avulsos, com preços e disponibilidade iguais aos da aba `Catalogo`.

Depois precisam ser testados, em ambiente controlado, um pedido completo, a gravação nas abas relacionadas, a consulta de confirmação, a edição de um item do catálogo no painel, uma mudança de status e uma avaliação. Não use um pedido real de cliente como primeiro teste.

## 6. Troca do endereço do site

Somente depois de os testes acima passarem, substitua o endereço em `js/config/loja.js` pelo Worker URL terminado em `/exec`. O cliente passará a consultar preços, registrar pedidos e enviar avaliações pela API independente. O painel administrativo continuará usando a mesma API e a mesma planilha.

Mantenha a implantação Apps Script antiga durante a transição e até validar o fluxo novo em celular e computador. Ela poderá ser mantida como contingência de retorno, sem ser o caminho principal dos clientes.

## Observações de segurança e operação

- A planilha não precisa ser pública.
- A chave privada da conta de serviço fica somente em Cloudflare Secrets.
- O Worker valida preços, disponibilidade, composição dos combos, endereço, frete e total novamente no servidor antes de gravar um pedido.
- As alterações de preço e as gravações de pedido são serializadas pelo Durable Object.
- O painel usa a mesma autenticação HMAC do site; a senha inicial é copiada do projeto atual. Trocas futuras de senha são guardadas no armazenamento seguro do Durable Object.
- A API mantém o contrato de ações atual para permitir a migração sem reconstruir o checkout.
