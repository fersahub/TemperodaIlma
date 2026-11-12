
        let currentShippingFee = null;
        let cartCombos = [];
        let currentEditingCombo = null;
        let selectedFlavors = {};
        let currentFlavorFilter = 'Todos';
        let currentFlavorSearch = '';
        let modoExibicaoPratos = 'grid';
        let editandoIndex = null;
        let pendingWhatsUrl = '';
        let pendingPedido = null;
        let bairroPendenteConfirmacao = false;
        let ultimoCepConsultado = '';
        let cepInfo = null;
        let ultimaRuaAutomatica = '';
        let ruaPendenteConfirmacao = false;
        let ruaConfirmadaTexto = '';
        let toastTimer = null;
        let estadoModalEmpilhado = false;
        let ignorarPopstate = false;
        let pixAtual = '';

        function marcarErro(id, msg) {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.add('campo-erro');
            el.setAttribute('aria-invalid', 'true');
            const p = document.createElement('p');
            p.className = 'erro-msg text-[11px] font-semibold text-red-500 mt-1';
            p.dataset.for = id;
            p.textContent = msg;
            (el.closest('.relative') || el).insertAdjacentElement('afterend', p);
        }

        function limparErro(id) {
            const el = document.getElementById(id);
            if (el) { el.classList.remove('campo-erro'); el.removeAttribute('aria-invalid'); }
            document.querySelectorAll('.erro-msg').forEach(p => { if (p.dataset.for === id) p.remove(); });
        }

        function limparTodosErros() {
            document.querySelectorAll('.erro-msg').forEach(p => p.remove());
            document.querySelectorAll('.campo-erro').forEach(el => el.classList.remove('campo-erro'));
        }

        function iniciarValidacao() {
            const form = document.getElementById('checkout-form');
            ['input', 'change'].forEach(ev => form.addEventListener(ev, e => { if (e.target.id) limparErro(e.target.id); }));
        }

        function irParaEtapa(n) {
            const alvo = { 1: 'cart-combos-container', 2: 'checkout-form', 3: 'step-pagamento' }[n];
            const el = document.getElementById(alvo);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function atualizarEtapas() {
            const box = document.getElementById('checkout-scroll');
            if (!box) return;
            const topo = box.getBoundingClientRect().top + 90;
            const y = id => { const el = document.getElementById(id); return el ? el.getBoundingClientRect().top : Infinity; };
            let etapa = 1;
            if (y('checkout-form') <= topo) etapa = 2;
            if (y('step-pagamento') <= topo) etapa = 3;
            if (box.scrollHeight > box.clientHeight + 8 && box.scrollTop + box.clientHeight >= box.scrollHeight - 4) etapa = 3;
            document.querySelectorAll('#steps-bar .etapa').forEach(b => {
                const n = Number(b.dataset.step);
                b.classList.toggle('ativa', n === etapa);
                b.classList.toggle('feita', n < etapa);
            });
        }

        function iniciarEtapas() {
            const box = document.getElementById('checkout-scroll');
            if (box) box.addEventListener('scroll', atualizarEtapas, { passive: true });
            atualizarEtapas();
        }

        function buscarBairro(valor) {
            const box = document.getElementById('bairro-resultados');
            const palavras = normalizarTexto(valor.trim()).split(/\s+/).filter(Boolean);
            if (!palavras.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
            const sel = document.getElementById('cust-bairro');
            const achados = Array.from(sel.options)
                .filter(o => o.value && palavras.every(w => normalizarTexto(o.value).includes(w)))
                .slice(0, 8);
            box.innerHTML = achados.length
                ? achados.map(o => `<button type="button" data-bairro="${escapeHtml(o.value)}" onclick="escolherBairro(this.dataset.bairro)" class="opcao-bairro w-full text-left px-3 py-2 text-xs border-b border-stone-100 flex justify-between gap-2"><span class="font-semibold text-stone-800">${escapeHtml(o.value)}</span><span class="text-stone-500">R$ ${parseFloat(o.getAttribute('data-taxa')).toFixed(2).replace('.', ',')}</span></button>`).join('')
                : '<p class="p-3 text-xs text-stone-500">Nenhum bairro encontrado. Confira a grafia ou escolha na lista abaixo.</p>';
            box.classList.remove('hidden');
        }

        function escolherBairro(nome) {
            const sel = document.getElementById('cust-bairro');
            sel.value = nome;
            document.getElementById('bairro-busca').value = '';
            const box = document.getElementById('bairro-resultados');
            box.classList.add('hidden');
            box.innerHTML = '';
            limparErro('cust-bairro');
            aoMudarBairroManualmente();
        }

        function pedirConfirmacaoBairro() {
            const sel = document.getElementById('cust-bairro');
            const opt = sel.options[sel.selectedIndex];
            if (!opt || !opt.value) return;
            bairroPendenteConfirmacao = true;
            const taxa = parseFloat(opt.getAttribute('data-taxa') || 0).toFixed(2).replace('.', ',');
            const box = document.getElementById('bairro-confirma');
            box.innerHTML = `<div class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs space-y-2"><p class="text-amber-900">Bairro identificado pelo CEP: <b>${escapeHtml(opt.value)}</b> (frete R$ ${taxa}). Está correto?</p><div class="flex gap-2"><button type="button" onclick="confirmarBairro(true)" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-lg">Sim, está correto</button><button type="button" onclick="confirmarBairro(false)" class="flex-1 bg-white border border-stone-300 text-stone-700 font-bold py-2 rounded-lg">Não, trocar</button></div></div>`;
            box.classList.remove('hidden');
        }

        function confirmarBairro(ok) {
            bairroPendenteConfirmacao = false;
            const box = document.getElementById('bairro-confirma');
            box.classList.add('hidden');
            box.innerHTML = '';
            if (!ok) {
                document.getElementById('cust-bairro').value = '';
                aoMudarBairroManualmente();
                document.getElementById('bairro-busca').focus();
            }
        }

        function avisarBairroForaDaLista(nome) {
            const box = document.getElementById('bairro-fora-alerta');
            const link = 'https://wa.me/5571994125510?text=' + encodeURIComponent('Olá! Queria confirmar se entregam no bairro ' + nome + '.');
            box.innerHTML = `<div class="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-xs"><i class="fa-solid fa-triangle-exclamation"></i> O CEP indica o bairro <b>${escapeHtml(nome)}</b>, que não está na nossa lista de entregas. Busque o bairro mais próximo acima ou <a href="${link}" target="_blank" rel="noopener" class="font-bold underline">confirme no WhatsApp</a>.</div>`;
            box.classList.remove('hidden');
        }

        /* --- AVISOS RÁPIDOS (TOAST) --- */
        function esconderToast() {
            document.getElementById('toast').style.display = 'none';
            clearTimeout(toastTimer);
        }

        function mostrarToast(msg, acaoTexto, acaoFn, ms) {
            const el = document.getElementById('toast');
            el.innerHTML = '';
            const span = document.createElement('span');
            span.textContent = msg;
            el.appendChild(span);
            if (acaoTexto && acaoFn) {
                const b = document.createElement('button');
                b.type = 'button';
                b.textContent = acaoTexto;
                b.onclick = () => { esconderToast(); acaoFn(); };
                el.appendChild(b);
            }
            el.style.display = 'flex';
            el.classList.remove('show');
            void el.offsetWidth;
            el.classList.add('show');
            clearTimeout(toastTimer);
            toastTimer = setTimeout(esconderToast, ms || 4500);
        }

        /* --- JANELAS: botão voltar, Esc, toque fora e trava de rolagem --- */
        const MODAIS_ORDEM = ['quiz-modal', 'sent-modal', 'confirm-modal', 'flavors-modal', 'checkout-modal'];

        function modalEstaAberto(id) {
            const el = document.getElementById(id);
            return !!el && !el.classList.contains('hidden');
        }

        function fecharModalPorId(id) {
            if (id === 'checkout-modal') {
                closeCheckoutModal();
            } else if (id === 'flavors-modal') {
                if (Object.keys(selectedFlavors).length && !confirm('Descartar a montagem deste combo?')) return;
                closeFlavorsModal();
            } else {
                document.getElementById(id).classList.add('hidden');
            }
        }

        function fecharModalDoTopo() {
            const id = MODAIS_ORDEM.find(modalEstaAberto);
            if (id) fecharModalPorId(id);
        }

        function sincronizarModais() {
            const n = MODAIS_ORDEM.filter(modalEstaAberto).length;
            document.documentElement.classList.toggle('modal-aberto', n > 0);
            if (n > 0 && !estadoModalEmpilhado) {
                history.pushState({ modal: true }, '');
                estadoModalEmpilhado = true;
            } else if (n === 0 && estadoModalEmpilhado) {
                estadoModalEmpilhado = false;
                ignorarPopstate = true;
                setTimeout(() => { ignorarPopstate = false; }, 600);
                history.back();
            }
        }

        function iniciarModais() {
            if (history.state && history.state.modal) history.replaceState(null, '');
            const obs = new MutationObserver(sincronizarModais);
            MODAIS_ORDEM.forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                obs.observe(el, { attributes: true, attributeFilter: ['class'] });
                el.addEventListener('click', e => { if (e.target === el) fecharModalPorId(id); });
            });
            window.addEventListener('popstate', () => {
                if (ignorarPopstate) { ignorarPopstate = false; return; }
                estadoModalEmpilhado = false;
                fecharModalDoTopo();
                sincronizarModais();
            });
            document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModalDoTopo(); });
        }

        /* --- COPIAR O PEDIDO --- */
        async function copiarPedido() {
            const texto = pendingPedido && pendingPedido.fullText;
            if (!texto) return;
            try {
                await navigator.clipboard.writeText(texto);
                mostrarToast('Pedido copiado! Cole no WhatsApp.');
            } catch (e) {
                const ta = document.getElementById('sent-texto');
                ta.value = texto;
                ta.classList.remove('hidden');
                ta.focus();
                ta.select();
                let ok = false;
                try { ok = document.execCommand('copy'); } catch (e2) {}
                mostrarToast(ok ? 'Pedido copiado! Cole no WhatsApp.' : 'Selecione o texto abaixo e copie.');
            }
        }

        /* --- CONFERIR RUA x CEP --- */
        function normalizarRua(t) {
            return normalizarTexto(t).replace(/[^a-z0-9 ]/g, ' ')
                .replace(/\b(rua|r|avenida|av|travessa|tv|alameda|al|estrada|estr|praca|pc|largo|ladeira|beco|rodovia|rod)\b/g, ' ')
                .replace(/\b(de|da|do|das|dos)\b/g, ' ').replace(/\s+/g, ' ').trim();
        }

        function ruasParecidas(a, b) {
            const x = normalizarRua(a), y = normalizarRua(b);
            if (!x || !y) return true;
            if (x.includes(y) || y.includes(x)) return true;
            const tx = x.split(' '), ty = y.split(' ');
            const comuns = tx.filter(w => ty.includes(w)).length;
            return comuns / Math.min(tx.length, ty.length) >= 0.6;
        }

        function esconderAvisoRua() {
            const b = document.getElementById('rua-confirma');
            if (b) { b.classList.add('hidden'); b.innerHTML = ''; }
        }

        function verificarRuaComCep() {
            const rua = document.getElementById('cust-rua').value.trim();
            const cepAtual = document.getElementById('cust-cep').value.replace(/\D/g, '');
            if (!cepInfo || !cepInfo.logradouro || cepInfo.cep !== cepAtual || !rua
                || rua === ruaConfirmadaTexto || ruasParecidas(rua, cepInfo.logradouro)) {
                ruaPendenteConfirmacao = false;
                esconderAvisoRua();
                return;
            }
            const box = document.getElementById('rua-confirma');
            if (ruaPendenteConfirmacao && !box.classList.contains('hidden')) return;
            ruaPendenteConfirmacao = true;
            box.innerHTML = `<div class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs space-y-2"><p class="text-amber-900">O CEP indica <b>${escapeHtml(cepInfo.logradouro)}</b>. Está certo?</p><div class="flex gap-2"><button type="button" onclick="usarRuaDoCep()" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-lg">Usar a rua do CEP</button><button type="button" onclick="manterRuaDigitada()" class="flex-1 bg-white border border-stone-300 text-stone-700 font-bold py-2 rounded-lg">Manter a que digitei</button></div></div>`;
            box.classList.remove('hidden');
        }

        function usarRuaDoCep() {
            const campo = document.getElementById('cust-rua');
            campo.value = cepInfo.logradouro;
            ultimaRuaAutomatica = campo.value;
            ruaPendenteConfirmacao = false;
            esconderAvisoRua();
            limparErro('cust-rua');
        }

        function manterRuaDigitada() {
            ruaConfirmadaTexto = document.getElementById('cust-rua').value.trim();
            ruaPendenteConfirmacao = false;
            esconderAvisoRua();
            limparErro('cust-rua');
        }

        function iniciarEndereco() {
            const rua = document.getElementById('cust-rua');
            rua.addEventListener('blur', verificarRuaComCep);
            rua.addEventListener('input', () => { ruaPendenteConfirmacao = false; esconderAvisoRua(); });
            document.getElementById('cust-cep').addEventListener('input', () => {
                document.getElementById('cep-status').innerHTML = '';
            });
        }

        /* --- COMPARTILHAR, PLANEJADOR, VISUALIZAÇÃO E ENDEREÇO SALVO --- */
        async function compartilharCardapio() {
            const dados = { title: 'Tempero da Ilma - Cardápio de Marmitas', text: 'Olha o cardápio de marmitas caseiras do Tempero da Ilma!', url: location.origin + location.pathname };
            if (navigator.share) {
                try { await navigator.share(dados); } catch (e) {}
                return;
            }
            try {
                await navigator.clipboard.writeText(dados.url);
                mostrarToast('Link copiado! Cole para indicar a um amigo.');
            } catch (e) {
                mostrarToast('Copie o endereço na barra do navegador.');
            }
        }

        function abrirAssistenteCombo() {
            document.getElementById('quiz-modal').classList.remove('hidden');
        }

        function ajustarQuizPorPessoas() {
            const pessoas = document.getElementById('quiz-pessoas').value;
            document.getElementById('quiz-qtd').value = pessoas === '1' ? '5' : '10';
        }

        function aplicarSugestaoQuiz() {
            const mapa = {
                '5|Tradicional 350g': 'combo-5-350g', '10|Tradicional 350g': 'combo-10-350g',
                '5|Tradicional 500g': 'combo-5-500g', '10|Tradicional 500g': 'combo-10-500g',
                '5|Linha Fit 300g': 'combo-5-300g-fit', '10|Linha Fit 300g': 'combo-10-300g-fit'
            };
            const id = mapa[document.getElementById('quiz-qtd').value + '|' + document.getElementById('quiz-estilo').value];
            const combo = combos.find(c => c.id === id);
            if (!combo) return;
            document.getElementById('quiz-modal').classList.add('hidden');
            openFlavorsModal(combo.id);
            mostrarToast('Sugestão: ' + combo.name);
        }

        function mudarModoExibicao(modo) {
            modoExibicaoPratos = modo;
            document.querySelectorAll('.view-btn').forEach(btn => {
                btn.classList.remove('bg-white', 'text-stone-800', 'shadow-sm');
                btn.classList.add('text-stone-600');
            });
            const ativo = document.getElementById('view-btn-' + modo);
            if (ativo) {
                ativo.classList.add('bg-white', 'text-stone-800', 'shadow-sm');
                ativo.classList.remove('text-stone-600');
            }
            renderFlavorsDisplay();
        }

        function preencherUltimoEndereco() {
            let dados = null;
            try { dados = (JSON.parse(localStorage.getItem('tempero_ilma_historico_pedido') || 'null') || {}).cliente; } catch (e) {}
            if (!dados) { mostrarToast('Nenhum endereço salvo neste aparelho.'); return; }
            const preencher = (id, valor) => { if (valor) { document.getElementById(id).value = valor; limparErro(id); } };
            preencher('cust-cep', dados.cep);
            preencher('cust-rua', dados.rua);
            preencher('cust-numero', dados.numero);
            preencher('cust-comp', dados.comp);
            ultimaRuaAutomatica = '';
            ruaConfirmadaTexto = (dados.rua || '').trim();
            ruaPendenteConfirmacao = false;
            esconderAvisoRua();
            if (dados.bairro && selecionarBairroNoSelect(dados.bairro)) { aoMudarBairroManualmente(); limparErro('cust-bairro'); }
            mostrarToast('Endereço do último pedido preenchido.');
        }

        function escapeHtml(t) {
            return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }

        /* --- CARRINHO SALVO NO CELULAR --- */
        function salvarCarrinho() {
            try { localStorage.setItem('tempero_ilma_carrinho', JSON.stringify(cartCombos)); } catch (e) {}
        }

        function restaurarCarrinho() {
            try {
                const salvo = JSON.parse(localStorage.getItem('tempero_ilma_carrinho') || '[]');
                cartCombos = salvo
                    .filter(i => combos.some(c => c.id === i.comboId))
                    .map(i => {
                        const c = combos.find(x => x.id === i.comboId);
                        return { ...i, name: c.name, price: c.price, freteGratis: !!c.freteGratis };
                    });
                if (cartCombos.length) updateCartUI();
            } catch (e) {}
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
            cartCombos = [];
            updateCartUI();
            document.getElementById('sent-link').href = pendingWhatsUrl;
            document.getElementById('sent-modal').classList.remove('hidden');
            if (window.confetti && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
            }
        }

        /* --- CONFIGURAÇÕES (edite aqui) --- */
        const CONFIG = {
            pixChave: '+5571994125510', // CPF/CNPJ só números, celular com +55 (ex: +5571999999999), e-mail ou chave aleatória
            pixNome: 'TEMPERO DA ILMA', // nome do recebedor (até 25 letras, sem acento)
            pixCidade: 'SALVADOR' // cidade do recebedor (até 15 letras, sem acento)
        };

        // Frete grátis: somente com Combo de 10 (350g ou 500g)
        function temFreteGratis() { return cartCombos.some(c => c.freteGratis); }

        function freteEfetivo() {
            if (currentShippingFee === null) return null;
            return temFreteGratis() ? 0 : currentShippingFee;
        }

        // Data do sábado de entrega (dd/mm): de seg a sex é o sábado da semana; no fim de semana é o sábado seguinte
        function dataEntregaSabado() {
            const hoje = new Date();
            let dias = (6 - hoje.getDay() + 7) % 7;
            if (dias === 0) dias = 7;
            const d = new Date(hoje);
            d.setDate(hoje.getDate() + dias);
            const p2 = n => String(n).padStart(2, '0');
            return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`;
        }

        function mostrarAvisoFimDeSemana() {
            const dia = new Date().getDay();
            if (dia !== 6 && dia !== 0) return;
            const el = document.getElementById('weekend-banner');
            el.innerHTML = `<i class="fa-solid fa-calendar-check"></i> Pedidos feitos agora serão entregues no sábado, dia ${dataEntregaSabado()}`;
            el.classList.remove('hidden');
        }

        function renderFreteBanner() {
            const ok = temFreteGratis();
            const hint = document.getElementById('cart-ship-hint');
            const el = document.getElementById('free-ship-banner');
            const pct = ok ? 100 : (cartCombos.length ? 50 : 0);
            if (hint) {
                hint.innerText = ok ? 'Frete grátis garantido!' : 'Combo de 10 = frete grátis';
                hint.className = 'text-[10px] font-semibold ' + (ok ? 'text-emerald-600' : 'text-amber-600');
            }
            if (el) {
                el.innerHTML = ok
                    ? `<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs space-y-2"><p class="font-bold text-emerald-900"><i class="fa-solid fa-truck-fast"></i> Frete grátis garantido pelo Combo de 10!</p><div class="h-2 bg-stone-200 rounded-full overflow-hidden"><div class="h-full bg-emerald-500" style="width:100%"></div></div></div>`
                    : `<div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs space-y-2"><p class="font-bold text-amber-900"><i class="fa-solid fa-truck-fast"></i> Peça um Combo de 10 marmitas (350g ou 500g) e ganhe frete grátis!</p><div class="h-2 bg-stone-200 rounded-full overflow-hidden"><div class="h-full bg-amber-500" style="width:${pct}%"></div></div><div class="flex gap-2"><button type="button" onclick="closeCheckoutModal();openFlavorsModal('combo-10-350g')" class="flex-1 bg-amber-500 text-stone-900 font-bold py-1.5 rounded-lg">+ Combo 10 (350g)</button><button type="button" onclick="closeCheckoutModal();openFlavorsModal('combo-10-500g')" class="flex-1 bg-amber-500 text-stone-900 font-bold py-1.5 rounded-lg">+ Combo 10 (500g)</button></div></div>`;
            }
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
            const lista = availableFlavors.filter(f => f.tag === currentEditingCombo.type)
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

        /* --- PIX COPIA E COLA + QR CODE (padrão BR Code do Banco Central) --- */
        function crc16(str) {
            let crc = 0xFFFF;
            for (let i = 0; i < str.length; i++) {
                crc ^= str.charCodeAt(i) << 8;
                for (let j = 0; j < 8; j++) {
                    crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
                    crc &= 0xFFFF;
                }
            }
            return crc.toString(16).toUpperCase().padStart(4, '0');
        }

        function emv(id, valor) { return id + String(valor.length).padStart(2, '0') + valor; }

        function semAcentos(t) {
            return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 ]/g, '').toUpperCase();
        }

        function gerarPixPayload(valor) {
            const chave = CONFIG.pixChave.trim();
            const nome = semAcentos(CONFIG.pixNome).slice(0, 25) || 'RECEBEDOR';
            const cidade = semAcentos(CONFIG.pixCidade).slice(0, 15) || 'SALVADOR';
            const conta = emv('00', 'br.gov.bcb.pix') + emv('01', chave);
            let p = emv('00', '01') + emv('01', '11') + emv('26', conta) + emv('52', '0000') + emv('53', '986')
                + emv('54', valor.toFixed(2)) + emv('58', 'BR') + emv('59', nome) + emv('60', cidade)
                + emv('62', emv('05', '***')) + '6304';
            return p + crc16(p);
        }

        function pixConfigurado() { return !!CONFIG.pixChave && !/SUA-CHAVE/i.test(CONFIG.pixChave); }

        function desenharQr(elId, texto) {
            const el = document.getElementById(elId);
            if (!el) return;
            try {
                const qr = qrcode(0, 'M');
                qr.addData(texto);
                qr.make();
                el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
                const svg = el.querySelector('svg');
                if (svg) {
                    svg.setAttribute('width', '176');
                    svg.setAttribute('height', '176');
                    svg.setAttribute('role', 'img');
                    svg.setAttribute('aria-label', 'QR Code do Pix');
                }
            } catch (e) { el.innerHTML = ''; }
        }

        async function copiarPixCopiaECola() {
            if (!pixAtual) return;
            try {
                await navigator.clipboard.writeText(pixAtual);
                mostrarToast('Código Pix copiado! Cole no app do seu banco, em "Pix copia e cola".', null, null, 6000);
            } catch (e) { window.prompt('Copie o código Pix:', pixAtual); }
        }

        function atualizarPixBox() {
            const box = document.getElementById('pix-container');
            if (!box) return;
            const pix = document.getElementById('cust-payment').value === 'Pix';
            box.classList.toggle('hidden', !pix);
            if (!pix) return;
            const sub = cartCombos.reduce((sum, i) => sum + i.price, 0);
            const fe = freteEfetivo();
            const area = document.getElementById('pix-qr-area');
            document.getElementById('pix-chave').innerText = CONFIG.pixChave;
            if (fe === null) {
                document.getElementById('pix-valor').innerText = 'calcule o frete para ver o total';
                area.classList.add('hidden');
                return;
            }
            const total = sub + fe;
            document.getElementById('pix-valor').innerText = 'R$ ' + total.toFixed(2).replace('.', ',');
            if (pixConfigurado() && total > 0) {
                pixAtual = gerarPixPayload(total);
                desenharQr('pix-qr', pixAtual);
                area.classList.remove('hidden');
            } else {
                area.classList.add('hidden');
            }
        }

        async function copiarPix() {
            try { await navigator.clipboard.writeText(CONFIG.pixChave); mostrarToast('Chave Pix copiada!'); }
            catch (e) { mostrarToast('Chave Pix: ' + CONFIG.pixChave, null, null, 9000); }
        }

        /* --- CONTADOR REGRESSIVO: sempre até a próxima sexta, 23:59:59 --- */
        function iniciarContadorRegressivo() {
            function atualizarTimer() {
                const now = new Date();
                const diasAteSexta = (5 - now.getDay() + 7) % 7; // sexta = 0 dias
                const deadline = new Date(now);
                deadline.setDate(now.getDate() + diasAteSexta);
                deadline.setHours(23, 59, 59, 999);

                const diff = deadline - now;
                const timerText = document.getElementById('timer-text');
                const fimDeSemana = now.getDay() === 0 || now.getDay() === 6;
                document.getElementById('timer-label').innerText = fimDeSemana ? 'Encomendas para o próximo Sábado encerram em:' : 'Encomendas para entrega neste Sábado encerram em:';

                const d = Math.floor(diff / 86400000);
                const h = Math.floor((diff / 3600000) % 24);
                const m = Math.floor((diff / 60000) % 60);
                const s = Math.floor((diff / 1000) % 60);

                let text = d > 0 ? `${d}d ` : '';
                text += `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
                timerText.innerText = text;
            }

            atualizarTimer();
            setInterval(atualizarTimer, 1000);
        }

        function normalizarTexto(t) {
            return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        }

        function buscarPratos(valor) {
            currentFlavorSearch = valor.trim();
            renderFlavorsDisplay();
        }

        function filtrarPratos(tag) {
            currentFlavorFilter = tag;

            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.classList.remove('bg-white', 'text-stone-800', 'shadow-sm');
                btn.classList.add('text-stone-600');
            });
            const activeBtn = document.getElementById(`filter-btn-${tag}`);
            if (activeBtn) {
                activeBtn.classList.add('bg-white', 'text-stone-800', 'shadow-sm');
                activeBtn.classList.remove('text-stone-600');
            }

            renderFlavorsDisplay();
        }

        function mascaraCep(input) {
            let v = input.value.replace(/\D/g, '');
            if (v.length > 5) {
                v = v.substring(0, 5) + '-' + v.substring(5, 8);
            }
            input.value = v;
        }

        async function consultarViaCep() {
            const cep = document.getElementById('cust-cep').value.replace(/\D/g, '');
            const st = document.getElementById('cep-status');
            if (cep.length !== 8) { st.innerHTML = ''; return; }
            if (cep === ultimoCepConsultado) return;
            ultimoCepConsultado = cep;
            cepInfo = null;
            const msg = (cls, html) => { st.innerHTML = `<span class="${cls}">${html}</span>`; };
            msg('text-stone-500', '<i class="fa-solid fa-spinner animate-spin"></i> Consultando CEP...');

            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 8000);
            try {
                const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: ctrl.signal });
                if (!response.ok) throw new Error('http');
                const data = await response.json();
                clearTimeout(timer);

                if (data.erro) {
                    msg('text-amber-700', 'CEP não encontrado. Confira os números ou preencha o endereço abaixo.');
                    return;
                }
                msg('text-emerald-600', '<i class="fa-solid fa-circle-check"></i> CEP encontrado.');
                cepInfo = { cep, logradouro: data.logradouro || '', bairro: data.bairro || '' };
                const alertaFora = document.getElementById('bairro-fora-alerta');
                if (alertaFora) { alertaFora.classList.add('hidden'); alertaFora.innerHTML = ''; }

                if (data.logradouro) {
                    const campo = document.getElementById('cust-rua');
                    const atual = campo.value.trim();
                    if (!atual || atual === ultimaRuaAutomatica) {
                        campo.value = data.logradouro;
                        ultimaRuaAutomatica = data.logradouro;
                        ruaConfirmadaTexto = '';
                        ruaPendenteConfirmacao = false;
                        esconderAvisoRua();
                        limparErro('cust-rua');
                    } else {
                        verificarRuaComCep();
                    }
                }
                if (data.bairro) {
                    if (selecionarBairroNoSelect(data.bairro)) { aoMudarBairroManualmente(); pedirConfirmacaoBairro(); }
                    else avisarBairroForaDaLista(data.bairro);
                }
            } catch (err) {
                clearTimeout(timer);
                ultimoCepConsultado = '';
                msg('text-red-500', 'Não consegui consultar o CEP agora. Escolha o bairro na lista.');
            }
        }

        // CORREÇÃO: correspondência exata primeiro, depois "começa com", depois "contém"
        function selecionarBairroNoSelect(nomeBairro) {
            const norm = s => s.toLowerCase().normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "").replace(/\(.*?\)/g, "").trim();
            const select = document.getElementById('cust-bairro');
            const termo = norm(nomeBairro || '');
            if (!termo) return false;

            const opts = Array.from(select.options).filter(o => o.value);

            const achado =
                opts.find(o => norm(o.value) === termo) ||
                opts.find(o => norm(o.value).startsWith(termo) || termo.startsWith(norm(o.value))) ||
                opts.find(o => norm(o.value).includes(termo));

            if (achado) {
                select.value = achado.value;
                return true;
            }
            return false;
        }

        function calcularFreteEBuscarBairro() {
            const selectBairro = document.getElementById('cust-bairro');
            const statusEl = document.getElementById('shipping-calc-status');

            if (selectBairro.selectedIndex === 0) {
                statusEl.innerHTML = `<span class="text-red-500 font-bold">Escolha o seu bairro na busca ou na lista acima para calcular o frete.</span>`;
                document.getElementById('bairro-busca').focus();
                return;
            }

            const option = selectBairro.options[selectBairro.selectedIndex];
            currentShippingFee = parseFloat(option.getAttribute('data-taxa') || 0);
            updateCartUI();
            statusEl.innerHTML = `<span class="text-emerald-600 font-bold"><i class="fa-solid fa-circle-check"></i> Frete calculado para ${escapeHtml(option.value)}: R$ ${currentShippingFee.toFixed(2).replace('.', ',')}</span>`;
        }

        function aoMudarBairroManualmente() {
            bairroPendenteConfirmacao = false;
            const fora = document.getElementById('bairro-fora-alerta');
            if (fora) { fora.classList.add('hidden'); fora.innerHTML = ''; }
            const bc = document.getElementById('bairro-confirma');
            if (bc) { bc.classList.add('hidden'); bc.innerHTML = ''; }
            const select = document.getElementById('cust-bairro');
            const option = select.options[select.selectedIndex];
            const taxa = parseFloat(option.getAttribute('data-taxa') || 0);
            const statusEl = document.getElementById('shipping-calc-status');

            if (taxa > 0) {
                currentShippingFee = taxa;
                statusEl.innerHTML = `<span class="text-emerald-600 font-bold"><i class="fa-solid fa-circle-check"></i> Bairro ajustado para ${option.value}! Frete: R$ ${taxa.toFixed(2).replace('.', ',')}</span>`;
            } else {
                currentShippingFee = null;
                statusEl.innerHTML = `<span class="text-red-500">Selecione um bairro válido.</span>`;
            }
            updateCartUI();
        }

        function checkBusinessStatus() {
            const now = new Date();
            const dayOfWeek = now.getDay();
            const currentHour = now.getHours();
            const container = document.getElementById('business-status-container');

            if (dayOfWeek >= 1 && dayOfWeek <= 5 && currentHour >= 8 && currentHour < 17) {
                container.innerHTML = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800"><span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Aberto</span>`;
                return;
            }
            if (dayOfWeek === 6) {
                container.innerHTML = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800"><i class="fa-solid fa-truck text-[10px]"></i> Apenas Entregas</span>`;
                return;
            }
            container.innerHTML = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-stone-200 text-stone-600"><span class="w-2 h-2 rounded-full bg-stone-400"></span> Fechado</span>`;
        }

        const combos = [
            { id: 'combo-5-350g', name: "Combo 5 Marmitas - 350g", qty: 5, price: 100.00, description: "Escolha 5 marmitas tradicionais de 350g para a sua semana.", image: "Combo 5.1.png", type: "Tradicional", destaque: true },
            { id: 'combo-10-350g', freteGratis: true, name: "Combo 10 Marmitas - 350g", qty: 10, price: 200.00, description: "Escolha 10 marmitas tradicionais de 350g variadas para a sua semana.", image: "Combo 10.1.png", type: "Tradicional", destaque: false },
            { id: 'combo-5-500g', name: "Combo 5 Marmitas - 500g", qty: 5, price: 125.00, description: "Escolha 5 marmitas tradicionais de 500g para a sua semana.", image: "Combo 5.1.png", type: "Tradicional", destaque: false },
            { id: 'combo-10-500g', freteGratis: true, name: "Combo 10 Marmitas - 500g", qty: 10, price: 250.00, description: "Escolha 10 marmitas tradicionais de 500g variadas para a sua semana.", image: "Combo 10.png", type: "Tradicional", destaque: false },
            { id: 'combo-5-300g-fit', name: "Combo 5 Marmitas FIT - 300g", qty: 5, price: 130.00, description: "Escolha 5 marmitas da nossa linha fit leve de 300g.", image: "Combo 5.1.png", type: "Linha Fit", destaque: true },
            { id: 'combo-10-300g-fit', name: "Combo 10 Marmitas FIT - 300g", qty: 10, price: 260.00, description: "Escolha 10 marmitas da nossa linha fit leve de 300g variadas.", image: "Combo 10.1.png", type: "Linha Fit", destaque: false }
        ];

        const availableFlavors = [
            { id: 'f1', name: 'Panqueca de Frango', desc: 'Frango desfiado, molho de tomate e queijo parmesão', tag: 'Tradicional', img: 'Panqueca frango.png' },
            { id: 'f2', name: 'Bife de Carne Temperada', desc: 'Feijão preto, Arroz branco e Caponata', tag: 'Tradicional', img: 'Bife carne temparada.png' },
            { id: 'f3', name: 'Carne Moída com Caponata', desc: 'Carne moída, Arroz branco e Caponata', tag: 'Tradicional', img: 'Carne camponata.png' },
            { id: 'f4', name: 'Feijoada de Feijão Preto', desc: 'Arroz branco e couve folha', tag: 'Tradicional', img: 'Feijão preto.png' },
            { id: 'f5', name: 'Carne de Panela com Batatas', desc: 'Arroz branco e Feijão carioca', tag: 'Tradicional', img: 'Bife panela.jpg' },
            { id: 'f7', name: 'Strogonoff de Frango', desc: 'Frango, Batata doce assada com páprica defumada', tag: 'Tradicional', img: 'Strogonoff.jpg' },
            { id: 'f8', name: 'Quiabada de Frango', desc: 'Feijão e Arroz branco', tag: 'Tradicional', img: 'Quiabada.jpg' },
            { id: 'f9', name: 'Panqueca de Carne Moída', desc: 'Carne moída, Molho de tomate e Queijo parmesão', tag: 'Tradicional', img: 'Panqueca carne.jpg' },
            { id: 'f10', name: 'Bife de Carne Acebolado', desc: 'Feijão carioca, Arroz branco e Brócolis', tag: 'Tradicional', img: 'Bife acebolado.jpg' },
            { id: 'f11', name: 'Carne Moída com Mix de Verduras', desc: 'Carne moída, Arroz branco e Mix de Verduras', tag: 'Tradicional', img: 'Carne moida mix.jpg' },
            { id: 'f12', name: 'Penne a Bolonhesa', desc: 'Massa Penne, Molho de tomate e Carne moída', tag: 'Linha Fit', img: 'Penne.jpg' },
            { id: 'f13', name: 'Espaguete com Almôndegas', desc: 'Massa Espaguete, Molho de tomate e Almôndegas de Carne', tag: 'Tradicional', img: 'Almondegas.jpg' },
            { id: 'f14', name: 'Frango ao Creme de Milho', desc: 'Com milho e Arroz com Brócolis', tag: 'Tradicional', img: 'Frango milho.jpg' },
            { id: 'f15', name: 'Carne de Panela Desfiada', desc: 'Carne desfiada, Arroz branco, Purê de abóbora e Mix de verduras', tag: 'Tradicional', img: 'Carne desfiada.jpg' },
            { id: 'f16', name: 'Lombo de Boi recheado', desc: 'Lombo de boi, Arroz branco, Feijão e Brócolis', tag: 'Tradicional', img: 'Lombo de boi.jpg' },
            { id: 'f17', name: 'Omelete de Frango', desc: 'Omelete de Frango, Arroz branco, Purê de batata e Mix de Verduras', tag: 'Tradicional', img: 'Omelete frango.jpg' },
            { id: 'f18', name: 'Bife de Frango Acebolado', desc: 'Bife de frango, Feijão, Arroz branco e Cenoura', tag: 'Tradicional', img: 'Frango acebolado.jpg' },
            { id: 'f19', name: 'Panqueca de Frango (Farinha Integral)', desc: 'Frango desfiado, Molho de tomate e Queijo parmesão', tag: 'Linha Fit', img: 'Panqueca frango integral.jpg' },
            { id: 'f20', name: 'Frango com Purê de Mandioquinha', desc: 'Frango desfiado, Purê de mandioquinha e Legumes assados', tag: 'Linha Fit', img: 'Frango mandioquinha.jpg' },
            { id: 'f21', name: 'Escondidinho Fit', desc: 'Purê de batata doce e Frango desfiado', tag: 'Linha Fit', img: 'Escondidinho.jpg' },
            { id: 'f22', name: 'Macarrão Integral com Almôndegas', desc: 'Massa integral, Molho de tomate e Almôndegas', tag: 'Linha Fit', img: 'Integral almondegas.jpg' },
            { id: 'f23', name: 'Carne Moída com Arroz Funcional', desc: 'Carne moída, Arroz funcional e Mix de Verduras', tag: 'Linha Fit', img: 'Arroz funcional.jpg' }
        ];

        function renderFlavorsDisplay() {
            const grid = document.getElementById('flavors-display-grid');
            if (!grid) return;
            grid.innerHTML = '';
            grid.className = modoExibicaoPratos === 'lista' ? 'space-y-2' : 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4';

            const palavras = normalizarTexto(currentFlavorSearch).split(/\s+/).filter(Boolean);
            const filtered = availableFlavors
                .filter(f => currentFlavorFilter === 'Todos' || f.tag === currentFlavorFilter)
                .filter(f => {
                    const alvo = normalizarTexto(`${f.name} ${f.desc}`);
                    return palavras.every(w => alvo.includes(w));
                });

            if (!filtered.length) {
                grid.innerHTML = `<p class="col-span-full text-center text-xs text-stone-500 py-6">Nenhum prato encontrado${currentFlavorSearch ? ` para "${escapeHtml(currentFlavorSearch)}"` : ''}.</p>`;
                return;
            }

            filtered.forEach(flavor => {
                const el = document.createElement('div');
                if (modoExibicaoPratos === 'lista') {
                    el.className = "bg-white p-3 rounded-xl border border-stone-200 shadow-sm";
                    el.innerHTML = `
                        <span class="text-[9px] font-bold uppercase tracking-wider text-brand-secondary bg-emerald-50 px-2 py-0.5 rounded mr-2">${flavor.tag}</span>
                        <span class="font-bold text-stone-800 text-xs">${flavor.name}</span>
                        <p class="text-[10px] text-stone-500 mt-1">${flavor.desc}</p>`;
                } else {
                    el.className = "bg-white p-3 rounded-xl border border-stone-200 flex gap-3 items-center shadow-sm";
                    el.innerHTML = `
                        <img loading="lazy" decoding="async" src="${flavor.img}" alt="${flavor.name}" class="w-16 h-16 rounded-lg object-cover shrink-0">
                        <div class="flex-1">
                            <span class="text-[9px] font-bold uppercase tracking-wider text-brand-secondary bg-emerald-50 px-2 py-0.5 rounded">${flavor.tag}</span>
                            <h4 class="font-bold text-stone-800 text-xs mt-0.5">${flavor.name}</h4>
                            <p class="text-[10px] text-stone-500 leading-tight mt-0.5 line-clamp-2">${flavor.desc}</p>
                        </div>`;
                }
                grid.appendChild(el);
            });
        }

        function renderCombos() {
            const grid = document.getElementById('combos-grid');
            grid.innerHTML = '';
            combos.forEach(combo => {
                const card = document.createElement('div');
                card.className = "bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm hover:shadow-md transition flex flex-col justify-between relative";
                card.innerHTML = `
                    <div>
                        <div class="h-44 w-full overflow-hidden relative">
                            <img loading="lazy" decoding="async" src="${combo.image}" alt="${combo.name}" class="w-full h-full object-cover">
                            <span class="absolute top-3 left-3 selo-img backdrop-blur-md text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider shadow-sm">
                                ${combo.qty} Marmitas (${combo.type})
                            </span>
                            ${combo.destaque ? '<span class="absolute top-3 right-3 bg-amber-500 text-stone-900 text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider shadow-sm">Mais Vendido</span>' : ''}
                        </div>
                        <div class="p-4 space-y-2">
                            <h3 class="font-bold text-stone-800 text-lg">${combo.name}</h3>
                            <p class="text-stone-500 text-xs leading-relaxed">${combo.description}</p>
                        </div>
                    </div>
                    <div class="p-4 pt-0 flex items-center justify-between border-t border-stone-100 mt-2">
                        <div>
                            <span class="text-[10px] text-stone-400 block font-medium">Valor do Pacote</span>
                            <span class="text-base font-extrabold text-stone-800">R$ ${combo.price.toFixed(2).replace('.', ',')}</span>
                        </div>
                        <button onclick="openFlavorsModal('${combo.id}')" class="bg-brand-secondary hover:bg-brand-accent text-white font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-sm">
                            <i class="fa-solid fa-plus text-xs"></i> Montar & Adicionar
                        </button>
                    </div>
                `;
                grid.appendChild(card);
            });
        }

        function openFlavorsModal(comboId, editIdx) {
            editandoIndex = (typeof editIdx === 'number') ? editIdx : null;
            currentEditingCombo = combos.find(c => c.id === comboId);
            const item = editandoIndex !== null ? cartCombos[editandoIndex] : null;
            selectedFlavors = item ? { ...(item.flavors || {}) } : {};
            document.getElementById('combo-obs').value = item ? (item.obs || '') : '';
            document.getElementById('modal-combo-title').innerText = currentEditingCombo.name;
            document.getElementById('modal-combo-subtitle').innerText = `Escolha ${currentEditingCombo.qty} marmitas para este combo (${currentEditingCombo.type})`;
            document.getElementById('max-count').innerText = currentEditingCombo.qty;
            document.getElementById('btn-confirm-combo').innerText = item ? 'Salvar alterações' : 'Adicionar Combo ao Pedido';
            renderFlavorsSelectionList();
            updateFlavorSelectionState();
            document.getElementById('flavors-modal').classList.remove('hidden');
        }

        function closeFlavorsModal() {
            document.getElementById('flavors-modal').classList.add('hidden');
            if (editandoIndex !== null) { editandoIndex = null; openCheckoutModal(); }
        }

        function renderFlavorsSelectionList() {
            const container = document.getElementById('flavors-selection-list');
            container.innerHTML = '';
            const filteredFlavors = availableFlavors.filter(flavor => flavor.tag === currentEditingCombo.type);

            filteredFlavors.forEach(flavor => {
                const count = selectedFlavors[flavor.id] || 0;
                const item = document.createElement('div');
                item.className = "flex items-center justify-between bg-stone-50 p-3 rounded-xl border border-stone-200";
                item.innerHTML = `
                    <div class="max-w-[60%]">
                        <p class="font-bold text-stone-800 text-xs">${flavor.name}</p>
                        <p class="text-[10px] text-stone-500">${flavor.desc}</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="changeFlavorCount('${flavor.id}', -1)" class="w-8 h-8 bg-white border border-stone-300 rounded-lg flex items-center justify-center text-stone-700 font-bold hover:bg-stone-100">-</button>
                        <span class="font-bold text-stone-800 w-5 text-center text-sm">${count}</span>
                        <button onclick="changeFlavorCount('${flavor.id}', 1)" class="w-8 h-8 bg-white border border-stone-300 rounded-lg flex items-center justify-center text-stone-700 font-bold hover:bg-stone-100">+</button>
                    </div>
                `;
                container.appendChild(item);
            });
        }

        function changeFlavorCount(flavorId, delta) {
            const currentTotal = Object.values(selectedFlavors).reduce((a, b) => a + b, 0);
            const flavorCount = selectedFlavors[flavorId] || 0;
            if (delta > 0 && currentTotal >= currentEditingCombo.qty) {
                mostrarToast(`Limite de ${currentEditingCombo.qty} marmitas atingido neste combo.`);
                return;
            }
            const newCount = flavorCount + delta;
            if (newCount <= 0) {
                delete selectedFlavors[flavorId];
            } else {
                selectedFlavors[flavorId] = newCount;
            }
            renderFlavorsSelectionList();
            updateFlavorSelectionState();
        }

        function updateFlavorSelectionState() {
            const currentTotal = Object.values(selectedFlavors).reduce((a, b) => a + b, 0);
            document.getElementById('selected-count').innerText = currentTotal;
            const btnConfirm = document.getElementById('btn-confirm-combo');
            if (currentTotal === currentEditingCombo.qty) {
                btnConfirm.disabled = false;
                btnConfirm.classList.remove('bg-stone-300', 'text-stone-500');
                btnConfirm.classList.add('bg-brand-secondary', 'text-white', 'hover:bg-brand-accent');
            } else {
                btnConfirm.disabled = true;
                btnConfirm.classList.add('bg-stone-300', 'text-stone-500');
                btnConfirm.classList.remove('bg-brand-secondary', 'text-white', 'hover:bg-brand-accent');
            }
        }

        function confirmComboSelection() {
            const summaryFlavors = Object.entries(selectedFlavors).map(([flavorId, count]) => {
                const flavor = availableFlavors.find(f => f.id === flavorId);
                return `${count}x ${flavor.name}`;
            }).join(', ');

            const cartItem = {
                cartId: Date.now().toString(),
                comboId: currentEditingCombo.id,
                name: currentEditingCombo.name,
                price: currentEditingCombo.price,
                qty: currentEditingCombo.qty,
                freteGratis: !!currentEditingCombo.freteGratis,
                flavors: { ...selectedFlavors },
                flavorsSummary: summaryFlavors,
                obs: document.getElementById('combo-obs').value.trim()
            };

            const estavaEditando = editandoIndex !== null;
            if (estavaEditando) {
                cartItem.cartId = cartCombos[editandoIndex].cartId;
                cartCombos[editandoIndex] = cartItem;
            } else {
                cartCombos.push(cartItem);
            }
            editandoIndex = null;
            closeFlavorsModal();
            updateCartUI();
            animarCarrinho();
            if (estavaEditando) { openCheckoutModal(); mostrarToast('Combo atualizado.'); }
            else mostrarToast('Combo adicionado.', 'Ver pedido', openCheckoutModal);
        }

        function updateCartUI() {
            const countEl = document.getElementById('cart-count');
            const totalEl = document.getElementById('cart-total');
            const subtotalEl = document.getElementById('summary-subtotal-price');
            const shippingEl = document.getElementById('summary-shipping-price');
            const summaryTotalEl = document.getElementById('summary-total-price');
            const cartBar = document.getElementById('cart-bar');
            const container = document.getElementById('cart-combos-container');

            const totalCount = cartCombos.length;
            countEl.innerText = totalCount;

            const subtotalPrice = cartCombos.reduce((sum, item) => sum + item.price, 0);
            const feEf = freteEfetivo();
            const shippingFeeToDisplay = feEf !== null ? feEf : 0;
            const totalPrice = subtotalPrice + shippingFeeToDisplay;

            totalEl.innerText = `R$ ${totalPrice.toFixed(2).replace('.', ',')}`;
            if (subtotalEl) subtotalEl.innerText = `R$ ${subtotalPrice.toFixed(2).replace('.', ',')}`;

            if (shippingEl) {
                if (currentShippingFee !== null) {
                    if (temFreteGratis()) {
                        shippingEl.innerHTML = `<s class="text-stone-400 font-normal">R$ ${currentShippingFee.toFixed(2).replace('.', ',')}</s> <span class="text-emerald-600">GRÁTIS</span>`;
                    } else {
                        shippingEl.innerText = `R$ ${currentShippingFee.toFixed(2).replace('.', ',')}`;
                    }
                    shippingEl.className = "font-bold text-stone-800";
                } else {
                    shippingEl.innerText = "Clique em calcular frete";
                    shippingEl.className = "font-bold text-amber-600";
                }
            }

            renderFreteBanner();
            salvarCarrinho();
            if (summaryTotalEl) summaryTotalEl.innerText = `R$ ${totalPrice.toFixed(2).replace('.', ',')}`;

            if (totalCount > 0) {
                cartBar.classList.remove('translate-y-full');
            } else {
                cartBar.classList.add('translate-y-full');
            }

            container.innerHTML = '';
            cartCombos.forEach((item, index) => {
                const div = document.createElement('div');
                div.className = "bg-stone-50 p-3 rounded-xl border border-stone-200 flex justify-between items-start gap-2";
                div.innerHTML = `
                    <div>
                        <h5 class="font-bold text-stone-800 text-xs">${item.name}</h5>
                        <p class="text-[10px] text-stone-500 mt-0.5"><span class="font-semibold">Sabores:</span> ${item.flavorsSummary}</p>
                        ${item.obs ? `<p class="text-[10px] text-amber-700 mt-0.5">Obs: ${escapeHtml(item.obs)}</p>` : ''}
                        <p class="text-xs font-bold text-brand-accent mt-1">R$ ${item.price.toFixed(2).replace('.', ',')}</p>
                    </div>
                    <div class="flex flex-col items-center gap-1"><button onclick="editarCombo(${index})" title="Editar combo" class="text-stone-400 hover:text-amber-600 p-1"><i class="fa-solid fa-pen text-xs"></i></button><button onclick="duplicarCombo(${index})" title="Duplicar combo" class="text-stone-400 hover:text-emerald-600 p-1"><i class="fa-regular fa-copy text-xs"></i></button><button onclick="removeCartItem(${index})" title="Remover" class="text-stone-400 hover:text-red-500 p-1"><i class="fa-solid fa-trash-can text-xs"></i></button></div>
                `;
                container.appendChild(div);
            });
        }

        function removeCartItem(index) {
            const removido = cartCombos[index];
            if (!removido) return;
            cartCombos.splice(index, 1);
            updateCartUI();
            mostrarToast('Combo removido.', 'Desfazer', () => {
                cartCombos.splice(Math.min(index, cartCombos.length), 0, removido);
                updateCartUI();
                animarCarrinho();
            }, 6000);
        }

        function openCheckoutModal() {
            if (cartCombos.length === 0) {
                mostrarToast('Seu carrinho está vazio. Escolha um combo para começar.');
                return;
            }
            document.getElementById('checkout-modal').classList.remove('hidden');
            document.getElementById('checkout-scroll').scrollTop = 0;
            atualizarEtapas();
        }

        function closeCheckoutModal() {
            document.getElementById('checkout-modal').classList.add('hidden');
        }

        function toggleTrocoField() {
            const payment = document.getElementById('cust-payment').value;
            const trocoContainer = document.getElementById('troco-container');
            atualizarPixBox();
            if (payment === 'Dinheiro') {
                trocoContainer.classList.remove('hidden');
            } else {
                trocoContainer.classList.add('hidden');
            }
        }

        function salvarUltimoCliente(dados) {
            const historicoCompleto = {
                cliente: dados,
                itensCarrinho: cartCombos
            };
            try {
                localStorage.setItem('tempero_ilma_historico_pedido', JSON.stringify(historicoCompleto));
                const btnEnd = document.getElementById('btn-ultimo-endereco');
                if (btnEnd) btnEnd.classList.remove('hidden');
            } catch (e) {}
        }

        function verificarUltimoCliente() {
            try {
                const salvo = localStorage.getItem('tempero_ilma_historico_pedido');
                if (salvo) {
                    document.getElementById('quick-reorder-banner').classList.remove('hidden');
                    document.getElementById('btn-ultimo-endereco').classList.remove('hidden');
                }
            } catch (e) {}
        }

        function carregarUltimoCliente() {
            let salvo = null;
            try {
                salvo = localStorage.getItem('tempero_ilma_historico_pedido');
            } catch (e) {}
            if (!salvo) return;

            const historico = JSON.parse(salvo);
            const dados = historico.cliente || {};

            document.getElementById('cust-name').value = dados.name || '';
            document.getElementById('cust-phone').value = dados.phone || '';
            document.getElementById('cust-cep').value = dados.cep || '';
            document.getElementById('cust-rua').value = dados.rua || '';
            document.getElementById('cust-numero').value = dados.numero || '';
            document.getElementById('cust-comp').value = dados.comp || '';

            // CORREÇÃO: ao carregar o bairro salvo, já atualiza o frete
            if (dados.bairro) {
                if (selecionarBairroNoSelect(dados.bairro)) aoMudarBairroManualmente();
            }

            if (historico.itensCarrinho && historico.itensCarrinho.length > 0) {
                cartCombos = historico.itensCarrinho.map(i => ({ ...i, freteGratis: !!(combos.find(c => c.id === i.comboId) || {}).freteGratis }));
                updateCartUI();
            }

            mostrarToast('Pedido anterior carregado no carrinho.');
            openCheckoutModal();
        }

        function sendToWhatsApp() {
            if (cartCombos.length === 0) {
                mostrarToast('Adicione pelo menos um combo ao carrinho.');
                return;
            }

            const name = document.getElementById('cust-name').value.trim();
            const phone = document.getElementById('cust-phone').value.trim();
            const cep = document.getElementById('cust-cep').value.trim();
            const bairro = document.getElementById('cust-bairro').value;
            const rua = document.getElementById('cust-rua').value.trim();
            const numero = document.getElementById('cust-numero').value.trim();
            const comp = document.getElementById('cust-comp').value.trim();
            const payment = document.getElementById('cust-payment').value;
            const troco = document.getElementById('cust-troco').value.trim();
            const obs = document.getElementById('cust-obs').value.trim();

            verificarRuaComCep();
            limparTodosErros();
            const erros = [];
            if (!name) erros.push(['cust-name', 'Informe seu nome completo.']);
            const telDigitos = phone.replace(/\D/g, '');
            if (telDigitos.length < 10 || telDigitos.length > 13) erros.push(['cust-phone', 'Digite um telefone válido com DDD. Ex: (71) 99999-9999']);
            if (!rua) erros.push(['cust-rua', 'Informe a rua ou avenida.']);
            else if (ruaPendenteConfirmacao) erros.push(['cust-rua', 'Confirme se a rua está correta (veja o aviso abaixo).']);
            if (!numero) erros.push(['cust-numero', 'Informe o número (ou S/N).']);
            if (!bairro) erros.push(['cust-bairro', 'Selecione o seu bairro.']);
            else if (bairroPendenteConfirmacao) erros.push(['cust-bairro', 'Confirme se o bairro identificado pelo CEP está correto.']);
            if (erros.length) {
                erros.forEach(([id, msg]) => marcarErro(id, msg));
                const primeiro = document.getElementById(erros[0][0]);
                primeiro.scrollIntoView({ behavior: 'smooth', block: 'center' });
                primeiro.focus({ preventScroll: true });
                return;
            }

            if (currentShippingFee === null) {
                const st = document.getElementById('shipping-calc-status');
                st.innerHTML = '<span class="text-red-500 font-bold">Clique em "Calcular Frete" antes de enviar o pedido.</span>';
                st.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }

            salvarUltimoCliente({ name, phone, cep, bairro, rua, numero, comp });

            let fullAddress = `${rua}, nº ${numero}`;
            if (comp) fullAddress += ` (${comp})`;
            fullAddress += ` - Bairro: ${bairro}, Salvador - BA`;
            if (cep) fullAddress += ` (CEP: ${cep})`;

            const ePlate = String.fromCodePoint(0x1F37D);
            const eUser = String.fromCodePoint(0x1F464);
            const ePhone = String.fromCodePoint(0x1F4DE);
            const ePin = String.fromCodePoint(0x1F4CD);
            const eMap = String.fromCodePoint(0x1F4CC);
            const eMemo = String.fromCodePoint(0x1F4DD);
            const eBox = String.fromCodePoint(0x1F4E6);
            const eMoney = String.fromCodePoint(0x1F4B0);
            const eDelivery = String.fromCodePoint(0x1F69A);
            const eCard = String.fromCodePoint(0x1F4B3);
            const eNote = String.fromCodePoint(0x1F4D1);
            const eSparkles = String.fromCodePoint(0x2728);

            const agora = new Date();
            const p2 = n => String(n).padStart(2, '0');
            const numPedido = `${p2(agora.getDate())}${p2(agora.getMonth() + 1)}-${p2(agora.getHours())}${p2(agora.getMinutes())}${p2(agora.getSeconds())}`;
            let lines = [];
            lines.push(`${ePlate} *NOVO PEDIDO #${numPedido} - TEMPERO DA ILMA* ${ePlate}`);
            lines.push(``);
            lines.push(`${eUser} *Cliente:* ${name}`);
            lines.push(`${ePhone} *Telefone:* ${phone}`);
            lines.push(`${ePin} *Endereço:* ${fullAddress}`);
            lines.push(`${eMap} *Localização no Maps:* https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${rua}, ${numero}, ${bairro}, Salvador - BA`)}`);

            lines.push(``);
            lines.push(`${eMemo} *--- COMANDA DIGITAL ---*`);

            cartCombos.forEach((item, index) => {
                lines.push(``);
                lines.push(`${eBox} *Combo ${index + 1}: ${item.name}* (R$ ${item.price.toFixed(2).replace('.', ',')})`);
                if (item.obs) lines.push(`   *Obs do combo:* ${item.obs}`);
                lines.push(`   *Sabores Escolhidos:*`);

                const saboresArray = item.flavorsSummary.split(', ');
                saboresArray.forEach(sabor => {
                    lines.push(`   - ${sabor}`);
                });
            });

            const subtotalPrice = cartCombos.reduce((sum, item) => sum + item.price, 0);
            const feFinal = freteEfetivo();
            const totalPrice = subtotalPrice + feFinal;

            const tot = {};
            cartCombos.forEach(it => it.flavorsSummary.split(', ').forEach(sv => {
                const m = sv.match(/^(\d+)x (.+)$/);
                if (m) tot[m[2]] = (tot[m[2]] || 0) + parseInt(m[1], 10);
            }));
            lines.push(``);
            lines.push(`${eNote} *TOTAL POR SABOR*`);
            Object.entries(tot).forEach(([n, q]) => lines.push(`- ${q}x ${n}`));

            lines.push(``);
            lines.push(`${eMoney} *RESUMO FINANCEIRO*`);
            lines.push(`Subtotal: R$ ${subtotalPrice.toFixed(2).replace('.', ',')}`);
            lines.push(`${eDelivery} Taxa de Entrega (${bairro}): ${feFinal === 0 ? 'GRÁTIS' : 'R$ ' + feFinal.toFixed(2).replace('.', ',')}`);
            lines.push(`*TOTAL GERAL:* *R$ ${totalPrice.toFixed(2).replace('.', ',')}*`);
            lines.push(``);
            lines.push(`${eCard} *Forma de Pagamento:* ${payment}`);
            lines.push(`${eDelivery} *Sábado de entrega:* ${dataEntregaSabado()}`);

            if (payment === 'Dinheiro' && troco) {
                lines.push(`*Troco para:* ${troco}`);
            }
            if (obs) {
                lines.push(`${eNote} *Observações:* ${obs}`);
            }

            lines.push(``);
            lines.push(`_Pedido gerado automaticamente pelo cardápio digital_ ${eSparkles}`);

            const fullText = lines.join('\n');
            const whatsappUrl = `https://wa.me/5571994125510?text=${encodeURIComponent(fullText)}`;
            abrirConfirmacao(whatsappUrl, { name, phone, fullAddress, payment, troco, obs, subtotalPrice, feFinal, totalPrice, fullText });
        }

        document.addEventListener('DOMContentLoaded', function() {
            checkBusinessStatus();
            iniciarContadorRegressivo();
            renderFlavorsDisplay();
            renderCombos();
            verificarUltimoCliente();
            mostrarAvisoFimDeSemana();
            iniciarValidacao();
            iniciarEtapas();
            iniciarModais();
            iniciarEndereco();
            restaurarCarrinho();
            atualizarIconeTema();
            renderFreteBanner();
            if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
        });
    