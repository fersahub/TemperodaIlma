/* Inicialização da aplicação. */
document.addEventListener('DOMContentLoaded', function() {
            checkBusinessStatus();
            iniciarContadorRegressivo();
            renderFlavorsDisplay();
            renderCombos();
            verificarUltimoCliente();
            mostrarAvisoFimDeSemana();
            iniciarValidacao();
            iniciarEtapas();
            iniciarModais();
            iniciarEndereco();
            restaurarCarrinho();
            atualizarIconeTema();
            renderFreteBanner();
            if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
        });
