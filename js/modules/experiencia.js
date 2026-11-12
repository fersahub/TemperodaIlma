/* Compartilhamento, planejador e visualização. */
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
