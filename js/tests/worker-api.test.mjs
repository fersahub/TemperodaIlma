import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  __test,
  OperationsCoordinator,
  default as worker
} from '../../workers/tempero-api/src/index.js';

const {fixedCatalogDefinitions,publicCatalog,validateOrderPayload,reviewDate,safeSheetText,dateSerial,panelDate}=__test;

function catalogSample() {
  return fixedCatalogDefinitions().map((definition,index)=>({
    ...definition,
    price:definition.type==='COMBO'
      ? ({'combo-5-350g':100,'combo-10-350g':200,'combo-5-500g':125,'combo-10-500g':250,'combo-5-300g-fit':130,'combo-10-300g-fit':260}[definition.id])
      : (definition.category==='Linha Fit'?26:(definition.size==='500g'?25:20)),
    active:true,
    rowNumber:index+2
  }));
}
function payloadBase() {
  return {
    orderId:'TI-261126-ABCDEF1234',
    reviewOrderId:'A'.repeat(24),
    customer:{
      name:'Cliente de Teste',
      phone:'71999999999',
      cep:'40000000',
      rua:'Rua de Teste',
      numero:'10',
      comp:'',
      bairro:'Centro'
    },
    combos:[{comboId:'combo-5-350g',flavors:{f1:3,f2:2},obs:''}],
    avulsas:[{flavorId:'f1',size:'350g',quantity:2}],
    firstOrderFreeShipping:false,
    shippingFee:9,
    subtotal:140,
    total:149,
    payment:'Pix',
    changeFor:'',
    observations:'',
    notificationsOptIn:false
  };
}
function makeStorage() {
  const values=new Map();
  let alarm=null;
  return {
    values,
    async get(key){return values.get(key);},
    async put(key,value){values.set(key,value);},
    async delete(key){values.delete(key);},
    async list(options={}) {
      const prefix=options.prefix||'';
      return new Map([...values.entries()].filter(([key])=>String(key).startsWith(prefix)));
    },
    async getAlarm(){return alarm;},
    async setAlarm(value){alarm=value;},
    async deleteAlarm(){alarm=null;}
  };
}


test('Worker encaminha GET ao Apps Script, preserva JSONP e adiciona CORS',async()=>{
  const originalFetch=globalThis.fetch;
  let capturedUrl='',capturedInit=null;
  globalThis.fetch=async(input,init={})=>{
    capturedUrl=String(input);
    capturedInit=init;
    return new Response('loadCatalog({"ok":true,"combos":[],"avulsas":[]});',{
      status:200,headers:{'Content-Type':'application/javascript; charset=utf-8'}
    });
  };
  try {
    const request=new Request('https://tempero-ilma-api.test.workers.dev/exec?action=catalog&callback=loadCatalog',{
      headers:{Origin:'https://fersahub.github.io'}
    });
    const response=await worker.fetch(request,{
      APPS_SCRIPT_URL:'https://script.google.com/macros/s/test-deployment-id/exec'
    });
    assert.equal(response.status,200);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://fersahub.github.io');
    assert.match(response.headers.get('Content-Type')||'',/javascript/);
    assert.match(await response.text(),/^loadCatalog\(/);
    assert.equal(capturedUrl,'https://script.google.com/macros/s/test-deployment-id/exec?action=catalog&callback=loadCatalog');
    assert.equal(capturedInit.redirect,'follow');
    assert.equal(capturedInit.method,'GET');
  } finally {
    globalThis.fetch=originalFetch;
  }
});

test('Worker encaminha POST form-urlencoded ao Apps Script sem alterar os parâmetros',async()=>{
  const originalFetch=globalThis.fetch;
  let capturedUrl='',capturedInit=null;
  globalThis.fetch=async(input,init={})=>{
    capturedUrl=String(input);
    capturedInit=init;
    return new Response(JSON.stringify({ok:true,orderId:'TI-261127-ABCDEF1234'}),{
      status:200,headers:{'Content-Type':'application/json; charset=utf-8'}
    });
  };
  try {
    const body=new URLSearchParams({action:'registerOrder',payload:JSON.stringify({orderId:'TI-261127-ABCDEF1234'})});
    const request=new Request('https://tempero-ilma-api.test.workers.dev/exec',{
      method:'POST',
      headers:{
        'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8',
        Origin:'https://fersahub.github.io'
      },
      body:body.toString()
    });
    const response=await worker.fetch(request,{
      APPS_SCRIPT_URL:'https://script.google.com/macros/s/test-deployment-id/exec'
    });
    assert.equal(response.status,200);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://fersahub.github.io');
    assert.deepEqual(await response.json(),{ok:true,orderId:'TI-261127-ABCDEF1234'});
    assert.equal(capturedUrl,'https://script.google.com/macros/s/test-deployment-id/exec');
    assert.equal(capturedInit.method,'POST');
    assert.equal(capturedInit.redirect,'follow');
    assert.equal(capturedInit.headers['Content-Type'],'application/x-www-form-urlencoded;charset=UTF-8');
    assert.equal(new TextDecoder().decode(capturedInit.body),body.toString());
  } finally {
    globalThis.fetch=originalFetch;
  }
});

test('Worker recusa APPS_SCRIPT_URL fora do endpoint oficial de Apps Script',async()=>{
  const response=await worker.fetch(new Request('https://tempero-ilma-api.test.workers.dev/exec?action=health'),{
    APPS_SCRIPT_URL:'https://example.com/exec'
  });
  assert.equal(response.status,503);
  assert.match((await response.json()).message,/Apps Script não é válido/);
});

test('catálogo esperado contém os 6 combos e 38 avulsas, sem identificadores repetidos',()=>{
  const definitions=fixedCatalogDefinitions();
  assert.equal(definitions.filter(item=>item.type==='COMBO').length,6);
  assert.equal(definitions.filter(item=>item.type==='AVULSA').length,38);
  assert.equal(definitions.length,44);
  assert.equal(new Set(definitions.map(item=>item.id)).size,44);
});

test('resposta pública conserva o contrato JSON do catálogo usado pelo site',()=>{
  const result=publicCatalog(catalogSample());
  assert.equal(result.ok,true);
  assert.equal(result.combos.length,6);
  assert.equal(result.avulsas.length,38);
  assert.ok(result.combos.every(item=>Number.isFinite(item.price)&&typeof item.active==='boolean'));
  assert.ok(result.avulsas.every(item=>item.id.startsWith('avulsa-')&&item.flavorId&&item.size));
});

test('valida pedido com preço oficial, sabores, complemento avulso e frete',()=>{
  const order=validateOrderPayload(
    payloadBase(),
    catalogSample(),
    [{neighborhood:'Centro',fee:9,active:true}],
    false
  );
  assert.equal(order.subtotal,140);
  assert.equal(order.shipping,9);
  assert.equal(order.total,149);
  assert.equal(order.items.length,2);
  assert.equal(order.customer.city,'Salvador - BA');
});

test('valida frete grátis de primeira compra apenas quando o telefone não tem pedido anterior',()=>{
  const payload=payloadBase();
  payload.firstOrderFreeShipping=true;
  payload.shippingFee=0;
  payload.total=140;
  const order=validateOrderPayload(payload,catalogSample(),[{neighborhood:'Centro',fee:9,active:true}],false);
  assert.equal(order.firstOrderFreeShipping,true);
  assert.equal(order.shipping,0);
  assert.throws(
    ()=>validateOrderPayload(payload,catalogSample(),[{neighborhood:'Centro',fee:9,active:true}],true),
    /frete informado não confere|benefício de primeiro pedido/
  );
});

test('rejeita total alterado pelo navegador e composição de combo incompatível',()=>{
  const wrongTotal=payloadBase();
  wrongTotal.total=1;
  assert.throws(
    ()=>validateOrderPayload(wrongTotal,catalogSample(),[{neighborhood:'Centro',fee:9,active:true}],false),
    /valores do pedido não conferem/
  );
  const wrongFlavor=payloadBase();
  wrongFlavor.combos=[{comboId:'combo-5-300g-fit',flavors:{f1:5},obs:''}];
  wrongFlavor.avulsas=[];
  wrongFlavor.subtotal=130;
  wrongFlavor.total=139;
  assert.throws(
    ()=>validateOrderPayload(wrongFlavor,catalogSample(),[{neighborhood:'Centro',fee:9,active:true}],false),
    /combo Fit contém um sabor incompatível/
  );
});

test('protege textos contra fórmula em células da planilha',()=>{
  assert.equal(safeSheetText('=IMPORTXML("x")'),"'=IMPORTXML(\"x\")");
  assert.equal(safeSheetText('Cliente normal'),'Cliente normal');
});

test('grava e lê datas no horário civil de Salvador, inclusive perto da meia-noite UTC',()=>{
  const instant=new Date('2026-11-27T02:30:00.000Z');
  const serial=dateSerial(instant);
  assert.equal(reviewDate(serial),'2026-11-26');
  assert.match(panelDate(serial),/26\/11\/2026, 23:30/);
});

test('Durable Object serializa incrementos concorrentes e aplica limite sem ultrapassagem',async()=>{
  const storage=makeStorage();
  const coordinator=new OperationsCoordinator({storage},{});
  const calls=Array.from({length:12},()=>coordinator.fetch(new Request('https://operations.internal/state/increment',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({key:'rate:customer',limit:5,ttl:60})
  })));
  const responses=await Promise.all(calls);
  const statuses=responses.map(response=>response.status);
  assert.equal(statuses.filter(status=>status===200).length,5);
  assert.equal(statuses.filter(status=>status===400).length,7);
  const result=await coordinator.fetch(new Request('https://operations.internal/state/get',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:'rate:customer'})
  }));
  assert.deepEqual(await result.json(),{ok:true,value:'5'});
});


// Integração simulada do contrato público com OAuth, Sheets API, idempotência e Durable Object.
test('API lê o catálogo pela Sheets API e registra um pedido uma única vez',async()=>{
  const originalFetch=globalThis.fetch;
  const {privateKey}=generateKeyPairSync('rsa',{
    modulusLength:2048,
    publicKeyEncoding:{type:'spki',format:'pem'},
    privateKeyEncoding:{type:'pkcs8',format:'pem'}
  });
  const serviceAccount={
    client_email:'tempero-api-test@example.iam.gserviceaccount.com',
    private_key:privateKey
  };
  const definitions=fixedCatalogDefinitions();
  const defaultComboPrices={
    'combo-5-350g':100,'combo-10-350g':200,
    'combo-5-500g':125,'combo-10-500g':250,
    'combo-5-300g-fit':130,'combo-10-300g-fit':260
  };
  const catalogRows=[
    ['ID','Tipo','Nome','Categoria','Tamanho','Quantidade','Preço','Ativo','Atualizado em'],
    ...definitions.map(item=>[
      item.id,item.type,item.name,item.category,item.size,item.quantity,
      item.type==='COMBO'?defaultComboPrices[item.id]:(item.category==='Linha Fit'?26:(item.size==='500g'?25:20)),
      true,0
    ])
  ];
  const sheets={
    Catalogo:catalogRows,
    Fretes:[['Bairro','Taxa','Ativo'],['Centro',9,true]],
    Pedidos:[['ID do pedido','Código de avaliação','Criado em','Atualizado em','Status','Cliente','Telefone']],
    ItensPedidos:[['Pedido ID','Tipo','Referência','Produto','Sabor/Resumo','Tamanho','Quantidade','Valor unitário','Subtotal','Observação']],
    Clientes:[['Telefone','Nome','CEP','Rua','Número','Complemento','Bairro','Primeiro pedido','Último pedido','Quantidade de pedidos','Total em pedidos','Aceita atualizações WhatsApp']],
    HistoricoPedidos:[['ID','Pedido ID','Data e hora','Status anterior','Novo status','Observação interna','Responsável']],
    Notificacoes:[['ID','Pedido ID','Criada em','Telefone','Status do pedido','Mensagem preparada','Situação da notificação','Atualizada em']],
    Avaliacoes:[['ID','Criado em','Código do pedido (hash)','Nome público','Nota geral','Comentário geral','Notas por sabor (JSON)','Status']]
  };
  const sheetNames=Object.keys(sheets);
  const metadata={sheets:sheetNames.map((title,index)=>({properties:{title,sheetId:index+1}}))};
  const writes=[];
  globalThis.fetch=async(input,init={})=>{
    const url=new URL(typeof input==='string'?input:input.url);
    if(url.hostname==='oauth2.googleapis.com') {
      return new Response(JSON.stringify({access_token:'mock-google-access-token',expires_in:3600}),{status:200,headers:{'Content-Type':'application/json'}});
    }
    if(url.hostname==='sheets.googleapis.com') {
      if(url.pathname.includes(':batchUpdate')) {
        writes.push(JSON.parse(init.body||'{}'));
        return new Response(JSON.stringify({replies:[{}]}),{status:200,headers:{'Content-Type':'application/json'}});
      }
      if(url.pathname.includes('/values/')) {
        const range=decodeURIComponent(url.pathname.split('/values/')[1]||'');
        const match=range.match(/^'([^']+)'!/);
        const name=match&&match[1];
        return new Response(JSON.stringify({values:sheets[name]||[]}),{status:200,headers:{'Content-Type':'application/json'}});
      }
      if(url.pathname.endsWith('/spreadsheets/test-sheet-id')) {
        return new Response(JSON.stringify(metadata),{status:200,headers:{'Content-Type':'application/json'}});
      }
      if(url.pathname.includes('/spreadsheets/test-sheet-id')) {
        return new Response(JSON.stringify(metadata),{status:200,headers:{'Content-Type':'application/json'}});
      }
    }
    throw new Error('Requisição externa inesperada no teste: '+url.href);
  };
  try {
    const storage=makeStorage();
    const env={
      GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify(serviceAccount),
      SPREADSHEET_ID:'test-sheet-id-12345678901234567890',
      ADMIN_PASSWORD:'SenhaDeTeste123',
      REVIEW_HASH_SALT:'salt-de-teste-para-avaliacoes'
    };
    const coordinator=new OperationsCoordinator({storage},env);
    const namespace={
      idFromName:name=>name,
      get:()=>({fetch:request=>coordinator.fetch(request)})
    };
    env.OPERATIONS=namespace;
    const catalogResponse=await worker.fetch(new Request('https://tempero-ilma-api.test.workers.dev/exec?action=catalog&callback=loadCatalog'),env);
    const catalogText=await catalogResponse.text();
    assert.match(catalogText,/loadCatalog\(\{"ok":true/);
    assert.match(catalogText,/"combos":\[\{"id":"combo-5-350g","price":100/);
    assert.match(catalogText,/"avulsas":\[/);

    const payload=payloadBase();
    const body=new URLSearchParams({action:'registerOrder',payload:JSON.stringify(payload)});
    const request=()=>new Request('https://tempero-ilma-api.test.workers.dev/exec',{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8','Origin':'https://fersahub.github.io'},
      body:body.toString()
    });
    const first=await worker.fetch(request(),env);
    const firstResult=await first.json();
    assert.equal(firstResult.ok,true,JSON.stringify(firstResult));
    assert.equal(firstResult.orderId,payload.orderId);
    assert.equal(writes.length,1);
    const second=await worker.fetch(request(),env);
    const secondResult=await second.json();
    assert.equal(secondResult.ok,true);
    assert.equal(secondResult.duplicate,true);
    assert.equal(writes.length,1);
  } finally {
    globalThis.fetch=originalFetch;
  }
});
