/*
  Relational Cartography (rcft): Apps Script único para leitura e escrita.

  Substitui os três deployments atuais por um só endereço:
    GET  devolve apenas o necessário para o mapa: [{ ts, country, word }]
         (as respostas longas deixam de ser publicadas no endpoint público)
    POST acrescenta uma linha à folha, nas mesmas colunas do formulário original

  Deploy:
    1. Na folha: Extensões > Apps Script. Criar um ficheiro novo e colar este código.
    2. Implementar > Nova implementação > Tipo: Aplicação Web.
       Executar como: Eu. Quem tem acesso: Qualquer pessoa.
    3. Copiar o URL /exec e colocá-lo em js/config.js, em READ_URL e WRITE_URL,
       e mudar WRITE_MODE para "post".
*/

const SPREADSHEET_ID = "1ZT2OFmhSqgpiDny7bg8MvkPgjWFiS8owc-O2CcC7xn0";
const SHEET_GID = 306737488;

// Colunas A..G: data/hora, país, quatro respostas longas, palavra
const COL_COUNTRY = 1;
const COL_WORD = 6;

function sheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return ss.getSheets().find(s => s.getSheetId() === SHEET_GID) || ss.getSheets()[0];
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Impede que uma resposta seja interpretada como fórmula pela folha.
function safe_(value, max) {
  let s = String(value == null ? "" : value).trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

// A leitura fica em cache 20 segundos: com muitos visitantes (ou o ecrã da
// instalação a pedir de 30 em 30 segundos) a folha só é lida uma vez por ciclo.
const CACHE_KEY = "rcft-rows";
const CACHE_SECONDS = 20;

function doGet() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(CACHE_KEY);
  if (hit) {
    return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  }
  const values = sheet_().getDataRange().getValues();
  values.shift(); // cabeçalhos
  const out = [];
  for (const r of values) {
    const word = String(r[COL_WORD] || "").trim();
    if (!word) continue;
    out.push({
      ts: r[0] instanceof Date ? r[0].toISOString() : String(r[0] || ""),
      country: String(r[COL_COUNTRY] || "").trim(),
      word: word
    });
  }
  const body = JSON.stringify(out);
  try { cache.put(CACHE_KEY, body, CACHE_SECONDS); } catch (_) { /* limite de 100 KB */ }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const p = (e && e.parameter) || {};
  const row = [
    new Date(),
    safe_(p.country, 120),
    safe_(p.meaning, 1000),
    safe_(p.forms, 1000),
    safe_(p.movement, 1000),
    safe_(p.space, 1000),
    safe_(p.oneword, 60)
  ];

  if (!row[1] || !row[2] || !row[6]) {
    return json_({ ok: false, error: "missing required fields" });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sheet_().appendRow(row);
    CacheService.getScriptCache().remove(CACHE_KEY);
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}
