# Tempero da Ilma — Cardápio Digital

Aplicação web estática publicada pelo **GitHub Pages**, sem Backend e sem banco de dados. GitHub Actions e Node.js são usados somente para testes durante o desenvolvimento.

## Estrutura

```text
TemperodaIlma/
├── assets/                 # Fotografias, logotipo e ícones
├── css/styles.css          # Aparência e tema
├── js/
│   ├── config/loja.js      # Configurações públicas da loja e Pix
│   ├── core/estado.js      # Estado compartilhado
│   ├── data/combos.js      # Cadastro de combos
│   ├── data/pratos.js      # Cadastro de pratos
│   ├── modules/            # Interface, pedidos, frete, cardápio e checkout
│   ├── services/           # Endereço e Pix
│   ├── tests/              # Testes de integridade
│   ├── vendor/             # Biblioteca QR Code
│   └── app.js              # Inicialização
├── .github/workflows/      # Verificações automáticas
├── 404.html
├── index.html
├── offline.html
├── manifest.json
├── package.json
├── README.md
└── sw.js
```

As três pastas principais continuam sendo **assets**, **css** e **js**. A pasta oculta `.github` contém a automação do GitHub.

## Onde editar

- Pratos: `js/data/pratos.js`.
- Combos e preços: `js/data/combos.js`.
- Dados da loja e Pix: `js/config/loja.js`.
- Aparência: `css/styles.css` e classes Tailwind.
- Cardápio: `js/modules/cardapio.js`.
- Detalhes dos pratos: `js/modules/detalhes-prato.js` e modal em `index.html`.
- Favoritos: `js/modules/favoritos.js`; a lista fica salva no navegador do próprio cliente.
- Carrinho: `js/modules/carrinho.js`.
- Pedidos: `js/modules/pedidos.js` e `js/modules/checkout.js`.
- Frete: `js/modules/operacao.js`.
- CEP/endereço: `js/modules/horarios.js` e `js/services/endereco.js`.
- Cache e instalação: `manifest.json` e `sw.js`.

Os arquivos JavaScript continuam como scripts clássicos carregados em ordem no final de `index.html`. Isso preserva as funções globais chamadas pelos eventos inline. Não adicione `type="module"` sem migrar primeiro esses eventos.

## Melhorias desta etapa

- Dados de pratos e combos separados da lógica.
- Configuração pública centralizada; valores Pix preservados.
- JavaScript dividido por responsabilidade.
- Carrinho preservado ao abrir o WhatsApp; só é limpo por ação manual após o cliente confirmar o envio.
- Mensagem esclarece que o site não consegue confirmar o envio no WhatsApp.
- Opção para apagar dados pessoais e carrinho salvos neste navegador.
- Tratamento de dados locais corrompidos.
- Service Worker versionado, limpeza de caches antigos, armazenamento de respostas válidas e tela offline.
- Dimensões nas imagens dinâmicas para reduzir deslocamento de layout.
- Testes automáticos de integridade via GitHub Actions.

## Dados locais e WhatsApp

O carrinho e os dados do último atendimento ficam somente no navegador via `localStorage`. A opção **Apagar dados salvos neste navegador** remove o histórico local e o carrinho deste dispositivo; não apaga mensagens enviadas pelo WhatsApp.

O navegador prepara a comanda e abre o WhatsApp, mas não consegue verificar se a mensagem foi enviada. Por isso, o carrinho permanece salvo até o cliente confirmar o envio e optar por limpá-lo.

## Pix

A geração local do payload Pix e do QR Code foi preservada. Esta etapa não adiciona confirmação de recebimento nem gateway de pagamento.

## Imagens

As fotografias originais foram mantidas. O carregamento sob demanda já existia; agora também foram adicionadas dimensões às imagens dinâmicas. A conversão física para WebP/AVIF exigirá regravar e comparar visualmente os arquivos originais em etapa própria.

## Testes

Execute na raiz com `npm test`. O GitHub Actions verifica sintaxe e integridade nas alterações da `main`, em branches `improvements/*` e em Pull Requests para `main`. Os testes cobrem dados, IDs, imagens, ordem dos scripts, pré-cache, preservação do carrinho e opção de apagar dados locais. Eles complementam, mas não substituem, o teste visual em navegador real.

## Executar localmente

Use `python -m http.server 8000` e acesse `http://localhost:8000`. O Service Worker exige HTTP ou HTTPS.

## Publicação e segurança

O GitHub Pages continua servindo os arquivos estáticos pela raiz da branch `main`. As mudanças desta etapa ficam em branch separada e devem ser revisadas/testadas visualmente antes da integração.

Não coloque senhas, tokens privados ou credenciais de gateway no frontend: arquivos públicos podem ser lidos por qualquer visitante.


## Detalhes dos pratos e favoritos

- Ao tocar na foto, no nome ou em **Ver detalhes**, o cliente abre a ficha do prato com sua foto, categoria e descrição cadastrada.
- O coração no cardápio e o botão na ficha adicionam/removem o prato dos favoritos.
- O filtro **Favoritos** mostra os pratos guardados e informa quando a lista está vazia.
- Os favoritos são salvos no armazenamento local (`localStorage`) deste navegador. Não exigem Backend ou Supabase e não sincronizam automaticamente entre dispositivos.
- A opção **Apagar dados salvos neste navegador** também remove a lista de favoritos.
