/* Frete, tema e operações comerciais. */
/* --- REGRAS DE FRETE E OPERAÇÃO DA LOJA --- */
        

        // Todas as entregas são cobradas conforme a taxa do bairro selecionado.
        function freteEfetivo() {
            return currentShippingFee;
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
            const hint = document.getElementById('cart-ship-hint');
            const el = document.getElementById('free-ship-banner');
            if (hint) {
                hint.innerText = 'Frete conforme o bairro';
                hint.className = 'text-[10px] font-semibold text-stone-500';
            }
            if (el) {
                el.innerHTML = '<div class="bg-stone-50 border border-stone-200 rounded-xl p-3 text-xs"><p class="font-semibold text-stone-700"><i class="fa-solid fa-truck text-brand-secondary"></i> O frete é calculado conforme o bairro informado e será cobrado normalmente.</p></div>';
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
