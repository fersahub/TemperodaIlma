/* Consulta e conferência de endereço. */
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
