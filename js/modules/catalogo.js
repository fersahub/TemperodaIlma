/* Carrega os preços e a disponibilidade oficiais do catálogo central. */
(function(){
  const API=window.TEMPERO_CONFIG&&window.TEMPERO_CONFIG.avaliacoes&&window.TEMPERO_CONFIG.avaliacoes.apiUrl;
  const CACHE_KEY='tempero_catalogo_comercial_v1';
  const REQUIRED_COMBOS=['combo-5-350g','combo-10-350g','combo-5-500g','combo-10-500g','combo-5-300g-fit','combo-10-300g-fit'];
  const REQUIRED_AVULSAS=[
    {id:'avulsa-tradicional-350g',key:'Tradicional|350g'},
    {id:'avulsa-tradicional-500g',key:'Tradicional|500g'},
    {id:'avulsa-fit-300g',key:'Linha Fit|300g'}
  ];
  window.TEMPERO_CATALOGO_STATUS='loading';
  window.TEMPERO_PRECOS_AVULSAS={};
  function aviso(status,message){
    window.TEMPERO_CATALOGO_STATUS=status;
    const el=document.getElementById('catalog-price-status');
    if(!el)return;
    if(!message){el.hidden=true;el.textContent='';return;}
    el.hidden=false;el.textContent=message;el.dataset.state=status;
  }
  function jsonp(){
    return new Promise((resolve,reject)=>{
      if(!API)return reject(new Error('Endpoint não configurado.'));
      const callback='tempCatalog_'+Date.now()+'_'+Math.floor(Math.random()*100000);
      const script=document.createElement('script'),query=new URLSearchParams({action:'catalog',callback});
      let finished=false,called=false;
      const finish=(error,data)=>{
        if(finished)return;finished=true;
        try{delete window[callback];}catch(e){window[callback]=undefined;}
        script.remove();clearTimeout(timer);
        if(error)reject(error);else resolve(data);
      };
      window[callback]=data=>{called=true;finish(null,data);};
      script.onerror=()=>finish(new Error('Não foi possível carregar o catálogo do servidor.'));
      script.onload=()=>{if(!called)finish(new Error('O servidor não retornou o catálogo esperado.'));};
      const timer=setTimeout(()=>finish(new Error('Tempo esgotado ao consultar os preços.')),12000);
      script.src=API+(API.includes('?')?'&':'?')+query.toString();
      script.async=true;document.head.appendChild(script);
    });
  }
  function validar(data){
    if(!data||data.ok!==true||!Array.isArray(data.combos)||!Array.isArray(data.avulsas))return false;
    return REQUIRED_COMBOS.every(id=>data.combos.some(x=>x&&x.id===id&&Number.isFinite(Number(x.price))&&Number(x.price)>0&&typeof x.active==='boolean')) &&
      REQUIRED_AVULSAS.every(def=>data.avulsas.some(x=>x&&x.id===def.id&&Number.isFinite(Number(x.price))&&Number(x.price)>0&&typeof x.active==='boolean'));
  }
  function aplicar(data){
    if(!validar(data))throw new Error('O catálogo retornado está incompleto ou inválido.');
    const combosData=new Map(data.combos.map(item=>[item.id,item]));
    combos.forEach(combo=>{
      const remoto=combosData.get(combo.id);
      if(!remoto)throw new Error('Faltou o preço de '+combo.id+'.');
      combo.price=Number(remoto.price);combo.ativo=remoto.active===true;
    });
    const avulsasData=new Map(data.avulsas.map(item=>[item.id,item]));
    window.TEMPERO_PRECOS_AVULSAS={};
    REQUIRED_AVULSAS.forEach(def=>{
      const item=avulsasData.get(def.id);
      window.TEMPERO_PRECOS_AVULSAS[def.key]={price:Number(item.price),active:item.active===true};
    });
    atualizarCarrinho();
  }
  function atualizarCarrinho(){
    try{
      if(typeof cartCombos!=='undefined'){
        cartCombos=cartCombos.filter(item=>combos.some(combo=>combo.id===item.comboId&&combo.ativo!==false)).map(item=>{
          const combo=combos.find(entry=>entry.id===item.comboId);
          return {...item,name:combo.name,price:combo.price,qty:combo.qty};
        });
        if(!cartCombos.length&&typeof cartAvulsas!=='undefined')cartAvulsas=[];
      }
      if(typeof cartAvulsas!=='undefined'&&typeof normalizarListaAvulsas==='function')
        cartAvulsas=cartCombos.length?normalizarListaAvulsas(cartAvulsas):[];
      if(typeof salvarCarrinho==='function')salvarCarrinho();
      if(typeof updateCartUI==='function')updateCartUI();
    }catch(error){/* O checkout também valida os valores no servidor. */}
    if(typeof renderCombos==='function')renderCombos();
    if(typeof renderAvulsasDisplay==='function')renderAvulsasDisplay();
    if(typeof renderFlavorsDisplay==='function')renderFlavorsDisplay();
  }
  function aplicarCacheComAviso(){
    try{
      const saved=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
      if(!saved||!saved.data||Date.now()-Number(saved.savedAt||0)>24*60*60*1000)return false;
      aplicar(saved.data);
      aviso('cached','Estamos exibindo o último catálogo salvo neste aparelho. Reconecte-se e atualize a página para confirmar os preços atuais antes de enviar um pedido.');
      return true;
    }catch(error){return false;}
  }
  async function iniciarCatalogoPublico(){
    aviso('loading','Atualizando preços e disponibilidade do cardápio…');
    try{
      const data=await jsonp();
      if(data&&data.ok===false&&/ação inválida|acao invalida|invalid action/i.test(String(data.message||''))){aviso('legacy','');return;}
      if(!validar(data))throw new Error(data&&data.message||'O catálogo recebido não passou na validação.');
      aplicar(data);
      try{localStorage.setItem(CACHE_KEY,JSON.stringify({data,savedAt:Date.now()}));}catch(error){}
      aviso('ready','');
    }catch(error){
      if(aplicarCacheComAviso())return;
      aviso('error','Não foi possível confirmar os preços atuais. Atualize a página quando a conexão retornar. Por segurança, o envio de novos pedidos ficará temporariamente bloqueado.');
    }
  }
  window.iniciarCatalogoPublico=iniciarCatalogoPublico;
  window.TEMPERO_CATALOGO_ATUALIZAR=atualizarCarrinho;
})();
