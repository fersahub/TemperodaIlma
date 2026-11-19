/* Venda complementar de marmitas avulsas. Sempre exige ao menos um combo no carrinho. */
function temComboNoCarrinho() {
    return Array.isArray(cartCombos) && cartCombos.length > 0;
}

function tamanhosDisponiveisAvulsa(prato) {
    if (!prato || prato.emBreve || prato.disponivel === false) return [];
    if (prato.tag === 'Tradicional') return ['350g', '500g'];
    if (prato.tag === 'Linha Fit') return ['300g'];
    return [];
}

/* Referência inicial: preço unitário médio do combo de 5 correspondente.
   Assim, os valores ficam derivados do catálogo existente e não duplicados no código. */
function precoUnitarioAvulsa(tag, tamanho) {
    const referencias = {
        'Tradicional|350g': 'combo-5-350g',
        'Tradicional|500g': 'combo-5-500g',
        'Linha Fit|300g': 'combo-5-300g-fit'
    };
    const comboId = referencias[tag + '|' + tamanho];
    const combo = combos.find(item => item.id === comboId);
    if (!combo || !combo.qty) return null;
    return Number((combo.price / combo.qty).toFixed(2));
}

function criarItemAvulso(pratoId, tamanho, quantidade) {
    if (!temComboNoCarrinho()) return null;
    const prato = availableFlavors.find(item => item.id === String(pratoId));
    const tamanhos = tamanhosDisponiveisAvulsa(prato);
    const qtd = Number(quantidade);
    const unitPrice = tamanhos.includes(String(tamanho)) ? precoUnitarioAvulsa(prato.tag, String(tamanho)) : null;
    if (!prato || !unitPrice || !Number.isInteger(qtd) || qtd < 1 || qtd > 99) return null;
    return {
        cartId: 'avulsa-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
        flavorId: prato.id,
        name: prato.name,
        tag: prato.tag,
        size: String(tamanho),
        quantity: qtd,
        unitPrice,
        totalPrice: Number((unitPrice * qtd).toFixed(2))
    };
}

function normalizarItemAvulso(item) {
    if (!item || typeof item !== 'object') return null;
    const prato = availableFlavors.find(p => p.id === String(item.flavorId));
    const tamanhos = tamanhosDisponiveisAvulsa(prato);
    const tamanho = String(item.size || '');
    const quantidade = Number(item.quantity);
    const unitPrice = prato && tamanhos.includes(tamanho) ? precoUnitarioAvulsa(prato.tag, tamanho) : null;
    if (!prato || !unitPrice || !Number.isInteger(quantidade) || quantidade < 1 || quantidade > 99) return null;
    return {
        cartId: typeof item.cartId === 'string' && item.cartId ? item.cartId : 'avulsa-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
        flavorId: prato.id,
        name: prato.name,
        tag: prato.tag,
        size: tamanho,
        quantity: quantidade,
        unitPrice,
        totalPrice: Number((unitPrice * quantidade).toFixed(2))
    };
}

function normalizarListaAvulsas(lista) {
    if (!Array.isArray(lista)) return [];
    return lista.map(normalizarItemAvulso).filter(Boolean);
}

function atualizarPrecoAvulsaCard(pratoId) {
    const prato = availableFlavors.find(item => item.id === String(pratoId));
    const select = document.getElementById('avulsa-tamanho-' + pratoId);
    const preco = document.getElementById('avulsa-preco-' + pratoId);
    if (!prato || !select || !preco) return;
    const unitPrice = precoUnitarioAvulsa(prato.tag, select.value);
    preco.textContent = unitPrice === null ? 'Preço indisponível' : 'R$ ' + unitPrice.toFixed(2).replace('.', ',') + ' / unidade';
}

function atualizarPreferenciaVisualAvulsas() {
    const secao = document.getElementById('avulsas-carrinho-section');
    const opcoes = document.getElementById('avulsas-opcoes-container');
    const botaoSim = document.getElementById('avulsas-resposta-sim');
    const botaoNao = document.getElementById('avulsas-resposta-nao');
    if (!secao || !opcoes) return;

    secao.classList.toggle('hidden', avulsasOcultasNestePedido);
    opcoes.classList.toggle('hidden', avulsasOcultasNestePedido || !avulsasOpcoesExpandidas);
    if (botaoSim) {
        const ativo = !avulsasOcultasNestePedido && avulsasOpcoesExpandidas;
        botaoSim.setAttribute('aria-pressed', String(ativo));
        botaoSim.setAttribute('aria-expanded', String(ativo));
    }
    if (botaoNao) botaoNao.setAttribute('aria-pressed', String(avulsasOcultasNestePedido));
}

function responderOpcaoAvulsas(resposta) {
    if (resposta === 'sim') {
        avulsasOcultasNestePedido = false;
        avulsasOpcoesExpandidas = true;
    } else if (resposta === 'nao') {
        avulsasOcultasNestePedido = true;
        avulsasOpcoesExpandidas = false;
    } else {
        return;
    }

    atualizarPreferenciaVisualAvulsas();
    salvarCarrinho();
}

function reiniciarPreferenciaAvulsas() {
    avulsasOcultasNestePedido = false;
    avulsasOpcoesExpandidas = false;
    atualizarPreferenciaVisualAvulsas();
}

function renderAvulsasDisplay() {
    const grid = document.getElementById('avulsas-display-grid');
    if (!grid) return;
    const podeAdicionar = temComboNoCarrinho();
    const aviso = document.getElementById('avulsas-regra-aviso');
    if (aviso) {
        aviso.innerHTML = podeAdicionar
            ? '<i class="fa-solid fa-circle-check text-emerald-600"></i> Seu combo já está no pedido. Agora você pode acrescentar marmitas avulsas.'
            : '<i class="fa-solid fa-lock text-amber-600"></i> Para adicionar marmitas avulsas, primeiro escolha pelo menos um combo. Não vendemos pedidos somente de 1 ou 2 marmitas.';
        aviso.className = 'rounded-xl border p-3 text-xs font-semibold ' + (podeAdicionar ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900');
    }

    const pratos = availableFlavors.filter(prato => tamanhosDisponiveisAvulsa(prato).length > 0);
    grid.innerHTML = '';
    pratos.forEach(prato => {
        const tamanhos = tamanhosDisponiveisAvulsa(prato);
        const opcoes = tamanhos.map(tamanho => '<option value="' + tamanho + '">' + tamanho + '</option>').join('');
        const imagem = escapeHtml(prato.img);
        const id = escapeHtml(prato.id);
        const nome = escapeHtml(prato.name);
        const descricao = escapeHtml(prato.desc);
        const categoria = escapeHtml(prato.tag);
        const card = document.createElement('article');
        card.id = 'avulsa-card-' + prato.id;
        card.className = 'bg-white border border-stone-200 rounded-xl p-3 shadow-sm flex flex-col gap-3';
        card.innerHTML = `
            <div class="flex gap-3 items-center">
                <img src="${imagem}" alt="${nome}" loading="lazy" decoding="async" width="56" height="56" class="w-14 h-14 object-cover rounded-lg shrink-0">
                <div class="min-w-0 flex-1">
                    <span class="text-[10px] font-bold uppercase tracking-wide text-brand-secondary">${categoria}</span>
                    <h4 class="font-bold text-stone-800 text-sm leading-snug">${nome}</h4>
                    <p class="text-xs text-stone-500 mt-1">${descricao}</p>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-2">
                <label class="text-xs font-semibold text-stone-700">Tamanho
                    <select id="avulsa-tamanho-${id}" onchange="atualizarPrecoAvulsaCard('${id}')" class="mt-1 w-full bg-stone-50 border border-stone-200 rounded-lg p-2 text-xs">${opcoes}</select>
                </label>
                <label class="text-xs font-semibold text-stone-700">Quantidade
                    <input id="avulsa-qtd-${id}" type="number" min="1" max="99" step="1" value="1" inputmode="numeric" class="mt-1 w-full bg-stone-50 border border-stone-200 rounded-lg p-2 text-xs">
                </label>
            </div>
            <div class="flex items-center justify-between gap-2">
                <span id="avulsa-preco-${id}" class="text-xs font-extrabold text-stone-800">${'R$ ' + precoUnitarioAvulsa(prato.tag, tamanhos[0]).toFixed(2).replace('.', ',') + ' / unidade'}</span>
                <button type="button" onclick="adicionarAvulsa('${id}')" ${podeAdicionar ? '' : 'disabled'} class="rounded-lg px-3 py-2 text-xs font-bold ${podeAdicionar ? 'bg-brand-secondary text-white hover:bg-brand-accent' : 'bg-stone-200 text-stone-500 cursor-not-allowed'}">
                    <i class="fa-solid fa-plus"></i> Adicionar
                </button>
            </div>`;
        grid.appendChild(card);
    });
    atualizarPreferenciaVisualAvulsas();
}

function abrirAvulsasNoCarrinho(pratoId) {
    if (!temComboNoCarrinho()) {
        mostrarToast('Para adicionar uma marmita avulsa, escolha primeiro um combo.');
        return;
    }
    responderOpcaoAvulsas('sim');
    openCheckoutModal();
    const card = document.getElementById('avulsa-card-' + String(pratoId));
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function adicionarAvulsa(pratoId) {
    if (!temComboNoCarrinho()) {
        mostrarToast('Escolha um combo antes de adicionar marmitas avulsas.');
        renderAvulsasDisplay();
        return;
    }
    const select = document.getElementById('avulsa-tamanho-' + pratoId);
    const input = document.getElementById('avulsa-qtd-' + pratoId);
    if (!select || !input) return;
    const nova = criarItemAvulso(pratoId, select.value, input.value);
    if (!nova) {
        mostrarToast('Confira o tamanho e a quantidade da marmita avulsa.');
        return;
    }
    const existente = cartAvulsas.find(item => item.flavorId === nova.flavorId && item.size === nova.size);
    if (existente) {
        if (existente.quantity + nova.quantity > 99) {
            mostrarToast('O limite por prato é de 99 unidades.');
            return;
        }
        existente.quantity += nova.quantity;
        existente.totalPrice = Number((existente.quantity * existente.unitPrice).toFixed(2));
    } else {
        cartAvulsas.push(nova);
    }
    input.value = '1';
    updateCartUI();
    animarCarrinho();
    mostrarToast('Marmita avulsa adicionada ao pedido.', 'Ver pedido', openCheckoutModal);
}

function alterarQuantidadeAvulsa(cartId, delta) {
    const item = cartAvulsas.find(avulsa => avulsa.cartId === String(cartId));
    if (!item) return;
    const novaQuantidade = item.quantity + Number(delta);
    if (novaQuantidade <= 0) {
        removerAvulsa(cartId);
        return;
    }
    if (novaQuantidade > 99) {
        mostrarToast('O limite por prato é de 99 unidades.');
        return;
    }
    item.quantity = novaQuantidade;
    item.totalPrice = Number((item.quantity * item.unitPrice).toFixed(2));
    updateCartUI();
}

function removerAvulsa(cartId) {
    const index = cartAvulsas.findIndex(item => item.cartId === String(cartId));
    if (index < 0) return;
    const removida = cartAvulsas.splice(index, 1)[0];
    updateCartUI();
    mostrarToast('Marmita avulsa removida.', 'Desfazer', () => {
        if (temComboNoCarrinho()) cartAvulsas.splice(Math.min(index, cartAvulsas.length), 0, removida);
        updateCartUI();
        animarCarrinho();
    }, 6000);
}
