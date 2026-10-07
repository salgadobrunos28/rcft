/*
  Relational Cartography (rcft): sketch
  p5.js em modo instância. O texto da interface está no HTML (index.html)
  e funciona como zona de exclusão: os nós não entram nos painéis de texto.

  Duas páginas usam este sketch:
    index.html          site (web e telemóvel), com o botão para o formulário
    installation.html   instalação: sem botão nem cursor, com QR code

  Parâmetros de URL (opcionais):
    ?scale=1.5      escala da interface e do desenho (ecrãs grandes)
    ?qr=0 / ?qr=1   esconde ou mostra o QR code
    ?mode=install   equivale a abrir installation.html

  Teclas:
    espaço  pausa a deriva
    r       atualiza os dados
    d       mostra o painel de diagnóstico
    f       ecrã inteiro
*/
(function () {
  const C = window.RCFT_CONFIG;
  const D = window.RCFT_DATA;

  const params = new URLSearchParams(location.search);
  const MODE = window.RCFT_MODE === "install" || params.get("mode") === "install" ? "install" : "web";
  const SCALE = clampNum(parseFloat(params.get("scale")), 0.5, 4, 1);
  const SHOW_QR = MODE === "install" ? params.get("qr") !== "0" : params.get("qr") === "1";

  document.documentElement.dataset.mode = MODE;
  if (MODE === "install") document.title = "Relational Cartography (rcft) - Installation";
  document.documentElement.style.setProperty("--s", String(SCALE));

  // Parâmetros visuais (iguais à versão original, multiplicados pela escala)
  const MOVE_AMT = 1 * SCALE;
  const NOISE_STEP = 0.001;
  const LABEL_OFFSET = 16 * SCALE;
  const GRID_SPACING = 80;
  const NEW_RING_MS = 4000;     // anel que assinala uma palavra nova
  const ZONE_PAD = 4 * SCALE;   // folga à volta dos painéis de texto

  const el = {
    coords: document.getElementById("coords"),
    debug: document.getElementById("debug"),
    qr: document.getElementById("qr"),
    qrCode: document.getElementById("qr-code"),
    panels: ["title", "about", "legend", "coords", "contribute", "qr"]
      .map(id => document.getElementById(id))
      .filter(Boolean)
  };

  let nodes = [];
  let sameEdges = [];
  let diffEdges = [];
  let zones = [];
  let paused = false;
  let firstLoadDone = false;
  let loading = false;
  let rowsCount = 0;
  let lastSource = "none";
  let lastSync = null;
  let lastError = null;

  let isMobile = false;
  let margin = 80 * SCALE;
  let baseRadius = 8 * SCALE;
  let labelSize = 10 * SCALE;
  let coordLines = 10;

  function clampNum(v, lo, hi, fallback) {
    return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
  }

  function capitalise(k) {
    return k.charAt(0).toUpperCase() + k.slice(1);
  }

  new p5(p => {
    class Node {
      constructor(key) {
        this.key = key;
        this.label = capitalise(key);
        this.f = 1;
        this.country = "";
        this.x = 0;
        this.y = 0;
        this.xoff = p.random(1000);
        this.yoff = p.random(2000);
        this.phase = p.random(p.TWO_PI);
        this.bornAt = null;
        this.lw = 0;
      }

      measure() {
        p.textSize(labelSize);
        this.lw = p.textWidth(this.label);
      }

      radius() {
        const pulse = this.f > 1 ? 1 + 0.15 * Math.sin(this.phase) : 1;
        return baseRadius * pulse * p.map(this.f, 1, 5, 1, 1.8);
      }

      update() {
        this.x += p.map(p.noise(this.xoff), 0, 1, -MOVE_AMT, MOVE_AMT);
        this.y += p.map(p.noise(this.yoff), 0, 1, -MOVE_AMT, MOVE_AMT);
        keepInside(this);
        this.xoff += NOISE_STEP;
        this.yoff += NOISE_STEP;
        if (this.f > 1) this.phase += 0.03 * this.f;
      }

      display(now) {
        const r = this.radius();
        p.stroke(255);
        p.noFill();
        p.ellipse(this.x, this.y, r, r);

        if (this.bornAt !== null) {
          const t = (now - this.bornAt) / NEW_RING_MS;
          if (t >= 1) {
            this.bornAt = null;
          } else {
            const e = 1 - Math.pow(1 - t, 3);
            p.stroke(255, 255 * (1 - t));
            p.ellipse(this.x, this.y, r + 48 * SCALE * e, r + 48 * SCALE * e);
          }
        }

        p.fill(255);
        p.noStroke();
        p.textSize(labelSize);
        p.text(this.label, this.x, this.y - LABEL_OFFSET);
      }
    }

    // ---------- Espaço disponível ----------

    // Limites do centro do nó: a margem, mas nunca deixando a etiqueta sair do ecrã.
    function bounds(n) {
      const halfW = n ? Math.max(n.radius() / 2, n.lw / 2) + 4 * SCALE : 0;
      return {
        minX: Math.max(margin, halfW),
        maxX: Math.min(p.width - margin, p.width - halfW),
        minY: Math.max(margin, LABEL_OFFSET + labelSize),
        maxY: p.height - margin
      };
    }

    function computeZones() {
      zones = [];
      for (const node of el.panels) {
        if (node.hidden) continue;
        const r = node.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        zones.push({
          x0: r.left - ZONE_PAD,
          y0: r.top - ZONE_PAD,
          x1: r.right + ZONE_PAD,
          y1: r.bottom + ZONE_PAD
        });
      }
    }

    // Mantém o nó (círculo e etiqueta) fora dos painéis e dentro das margens.
    function keepInside(n) {
      const b = bounds(n);
      const inB = (x, y) => x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
      const halfW = Math.max(n.radius() / 2, n.lw / 2) + 3 * SCALE;
      const up = LABEL_OFFSET + labelSize / 2 + 3 * SCALE;
      const down = n.radius() / 2 + 3 * SCALE;

      for (const z of zones) {
        const left = n.x - halfW, right = n.x + halfW;
        const top = n.y - up, bottom = n.y + down;
        if (right <= z.x0 || left >= z.x1 || bottom <= z.y0 || top >= z.y1) continue;

        const options = [
          { dx: z.x0 - right, dy: 0 },
          { dx: z.x1 - left, dy: 0 },
          { dx: 0, dy: z.y0 - bottom },
          { dx: 0, dy: z.y1 - top }
        ].sort((a, c) => (Math.abs(a.dx) + Math.abs(a.dy)) - (Math.abs(c.dx) + Math.abs(c.dy)));

        const valid = options.find(o => inB(n.x + o.dx, n.y + o.dy)) || options[0];
        n.x += valid.dx;
        n.y += valid.dy;
      }

      n.x = p.constrain(n.x, b.minX, b.maxX);
      n.y = p.constrain(n.y, b.minY, b.maxY);
    }

    function placeRandom(n) {
      const b = bounds(n);
      n.x = p.random(b.minX, b.maxX);
      n.y = p.random(b.minY, b.maxY);
      keepInside(n);
    }

    function applyResponsive() {
      isMobile = window.innerWidth < 768;
      margin = (isMobile ? 16 : 80) * SCALE;
      baseRadius = (isMobile ? 7 : 8) * SCALE;
      labelSize = (isMobile ? 9 : 10) * SCALE;
      coordLines = isMobile ? 8 : 10;
      for (const n of nodes) n.measure();
    }

    // ---------- Dados ----------

    // Junta as respostas por palavra. Mantém os nós que já existem (e a sua
    // posição); só as palavras novas entram no mapa.
    function applyRows(rows, source) {
      const agg = new Map();
      for (const r of rows) {
        const key = r.word.toLowerCase();
        let a = agg.get(key);
        if (!a) {
          // País do primeiro respondente, como na versão original.
          a = { key, f: 0, country: D.normCountry(r.country) };
          agg.set(key, a);
        }
        a.f++;
      }

      const existing = new Map(nodes.map(n => [n.key, n]));
      const next = [];
      for (const a of agg.values()) {
        let n = existing.get(a.key);
        if (!n) {
          n = new Node(a.key);
          n.measure();
          placeRandom(n);
          if (firstLoadDone) n.bornAt = p.millis();
        }
        n.f = a.f;
        n.country = a.country;
        next.push(n);
      }

      nodes = next;
      buildEdges();
      rowsCount = rows.length;
      lastSource = source;
      firstLoadDone = true;
      updateCoords(true);
    }

    function buildEdges() {
      sameEdges = [];
      diffEdges = [];
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const pair = [nodes[i], nodes[j]];
          if (nodes[i].country === nodes[j].country) sameEdges.push(pair);
          else diffEdges.push(pair);
        }
      }
    }

    async function refresh() {
      if (loading) return;
      loading = true;
      try {
        const rows = await D.fetchRows();
        if (rows.length === 0 && rowsCount > 0) {
          throw new Error("resposta vazia ignorada");
        }
        applyRows(rows, "network");
        lastError = null;
      } catch (e) {
        lastError = e && e.message ? e.message : String(e);
        console.warn("[rcft] falha ao atualizar:", lastError);
      } finally {
        loading = false;
        lastSync = new Date();
        updateDebug();
      }
    }

    // ---------- Desenho ----------

    function cartesianGrid() {
      p.push();
      p.stroke(255, 18);
      p.strokeWeight(0.5);
      for (let x = 0; x <= p.width; x += GRID_SPACING) p.line(x, 0, x, p.height);
      for (let y = 0; y <= p.height; y += GRID_SPACING) p.line(0, y, p.width, y);
      p.stroke(255, 35);
      p.strokeWeight(0.7);
      p.line(p.width / 2, 0, p.width / 2, p.height);
      p.line(0, p.height / 2, p.width, p.height / 2);
      p.pop();
    }

    // Todas as arestas num só traço por tipo, com tracejado nativo do canvas.
    function drawEdges() {
      const ctx = p.drawingContext;
      ctx.save();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 0.3 * SCALE;

      ctx.beginPath();
      for (const [a, b] of sameEdges) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      ctx.setLineDash([]);
      ctx.stroke();

      ctx.beginPath();
      for (const [a, b] of diffEdges) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      ctx.setLineDash([8 * SCALE, 5 * SCALE]);
      ctx.stroke();

      ctx.restore();
    }

    let lastCoordsAt = 0;
    function updateCoords(force) {
      const now = performance.now();
      if (!force && now - lastCoordsAt < 100) return;
      lastCoordsAt = now;

      if (!nodes.length) {
        el.coords.textContent = loading || !firstLoadDone ? "loading responses" : "";
        return;
      }
      const start = Math.max(0, nodes.length - coordLines);
      el.coords.textContent = nodes
        .slice(start)
        .map(n => `${n.label} -> ${n.x.toFixed(1)} , ${n.y.toFixed(1)}`)
        .join("\n");
    }

    function updateDebug() {
      if (el.debug.hidden) return;
      const t = lastSync ? lastSync.toLocaleTimeString() : "-";
      el.debug.textContent = [
        `mode       ${MODE}  scale ${SCALE}`,
        `source     ${lastSource}${loading ? " (updating)" : ""}`,
        `responses  ${rowsCount}`,
        `words      ${nodes.length}`,
        `edges      ${sameEdges.length + diffEdges.length} (same ${sameEdges.length} / different ${diffEdges.length})`,
        `last sync  ${t}`,
        `error      ${lastError || "-"}`,
        `fps        ${Math.round(p.frameRate())}`
      ].join("\n");
    }

    function buildQR() {
      if (!SHOW_QR || typeof window.qrcode !== "function") return;
      const url = C.QR_URL || new URL("./", location.href).href;
      const qr = window.qrcode(0, "M");
      qr.addData(url);
      qr.make();
      el.qrCode.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
      const svg = el.qrCode.querySelector("svg");
      if (svg) {
        svg.querySelectorAll("rect").forEach(r => r.setAttribute("fill", "#ffffff"));
        svg.querySelectorAll("path").forEach(path => path.setAttribute("fill", "#000000"));
        svg.setAttribute("shape-rendering", "crispEdges");
        svg.setAttribute("aria-label", "QR code: " + url);
        svg.setAttribute("role", "img");
      }
      el.qr.hidden = false;
    }

    // ---------- Ciclo p5 ----------

    p.setup = () => {
      const c = p.createCanvas(window.innerWidth, window.innerHeight);
      c.parent("stage");
      p.pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
      p.textFont("Helvetica");
      p.textAlign(p.CENTER, p.CENTER);

      buildQR();
      applyResponsive();
      computeZones();

      // Mostra logo a última versão guardada; a rede atualiza a seguir.
      const cached = D.loadCache();
      if (cached && cached.rows.length) applyRows(cached.rows, "cache");
      updateCoords(true);

      refresh();
      setInterval(refresh, C.REFRESH_MS);
      setInterval(() => { computeZones(); updateDebug(); }, 500);
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) refresh();
      });
    };

    p.windowResized = () => {
      const ow = p.width, oh = p.height;
      p.resizeCanvas(window.innerWidth, window.innerHeight);
      applyResponsive();
      computeZones();
      for (const n of nodes) {
        n.x = n.x / ow * p.width;
        n.y = n.y / oh * p.height;
        keepInside(n);
      }
    };

    p.draw = () => {
      const now = p.millis();
      p.background(0, 24, 255);
      cartesianGrid();
      drawEdges();
      for (const n of nodes) {
        if (!paused) n.update();
        n.display(now);
      }
      updateCoords(false);
    };

    p.keyPressed = () => {
      const k = String(p.key).toLowerCase();
      if (p.key === " ") paused = !paused;
      else if (k === "r") refresh();
      else if (k === "d") { el.debug.hidden = !el.debug.hidden; updateDebug(); }
      else if (k === "f") p.fullscreen(!p.fullscreen());
    };
  });
})();
