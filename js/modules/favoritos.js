/* Lista de favoritos: armazenada somente no navegador do cliente. */
const FAVORITOS_STORAGE_KEY = 'tempero_ilma_favoritos_v1';
function carregarPratosFavoritos() {
    try {
        const salvo = localStorage.getItem(FAVORITOS_STORAGE_KEY);
        if (!salvo) return [];
        const ids = JSON.parse(salvo);
        if (!Array.isArray(ids)) throw new Error('Lista de favoritos inválida.');
        return [...new Set(ids.filter(id => typeof id === 'string' && availableFlavors.some(prato => prato.id === id)))];
    } catch (erro) {
        try { localStorage.removeItem(FAVORITOS_STORAGE_KEY); } catch (falha) {}
        return [];
    }
}
let pratosFavoritos = carregarPratosFavoritos();
function pratoEstaFavoritado(id) { return pratosFavoritos.includes(String(id)); }
function atualizarContadorFavoritos() {
    const contador = document.getElementById('favorites-count');
    if (contador) contador.textContent = String(pratosFavoritos.length);
    const botao = document.getElementById('filter-btn-Favoritos');
    if (botao) botao.setAttribute('aria-label', `Mostrar ${pratosFavoritos.length} pratos favoritos`);
}
function iniciarFavoritos() { atualizarContadorFavoritos(); }
function alternarFavoritoPrato(id) {
    const prato = availableFlavors.find(item => item.id === String(id));
    if (!prato) return;
    const jaFavoritado = pratoEstaFavoritado(prato.id);
    const atualizados = jaFavoritado ? pratosFavoritos.filter(item => item !== prato.id) : [...pratosFavoritos, prato.id];
    try { localStorage.setItem(FAVORITOS_STORAGE_KEY, JSON.stringify(atualizados)); }
    catch (erro) { mostrarToast('Não foi possível salvar seus favoritos neste navegador.'); return; }
    pratosFavoritos = atualizados;
    atualizarContadorFavoritos();
    if (typeof atualizarBotaoFavoritoDetalhe === 'function') atualizarBotaoFavoritoDetalhe(prato.id);
    if (typeof renderFlavorsDisplay === 'function') renderFlavorsDisplay();
    mostrarToast(jaFavoritado ? `"${prato.name}" removido dos favoritos.` : `"${prato.name}" adicionado aos favoritos.`);
}
