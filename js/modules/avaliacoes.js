/* Avaliações públicas por sabor e experiência geral. */
const CHAVE_PEDIDOS_PARA_AVALIAR = 'tempero_ilma_pedidos_para_avaliar_v1';
let dadosPublicosAvaliacoes = { overall: { count: 0, average: null }, flavors: {}, comments: [] };
let pedidoAtualParaAvaliar = null;
let notasSaboresAvaliacao = {};
let notaGeralAvaliacao = 0;
let envioAvaliacaoEmAndamento = false;
let intervaloCarrosselAvaliacoes = null;
let indiceCarrosselAvaliacoes = 0;

function urlApiAvaliacoes() {
    const url = String(window.TEMPERO_CONFIG?.avaliacoes?.apiUrl || '').trim();
    const appsScript=/^https:\/\/script\.google\.com\/macros\/s\/[^/?#]+\/exec\/?$/.test(url);
    const cloudflareWorker=/^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev\/exec\/?$/i.test(url);
    return appsScript||cloudflareWorker ? url : '';
}

function gerarCodigoPedidoAvaliacao() {
    const bytes = new Uint8Array(12);
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
        window.crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function coletarSaboresPedidoAvaliacao() {
    const sabores = new Map();
    const incluir = (id, nome) => {
        let prato = id ? availableFlavors.find(item => item.id === String(id)) : null;
        if (!prato && nome) prato = availableFlavors.find(item => item.name === String(nome));
        if (prato && tamanhosDisponiveisAvaliacao(prato)) {
            sabores.set(prato.id, { id: prato.id, name: prato.name });
        }
    };

    (Array.isArray(cartCombos) ? cartCombos : []).forEach(item => {
        const saboresCombo = item && item.flavors && typeof item.flavors === 'object' ? item.flavors : {};
        Object.entries(saboresCombo).forEach(([id, quantidade]) => {
            if (Number(quantidade) > 0) incluir(id);
        });
        if (!Object.keys(saboresCombo).length && item && item.flavorsSummary) {
            String(item.flavorsSummary).split(', ').forEach(texto => {
                const correspondencia = texto.match(/^\d+x\s+(.+)$/);
                if (correspondencia) incluir('', correspondencia[1]);
            });
        }
    });

    (Array.isArray(cartAvulsas) ? cartAvulsas : []).forEach(item => {
        if (item) incluir(item.flavorId, item.name);
    });
    return Array.from(sabores.values()).slice(0, 20);
}

function tamanhosDisponiveisAvaliacao(prato) {
    return Boolean(prato && !prato.emBreve && prato.disponivel !== false);
}

function lerPedidosPendentesAvaliacao() {
    try {
        const dados = JSON.parse(localStorage.getItem(CHAVE_PEDIDOS_PARA_AVALIAR) || '[]');
        if (!Array.isArray(dados)) return [];
        return dados.filter(item =>
            item &&
            /^[A-F0-9]{24}$/.test(String(item.orderId || '')) &&
            Array.isArray(item.flavors) &&
            item.flavors.length > 0
        );
    } catch (erro) {
        return [];
    }
}

function salvarPedidosPendentesAvaliacao(lista) {
    try {
        localStorage.setItem(CHAVE_PEDIDOS_PARA_AVALIAR, JSON.stringify(lista.slice(-30)));
    } catch (erro) {
        mostrarToast('Não foi possível guardar o convite de avaliação neste navegador.');
    }
    atualizarBotoesConviteAvaliacao();
}

function registrarPedidoPendenteAvaliacao(pedido) {
    if (!pedido || !/^[A-F0-9]{24}$/.test(String(pedido.reviewOrderId || ''))) return;
    const sabores = Array.isArray(pedido.reviewFlavors) ? pedido.reviewFlavors : [];
    if (!sabores.length) return;
    const pendentes = lerPedidosPendentesAvaliacao().filter(item => item.orderId !== pedido.reviewOrderId);
    pendentes.push({
        orderId: pedido.reviewOrderId,
        flavors: sabores,
        createdAt: new Date().toISOString()
    });
    salvarPedidosPendentesAvaliacao(pendentes);
}

function removerPedidoPendenteAvaliacao(orderId) {
    const lista = lerPedidosPendentesAvaliacao().filter(item => item.orderId !== orderId);
    salvarPedidosPendentesAvaliacao(lista);
}

function atualizarBotoesConviteAvaliacao() {
    const ativo = Boolean(urlApiAvaliacoes());
    const haPedidos = lerPedidosPendentesAvaliacao().length > 0;
    const botaoResumo = document.getElementById('avaliacoes-abrir-btn');
    const botaoEnviado = document.getElementById('btn-avaliar-pedido-enviado');
    if (botaoResumo) botaoResumo.classList.toggle('hidden', !(ativo && haPedidos));
    if (botaoEnviado) botaoEnviado.classList.toggle('hidden', !(ativo && haPedidos));
}

function solicitarDadosAvaliacoes(action, parametros, callback) {
    const endpoint = urlApiAvaliacoes();
    if (!endpoint) {
        callback({ ok: false, message: 'O sistema de avaliações ainda não foi ativado.' });
        return;
    }
    const nomeCallback = 'tempAvaliacoes_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
    const script = document.createElement('script');
    const query = new URLSearchParams({ action, callback: nomeCallback, _: String(Date.now()) });
    Object.entries(parametros || {}).forEach(([chave, valor]) => query.set(chave, String(valor)));
    let finalizado = false;
    const concluir = resposta => {
        if (finalizado) return;
        finalizado = true;
        try { delete window[nomeCallback]; } catch (erro) { window[nomeCallback] = undefined; }
        script.remove();
        callback(resposta || { ok: false, message: 'Resposta vazia do serviço de avaliações.' });
    };
    window[nomeCallback] = concluir;
    script.onerror = () => concluir({ ok: false, message: 'Não foi possível conectar ao serviço de avaliações.' });
    script.src = endpoint + '?' + query.toString();
    script.async = true;
    document.head.appendChild(script);
    window.setTimeout(() => concluir({ ok: false, message: 'O serviço de avaliações não respondeu.' }), 12000);
}

function carregarAvaliacoesPublicas() {
    if (!urlApiAvaliacoes()) return;
    solicitarDadosAvaliacoes('list', {}, resposta => {
        if (!resposta || !resposta.ok) return;
        dadosPublicosAvaliacoes = {
            overall: resposta.overall || { count: 0, average: null },
            flavors: resposta.flavors || {},
            comments: Array.isArray(resposta.comments) ? resposta.comments : []
        };
        renderizarResumoAvaliacoes();
        if (typeof renderFlavorsDisplay === 'function') renderFlavorsDisplay();
        if (typeof pratoDetalheAtualId !== 'undefined' && pratoDetalheAtualId) {
            renderResumoAvaliacaoDetalhe(pratoDetalheAtualId);
        }
    });
}

function formatarNotaAvaliacao(valor) {
    return Number(valor).toFixed(1).replace('.', ',');
}

function htmlResumoAvaliacaoSabor(pratoId) {
    const resumo = dadosPublicosAvaliacoes.flavors[String(pratoId)];
    if (!resumo || !Number(resumo.count)) return '';
    const media = Number(resumo.average);
    const quantidade = Number(resumo.count);
    if (!Number.isFinite(media) || quantidade < 1) return '';
    return '<span class="inline-flex items-center gap-1 text-[10px] font-bold text-stone-500" aria-label="Nota ' +
        formatarNotaAvaliacao(media) + ' de 5, ' + quantidade + ' avaliações">' +
        '<i class="fa-solid fa-star text-amber-500"></i> ' + formatarNotaAvaliacao(media) +
        ' <span class="font-normal">(' + quantidade + ')</span></span>';
}

function renderResumoAvaliacaoDetalhe(pratoId) {
    const alvo = document.getElementById('dish-detail-rating');
    if (!alvo) return;
    if (!urlApiAvaliacoes()) {
        alvo.innerHTML = '';
        alvo.classList.add('hidden');
        return;
    }
    const resumo = dadosPublicosAvaliacoes.flavors[String(pratoId)];
    if (!resumo || !Number(resumo.count)) {
        alvo.textContent = 'Este sabor ainda não recebeu avaliações.';
        alvo.classList.remove('hidden');
        alvo.className = 'text-xs text-stone-500';
        return;
    }
    alvo.innerHTML = htmlResumoAvaliacaoSabor(pratoId);
    alvo.className = 'text-sm';
}

function renderizarResumoAvaliacoes() {
    const secao = document.getElementById('avaliacoes-section');
    if (!secao || !urlApiAvaliacoes()) return;
    secao.classList.remove('hidden');

    const geral = dadosPublicosAvaliacoes.overall || { count: 0, average: null };
    const media = document.getElementById('avaliacoes-media-geral');
    const estrelas = document.getElementById('avaliacoes-estrelas-geral');
    const total = document.getElementById('avaliacoes-total-geral');
    if (media) media.textContent = Number(geral.count) ? formatarNotaAvaliacao(geral.average) + '/5' : '—';
    if (estrelas) estrelas.textContent = Number(geral.count) ? '★'.repeat(Math.max(1, Math.round(Number(geral.average)))) : '';
    if (total) total.textContent = Number(geral.count)
        ? Number(geral.count) + (Number(geral.count) === 1 ? ' avaliação geral' : ' avaliações gerais')
        : 'Ainda não temos avaliações';

    const comentarios = document.getElementById('avaliacoes-comentarios');
    const semComentarios = document.getElementById('avaliacoes-sem-comentarios');
    const viewport = document.getElementById('avaliacoes-carrossel');
    if (intervaloCarrosselAvaliacoes) {
        window.clearInterval(intervaloCarrosselAvaliacoes);
        intervaloCarrosselAvaliacoes = null;
    }
    indiceCarrosselAvaliacoes = 0;
    if (comentarios) {
        comentarios.innerHTML = '';
        comentarios.style.transform = 'translateX(0)';
        dadosPublicosAvaliacoes.comments.forEach(item => {
            const card = document.createElement('article');
            card.className = 'w-full shrink-0 rounded-lg border border-stone-200 bg-stone-50 p-3 space-y-1';
            card.style.flex = '0 0 100%';
            const cabecalho = document.createElement('div');
            cabecalho.className = 'flex items-center justify-between gap-2';
            const nome = document.createElement('strong');
            nome.className = 'text-xs text-stone-800';
            nome.textContent = String(item.name || 'Cliente');
            const nota = document.createElement('span');
            nota.className = 'text-xs font-bold text-amber-600 shrink-0';
            nota.textContent = '★ ' + String(item.rating || '') + '/5';
            cabecalho.append(nome, nota);
            const texto = document.createElement('p');
            texto.className = 'text-xs text-stone-600 whitespace-pre-line break-words line-clamp-3';
            texto.textContent = String(item.comment || 'Avaliação registrada por um cliente.');
            card.append(cabecalho, texto);
            if (item.date) {
                const data = document.createElement('p');
                data.className = 'text-[10px] text-stone-400';
                data.textContent = String(item.date);
                card.appendChild(data);
            }
            comentarios.appendChild(card);
        });
    }
    const totalComentarios = dadosPublicosAvaliacoes.comments.length;
    if (semComentarios) semComentarios.classList.toggle('hidden', totalComentarios > 0);
    if (viewport) viewport.classList.toggle('hidden', totalComentarios === 0);
    if (comentarios && totalComentarios > 1 && viewport) {
        if (!viewport.dataset.carrosselPreparado) {
            viewport.addEventListener('mouseenter', () => { viewport.dataset.carrosselPausado = 'true'; });
            viewport.addEventListener('mouseleave', () => { viewport.dataset.carrosselPausado = 'false'; });
            viewport.addEventListener('focusin', () => { viewport.dataset.carrosselPausado = 'true'; });
            viewport.addEventListener('focusout', () => { viewport.dataset.carrosselPausado = 'false'; });
            viewport.dataset.carrosselPreparado = 'true';
            viewport.dataset.carrosselPausado = 'false';
        }
        const movimentoReduzido = window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!movimentoReduzido) {
            intervaloCarrosselAvaliacoes = window.setInterval(() => {
                if (viewport.dataset.carrosselPausado === 'true') return;
                indiceCarrosselAvaliacoes = (indiceCarrosselAvaliacoes + 1) % totalComentarios;
                comentarios.style.transform = 'translateX(-' + (indiceCarrosselAvaliacoes * 100) + '%)';
            }, 7500);
        }
    }
    atualizarBotoesConviteAvaliacao();
}

function criarControleEstrelas(container, valorAtual, aoSelecionar, rotulo) {
    if (!container) return;
    container.innerHTML = '';
    for (let nota = 1; nota <= 5; nota++) {
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'avaliacao-estrela text-2xl leading-none px-0.5 ' + (nota <= valorAtual ? 'text-amber-500' : 'text-stone-300');
        botao.innerHTML = '<i class="fa-solid fa-star"></i>';
        botao.setAttribute('aria-label', rotulo + ': ' + nota + ' de 5 estrelas');
        botao.setAttribute('aria-pressed', String(nota === valorAtual));
        botao.addEventListener('click', () => aoSelecionar(nota));
        container.appendChild(botao);
    }
}

function renderizarControleNotaGeral() {
    criarControleEstrelas(
        document.getElementById('avaliacao-nota-geral'),
        notaGeralAvaliacao,
        nota => {
            notaGeralAvaliacao = nota;
            renderizarControleNotaGeral();
        },
        'Nota geral'
    );
}

function renderizarListaSaboresAvaliacao() {
    const lista = document.getElementById('avaliacao-sabores-lista');
    if (!lista || !pedidoAtualParaAvaliar) return;
    lista.innerHTML = '';
    pedidoAtualParaAvaliar.flavors.forEach(sabor => {
        const card = document.createElement('div');
        card.className = 'rounded-xl border border-stone-200 bg-stone-50 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2';
        const nome = document.createElement('p');
        nome.className = 'text-xs font-bold text-stone-800';
        nome.textContent = String(sabor.name || 'Sabor');
        const estrelas = document.createElement('div');
        estrelas.className = 'flex items-center gap-1';
        const desenhar = () => criarControleEstrelas(estrelas, notasSaboresAvaliacao[sabor.id] || 0, nota => {
            notasSaboresAvaliacao[sabor.id] = nota;
            desenhar();
        }, 'Nota para ' + String(sabor.name || 'sabor'));
        desenhar();
        card.append(nome, estrelas);
        lista.appendChild(card);
    });
}

function abrirModalAvaliacao(orderId) {
    if (!urlApiAvaliacoes()) {
        mostrarToast('O sistema de avaliações está sendo ativado.');
        return;
    }
    const pedidos = lerPedidosPendentesAvaliacao();
    const selecionado = pedidos.find(item => item.orderId === String(orderId || '')) || pedidos[pedidos.length - 1];
    if (!selecionado) {
        mostrarToast('Não encontramos um pedido pendente de avaliação neste aparelho.');
        return;
    }
    pedidoAtualParaAvaliar = selecionado;
    notasSaboresAvaliacao = {};
    notaGeralAvaliacao = 0;
    envioAvaliacaoEmAndamento = false;

    const codigo = document.getElementById('avaliacao-codigo-pedido');
    if (codigo) codigo.textContent = 'Pedido ' + selecionado.orderId.slice(-8);
    const nome = document.getElementById('avaliacao-nome');
    const comentario = document.getElementById('avaliacao-comentario');
    const consentimento = document.getElementById('avaliacao-consentimento');
    const erro = document.getElementById('avaliacao-erro');
    if (nome) nome.value = '';
    if (comentario) comentario.value = '';
    if (consentimento) consentimento.checked = false;
    if (erro) erro.classList.add('hidden');
    renderizarListaSaboresAvaliacao();
    renderizarControleNotaGeral();
    atualizarBotaoEnviarAvaliacao(false);
    document.getElementById('avaliacao-modal').classList.remove('hidden');
}

function fecharModalAvaliacao() {
    const modal = document.getElementById('avaliacao-modal');
    if (modal) modal.classList.add('hidden');
    pedidoAtualParaAvaliar = null;
    envioAvaliacaoEmAndamento = false;
}

function mostrarErroAvaliacao(mensagem) {
    const erro = document.getElementById('avaliacao-erro');
    if (!erro) return;
    erro.textContent = mensagem;
    erro.classList.remove('hidden');
}

function atualizarBotaoEnviarAvaliacao(carregando) {
    const botao = document.getElementById('avaliacao-enviar-btn');
    if (!botao) return;
    botao.disabled = Boolean(carregando);
    botao.classList.toggle('opacity-60', Boolean(carregando));
    botao.textContent = carregando ? 'Enviando avaliação...' : 'Enviar avaliação';
}

function enviarAvaliacao(evento) {
    evento.preventDefault();
    if (envioAvaliacaoEmAndamento || !pedidoAtualParaAvaliar) return;
    const endpoint = urlApiAvaliacoes();
    if (!endpoint) {
        mostrarErroAvaliacao('O sistema de avaliações ainda não está conectado.');
        return;
    }

    const sabores = pedidoAtualParaAvaliar.flavors.map(sabor => ({
        id: sabor.id,
        rating: Number(notasSaboresAvaliacao[sabor.id] || 0)
    }));
    if (!notaGeralAvaliacao || sabores.some(sabor => !sabor.rating)) {
        mostrarErroAvaliacao('Selecione uma nota geral e uma nota para cada sabor.');
        return;
    }
    if (!document.getElementById('avaliacao-consentimento').checked) {
        mostrarErroAvaliacao('Confirme a autorização para publicar sua avaliação.');
        return;
    }
    if (document.getElementById('avaliacao-site').value.trim()) return;

    const nome = document.getElementById('avaliacao-nome').value.trim().slice(0, 35);
    const comentario = document.getElementById('avaliacao-comentario').value.trim().slice(0, 500);
    const payload = {
        orderId: pedidoAtualParaAvaliar.orderId,
        consent: true,
        displayName: nome,
        overallRating: notaGeralAvaliacao,
        overallComment: comentario,
        flavorRatings: sabores,
        website: document.getElementById('avaliacao-site').value.trim()
    };

    envioAvaliacaoEmAndamento = true;
    atualizarBotaoEnviarAvaliacao(true);
    postarAvaliacaoComFormulario(payload);
}

function postarAvaliacaoComFormulario(payload) {
    const endpoint = urlApiAvaliacoes();
    const formulario = new URLSearchParams();
    formulario.set('payload', JSON.stringify(payload));
    formulario.set('website', String(payload.website || ''));

    fetch(endpoint, {
        method: 'POST',
        mode: 'no-cors',
        body: formulario
    }).then(() => {
        // O POST é opaco por ser cross-origin; confirmamos o registro por um GET JSONP sem dados pessoais.
        window.setTimeout(() => verificarAvaliacaoNoServidor(payload.orderId, 0), 900);
    }).catch(() => {
        falharEnvioAvaliacao();
    });
}

function verificarAvaliacaoNoServidor(orderId, tentativa) {
    solicitarDadosAvaliacoes('check', { orderId }, resposta => {
        if (resposta && resposta.ok && resposta.exists) {
            removerPedidoPendenteAvaliacao(orderId);
            fecharModalAvaliacao();
            mostrarToast('Obrigado! Sua avaliação foi publicada.');
            carregarAvaliacoesPublicas();
            return;
        }
        if (tentativa < 8) {
            window.setTimeout(() => verificarAvaliacaoNoServidor(orderId, tentativa + 1), 1100);
            return;
        }
        falharEnvioAvaliacao();
    });
}

function falharEnvioAvaliacao() {
    envioAvaliacaoEmAndamento = false;
    atualizarBotaoEnviarAvaliacao(false);
    mostrarErroAvaliacao('Não conseguimos confirmar o envio. Sua avaliação continua salva neste aparelho; tente novamente.');
}

function iniciarSistemaAvaliacoes() {
    const form = document.getElementById('avaliacao-form');
    if (form) form.addEventListener('submit', enviarAvaliacao);
    const secao = document.getElementById('avaliacoes-section');
    if (!urlApiAvaliacoes()) {
        if (secao) secao.classList.add('hidden');
        atualizarBotoesConviteAvaliacao();
        return;
    }
    if (secao) secao.classList.remove('hidden');
    atualizarBotoesConviteAvaliacao();
    carregarAvaliacoesPublicas();
}
