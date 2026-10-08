/*
  Relational Cartography (rcft): dados
  Lê as respostas, normaliza-as e guarda a última versão válida em cache local.
  Nunca substitui o corpus por dados inventados: se a rede falhar, usa a cache.
*/
(function () {
  const C = window.RCFT_CONFIG;
  const CACHE_KEY = "rcft-cache-v1";

  function stripAccents(s) {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  // Mesma normalização de países da versão original.
  function normCountry(raw) {
    if (!raw) return "";
    let s = String(raw).toLowerCase().trim();
    s = s.replace(/[\u{1F300}-\u{1FAFF}\u{1F100}-\u{1F1FF}]/gu, "");
    s = stripAccents(s);
    if (s.includes(",")) {
      const parts = s.split(",").map(t => t.trim()).filter(Boolean);
      s = parts[parts.length - 1] || "";
    }
    s = s.replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
    const aliases = {
      "pt": "portugal", "prt": "portugal", "portuguese republic": "portugal",
      "uk": "united kingdom", "gb": "united kingdom", "great britain": "united kingdom",
      "england": "united kingdom", "scotland": "united kingdom", "wales": "united kingdom",
      "northern ireland": "united kingdom",
      "us": "united states", "usa": "united states", "u s a": "united states",
      "united states of america": "united states",
      "uae": "united arab emirates", "emirates": "united arab emirates",
      "br": "brazil", "de": "germany", "fr": "france", "es": "spain", "it": "italy"
    };
    return aliases[s] || s;
  }

  function findKey(keys, needles) {
    return keys.find(k => needles.some(n => k.toLowerCase().includes(n)));
  }

  function toTime(v) {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }

  /*
    Aceita dois formatos:
    1. o da folha original (uma coluna por pergunta, cabeçalhos em texto);
    2. o do apps-script/Code.gs deste repositório: [{ ts, word, country }].
    Devolve [{ ts, word, country }] ou null se o formato não for reconhecido.
  */
  function parseRows(data) {
    if (!Array.isArray(data)) return null;
    if (!data.length) return [];

    const keys = Object.keys(data[0] || {});
    let tsKey, wordKey, countryKey;

    if (keys.includes("word") && keys.includes("country")) {
      tsKey = "ts"; wordKey = "word"; countryKey = "country";
    } else {
      tsKey = findKey(keys, ["timestamp", "carimbo"]) || keys[0];
      wordKey = findKey(keys, ["one word", "palavra", "definir"]);
      countryKey = findKey(keys, ["where are you responding from", "country", "país", "pais", "location"]);
      if (!wordKey || !countryKey) return null;
    }

    const rows = [];
    for (const r of data) {
      const word = String(r[wordKey] ?? "").trim();
      if (!word || /^(null|undefined)$/i.test(word)) continue;
      rows.push({
        ts: toTime(r[tsKey]),
        word,
        country: String(r[countryKey] ?? "").trim()
      });
    }
    return rows;
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      return Array.isArray(obj.rows) ? obj : null;
    } catch (_) {
      return null;
    }
  }

  function saveCache(rows) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), rows }));
    } catch (_) { /* armazenamento indisponível: segue sem cache */ }
  }

  async function fetchRows() {
    const url = C.READ_URL + (C.READ_URL.includes("?") ? "&" : "?") + "t=" + Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), C.FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (_) {
        // O Apps Script às vezes devolve uma página de erro em HTML.
        throw new Error("a resposta não é JSON");
      }
      const rows = parseRows(data);
      if (!rows) throw new Error("formato de dados não reconhecido");
      saveCache(rows);
      return rows;
    } finally {
      clearTimeout(timer);
    }
  }

  /*
    Respostas acabadas de enviar a partir deste browser. O mapa mostra-as logo,
    sem esperar pela leitura lenta do Apps Script, e retira-as desta lista
    quando elas aparecem nos dados (ou ao fim de 15 minutos).
  */
  const PENDING_KEY = "rcft-pending-v1";
  const PENDING_MAX_AGE = 15 * 60 * 1000;

  function loadPending() {
    try {
      const list = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function savePending(list) {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(list)); } catch (_) { /* sem armazenamento */ }
  }

  function addPending(word, country) {
    const list = loadPending();
    list.push({ ts: Date.now(), word: String(word).trim(), country: String(country).trim() });
    savePending(list);
  }

  // Junta às respostas as que ainda não chegaram aos dados.
  function withPending(rows) {
    const now = Date.now();
    const list = loadPending().filter(pnd =>
      now - pnd.ts < PENDING_MAX_AGE &&
      !rows.some(r =>
        r.word.toLowerCase() === pnd.word.toLowerCase() &&
        (r.ts === null || r.ts >= pnd.ts - 5 * 60 * 1000)
      )
    );
    savePending(list);
    return rows.concat(list.map(pnd => ({ ts: pnd.ts, word: pnd.word, country: pnd.country })));
  }

  // Palavras enviadas há pouco tempo (para as assinalar no mapa).
  function recentPendingWords(ms) {
    const now = Date.now();
    return loadPending().filter(pnd => now - pnd.ts < ms).map(pnd => pnd.word.toLowerCase());
  }

  /*
    Atualização automática: o GitHub Pages deixa os browsers guardarem as
    páginas até 10 minutos. A página compara a sua versão com version.json
    (sem cache) e, se houver uma mais recente, recarrega-se com ?v= novo.
    Só tenta uma vez por versão, para nunca entrar em ciclo.
  */
  async function checkVersion() {
    const mine = Number(window.RCFT_VERSION || 0);
    try {
      const res = await fetch("version.json?t=" + Date.now(), { cache: "no-store" });
      if (!res.ok) return;
      const latest = Number((await res.json()).v || 0);
      if (!(latest > mine)) return;
      const key = "rcft-reload-" + latest;
      try {
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
      } catch (_) { /* sem armazenamento: recarrega na mesma */ }
      const url = new URL(location.href);
      url.searchParams.set("v", String(latest));
      location.replace(url.href);
    } catch (_) { /* sem rede: tenta na próxima verificação */ }
  }

  /*
    Fator de escala da interface e do desenho, partilhado pelo sketch e pela moldura.
      ?scale=1.5           valor fixo
      ?scale=auto, ou      proporcional ao lado menor do ecrã (720 px = 1; 1080 px = 1.5),
      data-scale="auto"    nunca abaixo de 1. Num televisor com a mesma diagonal, a peça
                           fica com o mesmo tamanho físico seja Full HD ou HD; um ecrã
                           ao alto usa a largura.
    Sem nada, 1.
  */
  function scaleIsAuto() {
    const q = new URLSearchParams(location.search).get("scale");
    return q === "auto" || (q == null && document.documentElement.dataset.scale === "auto");
  }

  function scale() {
    const v = parseFloat(new URLSearchParams(location.search).get("scale"));
    if (Number.isFinite(v)) return Math.min(4, Math.max(0.5, v));
    if (!scaleIsAuto()) return 1;
    const side = Math.min(window.innerWidth, window.innerHeight);
    if (!(side > 0)) return 1;   // iframe ainda sem tamanho: recalcula no resize
    return Math.min(3, Math.max(1, Math.round(side / 720 * 100) / 100));
  }

  window.RCFT_DATA = {
    checkVersion, scale, scaleIsAuto,
    fetchRows, loadCache, parseRows, normCountry,
    addPending, withPending, recentPendingWords
  };
})();
