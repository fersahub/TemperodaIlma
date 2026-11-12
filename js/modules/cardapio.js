/* Renderização do cardápio e dos combos. */
function renderFlavorsDisplay() {
            const grid = document.getElementById('flavors-display-grid');
            if (!grid) return;
            grid.innerHTML = '';
            grid.className = modoExibicaoPratos === 'lista' ? 'space-y-2' : 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4';

            const palavras = normalizarTexto(currentFlavorSearch).split(/\s+/).filter(Boolean);
            const filtered = availableFlavors
                .filter(f => currentFlavorFilter === 'Todos' || f.tag === currentFlavorFilter)
                .filter(f => {
                    const alvo = normalizarTexto(`${f.name} ${f.desc}`);
                    return palavras.every(w => alvo.includes(w));
                });

            if (!filtered.length) {
                grid.innerHTML = `<p class="col-span-full text-center text-xs text-stone-500 py-6">Nenhum prato encontrado${currentFlavorSearch ? ` para "${escapeHtml(currentFlavorSearch)}"` : ''}.</p>`;
                return;
            }

            filtered.forEach(flavor => {
                const el = document.createElement('div');
                if (modoExibicaoPratos === 'lista') {
                    el.className = "bg-white p-3 rounded-xl border border-stone-200 shadow-sm";
                    el.innerHTML = `
                        <span class="text-[9px] font-bold uppercase tracking-wider text-brand-secondary bg-emerald-50 px-2 py-0.5 rounded mr-2">${flavor.tag}</span>
                        <span class="font-bold text-stone-800 text-xs">${flavor.name}</span>
                        <p class="text-[10px] text-stone-500 mt-1">${flavor.desc}</p>`;
                } else {
                    el.className = "bg-white p-3 rounded-xl border border-stone-200 flex gap-3 items-center shadow-sm";
                    el.innerHTML = `
                        <img loading="lazy" decoding="async" width="64" height="64" src="${flavor.img}" alt="${flavor.name}" class="w-16 h-16 rounded-lg object-cover shrink-0">
                        <div class="flex-1">
                            <span class="text-[9px] font-bold uppercase tracking-wider text-brand-secondary bg-emerald-50 px-2 py-0.5 rounded">${flavor.tag}</span>
                            <h4 class="font-bold text-stone-800 text-xs mt-0.5">${flavor.name}</h4>
                            <p class="text-[10px] text-stone-500 leading-tight mt-0.5 line-clamp-2">${flavor.desc}</p>
                        </div>`;
                }
                grid.appendChild(el);
            });
        }

        function renderCombos() {
            const grid = document.getElementById('combos-grid');
            grid.innerHTML = '';
            combos.forEach(combo => {
                const card = document.createElement('div');
                card.className = "bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm hover:shadow-md transition flex flex-col justify-between relative";
                card.innerHTML = `
                    <div>
                        <div class="h-44 w-full overflow-hidden relative">
                            <img loading="lazy" decoding="async" width="640" height="352" src="${combo.image}" alt="${combo.name}" class="w-full h-full object-cover">
                            <span class="absolute top-3 left-3 selo-img backdrop-blur-md text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider shadow-sm">
                                ${combo.qty} Marmitas (${combo.type})
                            </span>
                            ${combo.destaque ? '<span class="absolute top-3 right-3 bg-amber-500 text-stone-900 text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider shadow-sm">Mais Vendido</span>' : ''}
                        </div>
                        <div class="p-4 space-y-2">
                            <h3 class="font-bold text-stone-800 text-lg">${combo.name}</h3>
                            <p class="text-stone-500 text-xs leading-relaxed">${combo.description}</p>
                        </div>
                    </div>
                    <div class="p-4 pt-0 flex items-center justify-between border-t border-stone-100 mt-2">
                        <div>
                            <span class="text-[10px] text-stone-400 block font-medium">Valor do Pacote</span>
                            <span class="text-base font-extrabold text-stone-800">R$ ${combo.price.toFixed(2).replace('.', ',')}</span>
                        </div>
                        <button onclick="openFlavorsModal('${combo.id}')" class="bg-brand-secondary hover:bg-brand-accent text-white font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-sm">
                            <i class="fa-solid fa-plus text-xs"></i> Montar & Adicionar
                        </button>
                    </div>
                `;
                grid.appendChild(card);
            });
        }
