(() => {
  const API = window.TEMPERO_CONFIG && window.TEMPERO_CONFIG.avaliacoes && window.TEMPERO_CONFIG.avaliacoes.apiUrl;
  const $ = id => document.getElementById(id);
  let token = sessionStorage.getItem('tempero_admin_token') || '';
  let orders = [];
  let statuses = [];
  let currentOrder = null;
  let toastTimer = null;

  function escapar(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
  function moeda(value) {
    return Number(value || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  }
  function toast(message) {
    const el=$('admin-toast'); el.textContent=message; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),3600);
  }
  function jsonp(action, params) {
    return new Promise((resolve,reject)=>{
      if(!API) return reject(new Error('Endpoint do Apps Script não configurado.'));
      const callback='adminJsonp_'+Date.now()+'_'+Math.floor(Math.random()*1000000);
      const script=document.createElement('script');
      const query=new URLSearchParams(Object.assign({action,callback},params||{}));
      let finished=false;
      const finish=(error,value)=>{
        if(finished)return; finished=true;
        try{delete window[callback];}catch(e){window[callback]=undefined;}
        script.remove(); clearTimeout(timer);
        if(error)reject(error);else resolve(value);
      };
      window[callback]=value=>finish(null,value);
      script.onerror=()=>finish(new Error('Não foi possível conectar ao Google Apps Script.'));
      script.src=API+'?'+query.toString(); script.async=true; document.head.appendChild(script);
      const timer=setTimeout(()=>finish(new Error('O serviço não respondeu. Confira a implantação do Apps Script.')),12000);
    });
  }
  async function gerarProvaHmac(password, nonce) {
    if(!window.crypto || !window.crypto.subtle) throw new Error('Este navegador não oferece criptografia segura. Abra o painel pelo endereço HTTPS.');
    const encoder=new TextEncoder();
    const key=await crypto.subtle.importKey('raw',encoder.encode(password),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const signed=await crypto.subtle.sign('HMAC',key,encoder.encode(nonce));
    const bytes=new Uint8Array(signed);
    let binary=''; bytes.forEach(value=>binary+=String.fromCharCode(value));
    return btoa(binary);
  }
  async function entrar(event) {
    event.preventDefault();
    const button=$('login-button'), message=$('login-message');
    const password=$('admin-password').value;
    message.textContent='';
    if(password.length<24){message.textContent='A senha-frase precisa ter pelo menos 24 caracteres.';return;}
    button.disabled=true; button.textContent='Validando…';
    try {
      const challenge=await jsonp('adminChallenge',{});
      if(!challenge || !challenge.ok || !challenge.nonce) throw new Error('Não foi possível iniciar a autenticação.');
      const proof=await gerarProvaHmac(password,challenge.nonce);
      const auth=await jsonp('adminLogin',{nonce:challenge.nonce,proof});
      if(!auth || !auth.ok || !auth.token) throw new Error(auth && auth.message || 'Acesso não autorizado.');
      token=auth.token; sessionStorage.setItem('tempero_admin_token',token);
      $('admin-password').value='';
      await carregarPainel();
    } catch(error) {
      message.textContent=error.message || 'Não foi possível entrar.';
    } finally {
      button.disabled=false; button.textContent='Entrar no painel';
    }
  }
  async function carregarPainel() {
    try {
      const data=await jsonp('adminData',{token});
      if(!data || !data.ok) throw new Error(data && data.message || 'Sessão inválida.');
      orders=Array.isArray(data.orders)?data.orders:[];
      statuses=Array.isArray(data.statuses)?data.statuses:[];
      $('login-view').hidden=true; $('dashboard-view').hidden=false; $('top-actions').hidden=false;
      $('spreadsheet-link').href=data.spreadsheetUrl || '#';
      renderStats(data.stats || {});
      renderFilterOptions();
      renderOrders();
    } catch(error) {
      if(/sessão|expirada|inválida/i.test(error.message)) sair();
      else toast(error.message || 'Não foi possível carregar os pedidos.');
    }
  }
  function renderStats(stats) {
    $('stat-total').textContent=stats.total || 0;
    $('stat-awaiting').textContent=stats.awaiting || 0;
    $('stat-progress').textContent=stats.inProgress || 0;
    $('stat-delivery').textContent=stats.outForDelivery || 0;
  }
  function renderFilterOptions() {
    const select=$('filter-status'), current=select.value;
    select.innerHTML='<option value="">Todos os status</option>'+statuses.map(s=>'<option value="'+escapar(s)+'">'+escapar(s)+'</option>').join('');
    select.value=current;
  }
  function renderOrders() {
    const query=$('search-orders').value.trim().toLocaleLowerCase('pt-BR');
    const status=$('filter-status').value;
    const filtered=orders.filter(o=>{
      const text=[o.id,o.name,o.phone,o.neighborhood].join(' ').toLocaleLowerCase('pt-BR');
      return (!query||text.includes(query))&&(!status||o.status===status);
    });
    $('orders-caption').textContent=filtered.length+' pedido(s) nesta visualização';
    if(!filtered.length) {
      $('orders-list').innerHTML='<div class="empty-state">Nenhum pedido encontrado para este filtro.</div>';return;
    }
    $('orders-list').innerHTML=filtered.map(o=>
      '<article class="order-card">'+
        '<div class="order-main"><strong>'+escapar(o.id)+'</strong><small>'+escapar(o.createdAt||'Data não informada')+'</small></div>'+
        '<div class="order-customer"><strong>'+escapar(o.name)+'</strong><small>'+escapar(o.neighborhood)+' · '+escapar(o.phone)+'</small></div>'+
        '<div class="order-value"><strong>'+moeda(o.total)+'</strong><small>'+escapar(o.payment)+'</small></div>'+
        '<div class="order-status"><span class="status-pill" data-status="'+escapar(o.status)+'">'+escapar(o.status)+'</span></div>'+
        '<button class="order-open" type="button" onclick="AdminPainel.abrirPedido(\''+escapar(o.id)+'\')">Ver pedido</button>'+
      '</article>'
    ).join('');
  }
  function abrirPedido(id) {
    currentOrder=orders.find(o=>o.id===id);
    if(!currentOrder)return;
    renderDetail();
    $('order-modal').hidden=false;
    document.body.classList.add('modal-open');
    $('order-modal').querySelector('.icon-button').focus();
  }
  function renderDetail() {
    const o=currentOrder;
    const address=[o.street,o.number,o.complement,o.neighborhood,o.city].filter(Boolean).join(', ');
    const items=(o.items||[]).map(item=>
      '<div class="item-line"><div><strong>'+escapar(item.kind==='Combo'?item.name:item.name+' ('+item.size+')')+'</strong>'+
      (item.kind==='Combo'?'<small>'+escapar(item.flavorSummary||'')+'</small>':'')+
      '<small>'+Number(item.quantity||0)+' unidade(s)'+(item.obs?' · '+escapar(item.obs):'')+'</small></div>'+
      '<strong>'+moeda(item.total)+'</strong></div>'
    ).join('') || '<p>Nenhum item detalhado foi encontrado.</p>';
    const statusOptions=statuses.map(s=>'<option value="'+escapar(s)+'" '+(s===o.status?'selected':'')+'>'+escapar(s)+'</option>').join('');
    let notice='';
    if(o.lastNotification) {
      notice='<section class="message-box"><h3>Mensagem de atualização</h3>'+
        '<p>Situação: '+escapar(o.lastNotification.status)+' · '+escapar(o.lastNotification.createdAt)+'</p>'+
        '<div class="message-preview">'+escapar(o.lastNotification.message)+'</div>'+
        '<div class="message-actions">'+
          '<button class="button button-ghost" type="button" onclick="AdminPainel.copiarMensagem()">Copiar mensagem</button>'+
          (o.notificationsOptIn?'<button class="button button-primary" type="button" onclick="AdminPainel.abrirWhatsApp()">Abrir WhatsApp</button>':'')+
        '</div>'+
        (!o.notificationsOptIn?'<p class="muted-note">O cliente não marcou a opção de receber atualizações. A mensagem pode ser copiada para uso como resposta em uma conversa já iniciada pelo cliente; não abra uma conversa proativa sem autorização.</p>':'<p class="muted-note">O WhatsApp será aberto com o texto pronto. A equipe ainda precisa tocar em Enviar; o painel não consegue confirmar o envio.</p>')+
      '</section>';
    }
    $('detail-title').textContent=o.id;
    $('order-detail').innerHTML=
      '<div class="detail-grid">'+
        '<section class="detail-box"><h3>Cliente</h3><p><strong>'+escapar(o.name)+'</strong></p><p>'+escapar(o.phone)+'</p>'+
          '<p>'+ (o.notificationsOptIn?'Autorizou atualizações pelo WhatsApp':'Não autorizou notificações')+'</p></section>'+
        '<section class="detail-box"><h3>Entrega</h3><p>'+escapar(address)+'</p><p>CEP: '+escapar(o.cep||'—')+'</p><p>Data prevista: '+escapar(o.deliveryDate||'A confirmar')+'</p></section>'+
        '<section class="detail-box"><h3>Pagamento</h3><p>'+escapar(o.payment)+'</p><p>Troco: '+escapar(o.changeFor||'Não informado')+'</p></section>'+
        '<section class="detail-box"><h3>Resumo</h3><p>Subtotal: '+moeda(o.subtotal)+'</p><p>Frete: '+moeda(o.shipping)+'</p><p><strong>Total: '+moeda(o.total)+'</strong></p></section>'+
        '<section class="detail-box full"><h3>Itens do pedido</h3>'+items+'<div class="detail-total">Total: '+moeda(o.total)+'</div></section>'+
        '<section class="detail-box full"><h3>Observações do cliente</h3><p>'+escapar(o.observations||'Nenhuma observação.')+'</p></section>'+
      '</div>'+
      '<form class="status-form" id="status-form">'+
        '<strong>Atualizar andamento</strong>'+
        '<label for="new-status">Novo status</label><select id="new-status">'+statusOptions+'</select>'+
        '<label for="internal-note">Observação interna (opcional)</label><textarea id="internal-note" maxlength="300" placeholder="Anotação para o histórico interno"></textarea>'+
        '<button class="button button-primary button-full" type="submit" id="save-status">Salvar status e preparar aviso</button>'+
        '<p class="muted-note">Ao alterar o status, o sistema registra a mudança e prepara uma mensagem para o cliente. O envio não é automático.</p>'+
      '</form>'+notice;
    $('status-form').addEventListener('submit',salvarStatus);
  }
  function fecharPedido() {
    $('order-modal').hidden=true; document.body.classList.remove('modal-open'); currentOrder=null;
  }
  async function postarAcao(action,payload) {
    const operationId=crypto.randomUUID();
    const body=new URLSearchParams({
      action,token,operationId,payload:JSON.stringify(payload||{})
    });
    await fetch(API,{method:'POST',mode:'no-cors',body});
    for(let tentativa=0;tentativa<8;tentativa++) {
      await new Promise(resolve=>setTimeout(resolve,700));
      const result=await jsonp('adminOperation',{token,operationId});
      if(result && !result.pending) {
        if(!result.ok) throw new Error(result.message||'A operação não foi concluída.');
        return result;
      }
    }
    throw new Error('Não foi possível confirmar a atualização. Atualize a lista antes de repetir.');
  }
  async function salvarStatus(event) {
    event.preventDefault();
    if(!currentOrder)return;
    const button=$('save-status');button.disabled=true;button.textContent='Salvando…';
    try {
      const result=await postarAcao('adminUpdateStatus',{
        orderId:currentOrder.id,status:$('new-status').value,note:$('internal-note').value
      });
      toast(result.message||'Status atualizado.');
      await carregarPainel();
      currentOrder=orders.find(o=>o.id===currentOrder.id)||null;
      if(currentOrder)renderDetail();
    } catch(error) {
      toast(error.message||'Não foi possível atualizar o pedido.');
    } finally {
      button.disabled=false;button.textContent='Salvar status e preparar aviso';
    }
  }
  function copiarMensagem() {
    if(!currentOrder||!currentOrder.lastNotification)return;
    const text=currentOrder.lastNotification.message;
    if(navigator.clipboard&&navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(()=>toast('Mensagem copiada.')).catch(()=>fallbackCopy(text));
    } else fallbackCopy(text);
  }
  function fallbackCopy(text) {
    const area=document.createElement('textarea');area.value=text;document.body.appendChild(area);area.select();
    const ok=document.execCommand('copy');area.remove();toast(ok?'Mensagem copiada.':'Não foi possível copiar a mensagem.');
  }
  async function abrirWhatsApp() {
    if(!currentOrder||!currentOrder.lastNotification||!currentOrder.notificationsOptIn)return;
    const phone=String(currentOrder.phone||'').replace(/\D/g,'');
    if(phone.length<10){toast('Telefone inválido para abrir o WhatsApp.');return;}
    const url='https://wa.me/'+phone+'?text='+encodeURIComponent(currentOrder.lastNotification.message);
    window.open(url,'_blank','noopener');
    try {
      await postarAcao('adminMarkNotification',{notificationId:currentOrder.lastNotification.id});
      toast('WhatsApp aberto. Confirme manualmente o envio da mensagem.');
      await carregarPainel();
      currentOrder=orders.find(o=>o.id===currentOrder.id)||currentOrder;
      if(currentOrder)renderDetail();
    } catch(error) {
      toast('WhatsApp aberto; não foi possível atualizar o histórico da notificação.');
    }
  }
  function sair() {
    token='';sessionStorage.removeItem('tempero_admin_token');
    $('dashboard-view').hidden=true;$('top-actions').hidden=true;$('login-view').hidden=false;
    fecharPedido();
  }
  async function atualizar(){await carregarPainel();toast('Painel atualizado.');}

  document.addEventListener('DOMContentLoaded',async()=>{
    $('login-form').addEventListener('submit',entrar);
    $('search-orders').addEventListener('input',renderOrders);
    $('filter-status').addEventListener('change',renderOrders);
    if(token) await carregarPainel();
  });
  window.AdminPainel={abrirPedido,fecharPedido,atualizar,sair,copiarMensagem,abrirWhatsApp};
})();