/**
 * Backend público de avaliações — Tempero da Ilma
 *
 * Implantação: Apps Script como Web App, executar como proprietário,
 * acesso "Qualquer pessoa". A planilha permanece privada.
 *
 * GET ?action=list&callback=nomeDaFuncao  -> resumo público (JSONP somente leitura)
 * GET ?action=check&orderId=...&callback=... -> informa apenas se o código já foi usado
 * POST payload=<JSON> -> grava uma avaliação e publica automaticamente
 */

const CONFIG = {
  SPREADSHEET_PROPERTY: 'TEMPERODA_ILMA_REVIEWS_SHEET_ID',
  SALT_PROPERTY: 'TEMPERODA_ILMA_REVIEWS_HASH_SALT',
  SHEET_NAME: 'Avaliacoes',
  STATUS_PUBLICADO: 'PUBLICADO',
  STATUS_OCULTO: 'OCULTO',
  HEADERS: [
    'ID',
    'Criado em',
    'Código do pedido (hash)',
    'Nome público',
    'Nota geral',
    'Comentário geral',
    'Notas por sabor (JSON)',
    'Status'
  ]
};

// IDs estáveis do catálogo atual. Atualize esta relação quando cadastrar novos sabores.
const SABORES_PERMITIDOS = {
  f1: 'Panqueca de Frango',
  f2: 'Bife de Carne Temperada',
  f3: 'Carne Moída com Caponata',
  f4: 'Feijoada de Feijão Preto',
  f5: 'Carne de Panela com Batatas',
  f7: 'Strogonoff de Frango',
  f8: 'Quiabada de Frango',
  f9: 'Panqueca de Carne Moída',
  f10: 'Bife de Carne Acebolado',
  f11: 'Carne Moída com Mix de Verduras',
  f12: 'Penne a Bolonhesa',
  f13: 'Espaguete com Almôndegas',
  f14: 'Frango ao Creme de Milho',
  f15: 'Carne de Panela Desfiada',
  f16: 'Lombo de Boi recheado',
  f17: 'Omelete de Frango',
  f18: 'Bife de Frango Acebolado',
  f19: 'Panqueca de Frango (Farinha Integral)',
  f20: 'Frango com Purê de Mandioquinha',
  f21: 'Escondidinho Fit',
  f22: 'Macarrão Integral com Almôndegas',
  f23: 'Carne Moída com Arroz Funcional'
};

function configurarSistemaAvaliacoes() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(CONFIG.SPREADSHEET_PROPERTY);
  var planilha;

  if (id) {
    planilha = SpreadsheetApp.openById(id);
  } else {
    planilha = SpreadsheetApp.create('Tempero da Ilma — Avaliações de clientes');
    props.setProperty(CONFIG.SPREADSHEET_PROPERTY, planilha.getId());
  }

  var aba = planilha.getSheetByName(CONFIG.SHEET_NAME);
  if (!aba) {
    aba = planilha.getSheets()[0];
    aba.setName(CONFIG.SHEET_NAME);
  }

  if (aba.getLastRow() === 0) {
    aba.getRange(1, 1, 1, CONFIG.HEADERS.length).setValues([CONFIG.HEADERS]);
    aba.setFrozenRows(1);
    aba.getRange(1, 1, 1, CONFIG.HEADERS.length).setFontWeight('bold');
    aba.autoResizeColumns(1, CONFIG.HEADERS.length);
  }

  if (!props.getProperty(CONFIG.SALT_PROPERTY)) {
    props.setProperty(CONFIG.SALT_PROPERTY, Utilities.getUuid() + Utilities.getUuid());
  }

  var resultado = {
    ok: true,
    spreadsheetUrl: planilha.getUrl(),
    sheetName: CONFIG.SHEET_NAME,
    message: 'Planilha configurada. Agora publique este projeto como um App da Web.'
  };
  Logger.log(JSON.stringify(resultado));
  return resultado;
}

function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};
  var callback = params.callback || '';
  try {
    var action = params.action || 'list';
    if (action === 'check') {
      var orderId = String(params.orderId || '').trim();
      if (!validarCodigoPedido_(orderId)) {
        return resposta_(callback, { ok: false, exists: false });
      }
      return resposta_(callback, {
        ok: true,
        exists: pedidoJaAvaliado_(hashPedido_(orderId))
      });
    }

    if (action !== 'list') {
      return resposta_(callback, { ok: false, message: 'Ação inválida.' });
    }

    return resposta_(callback, obterResumoPublico_());
  } catch (erro) {
    return resposta_(callback, { ok: false, message: 'Não foi possível consultar as avaliações.' });
  }
}

function doPost(e) {
  var params = e && e.parameter ? e.parameter : {};
  // Campo-isca: bots que o preencherem são ignorados sem gravar conteúdo.
  if (String(params.website || '').trim()) {
    return respostaTexto_({ ok: true });
  }

  var lock = LockService.getScriptLock();
  try {
    var payloadText = String(params.payload || '');
    if (!payloadText || payloadText.length > 12000) {
      throw new Error('Dados de avaliação inválidos.');
    }

    var payload = JSON.parse(payloadText);
    var review = validarAvaliacao_(payload);
    lock.waitLock(8000);

    var orderHash = hashPedido_(review.orderId);
    if (pedidoJaAvaliado_(orderHash)) {
      return respostaTexto_({ ok: false, duplicate: true, message: 'Este pedido já possui uma avaliação.' });
    }

    var aba = obterAba_();
    aba.appendRow([
      Utilities.getUuid(),
      new Date(),
      orderHash,
      protegerTextoPlanilha_(review.displayName),
      review.overallRating,
      protegerTextoPlanilha_(review.overallComment),
      protegerTextoPlanilha_(JSON.stringify(review.flavorRatings)),
      CONFIG.STATUS_PUBLICADO
    ]);

    return respostaTexto_({ ok: true, published: true });
  } catch (erro) {
    return respostaTexto_({
      ok: false,
      message: erro && erro.message ? String(erro.message).slice(0, 180) : 'Não foi possível registrar a avaliação.'
    });
  } finally {
    try {
      if (lock.hasLock()) lock.releaseLock();
    } catch (ignorar) {}
  }
}

function validarAvaliacao_(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Avaliação inválida.');
  var orderId = String(payload.orderId || '').trim();
  if (!validarCodigoPedido_(orderId)) throw new Error('Código do pedido inválido.');

  var notaGeral = Number(payload.overallRating);
  if (!Number.isInteger(notaGeral) || notaGeral < 1 || notaGeral > 5) {
    throw new Error('Informe a nota geral de 1 a 5.');
  }

  var nome = limparTexto_(payload.displayName, 35) || 'Cliente';
  var comentario = limparTexto_(payload.overallComment, 500);
  var recebidas = Array.isArray(payload.flavorRatings) ? payload.flavorRatings : [];
  if (!recebidas.length || recebidas.length > 20) {
    throw new Error('O pedido precisa conter ao menos um sabor para avaliar.');
  }

  var ids = {};
  var sabores = recebidas.map(function(item) {
    var id = String(item && item.id || '');
    var nota = Number(item && item.rating);
    if (!Object.prototype.hasOwnProperty.call(SABORES_PERMITIDOS, id)) {
      throw new Error('Um dos sabores não é válido.');
    }
    if (ids[id]) throw new Error('Há sabores repetidos na avaliação.');
    if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
      throw new Error('Informe uma nota para cada sabor.');
    }
    ids[id] = true;
    return { id: id, name: SABORES_PERMITIDOS[id], rating: nota };
  });

  return {
    orderId: orderId,
    displayName: nome,
    overallRating: notaGeral,
    overallComment: comentario,
    flavorRatings: sabores
  };
}

function validarCodigoPedido_(orderId) {
  return /^[A-Fa-f0-9]{24}$/.test(String(orderId || ''));
}

function limparTexto_(valor, limite) {
  return String(valor || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, limite);
}

function protegerTextoPlanilha_(valor) {
  var texto = String(valor || '');
  return /^[=+\-@]/.test(texto) ? "'" + texto : texto;
}

function hashPedido_(orderId) {
  var salt = PropertiesService.getScriptProperties().getProperty(CONFIG.SALT_PROPERTY);
  if (!salt) throw new Error('Execute configurarSistemaAvaliacoes antes de publicar.');
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(orderId) + salt,
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(byte) {
    var valor = (byte + 256) % 256;
    return ('0' + valor.toString(16)).slice(-2);
  }).join('');
}

function pedidoJaAvaliado_(hash) {
  var aba = obterAba_();
  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return false;
  var codigos = aba.getRange(2, 3, ultimaLinha - 1, 1).getValues();
  return codigos.some(function(linha) {
    return String(linha[0]) === hash;
  });
}

function obterAba_() {
  var id = PropertiesService.getScriptProperties().getProperty(CONFIG.SPREADSHEET_PROPERTY);
  if (!id) throw new Error('Execute configurarSistemaAvaliacoes antes de publicar.');
  var planilha = SpreadsheetApp.openById(id);
  var aba = planilha.getSheetByName(CONFIG.SHEET_NAME);
  if (!aba) throw new Error('A aba de avaliações não foi encontrada.');
  return aba;
}

function obterResumoPublico_() {
  var aba = obterAba_();
  var ultimaLinha = aba.getLastRow();
  var resultado = {
    ok: true,
    overall: { count: 0, average: null },
    flavors: {},
    comments: []
  };
  if (ultimaLinha < 2) return resultado;

  var linhas = aba.getRange(2, 1, ultimaLinha - 1, CONFIG.HEADERS.length).getValues();
  var somaGeral = 0;
  linhas.forEach(function(linha) {
    if (String(linha[7]) !== CONFIG.STATUS_PUBLICADO) return;

    var notaGeral = Number(linha[4]);
    if (Number.isInteger(notaGeral) && notaGeral >= 1 && notaGeral <= 5) {
      resultado.overall.count++;
      somaGeral += notaGeral;
    }

    var data = linha[1] instanceof Date
      ? Utilities.formatDate(linha[1], Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : String(linha[1] || '');

    var comentario = String(linha[5] || '');
    if (comentario) {
      resultado.comments.push({
        name: String(linha[3] || 'Cliente'),
        rating: notaGeral,
        comment: comentario,
        date: data
      });
    }

    var sabores;
    try {
      sabores = JSON.parse(String(linha[6] || '[]'));
    } catch (ignorar) {
      sabores = [];
    }
    if (!Array.isArray(sabores)) return;

    sabores.forEach(function(item) {
      var id = String(item && item.id || '');
      var nota = Number(item && item.rating);
      if (!Object.prototype.hasOwnProperty.call(SABORES_PERMITIDOS, id)) return;
      if (!Number.isInteger(nota) || nota < 1 || nota > 5) return;

      if (!resultado.flavors[id]) {
        resultado.flavors[id] = {
          name: SABORES_PERMITIDOS[id],
          count: 0,
          average: 0,
          sum: 0
        };
      }
      resultado.flavors[id].count++;
      resultado.flavors[id].sum += nota;
    });
  });

  if (resultado.overall.count) {
    resultado.overall.average = arredondarUmaCasa_(somaGeral / resultado.overall.count);
  }

  Object.keys(resultado.flavors).forEach(function(id) {
    var sabor = resultado.flavors[id];
    sabor.average = arredondarUmaCasa_(sabor.sum / sabor.count);
    delete sabor.sum;
  });

  resultado.comments.sort(function(a, b) {
    return String(b.date).localeCompare(String(a.date));
  });
  resultado.comments = resultado.comments.slice(0, 12);
  return resultado;
}

function arredondarUmaCasa_(valor) {
  return Math.round(Number(valor) * 10) / 10;
}

function resposta_(callback, dados) {
  var json = JSON.stringify(dados).replace(/</g, '\\u003c');
  if (callback && /^[A-Za-z_$][A-Za-z0-9_$]{0,80}$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function respostaTexto_(dados) {
  return ContentService.createTextOutput(JSON.stringify(dados))
    .setMimeType(ContentService.MimeType.JSON);
}
