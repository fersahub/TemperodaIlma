/* Persistência do carrinho e preparação de pedidos. */
function salvarCarrinho() {
    try {
        localStorage.setItem('tempero_ilma_carrinho', JSON.stringify({
            combos: cartCombos,
            avulsas: cartAvulsas,
            avulsasOcultas: avulsasOcultasNestePedido,
            avulsasOpcoesExpandidas
        }));
    } catch (e) {}
}

function restaurarCarrinho() {
    try {
        const salvo = JSON.parse(localStorage.getItem('tempero_ilma_carrinho') || '[]');
        // Compatibilidade com a versão antiga, que salvava somente um array de combos.
        const combosSalvos = Array.isArray(salvo) ? salvo : (salvo && Array.isArray(salvo.combos) ? salvo.combos : []);
        const avulsasSalvas = !Array.isArray(salvo) && salvo && Array.isArray(salvo.avulsas) ? salvo.avulsas : [];
        avulsasOcultasNestePedido = !Array.isArray(salvo) && Boolean(salvo && salvo.avulsasOcultas);
        avulsasOpcoesExpandidas = !avulsasOcultasNestePedido && !Array.isArray(salvo) && Boolean(salvo && salvo.avulsasOpcoesExpandidas);
        cartCombos = combosSalvos.filter(i => i && typeof i === 'object' && combos.some(c => c.id === i.comboId))
            .map(i => {
                const c = combos.find(x => x.id === i.comboId);
                return { ...i, name: c.name, price: c.price, qty: c.qty };
            });
        cartAvulsas = cartCombos.length ? normalizarListaAvulsas(avulsasSalvas) : [];
        atualizarPreferenciaVisualAvulsas();
        if (temItensCarrinho()) updateCartUI();
    } catch (e) {
        cartCombos = [];
        cartAvulsas = [];
        avulsasOcultasNestePedido = false;
        avulsasOpcoesExpandidas = false;
        atualizarPreferenciaVisualAvulsas();
        try { localStorage.removeItem('tempero_ilma_carrinho'); } catch (erro) {}
    }
}

/* --- EDITAR COMBO --- */
function flavorsDoResumo(resumo) {
    const o = {};
    String(resumo || '').split(', ').forEach(x => {
        const m = x.match(/^(\d+)x (.+)$/);
        const f = m && availableFlavors.find(v => v.name === m[2]);
        if (f) o[f.id] = parseInt(m[1], 10);
    });
    return o;
}

function editarCombo(i) {
    const it = cartCombos[i];
    if (!it) return;
    if (!it.flavors) it.flavors = flavorsDoResumo(it.flavorsSummary);
    closeCheckoutModal();
    openFlavorsModal(it.comboId, i);
}

/* --- CONFIRMAÇÃO E ENVIO --- */
function abrirConfirmacao(url, d) {
    pendingWhatsUrl = url;
    pendingPedido = d;
    const fmt = v => 'R$ ' + v.toFixed(2).replace('.', ',');
    const e = escapeHtml;
    const itensCombos = cartCombos.map(it =>
        '<div class="bg-stone-50 border border-stone-200 rounded-xl p-3">' +
        '<p class="font-bold text-stone-800">' + e(it.name) + ' <span class="text-brand-accent">' + fmt(it.price) + '</span></p>' +
        '<p class="text-[11px] text-stone-500">' + e(it.flavorsSummary || '') + '</p>' +
        (it.obs ? '<p class="text-[11px] text-amber-700">Obs: ' + e(it.obs) + '</p>' : '') +
        '</div>'
    ).join('');
    const itensAvulsas = cartAvulsas.map(it =>
        '<div class="bg-amber-50 border border-amber-200 rounded-xl p-3">' +
        '<p class="font-bold text-stone-800">' + e(it.quantity + 'x ' + it.name + ' (' + it.size + ')') + '</p>' +
        '<p class="text-[11px] text-stone-500">' + fmt(it.unitPrice) + ' cada · Subtotal: ' + fmt(it.totalPrice) + '</p>' +
        '</div>'
    ).join('');
    document.getElementById('confirm-content').innerHTML =
        '<div><p><b>Cliente:</b> ' + e(d.name) + '</p><p><b>Telefone:</b> ' + e(d.phone) + '</p><p><b>Endereço:</b> ' + e(d.fullAddress) + '</p></div>' +
        (itensCombos ? '<p class="font-bold text-stone-700">Combos</p><div class="space-y-2">' + itensCombos + '</div>' : '') +
        (itensAvulsas ? '<p class="font-bold text-stone-700">Marmitas avulsas</p><div class="space-y-2">' + itensAvulsas + '</div>' : '') +
        '<div class="border-t border-stone-200 pt-2 space-y-1">' +
        '<p class="flex justify-between"><span>Subtotal</span><b>' + fmt(d.subtotalPrice) + '</b></p>' +
        '<p class="flex justify-between"><span>Entrega</span><b>' + (d.feFinal === 0 ? 'GRÁTIS' : fmt(d.feFinal)) + '</b></p>' +
        '<p class="flex justify-between text-base text-stone-800"><b>Total</b><b class="text-brand-accent">' + fmt(d.totalPrice) + '</b></p>' +
        '<p><b>Pagamento:</b> ' + e(d.payment) + (d.payment === 'Dinheiro' && d.troco ? ' (troco para ' + e(d.troco) + ')' : '') + '</p>' +
        '<p><b>Entrega:</b> sábado, ' + dataEntregaSabado() + ' (horário a confirmar)</p>' +
        (d.obs ? '<p><b>Observações:</b> ' + e(d.obs) + '</p>' : '') +
        '</div>';
    document.getElementById('confirm-modal').classList.remove('hidden');
}

function confirmarEnvio() {
    const sentPix = document.getElementById('sent-pix');
    sentPix.classList.add('hidden');
    const dp = pendingPedido;
    if (dp && dp.payment === 'Pix' && pixConfigurado() && dp.totalPrice > 0) {
        pixAtual = gerarPixPayload(dp.totalPrice);
        document.getElementById('sent-pix-valor').innerText = 'R$ ' + dp.totalPrice.toFixed(2).replace('.', ',');
        desenharQr('sent-pix-qr', pixAtual);
        sentPix.classList.remove('hidden');
    }
    window.open(pendingWhatsUrl, '_blank');
    if (dp && dp.customerData) salvarUltimoCliente(dp.customerData);
    if (dp && typeof registrarPedidoCentralizado === 'function') {
        registrarPedidoCentralizado(dp).then(registrado => {
            if (registrado && dp.firstOrderFreeShipping && typeof revalidarBeneficioAposPrimeiroPedido === 'function') {
                revalidarBeneficioAposPrimeiroPedido(dp);
            }
        });
    }
    if (dp && typeof registrarPedidoPendenteAvaliacao === 'function') registrarPedidoPendenteAvaliacao(dp);
    document.getElementById('confirm-modal').classList.add('hidden');
    closeCheckoutModal();
    document.getElementById('sent-link').href = pendingWhatsUrl;
    document.getElementById('sent-modal').classList.remove('hidden');
}

function limparCarrinhoAposEnvio() {
    const confirmado = window.confirm('Você já enviou a mensagem pelo WhatsApp e deseja limpar o carrinho para começar outro pedido?');
    if (!confirmado) return;
    cartCombos = [];
    cartAvulsas = [];
    reiniciarPreferenciaAvulsas();
    currentShippingFee = null;
    pendingWhatsUrl = '';
    pendingPedido = null;
    updateCartUI();
    document.getElementById('sent-modal').classList.add('hidden');
    if (window.confetti && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
    }
    mostrarToast('Carrinho limpo. Você já pode iniciar um novo pedido.');
}


/* Envia o pedido para a planilha central. A gravação é confirmada por uma consulta de leitura. */
function consultarConfirmacaoPedido(reviewOrderId, callback) {
    if (typeof solicitarDadosAvaliacoes !== 'function') {
        callback(false);
        return;
    }
    solicitarDadosAvaliacoes('orderCheck', { reviewOrderId }, resposta => {
        callback(Boolean(resposta && resposta.ok && resposta.exists));
    });
}

function registrarPedidoCentralizado(pedido) {
    if (!pedido || !pedido.orderId || !pedido.reviewOrderId) return Promise.resolve(false);
    const endpoint = window.TEMPERO_CONFIG && window.TEMPERO_CONFIG.avaliacoes && window.TEMPERO_CONFIG.avaliacoes.apiUrl;
    if (!endpoint) {
        mostrarToast('Pedido aberto no WhatsApp. A integração com o painel ainda não está configurada.');
        return Promise.resolve(false);
    }

    const combos = cartCombos.map(item => ({
        comboId: item.comboId,
        flavors: item.flavors || flavorsDoResumo(item.flavorsSummary),
        flavorsSummary: item.flavorsSummary || '',
        obs: item.obs || ''
    }));
    const avulsas = cartAvulsas.map(item => ({
        flavorId: item.flavorId,
        size: item.size,
        quantity: item.quantity
    }));
    const payload = {
        orderId: pedido.orderId,
        reviewOrderId: pedido.reviewOrderId,
        customer: pedido.customerData,
        notificationsOptIn: Boolean(pedido.notificationsOptIn),
        payment: pedido.payment,
        changeFor: pedido.troco,
        observations: pedido.obs,
        subtotal: pedido.subtotalPrice,
        shippingFee: pedido.feFinal,
        firstOrderFreeShipping: Boolean(pedido.firstOrderFreeShipping),
        total: pedido.totalPrice,
        deliveryDate: pedido.deliveryDate,
        combos,
        avulsas
    };
    const body = new URLSearchParams({ action: 'registerOrder', payload: JSON.stringify(payload) });

    return fetch(endpoint, { method: 'POST', mode: 'no-cors', body })
        .then(() => new Promise(resolve => {
            let tentativa = 0;
            const verificar = () => consultarConfirmacaoPedido(pedido.reviewOrderId, existe => {
                if (existe) {
                    mostrarToast('Pedido registrado no painel administrativo.');
                    resolve(true);
                } else if (tentativa++ < 5) {
                    window.setTimeout(verificar, 1000);
                } else {
                    mostrarToast('Não conseguimos confirmar o registro no painel. Confira a integração antes de atualizar o status.');
                    resolve(false);
                }
            });
            window.setTimeout(verificar, 900);
        }))
        .catch(() => {
            mostrarToast('Não foi possível registrar o pedido no painel. A comanda do WhatsApp continua disponível.');
            return false;
        });
}
