(() => {
  const API = window.TEMPERO_CONFIG && window.TEMPERO_CONFIG.avaliacoes && window.TEMPERO_CONFIG.avaliacoes.apiUrl;
  const $ = id => document.getElementById(id);
  let token = sessionStorage.getItem('tempero_admin_token') || '';
  let orders = [];
  let statuses = [];
  let catalog = [];
  let currentOrder = null;
  let toastTimer = null;
  let carregandoPainel = false;
  let refreshIntervalId = null;
  let abaAtiva = 'orders';

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
      if(!API) return reject(new Error('Endpoint do Apps Script não configurado em js/config/loja.js.'));
      const callback='adminJsonp_'+Date.now()+'_'+Math.floor(Math.random()*1000000);
      const script=document.createElement('script');
      const query=new URLSearchParams(Object.assign({action,callback},params||{}));
      let finished=false,callbackExecutado=false;
      const finish=(error,value)=>{
        if(finished)return; finished=true;
        try{delete window[callback];}catch(e){window[callback]=undefined;}
        script.remove(); clearTimeout(timer);
        if(error)reject(error);else resolve(value);
      };
      window[callback]=value=>{callbackExecutado=true;finish(null,value);};
      script.onerror=()=>finish(new Error('O navegador não conseguiu carregar o Apps Script. Confira se a implantação é um App da Web, executa como proprietário e permite acesso a qualquer pessoa.'));
      script.onload=()=>{
        if(!callbackExecutado) finish(new Error('O endereço do Apps Script respondeu, mas não executou a resposta JSONP. A URL pode apontar para uma implantação antiga ou para outro projeto.'));
      };
      const timer=setTimeout(()=>finish(new Error('O Apps Script não respondeu em 15 segundos. Verifique a URL /exec, o acesso público e a implantação ativa.')),15000);
      const separator=API.indexOf('?')>=0?'&':'?';
      script.src=API+separator+query.toString();
      script.async=true;
      document.head.appendChild(script);
    });
  }

  function mostrarEstadoConexao(message, tipo) {
    const status=$('api-status');
    if(!status)return;
    status.textContent=message;
    status.dataset.state=tipo||'info';
  }

  async function testarConexao() {
    const button=$('api-test-button');
    if(button){button.disabled=true;button.textContent='Verificando…';}
    mostrarEstadoConexao('Verificando comunicação com o Apps Script…','info');
    try {
      const health=await jsonp('health',{});
      if(!health || health.ok!==true) {
        const detail=String(health && health.message || '').trim();
        if(/ação inválida|invalid action/i.test(detail)) {
          throw new Error('A URL configurada aponta para uma implantação antiga ou para outro projeto. Na aba Implantações, confira a URL /exec e compare o ID com o endereço em js/config/loja.js.');
        }
        throw new Error(detail || 'O Apps Script não confirmou a disponibilidade do serviço.');
      }
      if(health.apiVersion!=='2026.11.20.7') {
        throw new Error('A implantação respondeu com uma versão diferente da esperada ('+String(health.apiVersion||'sem versão')+'). Publique uma nova versão do Code.gs na implantação cujo ID corresponde ao endereço do site.');
      }
      if(!health.adminConfigured) {
        throw new Error('O Apps Script está atualizado, mas a senha administrativa não está configurada neste projeto. Não gere outra senha ainda; primeiro confira se esta é a implantação correta.');
      }
      if(!health.spreadsheetConfigured) {
        throw new Error('O Apps Script está atualizado, mas não tem uma planilha vinculada. Confira a propriedade da planilha antes de executar a configuração para evitar criar uma planilha duplicada.');
      }
      if(!health.spreadsheetAccessible) {
        throw new Error(health.spreadsheetError || 'O Apps Script não consegue acessar a planilha configurada. Verifique as autorizações da conta proprietária.');
      }
      if(Array.isArray(health.missingSheets) && health.missingSheets.length) {
        throw new Error('A planilha existe, mas faltam estas abas: '+health.missingSheets.join(', ')+'. Execute configurarSistemaAvaliacoes() no projeto correto para completar a estrutura.');
      }
      const challenge=await jsonp('adminChallenge',{});
      if(!challenge || challenge.ok!==true || !/^[A-Fa-f0-9]{64}$/.test(String(challenge.nonce||''))) {
        throw new Error(String(challenge && challenge.message || 'O Apps Script não conseguiu iniciar o desafio de autenticação.'));
      }
      mostrarEstadoConexao('Conexão confirmada · Apps Script '+health.apiVersion+'.','ok');
      return true;
    } catch(error) {
      mostrarEstadoConexao(error.message || 'Não foi possível verificar o Apps Script.','error');
      return false;
    } finally {
      if(button){button.disabled=false;button.textContent='Testar conexão';}
    }
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
    if(password.length<8 || password.length>128 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)){message.textContent='Use uma senha de 8 a 128 caracteres, incluindo letras e números.';return;}
    button.disabled=true; button.textContent='Validando…';
    try {
      const challenge=await jsonp('adminChallenge',{});
      if(!challenge || challenge.ok !== true || !/^[A-Fa-f0-9]{64}$/.test(String(challenge.nonce || ''))) {
        const motivo=String(challenge && challenge.message || '').trim();
        if(/ação inválida|invalid action/i.test(motivo)) {
          throw new Error('O Google Apps Script está respondendo, mas a implantação conectada ainda não reconhece a autenticação administrativa. Atualize o Code.gs no mesmo projeto e publique uma nova versão do App da Web.');
        }
        if(motivo) throw new Error('O Google Apps Script recusou o início da autenticação: '+motivo);
        throw new Error('O Google Apps Script respondeu sem fornecer o desafio de autenticação. Confira se o Code.gs atualizado foi publicado no mesmo endereço configurado no site.');
      }
      const proof=await gerarProvaHmac(password,challenge.nonce);
      const auth=await jsonp('adminLogin',{nonce:challenge.nonce,proof});
      if(!auth || !auth.ok || !auth.token) throw new Error(auth && auth.message || 'Acesso não autorizado.');
      token=auth.token; sessionStorage.setItem('tempero_admin_token',token);
      $('admin-password').value='';
      await carregarPainel();
    } catch(error) {
      message.textContent=error.message || 'Não foi possível entrar.';
      mostrarEstadoConexao(error.message || 'Falha ao autenticar.','error');
    } finally {
      button.disabled=false; button.textContent='Entrar no painel';
    }
  }
  async function carregarPainel(opcoes = {}) {
    if (carregandoPainel || !token) return false;
    carregandoPainel = true;
    try {
      const data=await jsonp('adminData',{token});
      if(!data || !data.ok) throw new Error(data && data.message || 'Sessão inválida.');
      orders=Array.isArray(data.orders)?data.orders:[];
      statuses=Array.isArray(data.statuses)?data.statuses:[];
      catalog=Array.isArray(data.catalog)?data.catalog:[];
      $('login-view').hidden=true; $('dashboard-view').hidden=false; $('top-actions').hidden=false;
      ativarAba(abaAtiva);
      $('spreadsheet-link').href=data.spreadsheetUrl || '#';
      renderStats(data.stats || {});
      renderCatalog();
      renderFilterOptions();
      renderOrders();
      const atualizadoEm = new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      const indicador = $('last-updated');
      if(indicador) indicador.textContent=atualizadoEm;
      return true;
    } catch(error) {
      if(/sessão|expirada|inválida/i.test(error.message)) sair();
      else if(!opcoes.silencioso) toast(error.message || 'Não foi possível carregar os pedidos.');
      return false;
    } finally {
      carregandoPainel = false;
    }
  }

  function ativarAba(nome, focar=false) {
    if(!['catalog','orders'].includes(nome)) return;
    abaAtiva=nome;
    const botoes=Array.from(document.querySelectorAll('[data-admin-tab]'));
    botoes.forEach(botao=>{
      const selecionado=botao.dataset.adminTab===nome;
      botao.setAttribute('aria-selected',String(selecionado));
      botao.tabIndex=selecionado?0:-1;
    });
    $('catalog-tab-panel').hidden=nome!=='catalog';
    $('orders-tab-panel').hidden=nome!=='orders';
    if(focar) {
      const ativo=botoes.find(botao=>botao.dataset.adminTab===nome);
      if(ativo)ativo.focus();
    }
  }
  function iniciarAbas() {
    const botoes=Array.from(document.querySelectorAll('[data-admin-tab]'));
    botoes.forEach((botao,index)=>{
      botao.addEventListener('click',()=>ativarAba(botao.dataset.adminTab));
      botao.addEventListener('keydown',event=>{
        let proximo=index;
        if(event.key==='ArrowRight')proximo=(index+1)%botoes.length;
        else if(event.key==='ArrowLeft')proximo=(index-1+botoes.length)%botoes.length;
        else if(event.key==='Home')proximo=0;
        else if(event.key==='End')proximo=botoes.length-1;
        else return;
        event.preventDefault();
        ativarAba(botoes[proximo].dataset.adminTab,true);
      });
    });
    ativarAba(abaAtiva);
  }

  function renderCatalog() {
    const root=$('catalog-list');
    if(!root)return;
    if(!catalog.length){root.innerHTML='<div class="empty-state">O catálogo não foi carregado. Verifique a conexão com o Apps Script.</div>';return;}
    const combosCatalogo=catalog.filter(item=>item.tipo==='COMBO');
    const avulsasCatalogo=catalog.filter(item=>item.tipo==='AVULSA');
    const renderRows=items=>items.map(item=>{
      const resumo=item.tipo==='COMBO'
        ? escapar(item.quantidade+' unidades · '+item.categoria+' · '+item.tamanho)
        : escapar('Preço exclusivo deste sabor · '+item.categoria+' · '+item.tamanho);
      const id=escapar(item.id),preco=Number(item.preco||0).toFixed(2);
      return '<article class="catalog-row"><div class="catalog-description"><strong>'+escapar(item.nome)+'</strong><small>'+resumo+'</small></div>'+
        '<div class="catalog-price"><label for="catalog-price-'+id+'">Preço (R$)</label><input id="catalog-price-'+id+'" type="number" min="0.01" max="9999.99" step="0.01" value="'+preco+'" inputmode="decimal"></div>'+
        '<label class="catalog-active"><input id="catalog-active-'+id+'" type="checkbox" '+(item.ativo?'checked':'')+'> <span>Ativo</span></label>'+
        '<button class="button button-primary catalog-save" type="button" data-catalog-id="'+id+'" onclick="AdminPainel.salvarCatalogo(\''+id+'\')">Salvar</button></article>';
    }).join('');
    const gruposAvulsas=[{categoria:'Tradicional',tamanho:'350g'},{categoria:'Tradicional',tamanho:'500g'},{categoria:'Linha Fit',tamanho:'300g'}];
    root.innerHTML='<section class="catalog-group"><h3>Combos</h3>'+renderRows(combosCatalogo)+'</section>'+
      '<section class="catalog-group"><h3>Marmitas avulsas · preços por sabor</h3>'+
      gruposAvulsas.map(grupo=>{
        const itens=avulsasCatalogo.filter(item=>item.categoria===grupo.categoria&&item.tamanho===grupo.tamanho);
        return itens.length?'<div class="catalog-subgroup"><h4>'+escapar(grupo.categoria+' · '+grupo.tamanho)+'</h4>'+renderRows(itens)+'</div>':'';
      }).join('')+'</section>';
  }
  async function salvarCatalogo(id) {
    const item=catalog.find(entry=>entry.id===id);
    if(!item)return;
    const priceInput=$('catalog-price-'+id),activeInput=$('catalog-active-'+id);
    const price=Number(priceInput&&priceInput.value);
    if(!Number.isFinite(price)||price<0.01||price>9999.99){toast('Informe um preço entre R$ 0,01 e R$ 9.999,99.');if(priceInput)priceInput.focus();return;}
    const button=Array.from(document.querySelectorAll('.catalog-save')).find(el=>el.dataset.catalogId===id);
    if(button){button.disabled=true;button.textContent='Salvando…';}
    try{
      const active=Boolean(activeInput&&activeInput.checked);
      const result=await postarAcao('adminSaveCatalog',{id,price,active});
      item.preco=price;item.ativo=active;item.atualizadoEm='Agora';
      renderCatalog();toast(result.message||'Catálogo atualizado.');
    }catch(error){
      toast(error.message||'Não foi possível atualizar o catálogo.');
      if(button){button.disabled=false;button.textContent='Salvar';}
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
    let phone=String(currentOrder.phone||'').replace(/\D/g,'');
    if(phone.length===10 || phone.length===11) phone='55'+phone;
    if(phone.length<12 || phone.length>13){toast('Telefone inválido para abrir o WhatsApp.');return;}
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
  function abrirAlterarSenha() {
    $('password-message').textContent='';
    $('password-form').reset();
    $('password-modal').hidden=false;
    $('new-admin-password').focus();
  }
  function fecharAlterarSenha() { $('password-modal').hidden=true; }
  async function salvarNovaSenha(event) {
    event.preventDefault();
    const senha=$('new-admin-password').value;
    const confirmacao=$('confirm-admin-password').value;
    const message=$('password-message'),button=$('password-save');
    message.textContent='';
    if(senha.length<8 || senha.length>128 || !/[A-Za-z]/.test(senha) || !/[0-9]/.test(senha)) {
      message.textContent='Use de 8 a 128 caracteres, incluindo pelo menos uma letra e um número.';return;
    }
    if(senha!==confirmacao) { message.textContent='As senhas não coincidem.';return; }
    button.disabled=true;button.textContent='Salvando…';
    try {
      const result=await postarAcao('adminChangePassword',{newPassword:senha});
      $('password-form').reset();fecharAlterarSenha();
      sair();
      $('login-message').textContent=result.message||'Senha alterada. Entre novamente com sua nova senha.';
    } catch(error) {
      message.textContent=error.message||'Não foi possível alterar a senha.';
    } finally { button.disabled=false;button.textContent='Salvar nova senha'; }
  }
  function sair() {
    token='';sessionStorage.removeItem('tempero_admin_token');
    $('dashboard-view').hidden=true;$('top-actions').hidden=true;$('login-view').hidden=false;
    fecharPedido();
  }
  async function atualizar(){
    const ok=await carregarPainel();
    if(ok) toast('Painel atualizado.');
  }
  function iniciarAtualizacaoAutomatica() {
    if(refreshIntervalId) return;
    refreshIntervalId=window.setInterval(()=>{
      if(!token || $('dashboard-view').hidden) return;
      // Não substituir o conteúdo de um pedido ou formulário enquanto estiver em uso.
      if(!$('order-modal').hidden || !$('password-modal').hidden) return;
      carregarPainel({silencioso:true});
    },60000);
  }

  document.addEventListener('DOMContentLoaded',async()=>{
    iniciarAbas();
    $('login-form').addEventListener('submit',entrar);
    $('search-orders').addEventListener('input',renderOrders);
    $('filter-status').addEventListener('change',renderOrders);
    $('password-form').addEventListener('submit',salvarNovaSenha);
    $('api-test-button').addEventListener('click',testarConexao);
    if(token) await carregarPainel();
    iniciarAtualizacaoAutomatica();
    testarConexao();
  });
  window.AdminPainel={abrirPedido,fecharPedido,atualizar,sair,copiarMensagem,abrirWhatsApp,abrirAlterarSenha,fecharAlterarSenha,testarConexao,salvarCatalogo};
})();