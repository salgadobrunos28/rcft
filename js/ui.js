/*
  Relational Cartography (rcft): interface do site como folha de mapa.
  Desenha a moldura com a graduação da grelha e preenche o colar e a cartouche
  com os dados que o sketch emite (eventos rcft:data e rcft:sync).
*/
(function () {
  const GRID = 80;            // o mesmo espaçamento da grelha do mapa
  const svg = document.getElementById("sheet");
  const NS = "http://www.w3.org/2000/svg";

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
    const m = cssPx("--m");
    const narrow = W < 768;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.textContent = "";

    el("rect", { class: "neat", x: m + 0.5, y: m + 0.5, width: W - 2 * m - 1, height: H - 2 * m - 1 });

    const len = narrow ? 3 : 5;
    const labelEvery = 2 * GRID;

    // Graduação: onde as linhas da grelha encontram a moldura.
    for (let x = GRID; x < W - m; x += GRID) {
      if (x <= m) continue;
      el("line", { class: "tick", x1: x + 0.5, y1: m - len, x2: x + 0.5, y2: m });
      el("line", { class: "tick", x1: x + 0.5, y1: H - m, x2: x + 0.5, y2: H - m + len });
      if (!narrow && x % labelEvery === 0) {
        el("text", { x: x, y: H - m + 14, "text-anchor": "middle" }, String(x));
      }
    }
    for (let y = GRID; y < H - m; y += GRID) {
      if (y <= m) continue;
      el("line", { class: "tick", x1: m - len, y1: y + 0.5, x2: m, y2: y + 0.5 });
      el("line", { class: "tick", x1: W - m, y1: y + 0.5, x2: W - m + len, y2: y + 0.5 });
      if (!narrow && y % labelEvery === 0) {
        el("text", { x: m - 8, y: y + 3, "text-anchor": "end" }, String(y));
      }
    }

    // Eixos centrais do mapa: marca mais longa.
    const cx = Math.round(W / 2) + 0.5, cy = Math.round(H / 2) + 0.5, L = narrow ? 6 : 10;
    el("line", { class: "tick major", x1: cx, y1: m - L, x2: cx, y2: m });
    el("line", { class: "tick major", x1: cx, y1: H - m, x2: cx, y2: H - m + L });
    el("line", { class: "tick major", x1: m - L, y1: cy, x2: m, y2: cy });
    el("line", { class: "tick major", x1: W - m, y1: cy, x2: W - m + L, y2: cy });
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
    $("st-responses").textContent = d.responses;
    $("st-words").textContent = d.words;
    $("st-origins").textContent = d.origins;
    $("st-last").textContent = d.lastTs ? stamp(d.lastTs) : "--";
  });

  window.addEventListener("rcft:sync", e => {
    const d = e.detail, t = d.time;
    $("ui-sync").textContent = `${z(t.getHours())}:${z(t.getMinutes())}:${z(t.getSeconds())}`;
    document.querySelector(".collar-status").classList.toggle("offline", !d.ok);
  });

  // Em telemóvel: só as cinco entradas mais recentes.
  if (window.innerWidth < 768) {
    const coords = document.getElementById("coords");
    if (coords) coords.dataset.lines = "5";
  }

  drawSheet();
  let t = null;
  window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(drawSheet, 120); });
})();
