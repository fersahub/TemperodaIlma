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

function configurarSistemaAvaliacoesBase_() {
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

function doGetAvaliacoes_(e) {
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

function doPostAvaliacoes_(e) {
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
    if (payload.consent !== true) throw new Error('A autorização de publicação é obrigatória.');
    if (!pedidoPodeSerAvaliado_(review.orderId)) throw new Error('A avaliação só fica disponível após a entrega confirmada pela loja.');
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
      ? Utilities.formatDate(linha[1], 'America/Bahia', 'yyyy-MM-dd')
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


/* ------------------------------------------------------------------
 * Gestão centralizada: pedidos, clientes, itens e notificações.
 * Mantém a aba Avaliacoes existente e cria as novas abas na mesma planilha.
 * ------------------------------------------------------------------ */

var GESTAO = {
  ADMIN_SECRET_PROPERTY: 'TEMPERODA_ILMA_ADMIN_SECRET',
  ADMIN_SESSION_VERSION_PROPERTY: 'TEMPERODA_ILMA_ADMIN_SESSION_VERSION',
  SHEETS: {
    ORDERS: 'Pedidos',
    ITEMS: 'ItensPedidos',
    CLIENTS: 'Clientes',
    HISTORY: 'HistoricoPedidos',
    NOTIFICATIONS: 'Notificacoes',
    SETTINGS: 'Configuracoes',
    SHIPPING: 'Fretes',
    PRODUCTS: 'Produtos'
  },
  ORDER_HEADERS: [
    'ID do pedido','Código de avaliação','Criado em','Atualizado em','Status',
    'Cliente','Telefone','Aceita atualizações WhatsApp','CEP','Rua','Número',
    'Complemento','Bairro','Pagamento','Troco','Observações','Subtotal',
    'Frete','Total','Data de entrega','Cidade'
  ],
  ITEM_HEADERS: [
    'Pedido ID','Tipo','Referência','Produto','Sabor/Resumo','Tamanho',
    'Quantidade','Valor unitário','Subtotal','Observação'
  ],
  CLIENT_HEADERS: [
    'Telefone','Nome','CEP','Rua','Número','Complemento','Bairro',
    'Primeiro pedido','Último pedido','Quantidade de pedidos','Total em pedidos',
    'Aceita atualizações WhatsApp'
  ],
  HISTORY_HEADERS: [
    'ID','Pedido ID','Data e hora','Status anterior','Novo status',
    'Observação interna','Responsável'
  ],
  NOTIFICATION_HEADERS: [
    'ID','Pedido ID','Criada em','Telefone','Status do pedido',
    'Mensagem preparada','Situação da notificação','Atualizada em'
  ],
  SETTINGS_HEADERS: ['Chave','Valor','Atualizado em'],
  SHIPPING_HEADERS: ['Bairro','Taxa','Ativo'],
  PRODUCT_HEADERS: ['ID','Produto','Categoria','Disponível'],
  STATUSES: [
    'Aguardando confirmação','Pedido confirmado','Em preparação',
    'Pronto para entrega','Saiu para entrega','Entregue','Cancelado'
  ]
};

var COMBOS_PERMITIDOS_ = {
  'combo-5-350g': { name: 'Combo 5 Marmitas - 350g', qty: 5, price: 100, type: 'Tradicional' },
  'combo-10-350g': { name: 'Combo 10 Marmitas - 350g', qty: 10, price: 200, type: 'Tradicional' },
  'combo-5-500g': { name: 'Combo 5 Marmitas - 500g', qty: 5, price: 125, type: 'Tradicional' },
  'combo-10-500g': { name: 'Combo 10 Marmitas - 500g', qty: 10, price: 250, type: 'Tradicional' },
  'combo-5-300g-fit': { name: 'Combo 5 Marmitas FIT - 300g', qty: 5, price: 130, type: 'Linha Fit' },
  'combo-10-300g-fit': { name: 'Combo 10 Marmitas FIT - 300g', qty: 10, price: 260, type: 'Linha Fit' }
};
var SABORES_FIT_IDS_ = { f12:true, f19:true, f20:true, f21:true, f22:true, f23:true };
var STATUS_INICIAL_PEDIDO_ = 'Aguardando confirmação';

var FRETES_INICIAIS_ = [
  ['São Caetano',7],['Boa Vista de São Caetano',7],['Capelinha',7],['Calafate',7],
  ['Fazenda Grande do Retiro',7],['Largo do Tanque',7],['Liberdade',7],['Retiro',7],
  ['IAPI',7],['Curuzu',7],['Pirajá',8.5],['Campinas de Pirajá',8.5],['Marechal Rondon',8.5],
  ['Brotas',9],['Campinas de Brotas',9],['Matatu',9],['Vila Laura',9],['Bonocô',9],
  ['Nazaré',9],['Centro',9],['Campo Grande',9],['Garcia',9],['Barris',9],['Tororó',9],
  ['Graça',9],['Calçada',10],['Mares',10],['Roma',10],['Uruguai',10],['Massaranduba',10],
  ['Boa Viagem',10],['Ribeira',10],['Bonfim',10],['Monte Serrat',10],['Cabula',10],
  ['Saboeiro',10],['Narandiba',10],['Pernambués',10],['Beiru / Tancredo Neves',10],
  ['Doron',10],['Engomadeira',10],['Mata Escura',10],['Imbuí',10],['Stiep',12],
  ['Barra',12],['Ondina',12],['Rio Vermelho',12],['Federação',12],
  ['Engenho Velho da Federação',12],['Amaralina',12],['Pituba',12],['Itaigara',12],
  ['Horto Florestal',12],['Costa Azul',12],['Pau da Lima',13],['São Marcos',13],
  ['Sete de Abril',13],['Castelo Branco',13],['Canabrava',13],['Dom Avelar',13],
  ['Cajazeiras (I a XI)',13],['Fazenda Grande (1 a 4)',13],['Boca da Mata',13],
  ['Boca do Rio',15],['Patamares',15],['Piatã',15],['Itapuã',15],['Stella Maris',15],
  ['Bairro da Paz',15],['Mussurunga',15],['São Cristóvão',15],
  ['Jardim das Margaridas',15],['Lobato',15],['Plataforma',15],['Periperi',15],
  ['Coutos',15],['Fazenda Coutos',15],['Paripe',15],['Valéria',15]
];

function configurarSistemaAvaliacoes() {
  var base = configurarSistemaAvaliacoesBase_();
  var planilha = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty(CONFIG.SPREADSHEET_PROPERTY)
  );
  configurarAbasGestao_(planilha);
  var resultado = {
    ok: true,
    spreadsheetUrl: planilha.getUrl(),
    sheetName: CONFIG.SHEET_NAME,
    message: 'Planilha central configurada. A aba Avaliacoes foi preservada e as abas de gestão foram adicionadas.'
  };
  Logger.log(JSON.stringify(resultado));
  return resultado;
}

function configurarAbasGestao_(planilha) {
  var definicoes = [
    [GESTAO.SHEETS.ORDERS,GESTAO.ORDER_HEADERS],
    [GESTAO.SHEETS.ITEMS,GESTAO.ITEM_HEADERS],
    [GESTAO.SHEETS.CLIENTS,GESTAO.CLIENT_HEADERS],
    [GESTAO.SHEETS.HISTORY,GESTAO.HISTORY_HEADERS],
    [GESTAO.SHEETS.NOTIFICATIONS,GESTAO.NOTIFICATION_HEADERS],
    [GESTAO.SHEETS.SETTINGS,GESTAO.SETTINGS_HEADERS],
    [GESTAO.SHEETS.SHIPPING,GESTAO.SHIPPING_HEADERS],
    [GESTAO.SHEETS.PRODUCTS,GESTAO.PRODUCT_HEADERS]
  ];
  definicoes.forEach(function(item) {
    var aba = planilha.getSheetByName(item[0]) || planilha.insertSheet(item[0]);
    if (aba.getLastRow() === 0) {
      aba.getRange(1,1,1,item[1].length).setValues([item[1]]);
      aba.setFrozenRows(1);
      aba.getRange(1,1,1,item[1].length).setFontWeight('bold');
      aba.autoResizeColumns(1,item[1].length);
    }
  });

  var fretes = planilha.getSheetByName(GESTAO.SHEETS.SHIPPING);
  if (fretes.getLastRow() < 2) {
    fretes.getRange(2,1,FRETES_INICIAIS_.length,3)
      .setValues(FRETES_INICIAIS_.map(function(x){ return [x[0],x[1],true]; }));
  }

  var settings = planilha.getSheetByName(GESTAO.SHEETS.SETTINGS);
  if (settings.getLastRow() < 2) {
    var agora = new Date();
    settings.getRange(2,1,6,3).setValues([
      ['fuso_horario','America/Bahia',agora],
      ['dia_entrega','Sábado',agora],
      ['dia_corte','Sexta-feira',agora],
      ['horario_corte','23:59',agora],
      ['horario_abertura','08:00',agora],
      ['horario_fechamento','17:00',agora]
    ]);
  }

  var produtos = planilha.getSheetByName(GESTAO.SHEETS.PRODUCTS);
  if (produtos.getLastRow() < 2) {
    var fitIds = SABORES_FIT_IDS_;
    var ids = Object.keys(SABORES_PERMITIDOS);
    produtos.getRange(2,1,ids.length,4).setValues(ids.map(function(id) {
      return [id,SABORES_PERMITIDOS[id],fitIds[id] ? 'Linha Fit' : 'Tradicional',true];
    }));
  }
}

/**
 * Defina uma senha administrativa manualmente pelo editor do Apps Script.
 * Recomendado: senha única com pelo menos 16 caracteres, letras e números.
 * Não compartilhe a senha em chats, logs ou arquivos do repositório.
 */
/**
 * Gere a senha do painel executando esta função uma única vez no editor.
 * Copie o valor exibido no Registro de execução e guarde-o em local seguro.
 */
function gerarSenhaPainelTempero() {
  var senha=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');
  definirSenhaPainelTempero(senha);
  Logger.log('SENHA DO PAINEL (copie e guarde): '+senha);
  return senha;
}
function validarSenhaAdmin_(senha) {
  var valor = String(senha || '');
  if (valor.length < 16 || valor.length > 128) {
    throw new Error('A senha deve ter entre 16 e 128 caracteres.');
  }
  if (!/[A-Za-z]/.test(valor) || !/[0-9]/.test(valor)) {
    throw new Error('Use pelo menos uma letra e um número na senha.');
  }
  return valor;
}

function invalidarSessoesAdmin_() {
  var props = PropertiesService.getScriptProperties();
  var atual = Number(props.getProperty(GESTAO.ADMIN_SESSION_VERSION_PROPERTY) || '1');
  if (!isFinite(atual) || atual < 1) atual = 1;
  props.setProperty(GESTAO.ADMIN_SESSION_VERSION_PROPERTY, String(atual + 1));
}

function definirSenhaPainelTempero(senha) {
  var valor = validarSenhaAdmin_(senha);
  PropertiesService.getScriptProperties().setProperty(GESTAO.ADMIN_SECRET_PROPERTY,valor);
  invalidarSessoesAdmin_();
  return 'Senha administrativa configurada com sucesso.';
}

function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};
  var action = String(params.action || 'list');
  if (action === 'orderCheck') {
    var reviewId = String(params.reviewOrderId || '');
    return resposta_(params.callback,{ok:true,exists:pedidoExistePorCodigoAvaliacao_(reviewId)});
  }
  if (action === 'adminChallenge') return criarDesafioAdmin_(params.callback);
  if (action === 'adminLogin') return autenticarAdmin_(params);
  if (action === 'adminData') {
    if (!validarSessaoAdmin_(params.token)) return resposta_(params.callback,{ok:false,message:'Sessão inválida ou expirada.'});
    return resposta_(params.callback,obterDadosPainelAdmin_());
  }
  if (action === 'adminOperation') {
    var opId = String(params.operationId || '');
    var op = /^[A-Fa-f0-9-]{20,50}$/.test(opId)
      ? CacheService.getScriptCache().get('temp-admin-op:'+opId) : null;
    var resultado = op ? JSON.parse(op) : {ok:false,pending:true,message:'Operação ainda não confirmada pelo servidor.'};
    // A troca de senha revoga imediatamente o token que iniciou a ação.
    // Nesse único caso, o identificador aleatório da operação permite confirmar o resultado.
    if (!validarSessaoAdmin_(params.token) && !(resultado && resultado.passwordChanged === true)) {
      return resposta_(params.callback,{ok:false,message:'Sessão inválida ou expirada.'});
    }
    return resposta_(params.callback,resultado);
  }
  return doGetAvaliacoes_(e);
}

function doPost(e) {
  var params = e && e.parameter ? e.parameter : {};
  var action = String(params.action || '');
  if (action === 'registerOrder') return registrarPedidoPublico_(params);
  if (action === 'adminUpdateStatus') return executarOperacaoAdmin_(params,'status');
  if (action === 'adminMarkNotification') return executarOperacaoAdmin_(params,'notification');
  if (action === 'adminChangePassword') return executarOperacaoAdmin_(params,'password');
  return doPostAvaliacoes_(e);
}

function criarDesafioAdmin_(callback) {
  var nonce = Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,'');
  CacheService.getScriptCache().put('temp-admin-nonce:'+nonce,'1',120);
  return resposta_(callback,{ok:true,nonce:nonce});
}

function autenticarAdmin_(params) {
  var nonce = String(params.nonce || '');
  var proof = String(params.proof || '');
  var cache = CacheService.getScriptCache();
  var challengeKey = 'temp-admin-nonce:'+nonce;
  if (!/^[A-Fa-f0-9]{64}$/.test(nonce) || cache.get(challengeKey) !== '1') {
    return resposta_(params.callback,{ok:false,message:'Desafio de autenticação expirado. Tente novamente.'});
  }
  cache.remove(challengeKey);
  var secret = PropertiesService.getScriptProperties().getProperty(GESTAO.ADMIN_SECRET_PROPERTY);
  if (!secret) return resposta_(params.callback,{ok:false,message:'A senha do painel ainda não foi configurada no Apps Script.'});
  var esperado = Utilities.base64Encode(Utilities.computeHmacSha256Signature(nonce,secret));
  if (!compararSeguro_(esperado,proof)) return resposta_(params.callback,{ok:false,message:'Senha incorreta.'});
  var token = Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,'');
  var versaoSessao = String(PropertiesService.getScriptProperties().getProperty(GESTAO.ADMIN_SESSION_VERSION_PROPERTY) || '1');
  cache.put('temp-admin-session:'+token,versaoSessao,21600);
  return resposta_(params.callback,{ok:true,token:token,expiresIn:21600});
}

function compararSeguro_(a,b) {
  a=String(a); b=String(b);
  var tamanho=Math.max(a.length,b.length),diferenca=a.length^b.length;
  for(var i=0;i<tamanho;i++) diferenca |= (a.charCodeAt(i)||0) ^ (b.charCodeAt(i)||0);
  return diferenca===0;
}

function validarSessaoAdmin_(token) {
  if (!/^[A-Fa-f0-9]{64}$/.test(String(token || ''))) return false;
  var versaoAtual = String(PropertiesService.getScriptProperties().getProperty(GESTAO.ADMIN_SESSION_VERSION_PROPERTY) || '1');
  return CacheService.getScriptCache().get('temp-admin-session:'+String(token)) === versaoAtual;
}

function criarIdUnico_(prefixo) {
  return String(prefixo || '') + Utilities.getUuid().replace(/-/g,'').slice(0,18).toUpperCase();
}

function limparCampo_(valor,limite) {
  return String(valor === null || valor === undefined ? '' : valor)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'')
    .trim().slice(0,limite || 250);
}

function numeroSeguro_(valor) {
  var n=Number(valor);
  if (!isFinite(n)) return NaN;
  return Math.round(n*100)/100;
}

function arredondarDinheiro_(valor) {
  return Math.round(Number(valor)*100)/100;
}

function planilhaGestao_() {
  var id=PropertiesService.getScriptProperties().getProperty(CONFIG.SPREADSHEET_PROPERTY);
  if (!id) throw new Error('Execute configurarSistemaAvaliacoes antes de usar o painel.');
  return SpreadsheetApp.openById(id);
}

function abaGestao_(nome) {
  var aba=planilhaGestao_().getSheetByName(nome);
  if (!aba) throw new Error('A aba '+nome+' não existe. Execute configurarSistemaAvaliacoes novamente.');
  return aba;
}

function linhaPedidoPorId_(orderId) {
  var aba=abaGestao_(GESTAO.SHEETS.ORDERS);
  var ultima=aba.getLastRow();
  if (ultima<2) return null;
  var encontrados=aba.getRange(2,1,ultima-1,1).getValues();
  for(var i=0;i<encontrados.length;i++) {
    if(String(encontrados[i][0])===String(orderId)) return {sheet:aba,row:i+2};
  }
  return null;
}

function pedidoExistePorCodigoAvaliacao_(reviewId) {
  if (!/^[A-Fa-f0-9]{24}$/.test(String(reviewId || ''))) return false;
  var aba=abaGestao_(GESTAO.SHEETS.ORDERS);
  var ultima=aba.getLastRow();
  if(ultima<2) return false;
  var valores=aba.getRange(2,2,ultima-1,1).getValues();
  return valores.some(function(l){return String(l[0])===String(reviewId);});
}

function pedidoPodeSerAvaliado_(reviewId) {
  if(!pedidoExistePorCodigoAvaliacao_(reviewId)) return false;
  var aba=abaGestao_(GESTAO.SHEETS.ORDERS);
  var ultima=aba.getLastRow();
  var valores=aba.getRange(2,1,ultima-1,5).getValues();
  for(var i=0;i<valores.length;i++) {
    if(String(valores[i][1])===String(reviewId)) return String(valores[i][4])==='Entregue';
  }
  return false;
}

function taxaEntregaBairro_(bairro) {
  var aba=abaGestao_(GESTAO.SHEETS.SHIPPING);
  var ultima=aba.getLastRow();
  if(ultima<2) return null;
  var linhas=aba.getRange(2,1,ultima-1,3).getValues();
  for(var i=0;i<linhas.length;i++) {
    if(String(linhas[i][0])===String(bairro) && linhas[i][2]!==false) return numeroSeguro_(linhas[i][1]);
  }
  return null;
}

function validarPedidoPublico_(payload) {
  if(!payload || typeof payload!=='object') throw new Error('Pedido inválido.');
  var orderId=limparCampo_(payload.orderId,60);
  var reviewId=String(payload.reviewOrderId || '');
  if(!/^TI-[0-9]{6}-[A-F0-9]{10}$/.test(orderId) || !/^[A-F0-9]{24}$/.test(reviewId)) {
    throw new Error('Identificação do pedido inválida.');
  }
  var cliente=payload.customer || {};
  var nome=limparCampo_(cliente.name,100);
  var telefone=String(cliente.phone || '').replace(/\D/g,'');
  var bairro=limparCampo_(cliente.bairro,100);
  var cep=limparCampo_(cliente.cep,9);
  var rua=limparCampo_(cliente.rua,150);
  var numero=limparCampo_(cliente.numero,30);
  if(!nome || telefone.length<10 || telefone.length>13 || !bairro || !rua || !numero || (cep && !/^\\d{5}-?\\d{3}$/.test(cep))) {
    throw new Error('Dados do cliente ou endereço incompletos.');
  }
  var combos=Array.isArray(payload.combos)?payload.combos:[];
  var avulsas=Array.isArray(payload.avulsas)?payload.avulsas:[];
  if(!combos.length || combos.length>20 || avulsas.length>50) {
    throw new Error('O pedido precisa ter ao menos um combo e respeitar os limites de itens.');
  }

  var subtotal=0;
  var itens=[];
  combos.forEach(function(item) {
    var combo=COMBOS_PERMITIDOS_[String(item && item.comboId || '')];
    if(!combo) throw new Error('Um dos combos não está cadastrado.');
    var flavors=item.flavors && typeof item.flavors==='object'?item.flavors:{};
    var quantidade=0;
    Object.keys(flavors).forEach(function(id) {
      var qtd=Number(flavors[id]);
      if(!Object.prototype.hasOwnProperty.call(SABORES_PERMITIDOS,id) || !Number.isInteger(qtd) || qtd<1 || qtd>combo.qty) {
        throw new Error('Há sabores ou quantidades inválidas no combo.');
      }
      if(combo.type==='Linha Fit' && !SABORES_FIT_IDS_[id]) throw new Error('O combo Fit contém um sabor incompatível.');
      if(combo.type==='Tradicional' && SABORES_FIT_IDS_[id]) throw new Error('O combo tradicional contém um sabor incompatível.');
      quantidade+=qtd;
    });
    if(quantidade!==combo.qty) throw new Error('A quantidade de sabores do combo não confere.');
    var obs=limparCampo_(item.obs,120);
    var resumoSabores=[];
    Object.keys(flavors).forEach(function(id) { resumoSabores.push(Number(flavors[id])+'x '+SABORES_PERMITIDOS[id]); });
    itens.push({
      kind:'Combo',reference:String(item.comboId),name:combo.name,
      flavorSummary:resumoSabores.join(', '),
      size:combo.type==='Linha Fit'?'300g':(String(item.comboId).indexOf('500g')>=0?'500g':'350g'),
      quantity:combo.qty,unitPrice:arredondarDinheiro_(combo.price/combo.qty),
      total:combo.price,obs:obs
    });
    subtotal+=combo.price;
  });

  var precosAvulsa={'350g':20,'500g':25,'300g':26};
  avulsas.forEach(function(item) {
    var id=String(item && item.flavorId || '');
    var sabor=SABORES_PERMITIDOS[id];
    var tamanho=String(item && item.size || '');
    var qtd=Number(item && item.quantity);
    if(!sabor || !precosAvulsa[tamanho] || !Number.isInteger(qtd) || qtd<1 || qtd>99) {
      throw new Error('Uma das marmitas avulsas é inválida.');
    }
    if(SABORES_FIT_IDS_[id] && tamanho!=='300g') throw new Error('O tamanho da marmita Fit é inválido.');
    if(!SABORES_FIT_IDS_[id] && tamanho==='300g') throw new Error('O tamanho da marmita tradicional é inválido.');
    var unit=precosAvulsa[tamanho],line=arredondarDinheiro_(unit*qtd);
    itens.push({kind:'Avulsa',reference:id,name:sabor,flavorSummary:sabor,size:tamanho,
      quantity:qtd,unitPrice:unit,total:line,obs:''});
    subtotal+=line;
  });

  subtotal=arredondarDinheiro_(subtotal);
  var frete=taxaEntregaBairro_(bairro);
  var freteInformado=numeroSeguro_(payload.shippingFee);
  if(frete===null || !isFinite(freteInformado) || Math.abs(frete-freteInformado)>0.01) {
    throw new Error('O frete precisa ser recalculado para o bairro selecionado.');
  }
  var subtotalInformado=numeroSeguro_(payload.subtotal);
  var totalInformado=numeroSeguro_(payload.total);
  if(!isFinite(subtotalInformado) || Math.abs(subtotal-subtotalInformado)>0.01 ||
     !isFinite(totalInformado) || Math.abs(arredondarDinheiro_(subtotal+frete)-totalInformado)>0.01) {
    throw new Error('Os valores do pedido não conferem. Atualize o carrinho e tente novamente.');
  }
  var pagamento=limparCampo_(payload.payment,40);
  if(['Pix','Cartão de Débito','Cartão de Crédito','Dinheiro'].indexOf(pagamento)<0) throw new Error('Forma de pagamento inválida.');
  return {
    orderId:orderId,reviewId:reviewId,customer:{
      name:nome,phone:telefone,cep:cep,rua:rua,numero:numero,
      comp:limparCampo_(cliente.comp,100),bairro:bairro,cidade:'Salvador - BA'
    },
    notificationsOptIn:payload.notificationsOptIn===true,
    payment:pagamento,troco:limparCampo_(payload.changeFor,40),
    observations:limparCampo_(payload.observations,500),
    subtotal:subtotal,shipping:frete,total:arredondarDinheiro_(subtotal+frete),
    deliveryDate:dataEntregaSabadoServidor_(),items:itens
  };
}

function registrarPedidoPublico_(params) {
  var lock=LockService.getScriptLock();
  try {
    var text=String(params.payload || '');
    if(!text || text.length>18000) throw new Error('Dados do pedido inválidos.');
    var payload=JSON.parse(text);
    var pedido=validarPedidoPublico_(payload);
    lock.waitLock(10000);
    if(pedidoExistePorCodigoAvaliacao_(pedido.reviewId)) {
      return respostaTexto_({ok:true,duplicate:true,orderId:pedido.orderId});
    }
    if(pedidoExistePorId_(pedido.orderId)) throw new Error('Este número de pedido já foi utilizado. Atualize a página e tente novamente.');
    validarLimiteRegistroPedido_(pedido.customer.phone);

    var agora=new Date();
    var status=STATUS_INICIAL_PEDIDO_;
    var orders=abaGestao_(GESTAO.SHEETS.ORDERS);
    orders.appendRow([
      pedido.orderId,pedido.reviewId,agora,agora,status,protegerTextoPlanilha_(pedido.customer.name),
      pedido.customer.phone,pedido.notificationsOptIn,pedido.customer.cep,
      protegerTextoPlanilha_(pedido.customer.rua),protegerTextoPlanilha_(pedido.customer.numero),
      protegerTextoPlanilha_(pedido.customer.comp),protegerTextoPlanilha_(pedido.customer.bairro),pedido.payment,
      protegerTextoPlanilha_(pedido.troco),protegerTextoPlanilha_(pedido.observations),pedido.subtotal,pedido.shipping,pedido.total,
      pedido.deliveryDate,pedido.customer.cidade
    ]);

    var itemRows=pedido.items.map(function(item) {
      return [
        pedido.orderId,item.kind,item.reference,item.name,item.flavorSummary,item.size,
        item.quantity,item.unitPrice,item.total,protegerTextoPlanilha_(item.obs)
      ];
    });
    if(itemRows.length) {
      var abaItens=abaGestao_(GESTAO.SHEETS.ITEMS);
      abaItens.getRange(abaItens.getLastRow()+1,1,itemRows.length,GESTAO.ITEM_HEADERS.length).setValues(itemRows);
    }

    registrarOuAtualizarCliente_(pedido,agora);
    abaGestao_(GESTAO.SHEETS.HISTORY).appendRow([
      criarIdUnico_('HIS-'),pedido.orderId,agora,'',status,'Pedido registrado pelo cardápio digital','Sistema'
    ]);
    return respostaTexto_({ok:true,orderId:pedido.orderId});
  } catch(erro) {
    return respostaTexto_({ok:false,message:limparCampo_(erro && erro.message,180) || 'Não foi possível registrar o pedido.'});
  } finally {
    try { if(lock.hasLock()) lock.releaseLock(); } catch(ignorar) {}
  }
}

function registrarOuAtualizarCliente_(pedido,agora) {
  var aba=abaGestao_(GESTAO.SHEETS.CLIENTS);
  var telefone=pedido.customer.phone,ultima=aba.getLastRow(),row=null;
  if(ultima>=2) {
    var nums=aba.getRange(2,1,ultima-1,1).getValues();
    for(var i=0;i<nums.length;i++) if(String(nums[i][0])===telefone) {row=i+2;break;}
  }
  if(row) {
    var atual=aba.getRange(row,1,12).getValues()[0];
    aba.getRange(row,2,1,11).setValues([[
      protegerTextoPlanilha_(pedido.customer.name),pedido.customer.cep,protegerTextoPlanilha_(pedido.customer.rua),protegerTextoPlanilha_(pedido.customer.numero),
      protegerTextoPlanilha_(pedido.customer.comp),protegerTextoPlanilha_(pedido.customer.bairro),atual[7] || agora,agora,
      Number(atual[9]||0)+1,arredondarDinheiro_(Number(atual[10]||0)+pedido.total),
      pedido.notificationsOptIn===true
    ]]);
  } else {
    aba.appendRow([
      telefone,protegerTextoPlanilha_(pedido.customer.name),pedido.customer.cep,protegerTextoPlanilha_(pedido.customer.rua),
      protegerTextoPlanilha_(pedido.customer.numero),protegerTextoPlanilha_(pedido.customer.comp),protegerTextoPlanilha_(pedido.customer.bairro),
      agora,agora,1,pedido.total,pedido.notificationsOptIn===true
    ]);
  }
}

function obterDadosPainelAdmin_() {
  var ordersSheet=abaGestao_(GESTAO.SHEETS.ORDERS);
  var itemsSheet=abaGestao_(GESTAO.SHEETS.ITEMS);
  var noticesSheet=abaGestao_(GESTAO.SHEETS.NOTIFICATIONS);
  var orderLast=ordersSheet.getLastRow(),orders=[];
  if(orderLast>=2) {
    var start=Math.max(2,orderLast-199);
    var rows=ordersSheet.getRange(start,1,orderLast-start+1,GESTAO.ORDER_HEADERS.length).getValues();
    var itemRows=itemsSheet.getLastRow()>=2
      ? itemsSheet.getRange(2,1,itemsSheet.getLastRow()-1,GESTAO.ITEM_HEADERS.length).getValues() : [];
    var noticeRows=noticesSheet.getLastRow()>=2
      ? noticesSheet.getRange(2,1,noticesSheet.getLastRow()-1,GESTAO.NOTIFICATION_HEADERS.length).getValues() : [];
    var itemsByOrder={},noticeByOrder={};
    itemRows.forEach(function(r) {
      var id=String(r[0]);
      if(!itemsByOrder[id]) itemsByOrder[id]=[];
      itemsByOrder[id].push({kind:String(r[1]),reference:String(r[2]),name:String(r[3]),
        flavorSummary:String(r[4]),size:String(r[5]),quantity:Number(r[6]||0),
        unitPrice:Number(r[7]||0),total:Number(r[8]||0),obs:String(r[9]||'')});
    });
    noticeRows.forEach(function(r) {
      noticeByOrder[String(r[1])]={id:String(r[0]),createdAt:formatarDataPainel_(r[2]),
        status:String(r[6]),message:String(r[5])};
    });
    rows.forEach(function(r) {
      var id=String(r[0]);
      orders.push({
        id:id,reviewId:String(r[1]),createdAt:formatarDataPainel_(r[2]),
        updatedAt:formatarDataPainel_(r[3]),status:String(r[4]),name:String(r[5]),
        phone:String(r[6]),notificationsOptIn:r[7]===true,cep:String(r[8]),
        street:String(r[9]),number:String(r[10]),complement:String(r[11]),
        neighborhood:String(r[12]),payment:String(r[13]),changeFor:String(r[14]),
        observations:String(r[15]),subtotal:Number(r[16]||0),shipping:Number(r[17]||0),
        total:Number(r[18]||0),deliveryDate:String(r[19]),city:String(r[20]),
        items:itemsByOrder[id]||[],lastNotification:noticeByOrder[id]||null
      });
    });
    orders.reverse();
  }
  var statusCounts={};
  GESTAO.STATUSES.forEach(function(s){statusCounts[s]=0;});
  orders.forEach(function(o){statusCounts[o.status]=(statusCounts[o.status]||0)+1;});
  return {ok:true,orders:orders,statuses:GESTAO.STATUSES,stats:{
    total:orders.length,awaiting:statusCounts[STATUS_INICIAL_PEDIDO_]||0,
    inProgress:(statusCounts['Pedido confirmado']||0)+(statusCounts['Em preparação']||0),
    outForDelivery:statusCounts['Saiu para entrega']||0,
    delivered:statusCounts['Entregue']||0
  },spreadsheetUrl:planilhaGestao_().getUrl()};
}

function formatarDataPainel_(valor) {
  if(valor instanceof Date) return Utilities.formatDate(valor,'America/Bahia','dd/MM/yyyy HH:mm');
  return String(valor||'');
}

function criarMensagemStatus_(pedido,status) {
  var primeiro=String(pedido.name||'').trim().split(/\s+/)[0] || 'cliente';
  var saudacao='Olá, '+primeiro+'! 😊\n\nTemos uma atualização sobre seu pedido '+pedido.id+' no Tempero da Ilma.\n\n';
  var textos={
    'Pedido confirmado':'Seu pedido foi confirmado! Em breve começaremos a preparar suas marmitas.',
    'Em preparação':'Seu pedido está em preparação. Nossa equipe já está organizando tudo com carinho.',
    'Pronto para entrega':'Seu pedido está pronto para entrega. Avisaremos quando sair para o seu endereço.',
    'Saiu para entrega':'Seu pedido saiu para entrega! Fique atento ao telefone para acompanhar o recebimento.',
    'Entregue':'Seu pedido consta como entregue. Esperamos que aproveite suas marmitas! ❤️',
    'Cancelado':'Seu pedido foi cancelado. Caso tenha dúvidas, fale conosco por esta conversa.'
  };
  return saudacao+(textos[status] || ('O status do seu pedido foi atualizado para: '+status+'.'))+
    '\n\nObrigado por escolher o Tempero da Ilma! ❤️';
}

function executarOperacaoAdmin_(params,tipo) {
  var operationId=String(params.operationId||'');
  var cache=CacheService.getScriptCache();
  var cacheKey='temp-admin-op:'+operationId;
  try {
    if(!/^[A-Fa-f0-9-]{20,50}$/.test(operationId)) throw new Error('Identificação da operação inválida.');
    if(!validarSessaoAdmin_(params.token)) throw new Error('Sessão inválida ou expirada.');
    var payload=JSON.parse(String(params.payload||'{}'));
    var lock=LockService.getScriptLock();
    lock.waitLock(10000);
    var resultado;
    try {
      if(tipo==='status') resultado=atualizarStatusPedidoAdmin_(payload);
      else if(tipo==='notification') resultado=marcarNotificacaoAdmin_(payload);
      else if(tipo==='password') resultado=alterarSenhaAdmin_(payload);
    } finally {
      if(lock.hasLock()) lock.releaseLock();
    }
    cache.put(cacheKey,JSON.stringify(resultado),300);
    return respostaTexto_(resultado);
  } catch(erro) {
    var falha={ok:false,message:limparCampo_(erro && erro.message,180)||'Não foi possível concluir a operação.'};
    try { cache.put(cacheKey,JSON.stringify(falha),300); } catch(ignorar) {}
    return respostaTexto_(falha);
  }
}

function alterarSenhaAdmin_(payload) {
  var senha=validarSenhaAdmin_(payload && payload.newPassword);
  // Trocar a senha também invalida sessões em outros navegadores e dispositivos.
  definirSenhaPainelTempero(senha);
  return {ok:true,passwordChanged:true,message:'Senha alterada com sucesso. Faça login novamente com sua nova senha.'};
}

function atualizarStatusPedidoAdmin_(payload) {
  var orderId=limparCampo_(payload.orderId,60);
  var novoStatus=String(payload.status||'');
  if(GESTAO.STATUSES.indexOf(novoStatus)<0) throw new Error('Status inválido.');
  var local=linhaPedidoPorId_(orderId);
  if(!local) throw new Error('Pedido não encontrado.');
  var linha=local.row,aba=local.sheet;
  var dados=aba.getRange(linha,1,1,GESTAO.ORDER_HEADERS.length).getValues()[0];
  var antigo=String(dados[4]||'');
  if(antigo===novoStatus) return {ok:true,unchanged:true,message:'O pedido já está com esse status.'};
  var agora=new Date();
  aba.getRange(linha,4).setValue(agora);
  aba.getRange(linha,5).setValue(novoStatus);
  var nota=limparCampo_(payload.note,300);
  abaGestao_(GESTAO.SHEETS.HISTORY).appendRow([
    criarIdUnico_('HIS-'),orderId,agora,antigo,novoStatus,protegerTextoPlanilha_(nota),'Painel administrativo'
  ]);

  var pedido={id:orderId,name:String(dados[5]||'')};
  var message=criarMensagemStatus_(pedido,novoStatus);
  var notificationId=criarIdUnico_('NOT-');
  abaGestao_(GESTAO.SHEETS.NOTIFICATIONS).appendRow([
    notificationId,orderId,agora,String(dados[6]||''),novoStatus,
    protegerTextoPlanilha_(message),'PRONTA_PARA_ABRIR_NO_WHATSAPP',agora
  ]);
  return {ok:true,orderId:orderId,status:novoStatus,notificationId:notificationId,message:'Status atualizado e mensagem preparada.'};
}

function marcarNotificacaoAdmin_(payload) {
  var id=String(payload.notificationId||'');
  if(!id) throw new Error('Notificação não identificada.');
  var aba=abaGestao_(GESTAO.SHEETS.NOTIFICATIONS),ultima=aba.getLastRow();
  if(ultima<2) throw new Error('Notificação não encontrada.');
  var ids=aba.getRange(2,1,ultima-1,1).getValues();
  for(var i=ids.length-1;i>=0;i--) {
    if(String(ids[i][0])===id) {
      aba.getRange(i+2,7).setValue('LINK_ABERTO_NO_WHATSAPP');
      aba.getRange(i+2,8).setValue(new Date());
      return {ok:true,message:'Link do WhatsApp aberto. O envio ainda depende de confirmação manual.'};
    }
  }
  throw new Error('Notificação não encontrada.');
}



function pedidoExistePorId_(orderId) {
  var aba=abaGestao_(GESTAO.SHEETS.ORDERS),ultima=aba.getLastRow();
  if(ultima<2) return false;
  return aba.getRange(2,1,ultima-1,1).getValues().some(function(linha){return String(linha[0])===String(orderId);});
}

function validarLimiteRegistroPedido_(telefone) {
  var cache=CacheService.getScriptCache();
  var bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(telefone),Utilities.Charset.UTF_8);
  var chave='temp-order-rate:'+bytes.map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('').slice(0,24);
  var atual=Number(cache.get(chave)||0);
  if(atual>=8) throw new Error('Muitos pedidos foram registrados deste telefone em pouco tempo. Aguarde alguns minutos e tente novamente.');
  cache.put(chave,String(atual+1),900);
}

function dataEntregaSabadoServidor_() {
  var agora=new Date(),fuso='America/Bahia';
  var dia=Number(Utilities.formatDate(agora,fuso,'u'))%7;
  var dias=(6-dia+7)%7;
  if(dias===0) dias=7;
  return Utilities.formatDate(new Date(agora.getTime()+dias*86400000),fuso,'dd/MM');
}
