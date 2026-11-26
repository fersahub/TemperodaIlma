/* Tempero da Ilma — API independente via Cloudflare Workers + Google Sheets API.
 * Compatível com o contrato JSONP/POST atual do site para permitir migração gradual.
 * Segredos obrigatórios (Cloudflare Secrets): GOOGLE_SERVICE_ACCOUNT_JSON,
 * SPREADSHEET_ID, ADMIN_PASSWORD, REVIEW_HASH_SALT.
 * Binding KV obrigatório: STATE.
 */
const API_VERSION = '2026.11.26.1';
const REQUIRED_SHEETS = ['Avaliacoes','Pedidos','ItensPedidos','Clientes','HistoricoPedidos','Notificacoes','Configuracoes','Fretes','Produtos','Catalogo'];
const ORDER_STATUSES = ['Aguardando confirmação','Pedido confirmado','Em preparação','Pronto para entrega','Saiu para entrega','Entregue','Cancelado'];
const INITIAL_STATUS = 'Aguardando confirmação';
const CITY = 'Salvador - BA';
const FIT_IDS = new Set(['f12','f19','f20','f21','f22','f23']);
const FLAVORS = {
  f1:'Panqueca de Frango', f2:'Bife de Carne Temperada', f3:'Carne Moída com Caponata',
  f4:'Feijoada de Feijão Preto', f5:'Carne de Panela com Batatas', f7:'Strogonoff de Frango',
  f8:'Quiabada de Frango', f9:'Panqueca de Carne Moída', f10:'Bife de Carne Acebolado',
  f11:'Carne Moída com Mix de Verduras', f12:'Penne a Bolonhesa', f13:'Espaguete com Almôndegas',
  f14:'Frango ao Creme de Milho', f15:'Carne de Panela Desfiada', f16:'Lombo de Boi recheado',
  f17:'Omelete de Frango', f18:'Bife de Frango Acebolado', f19:'Panqueca de Frango (Farinha Integral)',
  f20:'Frango com Purê de Mandioquinha', f21:'Escondidinho Fit',
  f22:'Macarrão Integral com Almôndegas', f23:'Carne Moída com Arroz Funcional'
};
const COMBOS = {
  'combo-5-350g': {name:'Combo 5 Marmitas - 350g',qty:5,type:'Tradicional'},
  'combo-10-350g': {name:'Combo 10 Marmitas - 350g',qty:10,type:'Tradicional'},
  'combo-5-500g': {name:'Combo 5 Marmitas - 500g',qty:5,type:'Tradicional'},
  'combo-10-500g': {name:'Combo 10 Marmitas - 500g',qty:10,type:'Tradicional'},
  'combo-5-300g-fit': {name:'Combo 5 Marmitas FIT - 300g',qty:5,type:'Linha Fit'},
  'combo-10-300g-fit': {name:'Combo 10 Marmitas FIT - 300g',qty:10,type:'Linha Fit'}
};
const SHEET_HEADERS = {
  Pedidos:['ID do pedido','Código de avaliação','Criado em','Atualizado em','Status','Cliente','Telefone','Aceita atualizações WhatsApp','CEP','Rua','Número','Complemento','Bairro','Pagamento','Troco','Observações','Subtotal','Frete','Total','Data de entrega','Cidade'],
  ItensPedidos:['Pedido ID','Tipo','Referência','Produto','Sabor/Resumo','Tamanho','Quantidade','Valor unitário','Subtotal','Observação'],
  Clientes:['Telefone','Nome','CEP','Rua','Número','Complemento','Bairro','Primeiro pedido','Último pedido','Quantidade de pedidos','Total em pedidos','Aceita atualizações WhatsApp'],
  HistoricoPedidos:['ID','Pedido ID','Data e hora','Status anterior','Novo status','Observação interna','Responsável'],
  Notificacoes:['ID','Pedido ID','Criada em','Telefone','Status do pedido','Mensagem preparada','Situação da notificação','Atualizada em'],
  Avaliacoes:['ID','Criado em','Código do pedido (hash)','Nome público','Nota geral','Comentário geral','Notas por sabor (JSON)','Status']
};

let tokenCache = {accessToken:'', expiresAt:0, serviceAccountEmail:''};
let sheetMetaCache = {at:0, ids:null};

const te = new TextEncoder();
function b64url(bytes) {
  let binary='';
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}
function fromB64url(value) {
  const normalized=String(value).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(normalized+'='.repeat((4-normalized.length%4)%4));
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
function pemBytes(pem) {
  return fromB64url(String(pem).replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''));
}
function randomHex(size=32) {
  const bytes=crypto.getRandomValues(new Uint8Array(size));
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
function jsonResponse(data, status=200, extra={}) {
  return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra}});
}
function callbackResponse(data, callback) {
  if (callback && /^[A-Za-z_$][A-Za-z0-9_$]{0,80}$/.test(callback)) {
    return new Response(callback+'('+JSON.stringify(data).replace(/</g,'\\u003c')+');',{
      headers:{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
    });
  }
  return jsonResponse(data);
}
function corsHeaders(request) {
  const origin=request.headers.get('Origin')||'*';
  const allowed=['https://fersahub.github.io','https://viniciusfersa2312.github.io','http://localhost:8788'];
  return {
    'Access-Control-Allow-Origin':allowed.includes(origin)?origin:'*',
    'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type',
    'Access-Control-Max-Age':'86400',
    'Vary':'Origin'
  };
}
function clean(value, limit=250) {
  return String(value===null||value===undefined?'':value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').trim().slice(0,limit);
}
function safeSheetText(value) {
  const text=String(value??'');
  return /^[=+\-@]/.test(text) ? "'"+text : text;
}
function money(value) {
  const n=Number(value);
  if(!Number.isFinite(n)) return NaN;
  return Math.round(n*100)/100;
}
function truthy(value) { return value===true || String(value).toUpperCase()==='TRUE'; }
function dateSerial(date=new Date()) { return date.getTime()/86400000+25569; }
function fromSerial(value) {
  const n=Number(value);
  return Number.isFinite(n) ? new Date((n-25569)*86400000) : null;
}
function panelDate(value) {
  let date=null;
  if(value instanceof Date) date=value;
  else if(typeof value==='number') date=fromSerial(value);
  else if(value) { const parsed=new Date(value); if(!Number.isNaN(parsed.getTime())) date=parsed; }
  if(!date) return String(value||'');
  return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Bahia',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(date);
}
function cellData(value) {
  if(value===null || value===undefined || value==='') return {userEnteredValue:{stringValue:''}};
  if(typeof value==='boolean') return {userEnteredValue:{boolValue:value}};
  if(typeof value==='number' && Number.isFinite(value)) return {userEnteredValue:{numberValue:value}};
  return {userEnteredValue:{stringValue:String(value)}};
}
function sheetRow(values) { return {values:values.map(cellData)}; }
function appendCellsRequest(sheetId, rows) {
  return {appendCells:{sheetId,rows:rows.map(sheetRow),fields:'userEnteredValue'}};
}
function updateCellsRequest(sheetId,rowIndex,columnIndex,rows) {
  return {updateCells:{start:{sheetId,rowIndex,columnIndex},rows:rows.map(sheetRow),fields:'userEnteredValue'}};
}
function operationsStub(env) {
  if(!env.OPERATIONS) throw new Error('O Durable Object OPERATIONS ainda não foi vinculado ao Cloudflare Worker.');
  return env.OPERATIONS.get(env.OPERATIONS.idFromName('tempero-global'));
}
function stateProxy(env) {
  const stub=operationsStub(env);
  const call=async(action,data={})=>{
    const response=await stub.fetch('https://operations.internal/state/'+action,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok||result.ok!==true) throw new Error(result.message||'Não foi possível acessar o estado seguro da API.');
    return result.value;
  };
  return {
    get:key=>call('get',{key}),
    put:(key,value,options={})=>call('put',{key,value,expirationTtl:options.expirationTtl||0}),
    delete:key=>call('delete',{key}),
    consume:key=>call('consume',{key}),
    increment:(key,limit,ttl)=>call('increment',{key,limit,ttl})
  };
}
function requireState(env) {
  if(env.STATE && typeof env.STATE.get==='function' && typeof env.STATE.put==='function') return env.STATE;
  return stateProxy(env);
}
function directState(ctx) {
  const storageKey=key=>'state:'+String(key);
  const read=async key=>{
    const item=await ctx.storage.get(storageKey(key));
    if(!item) return null;
    if(item.expiresAt && item.expiresAt<=Date.now()) {
      await ctx.storage.delete(storageKey(key));
      return null;
    }
    return item.value;
  };
  const write=async(key,value,expirationTtl=0)=>{
    const ttl=Number(expirationTtl)||0;
    const expiresAt=ttl>0?Date.now()+ttl*1000:0;
    await ctx.storage.put(storageKey(key),{value:String(value),expiresAt});
    if(ttl>0 && !(await ctx.storage.getAlarm())) await ctx.storage.setAlarm(Date.now()+60*60*1000);
  };
  return {
    get:read,
    put:(key,value,options={})=>write(key,value,options.expirationTtl||0),
    delete:key=>ctx.storage.delete(storageKey(key)),
    consume:async key=>{
      const value=await read(key);
      if(value!==null) await ctx.storage.delete(storageKey(key));
      return value;
    },
    increment:async(key,limit,ttl)=>{
      const count=Number(await read(key)||0)+1;
      if(count>Number(limit)) throw new Error('Muitas solicitações em pouco tempo. Aguarde alguns minutos e tente novamente.');
      await write(key,String(count),ttl);
      return count;
    }
  };
}

async function googleAccessToken(env) {
  const now=Math.floor(Date.now()/1000);
  if(tokenCache.accessToken && tokenCache.expiresAt>now+90) return tokenCache.accessToken;
  let account;
  try { account=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON||'{}'); }
  catch { throw new Error('A chave JSON da conta de serviço não está válida.'); }
  if(!account.client_email || !account.private_key) throw new Error('A conta de serviço precisa conter client_email e private_key.');
  const header=b64url(te.encode(JSON.stringify({alg:'RS256',typ:'JWT'})));
  const claims=b64url(te.encode(JSON.stringify({
    iss:account.client_email,
    scope:'https://www.googleapis.com/auth/spreadsheets',
    aud:'https://oauth2.googleapis.com/token',
    iat:now,
    exp:now+3600
  })));
  const unsigned=header+'.'+claims;
  const key=await crypto.subtle.importKey('pkcs8',pemBytes(account.private_key),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,te.encode(unsigned));
  const assertion=unsigned+'.'+b64url(signature);
  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok || !result.access_token) throw new Error('Não foi possível autenticar a conta de serviço no Google Sheets: '+clean(result.error_description||result.error||response.statusText,160));
  tokenCache={accessToken:result.access_token,expiresAt:now+Number(result.expires_in||3600),serviceAccountEmail:account.client_email};
  return tokenCache.accessToken;
}
function spreadsheetId(env) {
  const id=String(env.SPREADSHEET_ID||'').trim();
  if(!/^[A-Za-z0-9_-]{20,}$/.test(id)) throw new Error('O SPREADSHEET_ID ainda não foi configurado no Cloudflare Worker.');
  return id;
}
async function sheetsRequest(env,path,options={}) {
  const token=await googleAccessToken(env);
  const response=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+spreadsheetId(env)+path,{
    ...options,
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(options.headers||{})}
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error('Google Sheets API: '+clean(body.error?.message||response.statusText,200));
  return body;
}
async function readSheet(env,name) {
  const range=encodeURIComponent("'"+name+"'!A:Z");
  const result=await sheetsRequest(env,'/values/'+range+'?valueRenderOption=UNFORMATTED_VALUE');
  return Array.isArray(result.values)?result.values:[];
}
async function getSheetIds(env,force=false) {
  if(!force && sheetMetaCache.ids && Date.now()-sheetMetaCache.at<300000) return sheetMetaCache.ids;
  const result=await sheetsRequest(env,'?fields=sheets.properties(sheetId,title)');
  const ids={};
  for(const sheet of result.sheets||[]) {
    const p=sheet.properties||{};
    if(p.title!==undefined) ids[p.title]=p.sheetId;
  }
  sheetMetaCache={at:Date.now(),ids};
  return ids;
}
async function writeBatch(env,requests) {
  if(!requests.length) return {};
  return sheetsRequest(env,':batchUpdate',{method:'POST',body:JSON.stringify({requests})});
}
async function appendRow(env,ids,sheet,values) {
  const id=ids[sheet];
  if(id===undefined) throw new Error('A aba '+sheet+' não existe na planilha.');
  await writeBatch(env,[appendCellsRequest(id,[values])]);
}
function sheetRowsMap(rows) {
  return (rows||[]).slice(1).map((row,index)=>({row,index:index+1,number:index+2}));
}
async function fixedCatalogDefinitions() {
  const definitions=Object.entries(COMBOS).map(([id,combo])=>({
    id,type:'COMBO',name:combo.name,category:combo.type,
    size:combo.type==='Linha Fit'?'300g':(id.includes('500g')?'500g':'350g'),quantity:combo.qty
  }));
  for(const [flavorId,name] of Object.entries(FLAVORS)) {
    const category=FIT_IDS.has(flavorId)?'Linha Fit':'Tradicional';
    const sizes=category==='Linha Fit'?['300g']:['350g','500g'];
    for(const size of sizes) definitions.push({
      id:'avulsa-'+flavorId+'-'+size,type:'AVULSA',name,category,size,quantity:1,flavorId
    });
  }
  return definitions;
}
async function getCatalogItems(env) {
  const rows=await readSheet(env,'Catalogo');
  if(rows.length<2) throw new Error('A aba Catalogo está vazia.');
  const expectedHeaders=['ID','Tipo','Nome','Categoria','Tamanho','Quantidade','Preço','Ativo','Atualizado em'];
  if(expectedHeaders.some((header,index)=>String(rows[0][index]||'')!==header)) {
    throw new Error('Os cabeçalhos da aba Catalogo não correspondem ao formato esperado. Nenhum dado foi alterado.');
  }
  const byId=new Map();
  for(const {row,number} of sheetRowsMap(rows)) {
    const id=String(row[0]||'');
    if(!id) continue;
    if(byId.has(id)) throw new Error('Há identificador duplicado na aba Catalogo: '+id);
    const price=money(row[6]);
    if(!Number.isFinite(price)||price<=0||price>9999.99) throw new Error('Preço inválido no catálogo para '+id+'.');
    byId.set(id,{id,type:String(row[1]||''),name:String(row[2]||''),category:String(row[3]||''),size:String(row[4]||''),quantity:Number(row[5]||0),price,active:truthy(row[7]),updatedAt:panelDate(row[8]),rowNumber:number});
  }
  return fixedCatalogDefinitions().map(definition=>{
    const item=byId.get(definition.id);
    if(!item) throw new Error('O item '+definition.id+' não foi encontrado na aba Catalogo.');
    if(item.type!==definition.type||item.category!==definition.category||item.size!==definition.size||item.quantity!==definition.quantity||item.name!==definition.name) {
      throw new Error('A estrutura do item '+definition.id+' foi alterada indevidamente na aba Catalogo.');
    }
    return item;
  });
}
function publicCatalog(items) {
  return {
    ok:true,apiVersion:API_VERSION,catalogVersion:2,
    combos:items.filter(x=>x.type==='COMBO').map(x=>({id:x.id,price:x.price,active:x.active})),
    avulsas:items.filter(x=>x.type==='AVULSA').map(x=>{
      const match=x.id.match(/^avulsa-(f[0-9]+)-(350g|500g|300g)$/);
      return {id:x.id,flavorId:match?match[1]:'',category:x.category,size:x.size,price:x.price,active:x.active};
    })
  };
}
async function getShippingRows(env) {
  const rows=await readSheet(env,'Fretes');
  return sheetRowsMap(rows).map(x=>({neighborhood:String(x.row[0]||''),fee:money(x.row[1]),active:truthy(x.row[2])}));
}
function deliveryDateSaturday() {
  const now=new Date();
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Bahia',year:'numeric',month:'numeric',day:'numeric',weekday:'short'}).formatToParts(now);
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  const weekdays={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
  let days=(6-weekdays[p.weekday]+7)%7;
  if(days===0) days=7;
  const date=new Date(Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day)+days));
  return String(date.getUTCDate()).padStart(2,'0')+'/'+String(date.getUTCMonth()+1).padStart(2,'0');
}
async function phoneHasOrder(env,phone,ordersArg=null,clientsArg=null) {
  const normalized=String(phone||'').replace(/\D/g,'');
  if(normalized.length<10||normalized.length>13) return true;
  const [orders,clients]=await Promise.all([
    ordersArg||readSheet(env,'Pedidos'),
    clientsArg||readSheet(env,'Clientes')
  ]);
  if(sheetRowsMap(orders).some(x=>String(x.row[6]||'').replace(/\D/g,'')===normalized)) return true;
  return sheetRowsMap(clients).some(x=>String(x.row[0]||'').replace(/\D/g,'')===normalized);
}
function validateOrderPayload(payload,catalog,shipping,phoneHasPrevious) {
  if(!payload||typeof payload!=='object') throw new Error('Pedido inválido.');
  const orderId=clean(payload.orderId,60),reviewId=String(payload.reviewOrderId||'');
  if(!/^TI-[0-9]{6}-[A-F0-9]{10}$/.test(orderId)||! /^[A-F0-9]{24}$/.test(reviewId)) throw new Error('Identificação do pedido inválida.');
  const customer=payload.customer||{};
  const name=clean(customer.name,100),phone=String(customer.phone||'').replace(/\D/g,'');
  const neighborhood=clean(customer.bairro,100),cep=clean(customer.cep,9),street=clean(customer.rua,150),number=clean(customer.numero,30);
  if(!name||phone.length<10||phone.length>13||!neighborhood||!street||!number||(cep&&!/^\d{5}-?\d{3}$/.test(cep))) throw new Error('Dados do cliente ou endereço incompletos.');
  const combos=Array.isArray(payload.combos)?payload.combos:[];
  const avulsas=Array.isArray(payload.avulsas)?payload.avulsas:[];
  if(!combos.length||combos.length>20||avulsas.length>50) throw new Error('O pedido precisa ter ao menos um combo e respeitar os limites de itens.');
  const catalogById=new Map(catalog.map(x=>[x.id,x]));
  const items=[];
  let subtotal=0;
  for(const request of combos) {
    const id=String(request&&request.comboId||''),base=COMBOS[id],item=catalogById.get(id);
    if(!base||!item||item.type!=='COMBO'||item.active!==true) throw new Error('Um dos combos não está cadastrado ou está indisponível.');
    const flavors=request.flavors&&typeof request.flavors==='object'?request.flavors:{};
    let totalQty=0;
    const flavorLines=[];
    for(const [flavorId,amount] of Object.entries(flavors)) {
      const qty=Number(amount);
      if(!Object.prototype.hasOwnProperty.call(FLAVORS,flavorId)||!Number.isInteger(qty)||qty<1||qty>base.qty) throw new Error('Há sabores ou quantidades inválidas no combo.');
      if(base.type==='Linha Fit'&&!FIT_IDS.has(flavorId)) throw new Error('O combo Fit contém um sabor incompatível.');
      if(base.type==='Tradicional'&&FIT_IDS.has(flavorId)) throw new Error('O combo tradicional contém um sabor incompatível.');
      totalQty+=qty; flavorLines.push(qty+'x '+FLAVORS[flavorId]);
    }
    if(totalQty!==base.qty) throw new Error('A quantidade de sabores do combo não confere.');
    items.push({kind:'Combo',reference:id,name:base.name,flavorSummary:flavorLines.join(', '),size:base.type==='Linha Fit'?'300g':(id.includes('500g')?'500g':'350g'),quantity:base.qty,unitPrice:money(item.price/base.qty),total:item.price,obs:clean(request.obs,120)});
    subtotal+=item.price;
  }
  for(const request of avulsas) {
    const id=String(request&&request.flavorId||''),size=String(request&&request.size||''),qty=Number(request&&request.quantity);
    const fit=FIT_IDS.has(id),catalogId='avulsa-'+id+'-'+size,item=catalogById.get(catalogId);
    if(!FLAVORS[id]||(fit&&size!=='300g')||(!fit&&size==='300g')||!item||item.type!=='AVULSA'||item.active!==true||item.size!==size||!Number.isInteger(qty)||qty<1||qty>99) throw new Error('Uma das marmitas avulsas é inválida ou está indisponível.');
    const total=money(item.price*qty);
    items.push({kind:'Avulsa',reference:id,name:FLAVORS[id],flavorSummary:FLAVORS[id],size,quantity:qty,unitPrice:item.price,total,obs:''});
    subtotal+=total;
  }
  subtotal=money(subtotal);
  const shippingItem=shipping.find(x=>x.neighborhood===neighborhood&&x.active);
  const normalShipping=shippingItem?shippingItem.fee:null;
  const wantsFree=payload.firstOrderFreeShipping===true;
  const freeShipping=wantsFree&&!phoneHasPrevious;
  const finalShipping=freeShipping?0:normalShipping;
  const informedShipping=money(payload.shippingFee);
  if(normalShipping===null||(wantsFree&&!freeShipping)||!Number.isFinite(informedShipping)||Math.abs(finalShipping-informedShipping)>0.01) throw new Error('O frete informado não confere ou o benefício de primeiro pedido não está disponível para este telefone.');
  const informedSubtotal=money(payload.subtotal),informedTotal=money(payload.total);
  if(!Number.isFinite(informedSubtotal)||Math.abs(subtotal-informedSubtotal)>0.01||!Number.isFinite(informedTotal)||Math.abs(money(subtotal+finalShipping)-informedTotal)>0.01) throw new Error('Os valores do pedido não conferem. Atualize o carrinho e tente novamente.');
  const payment=clean(payload.payment,40);
  if(!['Pix','Cartão de Débito','Cartão de Crédito','Dinheiro'].includes(payment)) throw new Error('Forma de pagamento inválida.');
  return {
    orderId,reviewId,customer:{name,phone,cep,street,number,complement:clean(customer.comp,100),neighborhood,city:CITY},
    notificationsOptIn:payload.notificationsOptIn===true,payment,changeFor:clean(payload.changeFor,40),
    observations:clean(payload.observations,500),subtotal,shipping:finalShipping,total:money(subtotal+finalShipping),
    firstOrderFreeShipping:freeShipping,deliveryDate:deliveryDateSaturday(),items
  };
}
async function getMeta(env) { return getSheetIds(env,true); }

async function existsReviewHash(env,hash,rows=null) {
  const reviews=rows||await readSheet(env,'Avaliacoes');
  return sheetRowsMap(reviews).some(x=>String(x.row[2]||'')===hash);
}
async function existsOrderByReview(env,reviewId,rows=null) {
  const orders=rows||await readSheet(env,'Pedidos');
  return sheetRowsMap(orders).some(x=>String(x.row[1]||'')===reviewId);
}
function reviewDate(value) {
  const date=typeof value==='number'?fromSerial(value):(value instanceof Date?value:new Date(value));
  if(!date||Number.isNaN(date.getTime())) return String(value||'');
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const data=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return data.year+'-'+data.month+'-'+data.day;
}
function hashHex(bytes) {
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
async function reviewHash(orderId,env) {
  if(!env.REVIEW_HASH_SALT) throw new Error('O segredo de avaliações REVIEW_HASH_SALT não foi configurado.');
  return hashHex(await crypto.subtle.digest('SHA-256',te.encode(String(orderId)+env.REVIEW_HASH_SALT)));
}
async function getPublicReviews(env) {
  const rows=await readSheet(env,'Avaliacoes');
  const result={ok:true,overall:{count:0,average:null},flavors:{},comments:[]};
  let sum=0;
  for(const {row} of sheetRowsMap(rows)) {
    if(String(row[7]||'')!=='PUBLICADO') continue;
    const overall=Number(row[4]);
    if(Number.isInteger(overall)&&overall>=1&&overall<=5){result.overall.count++;sum+=overall;}
    const date=reviewDate(row[1]);
    const comment=String(row[5]||'');
    if(comment) result.comments.push({name:String(row[3]||'Cliente'),rating:overall,comment,date});
    let flavors=[];
    try{flavors=JSON.parse(String(row[6]||'[]'));}catch{}
    if(!Array.isArray(flavors)) continue;
    for(const entry of flavors) {
      const id=String(entry&&entry.id||''),rating=Number(entry&&entry.rating);
      if(!FLAVORS[id]||!Number.isInteger(rating)||rating<1||rating>5) continue;
      if(!result.flavors[id]) result.flavors[id]={name:FLAVORS[id],count:0,sum:0,average:0};
      result.flavors[id].count++;result.flavors[id].sum+=rating;
    }
  }
  if(result.overall.count) result.overall.average=Math.round(sum/result.overall.count*10)/10;
  for(const entry of Object.values(result.flavors)) {entry.average=Math.round(entry.sum/entry.count*10)/10;delete entry.sum;}
  result.comments.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  result.comments=result.comments.slice(0,12);
  return result;
}
function dateFromBahia() { return new Date(); }
async function recordOrder(env,payload) {
  const state=requireState(env), reviewId=String(payload&&payload.reviewOrderId||'');
  const idempotency='order:'+reviewId;
  const existing=await state.get(idempotency);
  if(existing) return {ok:true,duplicate:true,orderId:existing};
  const [catalog,shipping,orders,clients]=await Promise.all([
    getCatalogItems(env),getShippingRows(env),readSheet(env,'Pedidos'),readSheet(env,'Clientes')
  ]);
  const phone=String(payload?.customer?.phone||'').replace(/\D/g,'');
  const already=await phoneHasOrder(env,phone,orders,clients);
  const order=validateOrderPayload(payload,catalog,shipping,already);
  if(sheetRowsMap(orders).some(x=>String(x.row[0]||'')===order.orderId)) throw new Error('Este número de pedido já foi utilizado. Atualize a página e tente novamente.');
  if(sheetRowsMap(orders).some(x=>String(x.row[1]||'')===order.reviewId)) return {ok:true,duplicate:true,orderId:order.orderId};
  const now=dateSerial(dateFromBahia()),status=INITIAL_STATUS;
  const orderRow=[
    order.orderId,order.reviewId,now,now,status,safeSheetText(order.customer.name),order.customer.phone,
    order.notificationsOptIn,order.customer.cep,safeSheetText(order.customer.street),safeSheetText(order.customer.number),
    safeSheetText(order.customer.complement),safeSheetText(order.customer.neighborhood),order.payment,
    safeSheetText(order.changeFor),safeSheetText(order.observations),order.subtotal,order.shipping,order.total,
    order.deliveryDate,order.customer.city
  ];
  const itemRows=order.items.map(item=>[
    order.orderId,item.kind,item.reference,item.name,item.flavorSummary,item.size,item.quantity,item.unitPrice,item.total,safeSheetText(item.obs)
  ]);
  const historyRow=['HIS-'+crypto.randomUUID().replace(/-/g,'').slice(0,18).toUpperCase(),order.orderId,now,'',status,'Pedido registrado pelo cardápio digital','Sistema'];
  const clientRows=sheetRowsMap(clients);
  const clientIndex=clientRows.findIndex(x=>String(x.row[0]||'')===order.customer.phone);
  const ids=await getMeta(env),requests=[];
  if(ids.Pedidos===undefined||ids.ItensPedidos===undefined||ids.HistoricoPedidos===undefined||ids.Clientes===undefined) throw new Error('Uma ou mais abas obrigatórias não foram encontradas.');
  requests.push(appendCellsRequest(ids.ItensPedidos,itemRows));
  requests.push(appendCellsRequest(ids.HistoricoPedidos,[historyRow]));
  if(clientIndex>=0) {
    const old=clientRows[clientIndex].row;
    const firstOrder=old[7]||now;
    const update=[
      safeSheetText(order.customer.name),order.customer.cep,safeSheetText(order.customer.street),
      safeSheetText(order.customer.number),safeSheetText(order.customer.complement),safeSheetText(order.customer.neighborhood),
      firstOrder,now,Number(old[9]||0)+1,money(Number(old[10]||0)+order.total),order.notificationsOptIn
    ];
    requests.push(updateCellsRequest(ids.Clientes,clientRows[clientIndex].index,1,[update]));
  } else {
    requests.push(appendCellsRequest(ids.Clientes,[[
      order.customer.phone,safeSheetText(order.customer.name),order.customer.cep,safeSheetText(order.customer.street),
      safeSheetText(order.customer.number),safeSheetText(order.customer.complement),safeSheetText(order.customer.neighborhood),
      now,now,1,order.total,order.notificationsOptIn
    ]]));
  }
  // A linha principal do pedido é gravada no mesmo lote atômico das tabelas relacionadas.
  requests.push(appendCellsRequest(ids.Pedidos,[orderRow]));
  await writeBatch(env,requests);
  await state.put(idempotency,order.orderId,{expirationTtl:60*60*24*45});
  return {ok:true,orderId:order.orderId};
}

async function getAdminData(env) {
  const [orders,items,notifications,catalog]=await Promise.all([
    readSheet(env,'Pedidos'),readSheet(env,'ItensPedidos'),readSheet(env,'Notificacoes'),getCatalogItems(env)
  ]);
  const itemsByOrder={},noticeByOrder={};
  for(const {row} of sheetRowsMap(items)) {
    const id=String(row[0]||'');
    if(!itemsByOrder[id]) itemsByOrder[id]=[];
    itemsByOrder[id].push({kind:String(row[1]||''),reference:String(row[2]||''),name:String(row[3]||''),flavorSummary:String(row[4]||''),size:String(row[5]||''),quantity:Number(row[6]||0),unitPrice:Number(row[7]||0),total:Number(row[8]||0),obs:String(row[9]||'')});
  }
  for(const {row} of sheetRowsMap(notifications)) {
    noticeByOrder[String(row[1]||'')]={id:String(row[0]||''),createdAt:panelDate(row[2]),status:String(row[6]||''),message:String(row[5]||'')};
  }
  const all=sheetRowsMap(orders);
  const recent=all.slice(-200);
  const resultOrders=recent.map(({row})=>({
    id:String(row[0]||''),reviewId:String(row[1]||''),createdAt:panelDate(row[2]),updatedAt:panelDate(row[3]),
    status:String(row[4]||''),name:String(row[5]||''),phone:String(row[6]||''),notificationsOptIn:truthy(row[7]),
    cep:String(row[8]||''),street:String(row[9]||''),number:String(row[10]||''),complement:String(row[11]||''),
    neighborhood:String(row[12]||''),payment:String(row[13]||''),changeFor:String(row[14]||''),observations:String(row[15]||''),
    subtotal:Number(row[16]||0),shipping:Number(row[17]||0),total:Number(row[18]||0),deliveryDate:String(row[19]||''),city:String(row[20]||''),
    items:itemsByOrder[String(row[0]||'')]||[],lastNotification:noticeByOrder[String(row[0]||'')]||null
  })).reverse();
  const counts={};ORDER_STATUSES.forEach(s=>counts[s]=0);
  resultOrders.forEach(o=>counts[o.status]=(counts[o.status]||0)+1);
  return {ok:true,orders:resultOrders,statuses:ORDER_STATUSES,stats:{
    total:resultOrders.length,awaiting:counts[INITIAL_STATUS]||0,
    inProgress:(counts['Pedido confirmado']||0)+(counts['Em preparação']||0),
    outForDelivery:counts['Saiu para entrega']||0,delivered:counts['Entregue']||0
  },catalog,spreadsheetUrl:'https://docs.google.com/spreadsheets/d/'+spreadsheetId(env)+'/edit'};
}
function statusMessage(order,status) {
  const first=String(order.name||'').trim().split(/\s+/)[0]||'cliente';
  const intro='Olá, '+first+'! 😊\n\nTemos uma atualização sobre seu pedido '+order.id+' no Tempero da Ilma.\n\n';
  const texts={
    'Pedido confirmado':'Seu pedido foi confirmado! Em breve começaremos a preparar suas marmitas.',
    'Em preparação':'Seu pedido está em preparação. Nossa equipe já está organizando tudo com carinho.',
    'Pronto para entrega':'Seu pedido está pronto para entrega. Avisaremos quando sair para o seu endereço.',
    'Saiu para entrega':'Seu pedido saiu para entrega! Fique atento ao telefone para acompanhar o recebimento.',
    'Entregue':'Seu pedido consta como entregue. Esperamos que aproveite suas marmitas! ❤️',
    'Cancelado':'Seu pedido foi cancelado. Caso tenha dúvidas, fale conosco por esta conversa.'
  };
  return intro+(texts[status]||('O status do seu pedido foi atualizado para: '+status+'.'))+'\n\nObrigado por escolher o Tempero da Ilma! ❤️';
}
async function updateOrderStatus(env,payload) {
  const orderId=clean(payload.orderId,60),status=String(payload.status||'');
  if(!ORDER_STATUSES.includes(status)) throw new Error('Status inválido.');
  const orders=await readSheet(env,'Pedidos');
  const found=sheetRowsMap(orders).find(x=>String(x.row[0]||'')===orderId);
  if(!found) throw new Error('Pedido não encontrado.');
  const oldStatus=String(found.row[4]||'');
  if(oldStatus===status) return {ok:true,unchanged:true,message:'O pedido já está com esse status.'};
  const now=dateSerial(new Date()),note=clean(payload.note,300),ids=await getMeta(env);
  const history=['HIS-'+crypto.randomUUID().replace(/-/g,'').slice(0,18).toUpperCase(),orderId,now,oldStatus,status,safeSheetText(note),'Painel administrativo'];
  const notificationId='NOT-'+crypto.randomUUID().replace(/-/g,'').slice(0,18).toUpperCase();
  const message=statusMessage({id:orderId,name:String(found.row[5]||'')},status);
  const notification=[notificationId,orderId,now,String(found.row[6]||''),status,safeSheetText(message),'PRONTA_PARA_ABRIR_NO_WHATSAPP',now];
  await writeBatch(env,[
    updateCellsRequest(ids.Pedidos,found.index,3,[[now,status]]),
    appendCellsRequest(ids.HistoricoPedidos,[history]),
    appendCellsRequest(ids.Notificacoes,[notification])
  ]);
  return {ok:true,orderId,status,notificationId,message:'Status atualizado e mensagem preparada.'};
}
async function markNotification(env,payload) {
  const id=String(payload.notificationId||'');
  if(!id) throw new Error('Notificação não identificada.');
  const rows=await readSheet(env,'Notificacoes');
  const found=sheetRowsMap(rows).reverse().find(x=>String(x.row[0]||'')===id);
  if(!found) throw new Error('Notificação não encontrada.');
  const now=dateSerial(new Date()),ids=await getMeta(env);
  await writeBatch(env,[updateCellsRequest(ids.Notificacoes,found.index,6,[['LINK_ABERTO_NO_WHATSAPP',now]])]);
  return {ok:true,message:'Link do WhatsApp aberto. O envio ainda depende de confirmação manual.'};
}
async function saveCatalogItem(env,payload) {
  const id=String(payload.id||''),price=money(payload.price);
  if(!Number.isFinite(price)||price<0.01||price>9999.99) throw new Error('Informe um preço entre R$ 0,01 e R$ 9.999,99.');
  if(typeof payload.active!=='boolean') throw new Error('Informe se o item ficará ativo ou inativo.');
  const catalog=await getCatalogItems(env),target=catalog.find(x=>x.id===id);
  if(!target) throw new Error('Produto não encontrado no catálogo permitido.');
  if(target.type==='COMBO'&&!payload.active&&!catalog.some(x=>x.type==='COMBO'&&x.active&&x.id!==id)) throw new Error('Mantenha pelo menos um combo ativo para que os clientes possam montar pedidos.');
  const ids=await getMeta(env);
  await writeBatch(env,[updateCellsRequest(ids.Catalogo,target.rowNumber-1,6,[[price,payload.active,dateSerial(new Date())]])]);
  return {ok:true,item:{id,price,active:payload.active},message:'Preço e disponibilidade de '+target.name+' atualizados com sucesso.'};
}
async function submitReview(env,payload) {
  if(String(payload.website||'').trim()) return {ok:true};
  const orderId=String(payload.orderId||'').trim(),rating=Number(payload.overallRating);
  if(!/^[A-Fa-f0-9]{24}$/.test(orderId)) throw new Error('Código do pedido inválido.');
  if(!Number.isInteger(rating)||rating<1||rating>5) throw new Error('Informe a nota geral de 1 a 5.');
  const displayName=clean(payload.displayName,35)||'Cliente',comment=clean(payload.overallComment,500);
  const submitted=Array.isArray(payload.flavorRatings)?payload.flavorRatings:[];
  if(!submitted.length||submitted.length>20) throw new Error('O pedido precisa conter ao menos um sabor para avaliar.');
  const seen=new Set(),flavors=submitted.map(item=>{
    const id=String(item&&item.id||''),score=Number(item&&item.rating);
    if(!FLAVORS[id]) throw new Error('Um dos sabores não é válido.');
    if(seen.has(id)) throw new Error('Há sabores repetidos na avaliação.');
    if(!Number.isInteger(score)||score<1||score>5) throw new Error('Informe uma nota para cada sabor.');
    seen.add(id);return {id,name:FLAVORS[id],rating:score};
  });
  if(payload.consent!==true) throw new Error('A autorização de publicação é obrigatória.');
  const hash=await reviewHash(orderId,env);
  const [orders,reviews]=await Promise.all([readSheet(env,'Pedidos'),readSheet(env,'Avaliacoes')]);
  const order=sheetRowsMap(orders).find(x=>String(x.row[1]||'')===orderId);
  if(!order||String(order.row[4]||'')!=='Entregue') throw new Error('A avaliação só fica disponível após a entrega confirmada pela loja.');
  if(await existsReviewHash(env,hash,reviews)) throw new Error('Este pedido já possui uma avaliação.');
  const ids=await getMeta(env),row=['REV-'+crypto.randomUUID().replace(/-/g,'').slice(0,18).toUpperCase(),dateSerial(new Date()),hash,safeSheetText(displayName),rating,safeSheetText(comment),safeSheetText(JSON.stringify(flavors)),'PUBLICADO'];
  await writeBatch(env,[appendCellsRequest(ids.Avaliacoes,[row])]);
  return {ok:true,published:true};
}
async function incrementRate(env,key,limit,ttl) {
  const now=Math.floor(Date.now()/1000),window=Math.floor(now/ttl),name='rate:'+key+':'+window;
  const state=requireState(env);
  if(typeof state.increment==='function') return state.increment(name,limit,ttl+5);
  const count=Number(await state.get(name)||0)+1;
  if(count>limit) throw new Error('Muitas solicitações em pouco tempo. Aguarde alguns minutos e tente novamente.');
  await state.put(name,String(count),{expirationTtl:ttl+5});
  return count;
}
async function verifyAdminSession(env,token) {
  if(!/^[A-Fa-f0-9]{64}$/.test(String(token||''))) return false;
  const state=requireState(env);
  const saved=await state.get('session:'+token);
  if(!saved) return false;
  const version=await state.get('session-version')||'1';
  return saved===version;
}
async function getAdminPassword(env) {
  const saved=await requireState(env).get('admin-password');
  const password=saved||env.ADMIN_PASSWORD;
  if(!password) throw new Error('A senha administrativa inicial não foi configurada no Worker.');
  return password;
}
async function adminChallenge(env) {
  const state=requireState(env),nonce=randomHex(32);
  await state.put('nonce:'+nonce,'1',{expirationTtl:120});
  return {ok:true,nonce,apiVersion:API_VERSION};
}
async function adminLogin(env,params) {
  const state=requireState(env),nonce=String(params.nonce||''),proof=String(params.proof||'');
  if(!/^[A-Fa-f0-9]{64}$/.test(nonce)) return {ok:false,code:'CHALLENGE_EXPIRED',message:'Desafio de autenticação expirado. Tente novamente.'};
  const nonceValue=typeof state.consume==='function'?await state.consume('nonce:'+nonce):await state.get('nonce:'+nonce);
  if(nonceValue!=='1') return {ok:false,code:'CHALLENGE_EXPIRED',message:'Desafio de autenticação expirado. Tente novamente.'};
  if(typeof state.consume!=='function') await state.delete('nonce:'+nonce);
  const password=await getAdminPassword(env);
  const expected=await hmacBase64(password,nonce);
  if(!constantTimeEqual(expected,proof)) return {ok:false,code:'INVALID_CREDENTIALS',message:'Senha incorreta.'};
  const token=randomHex(32),version=await state.get('session-version')||'1';
  await state.put('session:'+token,version,{expirationTtl:21600});
  return {ok:true,token,expiresIn:21600};
}
async function hmacBase64(keyValue,message) {
  const key=await crypto.subtle.importKey('raw',te.encode(String(keyValue)),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('HMAC',key,te.encode(String(message)));
  let binary='';for(const b of new Uint8Array(signature))binary+=String.fromCharCode(b);
  return btoa(binary);
}
function constantTimeEqual(a,b) {
  a=String(a);b=String(b);
  let diff=a.length^b.length;
  const max=Math.max(a.length,b.length);
  for(let i=0;i<max;i++) diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return diff===0;
}
async function readRequestParams(request) {
  const contentType=request.headers.get('Content-Type')||'';
  if(contentType.includes('application/json')) return await request.json();
  if(contentType.includes('application/x-www-form-urlencoded')||contentType.includes('multipart/form-data')) {
    const form=await request.formData(),out={};
    for(const [key,value] of form.entries()) out[key]=String(value);
    return out;
  }
  const text=await request.text();
  const params=new URLSearchParams(text),out={};
  for(const [key,value] of params.entries()) out[key]=value;
  return out;
}
async function handleGet(request,env) {
  const url=new URL(request.url),params=url.searchParams,action=String(params.get('action')||'list'),callback=params.get('callback')||'';
  let result;
  try {
    if(action==='health') {
      let accessible=false,missing=[];
      try {
        const ids=await getSheetIds(env);accessible=true;
        missing=REQUIRED_SHEETS.filter(name=>ids[name]===undefined);
      } catch(error) { result={ok:true,service:'Tempero da Ilma API independente',apiVersion:API_VERSION,adminConfigured:Boolean(env.ADMIN_PASSWORD),spreadsheetConfigured:Boolean(env.SPREADSHEET_ID),spreadsheetAccessible:false,missingSheets:[],spreadsheetError:clean(error.message,180)}; }
      if(!result) result={ok:true,service:'Tempero da Ilma API independente',apiVersion:API_VERSION,adminConfigured:Boolean(env.ADMIN_PASSWORD)||Boolean(await requireState(env).get('admin-password')),spreadsheetConfigured:Boolean(env.SPREADSHEET_ID),spreadsheetAccessible:accessible,missingSheets:missing};
    } else if(action==='catalog') {
      result=publicCatalog(await getCatalogItems(env));
    } else if(action==='orderCheck') {
      const id=String(params.get('reviewOrderId')||'');
      result={ok:true,exists:/^[A-Fa-f0-9]{24}$/.test(id)&&await existsOrderByReview(env,id)};
    } else if(action==='firstOrderCheck') {
      const phone=String(params.get('phone')||'').replace(/\D/g,'');
      if(phone.length<10||phone.length>13) result={ok:false,message:'Informe um telefone válido com DDD.'};
      else {
        await incrementRate(env,await hashHex(await crypto.subtle.digest('SHA-256',te.encode(phone))),12,900);
        result={ok:true,eligible:!(await phoneHasOrder(env,phone))};
      }
    } else if(action==='adminChallenge') {
      result=await adminChallenge(env);
    } else if(action==='adminLogin') {
      result=await adminLogin(env,Object.fromEntries(params.entries()));
    } else if(action==='adminData') {
      if(!await verifyAdminSession(env,params.get('token'))) result={ok:false,code:'SESSION_INVALID',message:'Sessão inválida ou expirada.'};
      else result=await getAdminData(env);
    } else if(action==='adminOperation') {
      const op=String(params.get('operationId')||'');
      const operacao=/^[A-Fa-f0-9-]{20,50}$/.test(op)
        ? JSON.parse(await requireState(env).get('admin-op:'+op)||'{"ok":false,"pending":true,"message":"Operação ainda não confirmada pelo servidor."}')
        : {ok:false,pending:false,message:'Identificação da operação inválida.'};
      // A alteração de senha invalida a sessão que iniciou a operação; ainda assim,
      // o chamador pode consultar o resultado específico dessa troca.
      if(!await verifyAdminSession(env,params.get('token')) && operacao.passwordChanged!==true) {
        result={ok:false,code:'SESSION_INVALID',message:'Sessão inválida ou expirada.'};
      } else {
        result=operacao;
      }
    } else if(action==='check') {
      const orderId=String(params.get('orderId')||'');
      if(!/^[A-Fa-f0-9]{24}$/.test(orderId)) result={ok:false,exists:false};
      else result={ok:true,exists:await existsReviewHash(env,await reviewHash(orderId,env))};
    } else if(action==='list') {
      result=await getPublicReviews(env);
    } else {
      result={ok:false,message:'Ação inválida.'};
    }
  } catch(error) {
    result={ok:false,code:'BACKEND_ERROR',message:clean(error&&error.message||error,200)||'Não foi possível processar a solicitação.'};
  }
  return callbackResponse(result,callback);
}
async function dispatchPost(request,env) {
  const params=await readRequestParams(request),action=String(params.action||'');
  try {
    let result;
    if(action==='registerOrder') {
      const payload=JSON.parse(String(params.payload||'{}'));
      if(String(params.website||'').trim()) result={ok:true};
      else {
        const phone=String(payload.customer?.phone||'').replace(/\D/g,'');
        await incrementRate(env,'order:'+await hashHex(await crypto.subtle.digest('SHA-256',te.encode(phone))),8,900);
        result=await recordOrder(env,payload);
      }
    } else if(action==='adminUpdateStatus'||action==='adminMarkNotification'||action==='adminSaveCatalog'||action==='adminChangePassword') {
      const opId=String(params.operationId||'');
      if(!/^[A-Fa-f0-9-]{20,50}$/.test(opId)) throw new Error('Identificação da operação inválida.');
      if(!await verifyAdminSession(env,params.token)) throw new Error('Sessão inválida ou expirada.');
      const payload=JSON.parse(String(params.payload||'{}'));
      if(action==='adminUpdateStatus') result=await updateOrderStatus(env,payload);
      else if(action==='adminMarkNotification') result=await markNotification(env,payload);
      else if(action==='adminSaveCatalog') result=await saveCatalogItem(env,payload);
      else {
        const password=String(payload.newPassword||'');
        if(password.length<8||password.length>128||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password)) throw new Error('Use uma senha de 8 a 128 caracteres, incluindo letras e números.');
        const state=requireState(env);
        await state.put('admin-password',password);
        const current=Number(await state.get('session-version')||'1');
        await state.put('session-version',String(current+1));
        result={ok:true,passwordChanged:true,message:'Senha alterada com sucesso. Faça login novamente com sua nova senha.'};
      }
      await requireState(env).put('admin-op:'+opId,JSON.stringify(result),{expirationTtl:300});
    } else {
      const payload=JSON.parse(String(params.payload||'{}'));
      if(String(params.website||payload.website||'').trim()) result={ok:true};
      else result=await submitReview(env,payload);
    }
    return jsonResponse(result,200,corsHeaders(request));
  } catch(error) {
    const failure={ok:false,message:clean(error&&error.message||error,180)||'Não foi possível concluir a operação.'};
    const opId=String(params.operationId||'');
    if(/^[A-Fa-f0-9-]{20,50}$/.test(opId)) {
      try{await requireState(env).put('admin-op:'+opId,JSON.stringify(failure),{expirationTtl:300});}catch{}
    }
    return jsonResponse(failure,200,corsHeaders(request));
  }
}
export default {
  async fetch(request,env) {
    const headers=corsHeaders(request);
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers});
    const path=new URL(request.url).pathname;
    if(path==='/health'&&request.method==='GET') {
      return callbackResponse(await (async()=>{try{return {ok:true,service:'Tempero da Ilma API independente',apiVersion:API_VERSION,spreadsheetConfigured:Boolean(env.SPREADSHEET_ID),spreadsheetAccessible:!!(await getSheetIds(env))};}catch(e){return {ok:false,message:clean(e.message,180)};}})(),'');
    }
    if(request.method==='GET') {
      const response=await handleGet(request,env);
      const merged=new Headers(response.headers);
      for(const [k,v] of Object.entries(headers)) merged.set(k,v);
      return new Response(response.body,{status:response.status,headers:merged});
    }
    if(request.method==='POST') {
      if(!env.OPERATIONS) return jsonResponse({ok:false,message:'O Durable Object OPERATIONS não está configurado.'},503,headers);
      const coordinator=env.OPERATIONS.get(env.OPERATIONS.idFromName('tempero-global'));
      return coordinator.fetch(request);
    }
    return jsonResponse({ok:false,message:'Método não permitido.'},405,headers);
  }
};

export class OperationsCoordinator {
  constructor(ctx,env) {
    this.ctx=ctx;
    this.env=env;
    this.queue=Promise.resolve();
  }
  fetch(request) {
    const run=this.queue.then(()=>this.handle(request));
    this.queue=run.then(()=>undefined,()=>undefined);
    return run;
  }
  async handle(request) {
    const url=new URL(request.url);
    if(url.pathname.startsWith('/state/')) {
      try {
        const params=await request.json(),state=directState(this.ctx);
        let value=null;
        if(url.pathname==='/state/get') value=await state.get(params.key);
        else if(url.pathname==='/state/put') {await state.put(params.key,params.value,{expirationTtl:params.expirationTtl});value=true;}
        else if(url.pathname==='/state/delete') {await state.delete(params.key);value=true;}
        else if(url.pathname==='/state/consume') value=await state.consume(params.key);
        else if(url.pathname==='/state/increment') value=await state.increment(params.key,params.limit,params.ttl);
        else return jsonResponse({ok:false,message:'Operação de estado desconhecida.'},404);
        return jsonResponse({ok:true,value});
      } catch(error) {
        return jsonResponse({ok:false,message:clean(error&&error.message||error,180)},400);
      }
    }
    const serializedEnv=Object.assign({},this.env,{STATE:directState(this.ctx)});
    return dispatchPost(request,serializedEnv);
  }
  async alarm() {
    const entries=await this.ctx.storage.list({prefix:'state:'});
    let next=0;
    for(const [key,item] of entries) {
      if(item&&item.expiresAt&&item.expiresAt<=Date.now()) await this.ctx.storage.delete(key);
      else if(item&&item.expiresAt&&(!next||item.expiresAt<next)) next=item.expiresAt;
    }
    if(next) await this.ctx.storage.setAlarm(Math.max(Date.now()+1000,next));
  }
};


export const __test = Object.freeze({fixedCatalogDefinitions,publicCatalog,validateOrderPayload,reviewDate,safeSheetText,deliveryDateSaturday});
