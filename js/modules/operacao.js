/* Frete, tema e operações comerciais. */
/* --- REGRAS DE FRETE E OPERAÇÃO DA LOJA --- */
        

        function telefoneCheckoutParaBeneficio() {
            const campo = document.getElementById('cust-phone');
            return String(campo && campo.value || '').replace(/\\D/g, '');
        }

        function primeiroPedidoFreteGratisAtivo() {
            if (typeof primeiroPedidoFreteGratis === 'undefined' || !primeiroPedidoFreteGratis) return false;
            if (typeof primeiroPedidoTelefoneVerificado === 'undefined') return false;
            return primeiroPedidoTelefoneVerificado === telefoneCheckoutParaBeneficio();
        }

        // A taxa original do bairro é preservada; o benefício só altera o frete efetivo.
        function freteEfetivo() {
            if (currentShippingFee === null) return null;
            return primeiroPedidoFreteGratisAtivo() ? 0 : currentShippingFee;
        }

        function atualizarStatusFretePrimeiroPedido() {
            const el = document.getElementById('first-order-shipping-status');
            if (!el) return;
            const status = typeof primeiroPedidoVerificacaoStatus === 'undefined' ? 'idle' : primeiroPedidoVerificacaoStatus;
            const mensagens = {
                checking: 'Verificando se este telefone tem direito ao frete grátis de primeira compra...',
                eligible: 'Parabéns! Este telefone está elegível ao frete grátis no primeiro pedido.',
                used: 'Este telefone já possui pedido registrado. O frete será cobrado conforme o bairro.',
                error: 'Não foi possível confirmar o benefício agora. Será aplicado o frete normal.'
            };
            const msg = mensagens[status] || '';
            el.textContent = msg;
            el.className = msg
                ? 'mt-1 text-[11px] font-semibold ' + (status === 'eligible' ? 'text-emerald-700' : status === 'checking' ? 'text-amber-700' : 'text-stone-500')
                : 'hidden';
        }

        function aoDigitarTelefoneCheckout() {
            const telefone = telefoneCheckoutParaBeneficio();
            const consultado = typeof primeiroPedidoTelefoneConsultado === 'undefined' ? '' : primeiroPedidoTelefoneConsultado;
            if (telefone === consultado) return;
            const beneficioAtivo = primeiroPedidoFreteGratisAtivo();
            primeiroPedidoConsultaId++;
            primeiroPedidoFreteGratis = false;
            primeiroPedidoTelefoneVerificado = '';
            primeiroPedidoTelefoneConsultado = '';
            primeiroPedidoVerificacaoStatus = 'idle';
            atualizarStatusFretePrimeiroPedido();
            if (beneficioAtivo) updateCartUI();
        }

        function verificarFreteGratisPrimeiroPedido() {
            const telefone = telefoneCheckoutParaBeneficio();
            if (telefone.length < 10 || telefone.length > 13) return;
            if (primeiroPedidoVerificacaoStatus === 'checking' && primeiroPedidoTelefoneConsultado === telefone) return;
            if (primeiroPedidoTelefoneVerificado === telefone &&
                ['eligible','used'].includes(primeiroPedidoVerificacaoStatus)) return;

            const consultaId = ++primeiroPedidoConsultaId;
            primeiroPedidoTelefoneConsultado = telefone;
            primeiroPedidoVerificacaoStatus = 'checking';
            atualizarStatusFretePrimeiroPedido();

            solicitarDadosAvaliacoes('firstOrderCheck', { phone: telefone }, resposta => {
                if (consultaId !== primeiroPedidoConsultaId || telefoneCheckoutParaBeneficio() !== telefone) return;
                primeiroPedidoTelefoneVerificado = telefone;
                if (resposta && resposta.ok === true) {
                    primeiroPedidoFreteGratis = resposta.eligible === true;
                    primeiroPedidoVerificacaoStatus = primeiroPedidoFreteGratis ? 'eligible' : 'used';
                } else {
                    primeiroPedidoFreteGratis = false;
                    primeiroPedidoVerificacaoStatus = 'error';
                }
                atualizarStatusFretePrimeiroPedido();
                updateCartUI();
            });
        }

        function revalidarBeneficioAposPrimeiroPedido(pedido) {
            if (!pedido || pedido.firstOrderFreeShipping !== true) return;
            primeiroPedidoFreteGratis = false;
            primeiroPedidoTelefoneVerificado = '';
            primeiroPedidoTelefoneConsultado = '';
            primeiroPedidoVerificacaoStatus = 'idle';
            verificarFreteGratisPrimeiroPedido();
        }

        // Data do sábado de entrega (dd/mm): de seg a sex é o sábado da semana; no fim de semana é o sábado seguinte
        function dataEntregaSabado() {
            const agora = obterDataHoraLoja();
            let dias = (6 - agora.weekday + 7) % 7;
            if (dias === 0) dias = 7;
            const data = new Date(Date.UTC(agora.year, agora.month - 1, agora.day + dias));
            const p2 = n => String(n).padStart(2, '0');
            return p2(data.getUTCDate()) + '/' + p2(data.getUTCMonth() + 1);
        }

        function mostrarAvisoFimDeSemana() {
            const dia = obterDataHoraLoja().weekday;
            if (dia !== 6 && dia !== 0) return;
            const el = document.getElementById('weekend-banner');
            el.innerHTML = '<i class="fa-solid fa-calendar-check"></i> Pedidos feitos agora serão entregues no sábado, dia ' + dataEntregaSabado();
            el.classList.remove('hidden');
        }
        function renderFreteBanner() {
            const hint = document.getElementById('cart-ship-hint');
            const el = document.getElementById('free-ship-banner');
            const gratis = primeiroPedidoFreteGratisAtivo();
            if (hint) {
                hint.innerText = gratis ? 'Frete grátis no 1º pedido' : 'Frete conforme o bairro';
                hint.className = gratis ? 'text-[10px] font-bold text-emerald-700' : 'text-[10px] font-semibold text-stone-500';
            }
            if (el) {
                el.innerHTML = gratis
                    ? '<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs"><p class="font-semibold text-emerald-900"><i class="fa-solid fa-gift text-emerald-600"></i> Frete grátis aplicado ao seu primeiro pedido! A taxa do bairro foi zerada.</p></div>'
                    : '<div class="bg-stone-50 border border-stone-200 rounded-xl p-3 text-xs"><p class="font-semibold text-stone-700"><i class="fa-solid fa-truck text-brand-secondary"></i> O frete é calculado conforme o bairro. O benefício de primeira compra é verificado pelo telefone informado.</p></div>';
            }
            atualizarStatusFretePrimeiroPedido();
            atualizarPixBox();
        }

        function duplicarCombo(i) {
            const c = cartCombos[i];
            if (!c) return;
            cartCombos.splice(i + 1, 0, { ...c, cartId: Date.now().toString() });
            updateCartUI();
            animarCarrinho();
            mostrarToast('Combo duplicado.');
        }

        function montagemAutomatica() {
            selectedFlavors = {};
            const lista = availableFlavors.filter(f => f.tag === currentEditingCombo.type && !f.emBreve && f.disponivel !== false)
                .sort(() => Math.random() - 0.5);
            for (let i = 0; i < currentEditingCombo.qty; i++) {
                const f = lista[i % lista.length];
                selectedFlavors[f.id] = (selectedFlavors[f.id] || 0) + 1;
            }
            renderFlavorsSelectionList();
            updateFlavorSelectionState();
        }

        function animarCarrinho() {
            const el = document.getElementById('cart-icon-wrap');
            if (!el) return;
            el.classList.remove('cart-bump');
            void el.offsetWidth;
            el.classList.add('cart-bump');
        }

        function atualizarIconeTema() {
            const b = document.getElementById('theme-btn');
            if (b) b.innerHTML = document.documentElement.classList.contains('dark')
                ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
        }

        function alternarTema() {
            const dark = document.documentElement.classList.toggle('dark');
            try { localStorage.setItem('tema', dark ? 'dark' : 'light'); } catch (e) {}
            atualizarIconeTema();
        }
