/* Contador, horários, busca de pratos e consulta de CEP. */
/* Horário da operação sempre calculado no fuso de Salvador, independentemente do aparelho. */
function obterDataHoraLoja() {
    const cfg = window.TEMPERO_CONFIG && window.TEMPERO_CONFIG.operacao || {};
    const timeZone = cfg.timeZone || 'America/Bahia';
    const partes = new Intl.DateTimeFormat('en-US', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    const mapa = {};
    partes.forEach(item => { if (item.type !== 'literal') mapa[item.type] = Number(item.value); });
    const year = mapa.year, month = mapa.month, day = mapa.day;
    return { year, month, day, hour: mapa.hour, minute: mapa.minute, second: mapa.second,
        weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
        timestamp: Date.UTC(year, month - 1, day, mapa.hour, mapa.minute, mapa.second) };
}

/* --- CONTADOR REGRESSIVO: corte semanal no horário da loja --- */
function iniciarContadorRegressivo() {
    function atualizarTimer() {
        const cfg = window.TEMPERO_CONFIG && window.TEMPERO_CONFIG.operacao || {};
        const now = obterDataHoraLoja();
        const diaCorte = Number(cfg.cutoffWeekday ?? 5);
        const horaCorte = Number(cfg.cutoffHour ?? 23);
        const minutoCorte = Number(cfg.cutoffMinute ?? 59);
        const diasAteCorte = (diaCorte - now.weekday + 7) % 7;
        const deadline = Date.UTC(now.year, now.month - 1, now.day + diasAteCorte, horaCorte, minutoCorte, 59);
        const diff = Math.max(0, deadline - now.timestamp);
        const timerText = document.getElementById('timer-text');
        const fimDeSemana = now.weekday === 0 || now.weekday === 6;
        document.getElementById('timer-label').innerText = fimDeSemana
            ? 'Encomendas para o próximo Sábado encerram em:'
            : 'Encomendas para entrega neste Sábado encerram em:';
        const d = Math.floor(diff / 86400000);
        const h = Math.floor((diff / 3600000) % 24);
        const m = Math.floor((diff / 60000) % 60);
        const s = Math.floor((diff / 1000) % 60);
        let text = d > 0 ? d + 'd ' : '';
        text += String(h).padStart(2, '0') + 'h ' + String(m).padStart(2, '0') + 'm ' + String(s).padStart(2, '0') + 's';
        if (timerText) timerText.innerText = text;
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
            const activeBtn = Array.from(document.querySelectorAll('.filter-btn')).find(btn => btn.dataset.filter === tag);
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
            const campoCep = document.getElementById('cust-cep');
            const cep = campoCep.value.replace(/\D/g, '');
            const st = document.getElementById('cep-status');
            if (cep.length !== 8) {
                if (cepConsultaController) cepConsultaController.abort();
                cepConsultaController = null;
                cepConsultaId++;
                ultimoCepConsultado = '';
                cepInfo = null;
                if (st) st.innerHTML = '';
                return;
            }
            if (cep === ultimoCepConsultado && cepInfo && cepInfo.cep === cep) return;
            if (cepConsultaController) cepConsultaController.abort();
            const consultaId = ++cepConsultaId;
            const ctrl = new AbortController();
            cepConsultaController = ctrl;
            ultimoCepConsultado = cep;
            cepInfo = null;
            const msg = (cls, html) => { if (st) st.innerHTML = '<span class="' + cls + '">' + html + '</span>'; };
            msg('text-stone-500', '<i class="fa-solid fa-spinner animate-spin"></i> Consultando CEP...');
            const timer = setTimeout(() => ctrl.abort(), 8000);
            try {
                const response = await fetch('https://viacep.com.br/ws/' + cep + '/json/', { signal: ctrl.signal });
                if (!response.ok) throw new Error('http');
                const data = await response.json();
                const cepAtual = campoCep.value.replace(/\D/g, '');
                if (consultaId !== cepConsultaId || cepAtual !== cep) return;
                if (data.erro) {
                    ultimoCepConsultado = '';
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
                    } else { verificarRuaComCep(); }
                }
                if (data.bairro) {
                    if (selecionarBairroNoSelect(data.bairro)) {
                        currentShippingFee = null;
                        bairroPendenteConfirmacao = true;
                        pedirConfirmacaoBairro();
                        const status = document.getElementById('shipping-calc-status');
                        if (status) status.textContent = 'Confirme o bairro identificado pelo CEP para calcular o frete.';
                        updateCartUI();
                    } else {
                        currentShippingFee = null;
                        avisarBairroForaDaLista(data.bairro);
                        updateCartUI();
                    }
                }
            } catch (err) {
                const cepAtual = campoCep.value.replace(/\D/g, '');
                if (consultaId !== cepConsultaId || cepAtual !== cep || err.name === 'AbortError') return;
                ultimoCepConsultado = '';
                msg('text-red-500', 'Não consegui consultar o CEP agora. Escolha o bairro na lista.');
            } finally {
                clearTimeout(timer);
                if (consultaId === cepConsultaId) cepConsultaController = null;
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

            if (bairroPendenteConfirmacao) {
                statusEl.innerHTML = '<span class="text-amber-700 font-bold">Confirme o bairro identificado pelo CEP antes de calcular o frete.</span>';
                return;
            }
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
            const cfg = window.TEMPERO_CONFIG && window.TEMPERO_CONFIG.operacao || {};
            const now = obterDataHoraLoja();
            const dayOfWeek = now.weekday;
            const currentHour = now.hour;
            const inicioSemana = Number(cfg.openWeekdayStart ?? 1);
            const fimSemana = Number(cfg.openWeekdayEnd ?? 5);
            const horaAbertura = Number(cfg.openHour ?? 8);
            const horaFechamento = Number(cfg.closeHour ?? 17);
            const container = document.getElementById('business-status-container');

            if (dayOfWeek >= inicioSemana && dayOfWeek <= fimSemana && currentHour >= horaAbertura && currentHour < horaFechamento) {
                container.innerHTML = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800"><span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Aberto</span>`;
                return;
            }
            if (dayOfWeek === 6) {
                container.innerHTML = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800"><i class="fa-solid fa-truck text-[10px]"></i> Apenas Entregas</span>`;
                return;
            }
            container.innerHTML = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-stone-200 text-stone-600"><span class="w-2 h-2 rounded-full bg-stone-400"></span> Fechado</span>`;
        }
