# Tempero da Ilma — Cardápio Digital

Aplicação web estática para apresentação do cardápio semanal, montagem de combos de marmitas e preparação de pedidos para atendimento pelo WhatsApp.

O projeto é publicado pelo **GitHub Pages** e utiliza HTML, CSS e JavaScript puro, sem etapa de build ou dependência de framework.

## Estrutura do repositório

```text
TemperodaIlma/
├── assets/
│   └── images/
│       ├── combos/        # Imagens dos combos
│       ├── marca/         # Logotipo da loja
│       ├── pratos/        # Fotos dos pratos
│       └── pwa/           # Ícones de instalação
├── css/
│   └── styles.css         # Estilos próprios e tema
├── js/
│   ├── app.js             # Lógica principal da aplicação
│   ├── splash.js          # Tela de abertura
│   ├── tailwind-config.js # Configuração do Tailwind CDN
│   ├── theme-init.js      # Inicialização do tema
│   └── vendor/
│       └── qrcode-generator.js
├── 404.html               # Página de rota não encontrada
├── index.html             # Entrada do site
├── manifest.json          # Configuração do PWA
├── README.md
└── sw.js                  # Service Worker e cache offline
```

A raiz contém somente três pastas principais (**assets**, **css** e **js**) e os arquivos de entrada/configuração do site.

## Funcionalidades existentes

- Cardápio com pratos tradicionais e da linha Fit, pesquisa e filtros.
- Combos de 5 e 10 marmitas, com seleção e edição de sabores.
- Carrinho com duplicação, edição, remoção e restauração local.
- Cálculo de entrega por bairro e consulta de CEP pelo ViaCEP.
- Regras de frete grátis para os combos tradicionais elegíveis.
- Validação dos dados e preparação da comanda para WhatsApp.
- Geração local de payload Pix e QR Code.
- Compartilhamento do cardápio, tema escuro e recursos de PWA.
- Persistência local do carrinho e dos últimos dados de atendimento no navegador.

## Tecnologias e integrações

- HTML5, CSS e JavaScript sem framework.
- Tailwind CSS via CDN, Google Fonts e Font Awesome via CDN.
- canvas-confetti via CDN (efeito opcional).
- Biblioteca QR Code local em `js/vendor/`.
- ViaCEP para consulta de CEP.
- Links do WhatsApp para encaminhamento da comanda.

A aplicação é frontend estático. Não há backend, banco de dados compartilhado, painel administrativo ou gateway de pagamento integrado. O QR Code Pix é montado no navegador e não confirma o recebimento do pagamento. A comanda é preparada para o WhatsApp; o usuário ainda precisa concluir o envio no aplicativo.

## Executar localmente

Não é necessário instalar dependências ou compilar o projeto. Sirva a pasta pela raiz com um servidor HTTP local:

```bash
python -m http.server 8000
```

Depois abra `http://localhost:8000`.

Também é possível usar a extensão Live Server do Visual Studio Code. O acesso por `file://` não é recomendado porque recursos do navegador, especialmente o Service Worker, exigem HTTP ou HTTPS.

## Onde editar

- **Cardápio e combos:** arrays `availableFlavors` e `combos` em `js/app.js`.
- **Regras e fluxos operacionais:** funções em `js/app.js`.
- **Dados comerciais e configuração Pix:** objeto `CONFIG` em `js/app.js`.
- **Bairros e taxas de entrega:** opções do campo de bairro em `index.html`.
- **Aparência:** `css/styles.css` e classes Tailwind no HTML.
- **Imagens:** diretórios dentro de `assets/images/`.
- **Instalação e cache PWA:** `manifest.json` e `sw.js`.

Os dados comerciais e a chave Pix definidos no JavaScript ficam visíveis ao navegador. Não coloque senhas, tokens privados ou credenciais secretas no frontend.

## Publicação

O GitHub Pages deve publicar a partir da branch `main`, na raiz do repositório. Ao adicionar, renomear ou mover imagens, atualize todas as referências correspondentes em HTML/JavaScript e valide os caminhos do manifest e do Service Worker.

O Service Worker usa cache versionado. Quando arquivos centrais ou caminhos de assets mudarem, incremente a constante `C` em `sw.js` para que os navegadores instalem um cache novo.

## Checklist antes de integrar mudanças

1. Conferir referências locais a scripts, estilos, imagens, manifest e ícones.
2. Validar a sintaxe de JavaScript e JSON.
3. Testar combos, limite de sabores, carrinho e frete.
4. Testar consulta de CEP, validação do checkout, Pix e mensagem WhatsApp.
5. Conferir o site em celular e desktop e testar instalação/atualização do PWA.
6. Integrar por revisão e manter uma branch de backup antes de mudanças estruturais.

## Organização dos assets

Os nomes atuais dos arquivos de imagem foram mantidos para evitar alterações desnecessárias nos próprios arquivos. As imagens sem uso atual também foram preservadas em `assets/images/combos/`, sem remoção de conteúdo legado. O arquivo `Combo.png` tem somente 2 bytes no repositório original e precisa ser conferido antes de ser reutilizado.
