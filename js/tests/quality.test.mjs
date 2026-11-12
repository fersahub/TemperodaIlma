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
 for(const x of xs){assert.ok(x.name&&x.desc);assert.ok(['Tradicional','Linha Fit'].includes(x.tag));assert.ok(exists(x.img),x.img);}
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
 for(const p of ['js/config/loja.js','js/data/combos.js','js/data/pratos.js','js/core/estado.js','js/modules/checkout.js']){const i=html.indexOf('<script src="'+p+'">');assert.ok(i>=0&&i<appAt,p);}
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
