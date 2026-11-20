import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext, Script } from 'node:vm';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(resolve(ROOT,p),'utf8');
const exists=p=>existsSync(resolve(ROOT,p));
function data(p){const window={TEMPERO_DADOS:{}};runInNewContext(read(p),{window});return window.TEMPERO_DADOS;}

test('combos: IDs, preços, quantidades e imagens',()=>{
 const xs=data('js/data/combos.js').combos;assert.ok(xs.length>0);assert.equal(new Set(xs.map(x=>x.id)).size,xs.length);
 for(const x of xs){assert.ok(x.name&&x.description);assert.ok([5,10].includes(x.qty));assert.ok(Number.isFinite(x.price)&&x.price>0);assert.ok(['Tradicional','Linha Fit'].includes(x.type));assert.ok(exists(x.image),x.image);assert.equal(Object.hasOwn(x,'freteGratis'),false);}
});
test('pratos: IDs, categorias e imagens',()=>{
 const xs=data('js/data/pratos.js').pratos;assert.ok(xs.length>0);assert.equal(new Set(xs.map(x=>x.id)).size,xs.length);
 for(const x of xs){assert.ok(x.name&&x.desc);assert.ok(['Tradicional','Linha Fit','Especiais da Casa'].includes(x.tag));assert.ok(exists(x.img),x.img);}
});
test('configuração pública da loja, Pix e endpoint de avaliações',()=>{
 const window={};runInNewContext(read('js/config/loja.js'),{window});const c=window.TEMPERO_CONFIG;
 assert.match(c.loja.whatsappNumero,/^\d{12,13}$/);assert.ok(c.loja.cidade);assert.ok(c.pix.pixChave&&c.pix.pixNome&&c.pix.pixCidade);
 assert.match(c.avaliacoes.apiUrl,/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/);
});
test('HTML: referências locais existem e scripts carregam na ordem',()=>{
 const html=read('index.html'),refs=[];
 for(const m of html.matchAll(/<(?:script|link|img)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi)){const v=m[1];if(v&&!/^(?:https?:|data:|#|mailto:|tel:|javascript:)/i.test(v))refs.push(v.split(/[?#]/)[0]);}
 for(const p of refs)assert.ok(exists(p),p);
 const appAt=html.indexOf('<script src="js/app.js">');
 for(const p of ['js/config/loja.js','js/data/combos.js','js/data/pratos.js','js/core/estado.js','js/modules/favoritos.js','js/modules/detalhes-prato.js','js/modules/cardapio.js','js/modules/avulsas.js','js/modules/avaliacoes.js','js/modules/checkout.js']){const i=html.indexOf('<script src="'+p+'">');assert.ok(i>=0&&i<appAt,p);}
});
test('Service Worker: pré-cache contém arquivos existentes e remove versões antigas',()=>{
 const s=read('sw.js'),m=s.match(/const CORE_ASSETS\s*=\s*(\[[\s\S]*?\]);/);assert.ok(m);
 const list=new Function('return '+m[1])();for(const p of list)assert.ok(exists(p.replace(/^\.\//,'')),p);
 assert.match(s,/startsWith\(CACHE_PREFIX\)/);assert.match(s,/response\.ok \|\| response\.type === 'opaque'/);
});
test('WhatsApp: abrir conversa não limpa carrinho automaticamente',()=>{
 const s=read('js/modules/pedidos.js'),h=read('index.html'),a=s.indexOf('function confirmarEnvio()'),b=s.indexOf('function limparCarrinhoAposEnvio()');
 assert.ok(a>=0&&b>a);assert.ok(!s.slice(a,b).includes('cartCombos = []'));assert.match(h,/Comanda preparada para envio/);assert.match(h,/Seu carrinho foi preservado neste aparelho/);
});
test('limpeza do rodapé: opção de apagar dados salvos não é exibida ao cliente',()=>{
 assert.match(read('js/modules/checkout.js'),/function apagarDadosSalvos\(\)/);
 assert.doesNotMatch(read('index.html'),/Apagar dados salvos neste navegador/);
});
test('avulsas: pergunta Sim/Não inicia recolhida e as opções são compactas',()=>{
 const html=read('index.html'),avulsas=read('js/modules/avulsas.js');
 assert.match(html,/<section id="avulsas-carrinho-section"/);
 assert.match(html,/id="avulsas-opcoes-container" class="hidden/);
 assert.match(html,/responderOpcaoAvulsas\('sim'\)/);
 assert.match(html,/responderOpcaoAvulsas\('nao'\)/);
 assert.match(avulsas,/width="56" height="56"/);
});
test('avaliações: interface de sabores e geral, convite no site e backend configurável',()=>{
 const html=read('index.html'),module=read('js/modules/avaliacoes.js');
 const checkout=read('js/modules/checkout.js'),pedidos=read('js/modules/pedidos.js'),cardapio=read('js/modules/cardapio.js'),detalhes=read('js/modules/detalhes-prato.js');
 assert.match(html,/id="avaliacoes-section"/);
 assert.match(html,/id="avaliacao-form"/);
 assert.match(html,/id="avaliacao-nota-geral"/);
 assert.match(html,/id="avaliacao-sabores-lista"/);
 assert.match(html,/btn-avaliar-pedido-enviado/);
 assert.match(module,/function htmlResumoAvaliacaoSabor/);
 assert.match(module,/function coletarSaboresPedidoAvaliacao/);
 assert.match(module,/function registrarPedidoPendenteAvaliacao/);
 assert.match(module,/function enviarAvaliacao/);
 assert.match(cardapio,/htmlResumoAvaliacaoSabor/);
 assert.match(detalhes,/renderResumoAvaliacaoDetalhe/);
 assert.match(checkout,/reviewOrderId = gerarCodigoPedidoAvaliacao/);
 assert.match(checkout,/reviewFlavors = coletarSaboresPedidoAvaliacao/);
 assert.match(pedidos,/registrarPedidoPendenteAvaliacao\(dp\)/);
});
test('backend Apps Script: JSONP somente leitura, validação, deduplicação e publicação automática',()=>{
 const backend=read('integrations/google-apps-script/Code.gs');
 assert.doesNotThrow(()=>new Script(backend));
 assert.match(backend,/function configurarSistemaAvaliacoes\(\)/);
 assert.match(backend,/function doGet\(e\)/);
 assert.match(backend,/function doPost\(e\)/);
 assert.match(backend,/LockService\.getScriptLock\(\)/);
 assert.match(backend,/pedidoJaAvaliado_\(orderHash\)/);
 assert.match(backend,/CONFIG\.STATUS_PUBLICADO/);
 assert.match(backend,/SABORES_PERMITIDOS/);
 assert.match(backend,/callback.*A-Za-z0-9_/s);
 assert.match(read('sw.js'),/tempero-v19-painel-gestao/);
});

test('página offline está incluída no cache',()=>{assert.ok(exists('offline.html'));assert.match(read('sw.js'),/\.\/offline\.html/);});

 
test('favoritos: salvamento local, remoção e IDs válidos',()=>{
 const store=new Map(),messages=[];
 const sandbox={
  availableFlavors:[{id:'f1',name:'Panqueca'},{id:'f2',name:'Feijoada'}],
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
  document:{getElementById:()=>null},
  mostrarToast:m=>messages.push(m),
  atualizarBotaoFavoritoDetalhe:()=>{},
  renderFlavorsDisplay:()=>{}
 };
 runInNewContext(read('js/modules/favoritos.js'),sandbox);
 assert.equal(sandbox.pratoEstaFavoritado('f1'),false);
 sandbox.alternarFavoritoPrato('f1');
 assert.equal(sandbox.pratoEstaFavoritado('f1'),true);
 assert.deepEqual(JSON.parse(store.get('tempero_ilma_favoritos_v1')),['f1']);
 sandbox.alternarFavoritoPrato('f1');
 assert.equal(sandbox.pratoEstaFavoritado('f1'),false);
 assert.deepEqual(JSON.parse(store.get('tempero_ilma_favoritos_v1')),[]);
 assert.equal(messages.length,2);
});

test('detalhes dos pratos: modal e ações conectados ao cardápio',()=>{
 const html=read('index.html'),cardapio=read('js/modules/cardapio.js');
 assert.match(html,/id="dish-detail-modal"/);
 assert.match(html,/id="dish-detail-favorite"/);
 assert.match(html,/id="filter-btn-Favoritos"/);
 assert.match(cardapio,/abrirDetalhesPrato/);
 assert.match(cardapio,/alternarFavoritoPrato/);
 assert.match(read('js/modules/detalhes-prato.js'),/function verCombosDoPrato/);
});

test('apagar dados locais também remove favoritos',()=>{
 assert.match(read('js/modules/checkout.js'),/tempero_ilma_favoritos_v1/);
 assert.match(read('js/modules/checkout.js'),/pratosFavoritos = \[\]/);
});

test('Empadão de Frango: categoria própria, imagem e aviso de disponibilidade',()=>{
 const xs=data('js/data/pratos.js').pratos;
 const p=xs.find(x=>x.id==='f24');
 assert.ok(p);
 assert.equal(p.name,'Empadão de Frango');
 assert.equal(p.tag,'Especiais da Casa');
 assert.equal(p.emBreve,true);
 assert.equal(p.disponivel,false);
 assert.ok(exists(p.img),p.img);
 const html=read('index.html');
 assert.match(html,/data-filter="Especiais da Casa"/);
 assert.match(html,/<button[^>]*data-filter="Especiais da Casa"[^>]*>\s*Especiais da Casa\s*<\/button>/);
 assert.doesNotMatch(html,/<i[^>]*>\s*Especiais da Casa/);
 assert.match(html,/dish-detail-coming-soon/);
 assert.match(read('js/modules/cardapio.js'),/badge-em-breve[^>]*>Em breve/);
 assert.ok(read('css/styles.css').includes('html.dark .badge-em-breve{background:#3b2f16!important;color:#ffe08a!important;border-color:#8b6b22!important}'));
 assert.match(read('js/modules/detalhes-prato.js'),/const emBreve = prato.emBreve === true/);
});
test('Produtos em breve ficam fora da seleção e montagem automática de combos',()=>{
 assert.match(read('js/modules/carrinho.js'),/flavor\.tag === currentEditingCombo\.type && !flavor\.emBreve && flavor\.disponivel !== false/);
 assert.match(read('js/modules/operacao.js'),/f\.tag === currentEditingCombo\.type && !f\.emBreve && f\.disponivel !== false/);
});


test('planejador familiar calcula a necessidade e arredonda em múltiplos de cinco',()=>{
 const combos=data('js/data/combos.js').combos;
 const sandbox={combos};
 runInNewContext(read('js/modules/experiencia.js'),sandbox);
 const exato=JSON.parse(JSON.stringify(sandbox.calcularNecessidadeQuiz(4,5,1)));
 assert.deepEqual(exato,{pessoas:4,dias:5,refeicoes:1,total:20,sugerido:20,excedente:0});
 const arredondado=JSON.parse(JSON.stringify(sandbox.calcularNecessidadeQuiz(3,3,1)));
 assert.deepEqual(arredondado,{pessoas:3,dias:3,refeicoes:1,total:9,sugerido:10,excedente:1});
 assert.equal(sandbox.calcularNecessidadeQuiz(0,5,1),null);
 assert.equal(sandbox.calcularNecessidadeQuiz(21,5,1),null);
});

test('planejador familiar compõe vários combos existentes e calcula o valor correto',()=>{
 const combos=data('js/data/combos.js').combos;
 const sandbox={combos};
 runInNewContext(read('js/modules/experiencia.js'),sandbox);
 const plano=JSON.parse(JSON.stringify(sandbox.gerarPlanoCombosQuiz(15,'Tradicional 350g')));
 assert.deepEqual(plano.ids,['combo-10-350g','combo-5-350g']);
 assert.equal(plano.quantidade,15);
 assert.equal(plano.total,300);
 const familia=JSON.parse(JSON.stringify(sandbox.gerarPlanoCombosQuiz(20,'Tradicional 350g')));
 assert.deepEqual(familia.ids,['combo-10-350g','combo-10-350g']);
 assert.equal(familia.total,400);
 const reforcado=JSON.parse(JSON.stringify(sandbox.gerarPlanoCombosQuiz(10,'Tradicional 500g')));
 assert.deepEqual(reforcado.ids,['combo-10-500g']);
 assert.equal(reforcado.total,250);
 const fit=JSON.parse(JSON.stringify(sandbox.gerarPlanoCombosQuiz(10,'Linha Fit 300g')));
 assert.deepEqual(fit.ids,['combo-10-300g-fit']);
});

test('mini quiz apresenta quatro perguntas e montagem sequencial dos combos',()=>{
 const html=read('index.html');
 const experiencia=read('js/modules/experiencia.js');
 const carrinho=read('js/modules/carrinho.js');
 for(const id of ['quiz-pessoas','quiz-dias','quiz-refeicoes','quiz-estilo','quiz-resultado','quiz-acoes-resultado']) assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(experiencia,/function calcularNecessidadeQuiz/);
 assert.match(experiencia,/function gerarPlanoCombosQuiz/);
 assert.match(experiencia,/function iniciarMontagemSugestaoQuiz/);
 assert.match(experiencia,/function abrirProximoComboQuiz/);
 assert.match(carrinho,/const montagemPorQuiz = quizMontagemAtiva/);
 assert.match(carrinho,/Montagem interrompida/);
});

test('marmitas avulsas exigem combo e usam o preço unitário de referência dos combos de 5',()=>{
 const combos=data('js/data/combos.js').combos;
 const availableFlavors=data('js/data/pratos.js').pratos;
 const sandbox={combos,availableFlavors,cartCombos:[],cartAvulsas:[]};
 runInNewContext(read('js/modules/avulsas.js'),sandbox);
 assert.equal(sandbox.criarItemAvulso('f1','350g',1),null);
 sandbox.cartCombos.push({comboId:'combo-5-350g'});
 const tradicional350=sandbox.criarItemAvulso('f1','350g',2);
 assert.equal(tradicional350.unitPrice,20);
 assert.equal(tradicional350.totalPrice,40);
 const tradicional500=sandbox.criarItemAvulso('f1','500g',1);
 assert.equal(tradicional500.unitPrice,25);
 const fit=sandbox.criarItemAvulso('f12','300g',1);
 assert.equal(fit.unitPrice,26);
 assert.equal(sandbox.criarItemAvulso('f12','350g',1),null);
 assert.equal(sandbox.criarItemAvulso('f24','350g',1),null);
 assert.equal(sandbox.criarItemAvulso('f1','350g',0),null);
});

test('carrinho misto soma combos e avulsas e impede remover o último combo',()=>{
 const mensagens=[];
 const sandbox={
  cartCombos:[{qty:5,price:100}],
  cartAvulsas:[{quantity:2,totalPrice:40}],
  mostrarToast:m=>mensagens.push(m),
  document:{}
 };
 runInNewContext(read('js/modules/carrinho.js'),sandbox);
 assert.equal(sandbox.calcularSubtotalCarrinho(),140);
 assert.equal(sandbox.quantidadeMarmitasCarrinho(),7);
 assert.equal(sandbox.temItensCarrinho(),true);
 sandbox.removeCartItem(0);
 assert.equal(sandbox.cartCombos.length,1);
 assert.equal(sandbox.cartAvulsas.length,1);
 assert.equal(mensagens.length,1);
});

test('pedido misto: Pix, histórico, limpeza e comanda consideram avulsas',()=>{
 const checkout=read('js/modules/checkout.js');
 const pix=read('js/services/pix.js');
 const pedidos=read('js/modules/pedidos.js');
 assert.ok(checkout.includes('itensAvulsas: cartAvulsas'));
 assert.ok(checkout.includes('calcularSubtotalCarrinho()'));
 assert.ok(checkout.includes('MARMITAS AVULSAS'));
 assert.ok(checkout.includes('cartAvulsas = []'));
 assert.ok(pix.includes('calcularSubtotalCarrinho()'));
 assert.ok(pedidos.includes('avulsas: cartAvulsas'));
 assert.ok(pedidos.includes('cartAvulsas = []'));
});

test('avulsas oferecem Sim/Não, iniciam recolhidas e podem ser reabertas pelo cardápio',()=>{
 const html=read('index.html');
 const cardapio=read('js/modules/cardapio.js');
 const avulsas=read('js/modules/avulsas.js');
 assert.ok(html.includes('id="avulsas-carrinho-section"'));
 assert.ok(html.includes('id="avulsas-opcoes-container" class="hidden'));
 assert.match(html,/responderOpcaoAvulsas\('sim'\)/);
 assert.match(html,/responderOpcaoAvulsas\('nao'\)/);
 assert.ok(html.indexOf('id="checkout-modal"') < html.indexOf('id="avulsas-carrinho-section"'));
 assert.doesNotMatch(html,/<section id="avulsas-section"/);
 assert.match(cardapio,/Adicionar avulsa/);
 assert.match(cardapio,/abrirAvulsasNoCarrinho/);
 assert.match(avulsas,/function responderOpcaoAvulsas\(resposta\)/);
 assert.match(avulsas,/function reiniciarPreferenciaAvulsas\(\)/);
 assert.match(avulsas,/responderOpcaoAvulsas\('sim'\)/);
 assert.ok(html.includes('Não vendemos pedidos somente de 1 ou 2 marmitas'));
 assert.ok(avulsas.includes('if (!temComboNoCarrinho()) return null'));
 assert.ok(avulsas.includes('disabled'));
 assert.ok(read('sw.js').includes('tempero-v19-painel-gestao'));
});

test('avulsas: Não oculta a área, Sim expande e o atalho do cardápio reabre',()=>{
 const classes=()=>{const values=new Set();return {add:v=>values.add(v),remove:v=>values.delete(v),toggle:(v,force)=>{if(force===undefined){if(values.has(v))values.delete(v);else values.add(v);}else if(force)values.add(v);else values.delete(v);},contains:v=>values.has(v)};};
 const makeElement=()=>({classList:classes(),attributes:{},setAttribute(k,v){this.attributes[k]=v;},scrollIntoView(){this.scrolled=true;}});
 const elements={
  'avulsas-carrinho-section':makeElement(),
  'avulsas-opcoes-container':makeElement(),
  'avulsas-resposta-sim':makeElement(),
  'avulsas-resposta-nao':makeElement(),
  'avulsa-card-f1':makeElement()
 };
 elements['avulsas-opcoes-container'].classList.add('hidden');
 let salvou=0, abriu=0;
 const sandbox={
  cartCombos:[{comboId:'combo-5-350g'}],
  avulsasOcultasNestePedido:false,
  avulsasOpcoesExpandidas:false,
  document:{getElementById:id=>elements[id]||null},
  salvarCarrinho:()=>{salvou++;},
  openCheckoutModal:()=>{abriu++;},
  mostrarToast:()=>{},
 };
 runInNewContext(read('js/modules/avulsas.js'),sandbox);
 sandbox.responderOpcaoAvulsas('nao');
 assert.equal(sandbox.avulsasOcultasNestePedido,true);
 assert.equal(elements['avulsas-carrinho-section'].classList.contains('hidden'),true);
 sandbox.responderOpcaoAvulsas('sim');
 assert.equal(sandbox.avulsasOcultasNestePedido,false);
 assert.equal(sandbox.avulsasOpcoesExpandidas,true);
 assert.equal(elements['avulsas-opcoes-container'].classList.contains('hidden'),false);
 sandbox.responderOpcaoAvulsas('nao');
 sandbox.abrirAvulsasNoCarrinho('f1');
 assert.equal(sandbox.avulsasOcultasNestePedido,false);
 assert.equal(sandbox.avulsasOpcoesExpandidas,true);
 assert.equal(abriu,1);
 assert.equal(salvou,4);
 assert.equal(elements['avulsa-card-f1'].scrolled,true);
});

test('preferência Sim/Não das avulsas é preservada no carrinho local e reiniciada em novo pedido',()=>{
 const pedidos=read('js/modules/pedidos.js');
 const limpar=read('js/modules/checkout.js');
 assert.match(pedidos,/avulsasOcultas: avulsasOcultasNestePedido/);
 assert.match(pedidos,/avulsasOpcoesExpandidas/);
 assert.match(pedidos,/salvo\.avulsasOcultas/);
 assert.match(pedidos,/atualizarPreferenciaVisualAvulsas\(\)/);
 assert.match(pedidos,/reiniciarPreferenciaAvulsas\(\)/);
 assert.match(limpar,/reiniciarPreferenciaAvulsas\(\)/);
});


test('Combo 10 não concede frete grátis: todas as taxas de bairro são cobradas',()=>{
 const combos=data('js/data/combos.js').combos;
 assert.ok(combos.filter(c=>c.qty===10).length>=1);
 assert.ok(combos.every(c=>!Object.hasOwn(c,'freteGratis')));
 const sandbox={currentShippingFee:12,cartCombos:[{comboId:'combo-10-350g',freteGratis:true}],document:{getElementById:()=>null},atualizarPixBox:()=>{}};
 runInNewContext(read('js/modules/operacao.js'),sandbox);
 assert.equal(sandbox.freteEfetivo(),12);
 sandbox.cartCombos=[{comboId:'combo-10-500g',freteGratis:true}];
 assert.equal(sandbox.freteEfetivo(),12);
 sandbox.currentShippingFee=null;
 assert.equal(sandbox.freteEfetivo(),null);
 assert.equal(typeof sandbox.temFreteGratis,'undefined');
 assert.doesNotMatch(read('js/modules/operacao.js'),/frete grátis garantido|Combo de 10 = frete grátis|ganhe frete grátis/i);
});

test('planejador informa que o frete é cobrado conforme o bairro',()=>{
 const experiencia=read('js/modules/experiencia.js');
 assert.match(experiencia,/frete será calculado no checkout conforme o bairro informado/i);
 assert.doesNotMatch(experiencia,/temFreteGratis|oferece frete grátis/i);
});

test('avaliações: comentários aparecem em carrossel compacto com avanço lento',()=>{
 const html=read('index.html'),module=read('js/modules/avaliacoes.js'),css=read('css/styles.css');
 assert.match(html,/id="avaliacoes-carrossel"/);
 assert.match(html,/id="avaliacoes-comentarios" class="flex/);
 assert.match(module,/window\.setInterval\(\(\) =>/);
 assert.match(module,/}, 7500\)/);
 assert.match(module,/translateX\(-'/);
 assert.match(css,/\.avaliacoes-carrossel \{ min-height: 78px; \}/);
});
test('avulsas: novo pedido reinicia e persiste preferência mesmo após escolha Não',()=>{
 const avulsas=read('js/modules/avulsas.js'),carrinho=read('js/modules/carrinho.js'),pedidos=read('js/modules/pedidos.js');
 assert.match(avulsas,/function reiniciarPreferenciaAvulsas\(\)[\s\S]*salvarCarrinho\(\)/);
 assert.match(carrinho,/cartCombos\.length === 0 && cartAvulsas\.length === 0[\s\S]*reiniciarPreferenciaAvulsas\(\)/);
 assert.match(pedidos,/reiniciarPreferenciaAvulsas\(\)/);
});

test('painel administrativo: arquivos, autenticação e sessão não expõem segredo no frontend',()=>{
 const html=read('admin.html'),css=read('css/admin.css'),js=read('js/admin.js'),backend=read('integrations/google-apps-script/Code.gs');
 assert.ok(exists('admin.html')&&exists('css/admin.css')&&exists('js/admin.js'));
 assert.match(html,/noindex,nofollow/);
 assert.match(html,/id="login-form"/);
 assert.match(html,/id="dashboard-view"/);
 assert.match(js,/adminChallenge/);
 assert.match(js,/adminLogin/);
 assert.match(js,/crypto\.subtle/);
 assert.match(js,/adminUpdateStatus/);
 assert.match(js,/adminChangePassword/);
 assert.match(js,/password.length<8/);
 assert.match(js,/senha.length<8/);
 assert.match(html,/minlength="8"/);
 assert.match(backend,/valor.length < 8/);
 assert.match(js,/salvarNovaSenha/);
 assert.match(js,/},60000)/);
 assert.match(js,/carregarPainel\(\{silencioso:true\}\)/);
 assert.match(html,/id="last-updated"/);
 assert.match(backend,/function alterarSenhaAdmin_\(payload\)/);
 assert.match(backend,/ADMIN_SESSION_VERSION_PROPERTY/);
 assert.match(backend,/invalidarSessoesAdmin_\(\)/);
 assert.match(backend,/passwordChanged === true/);
 assert.match(js,/mode:'no-cors'/);
 assert.doesNotMatch(js,/TEMPERODA_ILMA_ADMIN_SECRET|definirSenhaPainelTempero/);
 assert.match(backend,/function definirSenhaPainelTempero\(senha\)/);
 assert.match(backend,/Utilities\.computeHmacSha256Signature/);
 assert.match(css,/\.orders-panel/);
});
test('Apps Script centraliza pedidos sem substituir a planilha de avaliações',()=>{
 const backend=read('integrations/google-apps-script/Code.gs');
 for(const sheet of ['Pedidos','ItensPedidos','Clientes','HistoricoPedidos','Notificacoes','Configuracoes','Fretes','Produtos','Avaliacoes']) assert.ok(backend.includes(sheet));
 assert.match(backend,/function configurarSistemaAvaliacoes\(\)/);
 assert.match(backend,/configurarSistemaAvaliacoesBase_/);
 assert.match(backend,/function registrarPedidoPublico_/);
 assert.match(backend,/function obterDadosPainelAdmin_/);
 assert.match(backend,/function atualizarStatusPedidoAdmin_/);
 assert.match(backend,/Aguardando confirmação/);
});
test('pedido central: registro só começa após confirmação e valores são conferidos no servidor',()=>{
 const pedidos=read('js/modules/pedidos.js'),checkout=read('js/modules/checkout.js'),backend=read('integrations/google-apps-script/Code.gs');
 assert.match(pedidos,/function registrarPedidoCentralizado\(pedido\)/);
 assert.match(pedidos,/action: 'registerOrder'/);
 assert.match(pedidos,/orderCheck/);
 assert.match(checkout,/const orderId =/);
 assert.doesNotMatch(checkout,/salvarUltimoCliente\(\{ name, phone/);
 assert.match(pedidos,/salvarUltimoCliente\(dp\.customerData\)/);
 assert.match(backend,/taxaEntregaBairro_/);
 assert.match(backend,/COMBOS_PERMITIDOS_/);
 assert.match(backend,/Os valores do pedido não conferem/);
});
test('notificações de status são preparadas e envio manual não é apresentado como automático',()=>{
 const backend=read('integrations/google-apps-script/Code.gs'),js=read('js/admin.js'),html=read('index.html');
 assert.match(backend,/function criarMensagemStatus_/);
 assert.match(backend,/PRONTA_PARA_ABRIR_NO_WHATSAPP/);
 assert.match(backend,/LINK_ABERTO_NO_WHATSAPP/);
 assert.match(js,/Confirme manualmente o envio da mensagem/i);
 assert.match(html,/Quero receber atualizações sobre o andamento deste pedido pelo WhatsApp/);
});
test('CEP: respostas antigas são descartadas e o frete espera confirmação do bairro',()=>{
 const horario=read('js/modules/horarios.js'),endereco=read('js/services/endereco.js'),estado=read('js/core/estado.js');
 assert.match(horario,/const consultaId = \+\+cepConsultaId/);
 assert.match(horario,/consultaId !== cepConsultaId \|\| cepAtual !== cep/);
 assert.match(horario,/bairroPendenteConfirmacao = true/);
 assert.match(horario,/Confirme o bairro identificado pelo CEP antes de calcular o frete/);
 assert.match(endereco,/cepConsultaController\.abort\(\)/);
 assert.match(estado,/else \{\s*calcularFreteEBuscarBairro\(\);/);
});
test('histórico local expira e só é persistido após confirmar a abertura da comanda',()=>{
 const checkout=read('js/modules/checkout.js'),pedidos=read('js/modules/pedidos.js'),experience=read('js/modules/experiencia.js');
 assert.match(checkout,/expiresAt: Date\.now\(\) \+/);
 assert.match(checkout,/Date\.now\(\) - salvoEm > \(CONFIG_LOJA\.historyDays \|\| 60\)/);
 assert.match(pedidos,/if \(dp && dp\.customerData\) salvarUltimoCliente/);
 assert.match(experience,/Date\.now\(\) - salvoEm > \(CONFIG_LOJA\.historyDays \|\| 60\)/);
});
test('horários usam o fuso configurado da operação',()=>{
 const config=read('js/config/loja.js'),horario=read('js/modules/horarios.js'),operacao=read('js/modules/operacao.js');
 assert.match(config,/timeZone:'America\/Bahia'/);
 assert.match(horario,/new Intl\.DateTimeFormat\('en-US',[\s\S]*timeZone/);
 assert.match(horario,/obterDataHoraLoja\(\)/);
 assert.match(operacao,/obterDataHoraLoja\(\)\.weekday/);
});
test('modal de avaliação participa da pilha de modais',()=>{
 const interfaceJs=read('js/modules/interface.js');
 assert.match(interfaceJs,/MODAIS_ORDEM = \['avaliacao-modal'/);
 assert.match(interfaceJs,/id === 'avaliacao-modal'/);
});
test('service worker não armazena painel administrativo no cache público',()=>{
 const sw=read('sw.js');
 assert.match(sw,/tempero-v19-painel-gestao/);
 assert.match(sw,/const paginaAdmin = url\.pathname\.endsWith\('\/admin\.html'\)/);
 assert.match(sw,/response\.ok && !paginaAdmin/);
 assert.match(sw,/if \(paginaAdmin\) return new Response/);
});

test('backend rejeita CEP malformado antes de registrar pedido',()=>{
 const backend=read('integrations/google-apps-script/Code.gs');
 assert.ok(backend.includes('var cep=limparCampo_(cliente.cep,9);'));
 assert.ok(backend.includes('cep && !/^'));
 assert.ok(backend.includes('test(cep)'));
});
