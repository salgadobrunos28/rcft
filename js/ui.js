/*
  Relational Cartography (rcft): interface do site como folha de mapa.
  Desenha a moldura com a graduação da grelha e preenche o colar e a cartouche
  com os dados que o sketch emite (eventos rcft:data e rcft:sync).
*/
(function () {
  const GRID = 80;            // o mesmo espaçamento da grelha do mapa
  const svg = document.getElementById("sheet");
  const NS = "http://www.w3.org/2000/svg";
  const root = document.documentElement;

  // Na instalação, a moldura acompanha a escala dos blocos (css/install.css), a
  // mesma do sketch (js/data.js). A graduação continua a marcar a grelha de 80 px.
  let S = 1;
  function readScale() {
    S = root.dataset.mode === "install" && window.RCFT_DATA ? window.RCFT_DATA.scale() : 1;
  }

  function el(name, attrs, text) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    svg.appendChild(e);
    return e;
  }

  function cssPx(name) {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
  }

  function drawSheet() {
    const W = window.innerWidth, H = window.innerHeight;
    const m = Math.round(cssPx("--m") * S);
    const narrow = W < 768;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.textContent = "";

    el("rect", { class: "neat", x: m + 0.5, y: m + 0.5, width: W - 2 * m - 1, height: H - 2 * m - 1 });

    const len = (narrow ? 3 : 5) * S;
    const L = (narrow ? 6 : 10) * S;   // marca dos eixos centrais, mais longa
    const labelEvery = 2 * GRID;

    /*
      Graduação: onde as linhas da grelha do mapa encontram a moldura. A grelha
      parte do centro (js/sketch.js), por isso o traço do centro é um traço da
      série, só mais longo, e os números (coordenadas em px, as mesmas da tabela)
      ficam a cada 160 px a partir dele.
    */
    const cx = Math.round(W / 2), cy = Math.round(H / 2);
    for (let x = cx % GRID; x < W - m; x += GRID) {
      if (x <= m) continue;
      const k = x === cx ? "tick major" : "tick", l = x === cx ? L : len;
      el("line", { class: k, x1: x + 0.5, y1: m - l, x2: x + 0.5, y2: m });
      el("line", { class: k, x1: x + 0.5, y1: H - m, x2: x + 0.5, y2: H - m + l });
      if (!narrow && Math.abs(x - cx) % labelEvery === 0) {
        el("text", { x: x, y: H - m + (x === cx ? 18 : 14) * S, "text-anchor": "middle" }, String(x));
      }
    }
    for (let y = cy % GRID; y < H - m; y += GRID) {
      if (y <= m) continue;
      const k = y === cy ? "tick major" : "tick", l = y === cy ? L : len;
      el("line", { class: k, x1: m - l, y1: y + 0.5, x2: m, y2: y + 0.5 });
      el("line", { class: k, x1: W - m, y1: y + 0.5, x2: W - m + l, y2: y + 0.5 });
      if (!narrow && Math.abs(y - cy) % labelEvery === 0) {
        el("text", { x: m - (y === cy ? 12 : 8) * S, y: y + 3 * S, "text-anchor": "end" }, String(y));
      }
    }
  }

  // ---------- dados ----------

  const $ = id => document.getElementById(id);
  const z = v => String(v).padStart(2, "0");

  function stamp(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
  }

  window.addEventListener("rcft:data", e => {
    const d = e.detail;
    if (!$("st-responses")) return;
    $("st-responses").textContent = d.responses;
    $("st-words").textContent = d.words;
    $("st-origins").textContent = d.origins;
    $("st-last").textContent = d.lastTs ? stamp(d.lastTs) : "--";
    stackBottom();
  });

  // Em telemóvel: só as cinco entradas mais recentes. Decidido a cada resize,
  // porque dentro do Cargo o iframe começa sem tamanho.
  const coords = document.getElementById("coords");
  const LINES = coords ? coords.dataset.lines : null;
  function setLines() {
    const w = window.innerWidth;
    if (!coords || !LINES || !(w > 0)) return;
    coords.dataset.lines = w < 768 ? "5" : LINES;
  }

  /*
    Instalação: num ecrã estreito com escala grande (por exemplo um ecrã ao alto
    com ?scale=1.5) o bloco do QR e o do título não cabem lado a lado. Nesse caso
    o QR sobe e fica por cima do título, alinhado à direita.
  */
  function stackBottom() {
    const panel = document.querySelector(".i-panel");
    const car = document.querySelector(".cartouche");
    if (!panel || !car) return;
    root.style.setProperty("--panel-lift", "0px");
    const a = car.getBoundingClientRect(), b = panel.getBoundingClientRect();
    if (!a.width || !b.width) return;
    if (a.right + 16 * S > b.left) {
      root.style.setProperty("--panel-lift", (a.height / S + 16) + "px");
    }
  }

  function layout() { readScale(); setLines(); drawSheet(); stackBottom(); }

  readScale();
  setLines();
  drawSheet();
  let t = null;
  window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(layout, 120); });
  // O QR só aparece depois de o sketch arrancar, e a fonte muda as larguras.
  window.addEventListener("load", () => setTimeout(stackBottom, 0));
  if (document.fonts) document.fonts.ready.then(stackBottom);
})();
