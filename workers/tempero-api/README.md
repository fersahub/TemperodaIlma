# Cloudflare Worker — proxy do Apps Script | Tempero da Ilma

## Arquitetura escolhida

O Worker da Cloudflare funciona como uma camada de entrada para o site. Ele encaminha as chamadas GET e POST para o **Apps Script já existente**, que continua sendo o backend autorizado e responsável por acessar a planilha privada.

Isso evita a criação de um projeto Google Cloud, conta de serviço ou chave JSON.

Fluxo:

```text
Site / Painel administrativo
          |
          v
Cloudflare Worker (workers.dev)
          |
          v
Apps Script existente (executa como proprietário)
          |
          v
Planilha Google privada
```

O Worker encaminha os parâmetros e o corpo dos formulários sem reinterpretar pedidos ou operações administrativas. O Apps Script continua fazendo as validações, aplicando o LockService e gravando nas abas atuais.

## 1. Configuração do Worker

O endereço do Apps Script existente é configurado como variável pública não sensível em `wrangler.toml`:

- `APPS_SCRIPT_URL`: URL de implantação atual do Apps Script, terminada em `/exec`.

Essa URL já era utilizada pelo site, portanto não é uma nova credencial. O Worker só aceita como destino um endpoint HTTPS em `script.google.com/macros/s/.../exec`.

O projeto continua com:

- Nome: `tempero-ilma-api`
- Diretório raiz: `workers/tempero-api`
- Comando de implantação: `npx wrangler deploy`

## 2. O que NÃO precisa ser configurado na Cloudflare

Neste modo proxy, não cadastre estes segredos no Worker:

- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `SPREADSHEET_ID`
- `ADMIN_PASSWORD`
- `REVIEW_HASH_SALT`

A senha administrativa e o salt das avaliações permanecem nas Propriedades do script do Apps Script. A autorização para acessar a planilha continua sendo a autorização da conta proprietária do Apps Script.

## 3. Requisito da implantação Apps Script

A implantação atual precisa continuar ativa e configurada como:

- Executar como: proprietário / usuário que implantou.
- Quem pode acessar: qualquer pessoa, inclusive anônimos, conforme a opção disponível na conta.

O Apps Script precisa continuar com o `Code.gs` que atende às ações `health`, `catalog`, `orderCheck`, `firstOrderCheck`, `adminChallenge`, `adminLogin`, `adminData`, `adminOperation`, `registerOrder`, `adminUpdateStatus`, `adminMarkNotification`, `adminSaveCatalog`, `adminChangePassword` e avaliações.

Não crie uma implantação nova nem altere o ID da implantação sem necessidade. A planilha permanece privada.

## 4. Por que o Worker segue redirecionamentos

As respostas do Content Service do Apps Script podem redirecionar para um endereço temporário em `script.googleusercontent.com`. O Worker usa `redirect: 'follow'` para receber o conteúdo final e devolvê-lo ao navegador.

O Worker preserva o query string do GET (incluindo callback JSONP) e encaminha o corpo form-urlencoded do POST. A resposta é devolvida com cabeçalhos CORS para o domínio público do site.

## 5. Testes antes de trocar o endereço do site

Depois que a alteração for incorporada à branch principal e a Cloudflare concluir a nova implantação, testar:

1. `/exec?action=health`: deve retornar a saúde informada pelo Apps Script, incluindo `adminConfigured: true`, `spreadsheetConfigured: true`, `spreadsheetAccessible: true` e `missingSheets: []`.
2. `/exec?action=catalog`: deve trazer os 6 combos e os 38 itens avulsos da aba `Catalogo`.
3. Login no painel, carregamento de pedidos, alteração de status e consulta de `adminOperation`.
4. Alteração de um preço de teste pelo painel e conferência na planilha.
5. Pedido de teste e conferência nas abas `Pedidos`, `ItensPedidos`, `Clientes` e `HistoricoPedidos`.
6. Fluxo de avaliação.

Não use um pedido real de cliente como primeiro teste.

## 6. Troca do endereço do site

Somente depois de todos os testes passarem, alterar `js/config/loja.js` para apontar para o endereço Cloudflare terminado em `/exec`.

Até lá:

- O site continua usando o endereço Apps Script atual.
- A implantação Apps Script atual deve ser mantida.
- Não apagar nem redefinir propriedades do Apps Script.
- Não publicar a alteração do endereço do site antes dos testes.

## 7. Limites e transparência

Esta alternativa não elimina o Apps Script: ele continua executando a lógica e acessando a planilha. A Cloudflare atua como proxy de entrada e padroniza o acesso do navegador. Portanto, os limites de execução e cotas do Apps Script continuam aplicáveis. O proxy pode contornar problemas de chamada direta do navegador, mas isso precisa ser confirmado em testes reais de celular e computador; não é uma garantia antecipada.
