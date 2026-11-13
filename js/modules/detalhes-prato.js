/* Janela de detalhes do prato. Dados exibidos vêm do cadastro de pratos. */
let pratoDetalheAtualId = null;
let elementoOrigemDetalhe = null;
function atualizarBotaoFavoritoDetalhe(id) {
    const botao = document.getElementById('dish-detail-favorite');
    if (!botao || !id || pratoDetalheAtualId !== id) return;
    const ativo = pratoEstaFavoritado(id);
    botao.setAttribute('aria-pressed', String(ativo));
    botao.innerHTML = ativo ? '<i class="fa-solid fa-heart"></i> Salvo nos favoritos' : '<i class="fa-regular fa-heart"></i> Adicionar aos favoritos';
    botao.classList.toggle('is-favorito', ativo);
}
function abrirDetalhesPrato(id) {
    const prato = availableFlavors.find(item => item.id === String(id));
    if (!prato) { mostrarToast('Não foi possível localizar esse prato.'); return; }
    pratoDetalheAtualId = prato.id;
    elementoOrigemDetalhe = document.activeElement;
    const imagem = document.getElementById('dish-detail-image');
    imagem.src = prato.img;
    imagem.alt = prato.name;
    document.getElementById('dish-detail-name').textContent = prato.name;
    document.getElementById('dish-detail-tag').textContent = prato.tag;
    document.getElementById('dish-detail-description').textContent = prato.desc;
    atualizarBotaoFavoritoDetalhe(prato.id);
    document.getElementById('dish-detail-modal').classList.remove('hidden');
    document.getElementById('dish-detail-close').focus({ preventScroll: true });
}
function fecharDetalhesPrato() {
    const modal = document.getElementById('dish-detail-modal');
    if (modal) modal.classList.add('hidden');
    const origem = elementoOrigemDetalhe;
    pratoDetalheAtualId = null;
    elementoOrigemDetalhe = null;
    if (origem && origem.isConnected && typeof origem.focus === 'function') origem.focus({ preventScroll: true });
}
function alternarFavoritoDetalhe() {
    if (pratoDetalheAtualId) alternarFavoritoPrato(pratoDetalheAtualId);
}
function verCombosDoPrato() {
    fecharDetalhesPrato();
    const combosSection = document.getElementById('combos-grid');
    if (!combosSection) return;
    combosSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const primeiroBotao = combosSection.querySelector('button');
    if (primeiroBotao) primeiroBotao.focus({ preventScroll: true });
}
