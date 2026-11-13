/* Renderização do cardápio e dos combos. */
function renderFlavorsDisplay() {
    const grid = document.getElementById('flavors-display-grid');
    if (!grid) return;
    grid.innerHTML = '';
    grid.className = modoExibicaoPratos === 'lista' ? 'space-y-2' : 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4';
    if (typeof atualizarContadorFavoritos === 'function') atualizarContadorFavoritos();

    const palavras = normalizarTexto(currentFlavorSearch).split(/\s+/).filter(Boolean);
    const filtered = availableFlavors
        .filter(flavor => {
            if (currentFlavorFilter === 'Todos') return true;
            if (currentFlavorFilter === 'Favoritos') return pratoEstaFavoritado(flavor.id);
            return flavor.tag === currentFlavorFilter;
        })
        .filter(flavor => {
            const alvo = normalizarTexto(flavor.name + ' ' + flavor.desc);
            return palavras.every(word => alvo.includes(word));
        });

    if (!filtered.length) {
        if (currentFlavorFilter === 'Favoritos' && !availableFlavors.some(flavor => pratoEstaFavoritado(flavor.id))) {
            grid.innerHTML = \`
                <div class="col-span-full bg-white border border-dashed border-stone-300 rounded-2xl p-8 text-center space-y-3">
                    <div class="w-12 h-12 mx-auto rounded-full bg-rose-50 text-rose-500 flex items-center justify-center text-xl"><i class="fa-regular fa-heart"></i></div>
                    <p class="font-bold text-stone-800 text-sm">Sua lista de favoritos está vazia.</p>
                    <p class="text-xs text-stone-500">Toque no coração de um prato para guardá-lo aqui.</p>
                    <button type="button" onclick="filtrarPratos('Todos')" class="inline-flex items-center gap-2 bg-brand-secondary hover:bg-brand-accent text-white font-bold text-xs px-4 py-2.5 rounded-xl">Explorar cardápio</button>
                </div>\`;
        } else {
            grid.innerHTML = \`<p class="col-span-full text-center text-xs text-stone-500 py-6">Nenhum prato encontrado${currentFlavorSearch ? \` para "${escapeHtml(currentFlavorSearch)}"\` : ''}.</p>\`;
        }
        return;
    }

    filtered.forEach(flavor => {
        const el = document.createElement('article');
        const favorito = pratoEstaFavoritado(flavor.id);
        const idSeguro = escapeHtml(flavor.id);
        const nomeSeguro = escapeHtml(flavor.name);
        const descricaoSegura = escapeHtml(flavor.desc);
        const categoriaSegura = escapeHtml(flavor.tag);
        const imagemSegura = escapeHtml(flavor.img);
        const tamanhoImagem = modoExibicaoPratos === 'lista' ? 'w-14 h-14' : 'w-16 h-16';
        el.className = 'bg-white p-3 rounded-xl border border-stone-200 shadow-sm';
        el.innerHTML = \`
            <div class="flex items-center gap-3">
                <button type="button" data-prato-id="${idSeguro}" onclick="abrirDetalhesPrato(this.dataset.pratoId)" class="shrink-0 rounded-lg focus:outline-none" aria-label="Ver detalhes de ${nomeSeguro}">
                    <img loading="lazy" decoding="async" width="64" height="64" src="${imagemSegura}" alt="${nomeSeguro}" class="${tamanhoImagem} rounded-lg object-cover">
                </button>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2">
                        <span class="text-[9px] font-bold uppercase tracking-wider text-brand-secondary bg-emerald-50 px-2 py-0.5 rounded">${categoriaSegura}</span>
                        <button type="button" data-prato-id="${idSeguro}" onclick="alternarFavoritoPrato(this.dataset.pratoId)" class="prato-favorito-btn w-9 h-9 shrink-0 rounded-full flex items-center justify-center transition ${favorito ? 'is-favorito' : 'bg-stone-100 text-stone-500 hover:text-rose-600'}" aria-label="${favorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}: ${nomeSeguro}" aria-pressed="${favorito}" title="${favorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">
                            <i class="${favorito ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                        </button>
                    </div>
                    <button type="button" data-prato-id="${idSeguro}" onclick="abrirDetalhesPrato(this.dataset.pratoId)" class="block text-left w-full mt-1">
                        <h4 class="font-bold text-stone-800 text-xs leading-snug">${nomeSeguro}</h4>
                    </button>
                    <p class="text-[10px] text-stone-500 leading-tight mt-1 line-clamp-2">${descricaoSegura}</p>
                    <button type="button" data-prato-id="${idSeguro}" onclick="abrirDetalhesPrato(this.dataset.pratoId)" class="mt-2 text-[10px] font-bold text-brand-secondary hover:underline inline-flex items-center gap-1">
                        Ver detalhes <i class="fa-solid fa-arrow-right text-[9px]"></i>
                    </button>
                </div>
            </div>\`;
        grid.appendChild(el);
    });
}

function renderCombos() {
    const grid = document.getElementById('combos-grid');
    if (!grid) return;
    grid.innerHTML = '';
    combos.forEach(combo => {
        const card = document.createElement('div');
        card.className = "bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm hover:shadow-md transition flex flex-col justify-between relative";
        card.innerHTML = \`
            <div>
                <div class="h-44 w-full overflow-hidden relative">
                    <img loading="lazy" decoding="async" width="640" height="352" src="${combo.image}" alt="${combo.name}" class="w-full h-full object-cover">
                    <span class="absolute top-3 left-3 selo-img backdrop-blur-md text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider shadow-sm">${combo.qty} Marmitas (${combo.type})</span>
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
                <button onclick="openFlavorsModal('${combo.id}')" class="bg-brand-secondary hover:bg-brand-accent text-white font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-sm"><i class="fa-solid fa-plus text-xs"></i> Montar & Adicionar</button>
            </div>\`;
        grid.appendChild(card);
    });
}
