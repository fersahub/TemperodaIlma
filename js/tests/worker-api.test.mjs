import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __test,
  OperationsCoordinator
} from '../../workers/tempero-api/src/index.js';

const {fixedCatalogDefinitions,publicCatalog,validateOrderPayload,reviewDate,safeSheetText}=__test;

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
