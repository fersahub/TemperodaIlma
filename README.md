# Tempero da Ilma — Cardápio Digital

Aplicação publicada pelo **GitHub Pages**, com cardápio estático e backend leve em **Google Apps Script + Google Sheets** para avaliações e gestão de pedidos. A planilha permanece privada; o painel administrativo é hospedado no GitHub Pages e exige autenticação.

## Estrutura

```text
TemperodaIlma/
├── assets/                 # Fotografias, logotipo e ícones
├── css/styles.css          # Aparência do cardápio
├── css/admin.css           # Aparência do painel administrativo
├── js/
│   ├── config/loja.js      # Configurações públicas da loja e Pix
│   ├── core/estado.js      # Estado compartilhado
│   ├── data/combos.js      # Cadastro de combos
│   ├── data/pratos.js      # Cadastro de pratos
│   ├── modules/            # Interface, pedidos, frete, cardápio e checkout
│   ├── services/           # Endereço e Pix
│   ├── tests/              # Testes de integridade
│   ├── vendor/             # Biblioteca QR Code
│   ├── admin.js            # Autenticação e operações do painel
│   └── app.js              # Inicialização
├── .github/workflows/      # Verificações automáticas
├── 404.html
├── admin.html               # Painel administrativo (requer conexão)
├── index.html
├── offline.html
├── manifest.json
├── package.json
├── README.md
└── sw.js
```

As três pastas principais continuam sendo **assets**, **css** e **js**. A pasta oculta `.github` contém a automação do GitHub.

## Onde editar

- Pratos: `js/data/pratos.js` (inclui as categorias Tradicional, Linha Fit e Especiais da Casa).
- Combos e preços: `js/data/combos.js`.
- Dados da loja, Pix e horários da operação: `js/config/loja.js`.
- Aparência: `css/styles.css` e classes Tailwind.
- Cardápio: `js/modules/cardapio.js`.
- Detalhes dos pratos: `js/modules/detalhes-prato.js` e modal em `index.html`.
- Favoritos: `js/modules/favoritos.js`; a lista fica salva no navegador do próprio cliente.
- Carrinho: `js/modules/carrinho.js`.
- Marmitas avulsas complementares: `js/modules/avulsas.js`.
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
- Histórico de cliente salvo somente após a confirmação da abertura do pedido e com expiração local de 60 dias.
- Consulta de CEP protegida contra respostas fora de ordem; frete de bairro identificado pelo CEP só é calculado após confirmação.
- Horários, corte de pedidos e data de entrega usam o fuso `America/Bahia`.
- Painel administrativo com autenticação, consulta de pedidos, atualização de status e preparação manual de mensagens para WhatsApp.
- Tratamento de dados locais corrompidos.
- Service Worker versionado, limpeza de caches antigos, armazenamento de respostas válidas e tela offline.
- Dimensões nas imagens dinâmicas para reduzir deslocamento de layout.
- Testes automáticos de integridade via GitHub Actions.

## Dados locais e WhatsApp

O carrinho e os dados do último atendimento ficam no navegador via `localStorage`. O histórico do cliente expira após 60 dias. A função de apagar dados locais continua disponível no código, sem ser exibida no rodapé.

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


## Categoria Especiais da Casa

- A categoria possui filtro próprio no cardápio.
- O Empadão de Frango está cadastrado com o selo **Em breve**.
- Produtos marcados como em breve ou indisponíveis não aparecem nas opções de montagem dos combos.
- A fotografia do empadão é otimizada em WebP e incluída no pré-cache para disponibilidade offline após a instalação/atualização do Service Worker.


## Mini Quiz — Planejador de refeições da família

- Calcula a quantidade de marmitas a partir do número de pessoas, dias e refeições por pessoa ao dia.
- Arredonda para múltiplos de 5, pois os combos cadastrados atualmente são de 5 e 10 unidades.
- Apresenta o detalhamento dos combos existentes e o total estimado com base nos preços do catálogo.
- Permite montar uma sequência de combos, escolhendo os sabores de cada um, antes de adicioná-los ao carrinho.
- Se a sequência for cancelada, preserva no carrinho os combos que já foram concluídos.
- Os cálculos do planejador acontecem localmente no navegador.


## Carrinho misto: combos + marmitas avulsas

- O cliente precisa adicionar pelo menos um combo antes de incluir marmitas avulsas.
- Pedidos compostos somente por marmitas avulsas não são permitidos.
- As avulsas podem ser escolhidas nos tamanhos Tradicional 350g, Tradicional 500g e Fit 300g, conforme a categoria do prato.
- A quantidade pode ser ajustada no cardápio e no carrinho.
- O carrinho, resumo, comanda de WhatsApp e valor Pix somam combos e avulsas.
- O frete é calculado conforme a taxa do bairro; combos de 10 não concedem frete grátis automaticamente.
- O primeiro pedido pode receber frete grátis após validação do telefone na planilha central. A elegibilidade considera pedidos já registrados nas abas **Pedidos** e **Clientes**; cada telefone utiliza o benefício uma única vez. O benefício é consumido quando o pedido entra na planilha, mesmo que depois seja cancelado. Pedidos históricos que nunca foram importados para a planilha central não podem ser reconhecidos automaticamente.
- Na migração, cada sabor recebe inicialmente o preço e a disponibilidade do antigo perfil correspondente (Tradicional 350g, Tradicional 500g ou Fit 300g). Esses valores são replicados como ponto de partida, mas cada registro passa a ser independente e pode ser alterado sem afetar os outros.
- Carrinhos antigos salvos no navegador (formato de array, contendo apenas combos) continuam sendo restaurados.
- O carrinho de montagem permanece no navegador; após a confirmação do cliente, o pedido é registrado na planilha central.

## Sistema de avaliações por sabor e geral

A interface de avaliações fica no próprio site e usa **Google Apps Script + Google Sheets** como serviço central. A planilha não é publicada: o Apps Script executa como a conta que o implantou e expõe somente as médias e comentários publicados.

- O cliente recebe o convite no site após abrir o pedido no WhatsApp; a avaliação é feita depois que receber as marmitas.
- O formulário usa o pedido salvo neste navegador e permite avaliar cada sabor recebido e a experiência geral.
- As notas e os comentários são publicados automaticamente. O nome é opcional e telefone/endereço não são enviados para a planilha.
- Os cards e os detalhes dos pratos exibem a média e a quantidade de avaliações; a página principal exibe a média geral e comentários.
- O código do pedido impede uma segunda avaliação pelo mesmo pedido. Como o site não confirma a entrega pelo WhatsApp, esse código identifica o pedido gerado no navegador, mas não é uma comprovação antifraude de compra/entrega.
- A coluna **Status** da planilha começa como `PUBLICADO`. Para ocultar uma avaliação, altere manualmente para `OCULTO`; ela deixa de entrar nas médias e nos comentários públicos.
- O backend está em `integrations/google-apps-script/Code.gs`. O endpoint é configurado em `js/config/loja.js`, no campo `avaliacoes.apiUrl`. Não coloque senhas ou tokens privados no site.

### Ativação única do Google Apps Script

1. Entre em [script.google.com](https://script.google.com/) com a conta Google da marmitaria e crie um projeto.
2. Copie todo o conteúdo de `integrations/google-apps-script/Code.gs` para o arquivo `Code.gs`.
3. No editor, selecione e execute `configurarSistemaAvaliacoes`. Autorize o acesso solicitado. A execução cria a planilha privada e registra o endereço dela no log.
4. Em **Implantar → Nova implantação**, selecione **App da Web**. Configure **Executar como: Eu** e **Quem pode acessar: Qualquer pessoa**. Implante e copie a URL terminada em `/exec`.
5. Informe essa URL no campo `avaliacoes.apiUrl` em `js/config/loja.js`, mantendo-a entre aspas. Depois publique essa alteração no site.
6. Faça um pedido de teste, confirme a abertura do WhatsApp, abra **Avaliar meu pedido**, envie uma avaliação e confira a planilha e a exibição no cardápio.

A URL do Apps Script é pública por necessidade de funcionamento, mas a planilha permanece privada. O endpoint valida notas e IDs de sabores, usa um campo antispam, bloqueio concorrente e uma avaliação por código de pedido. As avaliações são automáticas, portanto comentários inadequados podem aparecer; use a coluna **Status** para ocultá-los. Essa proteção é adequada para começar com baixo volume, mas não substitui autenticação robusta ou verificação de entrega contra fraude coordenada.

Enquanto a URL não for configurada, o formulário e os indicadores ficam ocultos: o site não exibe notas fictícias nem simula avaliações.

## Painel administrativo e planilha central

O painel fica em admin.html e utiliza o mesmo Google Apps Script já conectado às avaliações. Não exige provedor pago nem API do WhatsApp.

Ao confirmar a abertura da comanda no cardápio, o site tenta registrar o pedido na planilha. O status inicial é **Aguardando confirmação**: abrir o WhatsApp não comprova que a mensagem foi enviada nem que a venda foi confirmada.

A planilha existente é preservada e recebe estas abas adicionais:

- **Pedidos**: dados do pedido, cliente, endereço, valores e status.
- **ItensPedidos**: combos e marmitas avulsas discriminados.
- **Clientes**: histórico resumido por telefone.
- **HistoricoPedidos**: mudanças de status e observações internas.
- **Notificacoes**: mensagens preparadas e situação do link do WhatsApp.
- **Fretes**: bairros e taxas usadas para validar pedidos.
- **Produtos**: catálogo inicial de sabores.
- **Configuracoes**: parâmetros operacionais iniciais.
- **Avaliacoes**: aba existente preservada.

### Ativação/atualização do Apps Script

1. Abra o mesmo projeto do Google Apps Script que já atende às avaliações. Não crie uma planilha nova.
2. Substitua o conteúdo do arquivo `Code.gs` pelo arquivo integrations/google-apps-script/Code.gs deste repositório. Se houver outros arquivos `.gs`, confira se não existe outra função `doGet(e)` ou `doPost(e)` duplicada; mantenha somente um ponto de entrada de cada tipo.
3. Execute `verificarConfiguracaoPainelTempero()` no editor do Apps Script. No Registro de execução, confira `adminConfigured`, `spreadsheetConfigured`, `spreadsheetAccessible` e `missingSheets`. Esta função é apenas diagnóstica e não altera nada. Só execute `configurarSistemaAvaliacoes()` se a planilha existente estiver configurada e o diagnóstico mostrar abas faltando; a função reutiliza o ID registrado, mas, sem esse ID, a rotina de configuração base pode criar outra planilha.
4. Somente na primeira configuração do painel, se ainda não existir senha administrativa, execute gerarSenhaPainelTempero() uma vez. Como o painel já está configurado, não execute essa função nesta atualização: ela substitui a senha existente.
5. Em **Implantar → Gerenciar implantações**, localize a implantação existente **Atualização do Painel - 20/11/2026**. Confirme pelo identificador completo `AKfycby4mn8UBBcPENUq_UVml-y7HFlFiLtjOOZB6NUZBPS5Nii1tX2lqZqvy0jMIlEN1vj65A`, que deve corresponder ao ID entre `/s/` e `/exec` no `apiUrl` de `js/config/loja.js`. Edite essa implantação, selecione **Nova versão** e mantenha **Executar como: Eu** e **Quem pode acessar: Qualquer pessoa**. Não crie outra implantação e não exclua a implantação chamada `Sem título`.
6. Antes do login, abra a mesma URL acrescida de `?action=health`. A resposta esperada traz `ok: true`, `apiVersion: 2026.11.20.6`, `adminConfigured: true`, `spreadsheetConfigured: true`, `spreadsheetAccessible: true` e `missingSheets: []`. A primeira chamada cria automaticamente a aba `Catalogo` na planilha existente e preenche os nove registros iniciais. Confira também que `spreadsheetError` está vazio. O painel possui o botão **Testar conexão**. O endereço é https://fersahub.github.io/TemperodaIlma/admin.html.
7. Depois de entrar, use **Alterar senha** no topo do painel para cadastrar sua própria senha. Ela deve ter de 8 a 128 caracteres e conter letras e números. A operação encerra também as sessões existentes em outros navegadores e dispositivos.
8. Para futuras atualizações, substitua o conteúdo do arquivo principal `Code.gs` e publique uma nova versão da mesma implantação **Atualização do Painel - 20/11/2026**, preservando seu ID. O projeto deve ter apenas uma função `doGet(e)` e uma função `doPost(e)` globais; arquivos auxiliares podem existir, mas não mantenha versões antigas desses pontos de entrada duplicadas. Não execute `gerarSenhaPainelTempero()` novamente, a menos que queira redefinir a senha.
9. Faça um pedido de teste, confirme a abertura da comanda no WhatsApp, confira se entrou como Aguardando confirmação, altere o status no painel e teste a mensagem preparada.

### Como funcionam os avisos

Ao mudar o status, o sistema grava o histórico e prepara uma mensagem. Para clientes que autorizaram atualizações pelo WhatsApp no checkout, o painel oferece um botão para abrir a conversa com o texto pronto. A equipe ainda precisa tocar em **Enviar** no WhatsApp. O painel registra apenas que o link foi aberto; não afirma que a mensagem foi enviada ou entregue. Para clientes sem autorização, a mensagem pode ser copiada para uso como resposta dentro de uma conversa iniciada pelo próprio cliente.

As avaliações exigem consentimento explícito e um pedido registrado com status **Entregue**. O site não possui confirmação automática de pagamento ou entrega; a equipe atualiza o status no painel.

### Segurança e limites

A senha administrativa fica nas Script Properties do Apps Script e não é enviada ao GitHub Pages. O login usa desafio HMAC e sessões temporárias. A alteração de senha é feita dentro do painel, após autenticação, com mínimo de 8 caracteres e invalida todas as sessões anteriores. A lista de pedidos é atualizada automaticamente a cada 60 segundos, sem recarregar a página. A planilha deve permanecer privada e a conta Google que administra o Apps Script deve ser protegida. A página do painel não é armazenada em cache offline. O login agora diferencia erros de conexão de uma implantação antiga do Apps Script. A atualização automática consulta os dados uma vez por minuto enquanto o painel está aberto e não há modais em uso. O serviço está sujeito às cotas de uso do Google.

O painel administrativo está organizado em duas abas: **Gestão do Cardápio**, para alterar preços e disponibilidade dos seis combos e de cada marmita avulsa por sabor e tamanho, e **Gestão de Pedidos**, para consultar clientes, filtrar registros, abrir detalhes, atualizar o andamento e preparar mensagens. A aba de pedidos abre por padrão após o login. Cada sabor Tradicional possui controles independentes para 350g e 500g; cada sabor Fit possui controle próprio para 300g. O backend valida o preço e a disponibilidade exatos do sabor escolhido antes de registrar um pedido. A edição dos valores não altera pedidos já gravados.


## Gestão do cardápio — preços e disponibilidade

A aba **Catalogo** é criada automaticamente na planilha central quando a nova versão do Apps Script recebe a primeira consulta de saúde ou de catálogo. Ela é separada da aba **Produtos**: Produtos mantém o cadastro técnico dos sabores; Catalogo guarda os preços e a disponibilidade comercial.

### Itens controlados pelo painel

- **Combos:** 5 e 10 marmitas Tradicionais de 350g; 5 e 10 marmitas Tradicionais de 500g; 5 e 10 marmitas Fit de 300g.
- **Avulsas:** cada sabor possui registro próprio. Sabores Tradicionais têm registros separados de 350g e 500g; sabores Fit têm registro de 300g. Alterar o preço ou desativar um sabor/tamanho não altera os demais.
- Cada item possui preço e situação Ativo/Inativo. É obrigatório manter pelo menos um combo ativo.

### Usar o módulo

1. Atualize e publique a nova versão do arquivo `Code.gs` no Apps Script, usando a implantação já associada ao endpoint do site.
2. Acesse `https://fersahub.github.io/TemperodaIlma/admin.html` e entre com a senha administrativa existente.
3. Abra a aba **Gestão do Cardápio** no topo do painel.
4. Altere o preço no campo do item. Use o ponto como separador decimal se o navegador exigir (por exemplo, `22.50`).
5. Marque ou desmarque **Ativo** para disponibilizar ou ocultar aquele combo/opção de avulsa.
6. Clique em **Salvar** na mesma linha. Aguarde a confirmação antes de editar outro item.
7. Atualize o site do cardápio. Ele consulta os preços atualizados ao iniciar. Os preços também são validados no servidor quando um pedido é registrado.

### Colunas da aba Catalogo

`ID`, `Tipo`, `Nome`, `Categoria`, `Tamanho`, `Quantidade`, `Preço`, `Ativo`, `Atualizado em`. Altere preços e disponibilidade pelo painel; não mude IDs, nomes estruturais, categorias, tamanhos ou quantidades diretamente na planilha. A API verifica os identificadores estruturais antes de aceitar os valores.

### Regras de preço e histórico

- Valores permitidos: R$ 0,01 até R$ 9.999,99.
- O servidor consulta a mesma aba Catalogo usada pelo painel e pelo site; não confia no valor enviado pelo navegador.
- Se o preço do carrinho ficar diferente do preço atual porque houve alteração simultânea no painel, a validação do servidor rejeitará a divergência. Atualize a página e monte o pedido novamente.
- O preço de cada pedido é gravado como fotografia histórica em `Pedidos` e `ItensPedidos`. Alterações posteriores no catálogo não recalculam pedidos antigos.
- Quando uma opção é desativada, deixa de aparecer para novas compras; itens já registrados permanecem nos registros históricos.
- Se a consulta ao catálogo falhar, o site pode exibir o último catálogo salvo por até 24 horas, mas bloqueia o envio de novos pedidos até conseguir confirmar os preços atuais.
- Enquanto o Apps Script antigo responder apenas `Ação inválida` para o catálogo, o site mantém o comportamento estático anterior. O painel exige a versão `2026.11.20.7` para liberar a nova área.

### Limites desta etapa

O painel edita preços e ativa/desativa as opções comerciais já existentes. Cadastro de novos combos, novos tamanhos, novos sabores, alteração de nomes/descrições/fotos e mudança das quantidades dos combos continuam exigindo ajuste técnico porque esses elementos estão ligados às regras de montagem, avaliações e validações de pedidos. O módulo não altera taxas de entrega, cupons ou horário da loja.


### Atualização do catálogo no navegador e no aplicativo instalado
O Service Worker usa o cache `tempero-v27-refresh-catalog-assets`. Navegações, scripts e estilos locais são atualizados pela rede sem reutilizar cópias antigas do cache HTTP; se o catálogo falhar, o checkout solicita uma nova tentativa antes de manter o bloqueio. O cache continua disponível como fallback offline, mas preços não confirmados nunca são usados para enviar um pedido.

A consulta do catálogo recebe um parâmetro de atualização único a cada tentativa. Quando o checkout encontra uma resposta antiga ou uma falha temporária, oferece uma nova consulta; os preços só liberam o envio após validação atual no servidor.
