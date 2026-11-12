/* Frete, tema e operações comerciais. */
/* --- REGRAS DE FRETE E OPERAÇÃO DA LOJA --- */
        

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
                    ? `<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs space-y-2"><p class="font-bold text-emerald-900"><i class="fa-solid fa-truck-fast"></i> Frete grátis garantido pelo Combo de 10!</p><div class="h-2 bg-stone-200 rounded-full overflow-hidden"><div class="h-full bg-emerald-500 frete-progresso-100"></div></div></div>`
                    : `<div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs space-y-2"><p class="font-bold text-amber-900"><i class="fa-solid fa-truck-fast"></i> Peça um Combo de 10 marmitas (350g ou 500g) e ganhe frete grátis!</p><div class="h-2 bg-stone-200 rounded-full overflow-hidden"><div class="h-full bg-amber-500 frete-progresso-${pct}"></div></div><div class="flex gap-2"><button type="button" onclick="closeCheckoutModal();openFlavorsModal('combo-10-350g')" class="flex-1 bg-amber-500 text-stone-900 font-bold py-1.5 rounded-lg">+ Combo 10 (350g)</button><button type="button" onclick="closeCheckoutModal();openFlavorsModal('combo-10-500g')" class="flex-1 bg-amber-500 text-stone-900 font-bold py-1.5 rounded-lg">+ Combo 10 (500g)</button></div></div>`;
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
