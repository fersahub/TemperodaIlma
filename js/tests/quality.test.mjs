import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(resolve(ROOT,p),'utf8');
const exists=p=>existsSync(resolve(ROOT,p));
function data(p){const window={TEMPERO_DADOS:{}};runInNewContext(read(p),{window});return window.TEMPERO_DADOS;}

test('combos: IDs, preços, quantidades e imagens',()=>{
 const xs=data('js/data/combos.js').combos;assert.ok(xs.length>0);assert.equal(new Set(xs.map(x=>x.id)).size,xs.length);
 for(const x of xs){assert.ok(x.name&&x.description);assert.ok([5,10].includes(x.qty));assert.ok(Number.isFinite(x.price)&&x.price>0);assert.ok(['Tradicional','Linha Fit'].includes(x.type));assert.ok(exists(x.image),x.image);if(x.freteGratis)assert.equal(x.type,'Tradicional');}
});
test('pratos: IDs, categorias e imagens',()=>{
 const xs=data('js/data/pratos.js').pratos;assert.ok(xs.length>0);assert.equal(new Set(xs.map(x=>x.id)).size,xs.length);
 for(const x of xs){assert.ok(x.name&&x.desc);assert.ok(['Tradicional','Linha Fit','Especiais da Casa'].includes(x.tag));assert.ok(exists(x.img),x.img);}
});
test('configuração pública da loja e Pix preenchida',()=>{
 const window={};runInNewContext(read('js/config/loja.js'),{window});const c=window.TEMPERO_CONFIG;
 assert.match(c.loja.whatsappNumero,/^\d{12,13}$/);assert.ok(c.loja.cidade);assert.ok(c.pix.pixChave&&c.pix.pixNome&&c.pix.pixCidade);
});
test('HTML: referências locais existem e scripts carregam na ordem',()=>{
 const html=read('index.html'),refs=[];
 for(const m of html.matchAll(/<(?:script|link|img)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi)){const v=m[1];if(v&&!/^(?:https?:|data:|#|mailto:|tel:|javascript:)/i.test(v))refs.push(v.split(/[?#]/)[0]);}
 for(const p of refs)assert.ok(exists(p),p);
 const appAt=html.indexOf('<script src="js/app.js">');
 for(const p of ['js/config/loja.js','js/data/combos.js','js/data/pratos.js','js/core/estado.js','js/modules/favoritos.js','js/modules/detalhes-prato.js','js/modules/cardapio.js','js/modules/avulsas.js','js/modules/checkout.js']){const i=html.indexOf('<script src="'+p+'">');assert.ok(i>=0&&i<appAt,p);}
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
test('cliente pode apagar dados guardados localmente',()=>{
 assert.match(read('js/modules/checkout.js'),/function apagarDadosSalvos\(\)/);assert.match(read('index.html'),/Apagar dados salvos neste navegador/);
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
 assert.match(read('js/modules/cardapio.js'),/Em breve/);
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
 assert.equal(plano.temFreteGratis,true);
 const familia=JSON.parse(JSON.stringify(sandbox.gerarPlanoCombosQuiz(20,'Tradicional 350g')));
 assert.deepEqual(familia.ids,['combo-10-350g','combo-10-350g']);
 assert.equal(familia.total,400);
 const reforcado=JSON.parse(JSON.stringify(sandbox.gerarPlanoCombosQuiz(10,'Tradicional 500g')));
 assert.deepEqual(reforcado.ids,['combo-10-500g']);
 assert.equal(reforcado.total,250);
 const fit=JSON.parse(JSON.stringify(sandbox.gerarPlanoCombosQuiz(10,'Linha Fit 300g')));
 assert.deepEqual(fit.ids,['combo-10-300g-fit']);
 assert.equal(fit.temFreteGratis,false);
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

test('seção de avulsas informa e aplica a regra de combo obrigatório',()=>{
 const html=read('index.html');
 const avulsas=read('js/modules/avulsas.js');
 assert.ok(html.includes('id="avulsas-display-grid"'));
 assert.ok(html.includes('Não vendemos pedidos somente de 1 ou 2 marmitas'));
 assert.ok(avulsas.includes('if (!temComboNoCarrinho()) return null'));
 assert.ok(avulsas.includes('disabled'));
 assert.ok(read('sw.js').includes('tempero-v10-carrinho-misto'));
});
