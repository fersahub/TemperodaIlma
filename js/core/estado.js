/* Estado global. Scripts clássicos preservam compatibilidade com os eventos inline do HTML. */
const combos = window.TEMPERO_DADOS.combos;
const availableFlavors = window.TEMPERO_DADOS.pratos;
const CONFIG_LOJA = window.TEMPERO_CONFIG.loja;
const CONFIG = window.TEMPERO_CONFIG.pix;

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
