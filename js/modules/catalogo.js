/* Carrega os preços e a disponibilidade oficiais do catálogo central. */
(function(){
  const API=window.TEMPERO_CONFIG&&window.TEMPERO_CONFIG.avaliacoes&&window.TEMPERO_CONFIG.avaliacoes.apiUrl;
  const CACHE_KEY='tempero_catalogo_comercial_v2';
  const REQUIRED_COMBOS=['combo-5-350g','combo-10-350g','combo-5-500g','combo-10-500g','combo-5-300g-fit','combo-10-300g-fit'];
  const pratos=Array.isArray(window.TEMPERO_DADOS&&window.TEMPERO_DADOS.pratos)?window.TEMPERO_DADOS.pratos:[];
  const REQUIRED_AVULSAS=pratos.filter(prato=>prato&&!prato.emBreve&&prato.disponivel!==false&&['Tradicional','Linha Fit'].includes(prato.tag))
    .flatMap(prato=>(prato.tag==='Linha Fit'?['300g']:['350g','500g']).map(size=>({
      id:'avulsa-'+prato.id+'-'+size,flavorId:prato.id,size,key:prato.id+'|'+size
    })));
  window.TEMPERO_CATALOGO_STATUS='loading';
  window.TEMPERO_CATALOGO_TENTATIVA_INICIAL_CONCLUIDA=false;
  window.TEMPERO_PRECOS_AVULSAS={};
  window.TEMPERO_CATALOGO_CARREGADO=false;
  let catalogoEmAtualizacao=false;
  function aviso(status,message){
    window.TEMPERO_CATALOGO_STATUS=status;
    // O Pix só pode aparecer depois que o catálogo oficial estiver confirmado.
    if(typeof atualizarPixBox==='function'){try{atualizarPixBox();}catch(error){}}
    const el=document.getElementById('catalog-price-status');
    if(!el)return;
    if(!message){el.hidden=true;el.textContent='';return;}
    el.hidden=false;el.textContent=message;el.dataset.state=status;
  }
  function jsonp(){
    return new Promise((resolve,reject)=>{
      if(!API)return reject(new Error('Endpoint não configurado.'));
      const callback='tempCatalog_'+Date.now()+'_'+Math.floor(Math.random()*100000);
      const script=document.createElement('script'),query=new URLSearchParams({action:'catalog',callback,_:String(Date.now())});
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
  function diagnosticar(data){
    if(!data||data.ok!==true)return data&&data.message?'Resposta do servidor: '+String(data.message).slice(0,140):'O servidor não confirmou o catálogo (ok=true).';
    if(!Array.isArray(data.combos)||!Array.isArray(data.avulsas))return 'A resposta não contém as listas de combos e marmitas avulsas.';
    for(const id of REQUIRED_COMBOS){
      const item=data.combos.find(x=>x&&x.id===id);
      if(!item)return 'Combo ausente no catálogo: '+id+'.';
      if(!Number.isFinite(Number(item.price))||Number(item.price)<=0)return 'Preço inválido para o combo '+id+'.';
      if(typeof item.active!=='boolean')return 'Disponibilidade inválida para o combo '+id+'.';
    }
    if(!REQUIRED_AVULSAS.length)return 'A lista de marmitas do aplicativo não foi carregada.';
    for(const def of REQUIRED_AVULSAS){
      const item=data.avulsas.find(x=>x&&x.id===def.id);
      if(!item)return 'Marmita avulsa ausente no servidor: '+def.id+'.';
      if(item.flavorId!==def.flavorId||item.size!==def.size)return 'Identificação divergente para a marmita '+def.id+'.';
      if(!Number.isFinite(Number(item.price))||Number(item.price)<=0)return 'Preço inválido para a marmita '+def.id+'.';
      if(typeof item.active!=='boolean')return 'Disponibilidade inválida para a marmita '+def.id+'.';
    }
    return '';
  }
  function validar(data){return diagnosticar(data)==='';}
  function aplicar(data){
    if(!validar(data))throw new Error(diagnosticar(data));
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
    window.TEMPERO_CATALOGO_CARREGADO=true;
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
    if(catalogoEmAtualizacao)return;
    catalogoEmAtualizacao=true;
    aviso('loading','Atualizando preços e disponibilidade do cardápio…');
    try{
      const data=await jsonp();
      if(data&&data.ok===false&&/ação inválida|acao invalida|invalid action/i.test(String(data.message||''))){aviso('legacy','');return;}
      if(!validar(data))throw new Error(diagnosticar(data));
      aplicar(data);
      try{localStorage.setItem(CACHE_KEY,JSON.stringify({data,savedAt:Date.now()}));}catch(error){}
      aviso('ready','');
    }catch(error){
      if(aplicarCacheComAviso())return;
      window.TEMPERO_CATALOGO_ULTIMO_ERRO=String(error&&error.message||error||'Falha desconhecida');
      console.error('[Tempero da Ilma] Falha ao atualizar catálogo:',window.TEMPERO_CATALOGO_ULTIMO_ERRO);
      aviso('error','Não foi possível confirmar os preços atuais. Atualize a página quando a conexão retornar. Por segurança, o envio de novos pedidos ficará temporariamente bloqueado. Diagnóstico: '+window.TEMPERO_CATALOGO_ULTIMO_ERRO.slice(0,180));
    }finally{
      // Depois da primeira resposta, uma nova tentativa em segundo plano não pode travar o pré-pedido.
      window.TEMPERO_CATALOGO_TENTATIVA_INICIAL_CONCLUIDA=true;
      catalogoEmAtualizacao=false;
    }
  }
  function iniciarAtualizacaoAutomaticaCatalogo(){
    if(window.TEMPERO_CATALOGO_TIMER)return;
    window.TEMPERO_CATALOGO_TIMER=window.setInterval(()=>{
      if(document.visibilityState!=='visible')return;
      const temItensNoCarrinho=(typeof cartCombos!=='undefined'&&Array.isArray(cartCombos)&&cartCombos.length>0)||
        (typeof cartAvulsas!=='undefined'&&Array.isArray(cartAvulsas)&&cartAvulsas.length>0);
      // Não alterar preços ou disponibilidade enquanto o cliente estiver montando um pedido.
      if(temItensNoCarrinho)return;
      iniciarCatalogoPublico();
    },60000);
  }
  window.iniciarCatalogoPublico=iniciarCatalogoPublico;
  window.iniciarAtualizacaoAutomaticaCatalogo=iniciarAtualizacaoAutomaticaCatalogo;
  window.TEMPERO_CATALOGO_ATUALIZAR=atualizarCarrinho;
})();
