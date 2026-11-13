/* Checkout e dados do cliente. */
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
                if (!salvo) return;
                const historico = JSON.parse(salvo);
                if (!historico || typeof historico !== 'object' || Array.isArray(historico)) throw new Error('Histórico inválido.');
                const banner = document.getElementById('quick-reorder-banner');
                const btnEndereco = document.getElementById('btn-ultimo-endereco');
                if (banner) banner.classList.remove('hidden');
                if (btnEndereco) btnEndereco.classList.remove('hidden');
            } catch (e) {
                try { localStorage.removeItem('tempero_ilma_historico_pedido'); } catch (erro) {}
            }
        }

        function carregarUltimoCliente() {
            let salvo = null;
            try {
                salvo = localStorage.getItem('tempero_ilma_historico_pedido');
            } catch (e) {}
            if (!salvo) return;

            let historico;
            try {
                historico = JSON.parse(salvo);
                if (!historico || typeof historico !== 'object' || Array.isArray(historico)) throw new Error('Histórico inválido.');
            } catch (erro) {
                try { localStorage.removeItem('tempero_ilma_historico_pedido'); } catch (falha) {}
                const banner = document.getElementById('quick-reorder-banner');
                const btnEndereco = document.getElementById('btn-ultimo-endereco');
                if (banner) banner.classList.add('hidden');
                if (btnEndereco) btnEndereco.classList.add('hidden');
                mostrarToast('Os dados anteriores não puderam ser lidos e foram removidos. Preencha seus dados novamente.');
                return;
            }
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

        function apagarDadosSalvos() {
            const confirmado = window.confirm('Isso apagará deste navegador os dados do último cliente, o carrinho e sua lista de favoritos. Não apaga mensagens já enviadas pelo WhatsApp. Deseja continuar?');
            if (!confirmado) return;
            try {
                localStorage.removeItem('tempero_ilma_historico_pedido');
                localStorage.removeItem('tempero_ilma_carrinho');
                localStorage.removeItem('tempero_ilma_favoritos_v1');
            } catch (erro) {
                mostrarToast('Não foi possível apagar os dados salvos neste navegador.');
                return;
            }
            cartCombos = [];
            if (typeof pratosFavoritos !== 'undefined') pratosFavoritos = [];
            if (typeof atualizarContadorFavoritos === 'function') atualizarContadorFavoritos();
            if (currentFlavorFilter === 'Favoritos') filtrarPratos('Todos');
            currentShippingFee = null;
            cepInfo = null;
            ultimoCepConsultado = '';
            bairroPendenteConfirmacao = false;
            ruaPendenteConfirmacao = false;
            ultimaRuaAutomatica = '';
            ruaConfirmadaTexto = '';
            ['cust-name','cust-phone','cust-cep','cust-rua','cust-numero','cust-comp','cust-obs','cust-troco'].forEach(id => {
                const campo = document.getElementById(id);
                if (campo) campo.value = '';
            });
            const bairro = document.getElementById('cust-bairro');
            if (bairro) bairro.selectedIndex = 0;
            const pagamento = document.getElementById('cust-payment');
            if (pagamento) pagamento.selectedIndex = 0;
            const banner = document.getElementById('quick-reorder-banner');
            const btnEndereco = document.getElementById('btn-ultimo-endereco');
            if (banner) banner.classList.add('hidden');
            if (btnEndereco) btnEndereco.classList.add('hidden');
            closeCheckoutModal();
            updateCartUI();
            try { localStorage.removeItem('tempero_ilma_carrinho'); } catch (erro) {}
            mostrarToast('Dados, carrinho e favoritos apagados deste navegador.');
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
            fullAddress += ` - Bairro: ${bairro}, ${CONFIG_LOJA.cidade}`;
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
            lines.push(`${eMap} *Localização no Maps:* https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${rua}, ${numero}, ${bairro}, ${CONFIG_LOJA.cidade}`)}`);

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
            const whatsappUrl = `https://wa.me/${CONFIG_LOJA.whatsappNumero}?text=${encodeURIComponent(fullText)}`;
            abrirConfirmacao(whatsappUrl, { name, phone, fullAddress, payment, troco, obs, subtotalPrice, feFinal, totalPrice, fullText });
        }
