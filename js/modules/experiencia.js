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

        let quizPlanoAtual = [];
        let quizMontagemAtiva = false;
        let quizIndiceCombo = 0;
        let quizCombosPendentes = [];
        let quizConfirmandoEtapa = false;

        function abrirAssistenteCombo() {
            document.getElementById('quiz-formulario').classList.remove('hidden');
            document.getElementById('quiz-resultado').classList.add('hidden');
            document.getElementById('quiz-calcular').classList.remove('hidden');
            document.getElementById('quiz-acoes-resultado').classList.add('hidden');
            document.getElementById('quiz-erro').classList.add('hidden');
            document.getElementById('quiz-modal').classList.remove('hidden');
        }

        function fecharAssistenteCombo() {
            document.getElementById('quiz-modal').classList.add('hidden');
        }

        function editarRespostasQuiz() {
            document.getElementById('quiz-formulario').classList.remove('hidden');
            document.getElementById('quiz-resultado').classList.add('hidden');
            document.getElementById('quiz-calcular').classList.remove('hidden');
            document.getElementById('quiz-acoes-resultado').classList.add('hidden');
            document.getElementById('quiz-erro').classList.add('hidden');
        }

        function calcularNecessidadeQuiz(pessoas, dias, refeicoes) {
            const qtdPessoas = Number(pessoas);
            const qtdDias = Number(dias);
            const qtdRefeicoes = Number(refeicoes);
            if (!Number.isInteger(qtdPessoas) || qtdPessoas < 1 || qtdPessoas > 20) return null;
            if (![2, 3, 5, 7].includes(qtdDias) || ![1, 2].includes(qtdRefeicoes)) return null;
            const total = qtdPessoas * qtdDias * qtdRefeicoes;
            const sugerido = Math.ceil(total / 5) * 5;
            return {
                pessoas: qtdPessoas,
                dias: qtdDias,
                refeicoes: qtdRefeicoes,
                total: total,
                sugerido: sugerido,
                excedente: sugerido - total
            };
        }

        function gerarPlanoCombosQuiz(quantidade, estilo) {
            const opcoes = {
                'Tradicional 350g': { tipo: 'Tradicional', peso: '350g' },
                'Tradicional 500g': { tipo: 'Tradicional', peso: '500g' },
                'Linha Fit 300g': { tipo: 'Linha Fit', peso: '300g FIT' }
            };
            const escolha = opcoes[estilo];
            if (!escolha || !Number.isInteger(Number(quantidade)) || Number(quantidade) < 5 || Number(quantidade) % 5 !== 0) return null;

            const combo5 = combos.find(c => c.type === escolha.tipo && c.qty === 5 && c.name.includes(escolha.peso));
            const combo10 = combos.find(c => c.type === escolha.tipo && c.qty === 10 && c.name.includes(escolha.peso));
            if (!combo5 || !combo10) return null;

            let restante = Number(quantidade);
            const ids = [];
            while (restante >= 10) {
                ids.push(combo10.id);
                restante -= 10;
            }
            if (restante === 5) ids.push(combo5.id);
            if (restante !== 0) return null;

            const itens = ids.map(id => combos.find(c => c.id === id));
            return {
                ids: ids,
                itens: itens,
                quantidade: itens.reduce((soma, item) => soma + item.qty, 0),
                total: itens.reduce((soma, item) => soma + item.price, 0),
                temFreteGratis: itens.some(item => item.freteGratis)
            };
        }

        function aplicarSugestaoQuiz() {
            const calculo = calcularNecessidadeQuiz(
                document.getElementById('quiz-pessoas').value,
                document.getElementById('quiz-dias').value,
                document.getElementById('quiz-refeicoes').value
            );
            const erro = document.getElementById('quiz-erro');
            erro.classList.add('hidden');

            if (!calculo) {
                erro.textContent = 'Confira as respostas. Informe de 1 a 20 pessoas e selecione as opções disponíveis.';
                erro.classList.remove('hidden');
                return;
            }

            const estilo = document.getElementById('quiz-estilo').value;
            const plano = gerarPlanoCombosQuiz(calculo.sugerido, estilo);
            if (!plano) {
                erro.textContent = 'Não foi possível montar a sugestão com os combos disponíveis. Tente outra preferência.';
                erro.classList.remove('hidden');
                return;
            }

            quizPlanoAtual = plano.ids.slice();
            quizIndiceCombo = 0;
            const detalhamento = {};
            plano.itens.forEach(item => { detalhamento[item.id] = (detalhamento[item.id] || 0) + 1; });
            const linhas = Object.entries(detalhamento).map(([id, quantidade]) => {
                const item = combos.find(c => c.id === id);
                return '<li class="flex justify-between gap-3"><span>' + quantidade + ' × ' + escapeHtml(item.name) + '</span><strong class="whitespace-nowrap">R$ ' + (quantidade * item.price).toFixed(2).replace('.', ',') + '</strong></li>';
            }).join('');

            document.getElementById('quiz-resultado').innerHTML =
                '<div class="rounded-xl bg-emerald-50 border border-emerald-200 p-4 space-y-3">' +
                    '<div><p class="text-[10px] font-bold uppercase tracking-wide text-emerald-800">Quantidade calculada</p>' +
                    '<p class="text-3xl font-extrabold text-emerald-900">' + calculo.total + ' <span class="text-sm font-bold">marmitas</span></p>' +
                    '<p class="text-[11px] text-emerald-800">Para ' + calculo.pessoas + ' pessoa(s), durante ' + calculo.dias + ' dia(s), com ' + calculo.refeicoes + ' refeição(ões) por dia.</p></div>' +
                    '<div class="border-t border-emerald-200 pt-3"><p class="text-[10px] font-bold uppercase tracking-wide text-emerald-800">Combos recomendados</p>' +
                    '<p class="text-xl font-extrabold text-stone-900">' + plano.quantidade + ' marmitas</p>' +
                    '<ul class="space-y-1 text-[11px] text-stone-700 mt-2">' + linhas + '</ul>' +
                    '<p class="text-[10px] text-stone-600 mt-2">' + (calculo.excedente ? 'A sugestão inclui ' + calculo.excedente + ' marmita(s) extra(s), pois os combos são vendidos em pacotes de 5 e 10.' : 'A quantidade dos combos corresponde exatamente ao planejamento informado.') + '</p></div>' +
                    '<div class="flex items-center justify-between border-t border-emerald-200 pt-3"><span class="text-xs font-bold text-stone-700">Total estimado</span><strong class="text-lg text-stone-900">R$ ' + plano.total.toFixed(2).replace('.', ',') + '</strong></div>' +
                    '<p class="text-[10px] text-stone-600">' + (plano.temFreteGratis ? 'Seu planejamento inclui Combo 10 tradicional, que oferece frete grátis conforme as condições da loja.' : 'O frete, quando aplicável, será calculado no checkout.') + '</p>' +
                '</div>';

            document.getElementById('quiz-formulario').classList.add('hidden');
            document.getElementById('quiz-resultado').classList.remove('hidden');
            document.getElementById('quiz-calcular').classList.add('hidden');
            document.getElementById('quiz-acoes-resultado').classList.remove('hidden');
        }

        function iniciarMontagemSugestaoQuiz() {
            if (!quizPlanoAtual.length) {
                mostrarToast('Calcule sua quantidade primeiro.');
                return;
            }
            quizCombosPendentes = quizPlanoAtual.slice();
            quizIndiceCombo = 0;
            quizMontagemAtiva = true;
            fecharAssistenteCombo();
            abrirProximoComboQuiz();
        }

        function abrirProximoComboQuiz() {
            const id = quizCombosPendentes[quizIndiceCombo];
            if (!id) {
                quizMontagemAtiva = false;
                quizCombosPendentes = [];
                quizIndiceCombo = 0;
                return;
            }
            openFlavorsModal(id);
            const combo = combos.find(c => c.id === id);
            document.getElementById('modal-combo-subtitle').innerText =
                'Etapa ' + (quizIndiceCombo + 1) + ' de ' + quizCombosPendentes.length + ': escolha ' + combo.qty + ' marmitas (' + combo.type + ').';
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
