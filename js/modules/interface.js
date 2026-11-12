/* Alertas, toasts, modais e utilitários da interface. */
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
