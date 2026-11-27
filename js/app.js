/* Inicialização da aplicação. */
document.addEventListener('DOMContentLoaded', function() {
            if (typeof iniciarCatalogoPublico === 'function') iniciarCatalogoPublico();
            checkBusinessStatus();
            iniciarContadorRegressivo();
            iniciarFavoritos();
            renderFlavorsDisplay();
            renderCombos();
            renderAvulsasDisplay();
            verificarUltimoCliente();
            mostrarAvisoFimDeSemana();
            iniciarValidacao();
            iniciarEtapas();
            iniciarSistemaAvaliacoes();
            iniciarModais();
            iniciarEndereco();
            restaurarCarrinho();
            atualizarIconeTema();
            renderFreteBanner();
            if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
        });
