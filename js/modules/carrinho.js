/* Seleção de sabores e gerenciamento do carrinho. */
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
