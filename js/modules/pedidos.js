/* Persistência do carrinho e preparação de pedidos. */
/* --- CARRINHO SALVO NO CELULAR --- */
        function salvarCarrinho() {
            try { localStorage.setItem('tempero_ilma_carrinho', JSON.stringify(cartCombos)); } catch (e) {}
        }

        function restaurarCarrinho() {
            try {
                const salvo = JSON.parse(localStorage.getItem('tempero_ilma_carrinho') || '[]');
                if (!Array.isArray(salvo)) throw new Error('Formato de carrinho inválido.');
                cartCombos = salvo.filter(i => i && typeof i === 'object' && combos.some(c => c.id === i.comboId))
                    .map(i => {
                        const c = combos.find(x => x.id === i.comboId);
                        return { ...i, name: c.name, price: c.price, freteGratis: !!c.freteGratis };
                    });
                if (cartCombos.length) updateCartUI();
            } catch (e) {
                cartCombos = [];
                try { localStorage.removeItem('tempero_ilma_carrinho'); } catch (erro) {}
            }
        }

        /* --- EDITAR COMBO --- */
        function flavorsDoResumo(resumo) {
            const o = {};
            resumo.split(', ').forEach(x => {
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
            const itens = cartCombos.map(it => `<div class="bg-stone-50 border border-stone-200 rounded-xl p-3"><p class="font-bold text-stone-800">${e(it.name)} <span class="text-brand-accent">${fmt(it.price)}</span></p><p class="text-[11px] text-stone-500">${e(it.flavorsSummary)}</p>${it.obs ? `<p class="text-[11px] text-amber-700">Obs: ${e(it.obs)}</p>` : ''}</div>`).join('');
            document.getElementById('confirm-content').innerHTML = `
                <div><p><b>Cliente:</b> ${e(d.name)}</p><p><b>Telefone:</b> ${e(d.phone)}</p><p><b>Endereço:</b> ${e(d.fullAddress)}</p></div>
                <div class="space-y-2">${itens}</div>
                <div class="border-t border-stone-200 pt-2 space-y-1">
                    <p class="flex justify-between"><span>Subtotal</span><b>${fmt(d.subtotalPrice)}</b></p>
                    <p class="flex justify-between"><span>Entrega</span><b>${d.feFinal === 0 ? 'GRÁTIS' : fmt(d.feFinal)}</b></p>
                    <p class="flex justify-between text-base text-stone-800"><b>Total</b><b class="text-brand-accent">${fmt(d.totalPrice)}</b></p>
                    <p><b>Pagamento:</b> ${e(d.payment)}${d.payment === 'Dinheiro' && d.troco ? ' (troco para ' + e(d.troco) + ')' : ''}</p>
                    <p><b>Entrega:</b> sábado, ${dataEntregaSabado()} (horário a confirmar)</p>
                    ${d.obs ? `<p><b>Observações:</b> ${e(d.obs)}</p>` : ''}
                </div>`;
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
            document.getElementById('confirm-modal').classList.add('hidden');
            closeCheckoutModal();
            document.getElementById('sent-link').href = pendingWhatsUrl;
            document.getElementById('sent-modal').classList.remove('hidden');
        }

                function limparCarrinhoAposEnvio() {
            const confirmado = window.confirm('Você já enviou a mensagem pelo WhatsApp e deseja limpar o carrinho para começar outro pedido?');
            if (!confirmado) return;
            cartCombos = [];
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
