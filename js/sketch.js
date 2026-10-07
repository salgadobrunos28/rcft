/*
  Relational Cartography (rcft): sketch
  p5.js em modo instância. O texto da interface está no HTML (index.html),
  transparente, por cima do canvas: os nós e as linhas veem-se por baixo dele.

  Duas páginas usam este sketch:
    index.html          site (web e telemóvel), com o botão para o formulário
    installation.html   instalação: sem botão nem cursor, com QR code

  Parâmetros de URL (opcionais):
    ?scale=1.5      escala da interface e do desenho (ecrãs grandes)
    ?qr=0 / ?qr=1   esconde ou mostra o QR code
    ?mode=install   equivale a abrir installation.html
    ?debug=1        mostra o painel de diagnóstico desde o início
    ?flash=0 / =1   desliga ou liga o flash de palavra nova (ligado só na instalação)

  Teclas:
    espaço  pausa a deriva
    r       atualiza os dados
    d       mostra o painel de diagnóstico
    f       ecrã inteiro
    t       testa o flash (só o efeito visual, não mexe nos dados)
*/
(function () {
  const C = window.RCFT_CONFIG;
  const D = window.RCFT_DATA;

  const params = new URLSearchParams(location.search);
  const MODE = window.RCFT_MODE === "install" || params.get("mode") === "install" ? "install" : "web";
  const SCALE = clampNum(parseFloat(params.get("scale")), 0.5, 4, 1);
  const SHOW_QR = MODE === "install" ? params.get("qr") !== "0" : params.get("qr") === "1";

  document.documentElement.dataset.mode = MODE;

  // Dentro do Cargo, o botão abre a página das perguntas do rcft.cargo.site.
  if (window.top !== window.self && C.CONTRIBUTE_PAGE) {
    const btn = document.getElementById("contribute");
    if (btn) { btn.href = C.CONTRIBUTE_PAGE; btn.target = "_top"; }
  }
  if (MODE === "install") document.title = "Relational Cartography (rcft) - Installation";
  document.documentElement.style.setProperty("--s", String(SCALE));

  // Parâmetros visuais (iguais à versão original, multiplicados pela escala)
  const MOVE_AMT = 1 * SCALE;
  const NOISE_STEP = 0.001;
  const LABEL_OFFSET = 16 * SCALE;
  const GRID_SPACING = 80;
  const NEW_RING_MS = 4000;     // anel que assinala uma palavra nova

  // Flash de ecrã inteiro quando entra uma palavra nova (por omissão só na instalação).
  // Um flash por atualização, e no máximo um a cada 3 segundos, mesmo que entrem
  // várias palavras de uma vez: evita sequências de flashes (fotossensibilidade).
  const FLASH = params.has("flash") ? params.get("flash") === "1" : MODE === "install";
  const FLASH_MS = 900;          // duração do desvanecimento
  const FLASH_PEAK = 0.9;        // opacidade inicial do branco
  const FLASH_MIN_GAP_MS = 3000;

  const el = {
    coords: document.getElementById("coords"),
    debug: document.getElementById("debug"),
    qr: document.getElementById("qr"),
    qrCode: document.getElementById("qr-code")
  };

  let nodes = [];
  let sameEdges = [];
  let diffEdges = [];
  let paused = false;
  let flashAt = -Infinity;
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
        if (this.highlight) { this.bornAt = now; this.highlight = false; }
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

    // Os nós atravessam livremente as zonas de texto, como na versão original.
    function keepInside(n) {
      const b = bounds(n);
      n.x = p.constrain(n.x, b.minX, b.maxX);
      n.y = p.constrain(n.y, b.minY, b.maxY);
    }

    // Dentro do Cargo o iframe pode começar com tamanho zero. Enquanto o canvas
    // não tiver tamanho real, os nós ficam por colocar (e não se desenham).
    const MIN_SIZE = 50;
    function canvasReady() {
      return p.width >= MIN_SIZE && p.height >= MIN_SIZE;
    }

    function placeRandom(n) {
      if (!canvasReady()) { n.unplaced = true; return; }
      const b = bounds(n);
      n.x = p.random(b.minX, b.maxX);
      n.y = p.random(b.minY, b.maxY);
      n.unplaced = false;
    }

    function applyResponsive() {
      isMobile = window.innerWidth < 768;
      // Com a interface de folha de mapa, as palavras ficam dentro da moldura.
      const sheet = document.documentElement.dataset.ui === "sheet";
      margin = (isMobile ? (sheet ? 30 : 6) : 80) * SCALE;
      baseRadius = (isMobile ? 7 : 8) * SCALE;
      labelSize = (isMobile ? 9 : 10) * SCALE;
      coordLines = isMobile ? 8 : 10;
      for (const n of nodes) n.measure();
    }

    // ---------- Dados ----------

    // Junta as respostas por palavra. Mantém os nós que já existem (e a sua
    // posição); só as palavras novas entram no mapa.
    function applyRows(rows, source) {
      // Ordem de chegada: a linha contínua atravessa as palavras por esta ordem.
      rows = rows
        .map((r, i) => [r, i])
        .sort((u, v) => {
          const a = u[0].ts, b = v[0].ts;
          if (a == null || b == null || a === b) return u[1] - v[1];
          return a - b;
        })
        .map(x => x[0]);
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
      let added = 0;
      let usedNext = false;
      for (const a of agg.values()) {
        let n = existing.get(a.key);
        if (!n) {
          n = new Node(a.key);
          n.measure();
          if (firstLoadDone && nextPos && !usedNext && canvasReady()) {
            // A primeira palavra nova nasce no ponto anunciado pelo QR.
            n.x = nextPos.x;
            n.y = nextPos.y;
            n.unplaced = false;
            usedNext = true;
          } else {
            placeRandom(n);
          }
          if (firstLoadDone) { n.bornAt = p.millis(); added++; }
        }
        n.f = a.f;
        n.country = a.country;
        next.push(n);
      }

      nodes = next;
      if (usedNext) rollNextPos();
      if (added > 0 && FLASH) triggerFlash();
      buildEdges();
      rowsCount = rows.length;
      lastSource = source;
      firstLoadDone = true;
      updateCoords(true);

      // Para a interface do site: totais do corpus.
      const origins = new Set(rows.map(r => D.normCountry(r.country)).filter(Boolean)).size;
      const lastTs = rows.reduce((m, r) => (r.ts && r.ts > m ? r.ts : m), 0) || null;
      window.dispatchEvent(new CustomEvent("rcft:data", {
        detail: { responses: rows.length, words: nodes.length, origins, lastTs, source }
      }));
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
        applyRows(D.withPending(rows), "network");
        lastError = null;
      } catch (e) {
        lastError = e && e.message ? e.message : String(e);
        console.warn("[rcft] falha ao atualizar:", lastError);
        // Sem dados nenhuns no ecrã: tenta outra vez mais cedo.
        if (!firstLoadDone) setTimeout(refresh, 5000);
      } finally {
        loading = false;
        lastSync = new Date();
        updateCoords(true);
        updateDebug();
        window.dispatchEvent(new CustomEvent("rcft:sync", {
          detail: { time: lastSync, ok: !lastError, source: lastSource }
        }));
      }
    }

    // ---------- Próximo ponto ----------

    /*
      Com o QR visível (instalação), o sistema sorteia antecipadamente o ponto
      onde a próxima palavra vai nascer e mostra-o na etiqueta do QR
      ("input -> x , y"). Quando chega uma palavra nova, a primeira nasce aí e é
      sorteado o ponto seguinte; se chegarem várias de uma vez, as outras ficam
      em pontos aleatórios. O ponto evita as bordas o suficiente para a
      etiqueta de qualquer palavra caber, para nascer exatamente onde foi anunciado.
    */
    let nextPos = null;

    function rollNextPos() {
      if (!SHOW_QR) return;
      if (!canvasReady()) { nextPos = null; updateQRLabel(); return; }
      const half = 80 * SCALE;
      const minX = Math.max(margin, half);
      const maxX = Math.min(p.width - margin, p.width - half);
      const minY = Math.max(margin, LABEL_OFFSET + labelSize);
      const maxY = p.height - margin;
      nextPos = { x: p.random(minX, maxX), y: p.random(minY, maxY) };
      updateQRLabel();
    }

    function updateQRLabel() {
      const c = document.getElementById("qr-coords");
      if (!c) return;
      c.textContent = nextPos
        ? `input -> ${nextPos.x.toFixed(1)} , ${nextPos.y.toFixed(1)}`
        : "input -> ...";
    }

    // ---------- Flash ----------

    function triggerFlash() {
      const now = p.millis();
      if (now - flashAt < FLASH_MIN_GAP_MS) return;
      flashAt = now;
    }

    // Branco por cima do campo, a desvanecer. Fica por baixo do texto HTML.
    function drawFlash(now) {
      const t = (now - flashAt) / FLASH_MS;
      if (t < 0 || t >= 1) return;
      const a = 255 * FLASH_PEAK * Math.pow(1 - t, 2);
      p.noStroke();
      p.fill(255, a);
      p.rect(0, 0, p.width, p.height);
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

    // Arestas desenhadas como na versão original: cada linha e cada traço do
    // tracejado é um segmento curto e independente. No Chrome com aceleração
    // gráfica isto é bastante mais rápido do que um só caminho longo ou do que
    // o tracejado nativo do canvas (setLineDash), que testei e engasgava o desenho.
    function drawEdges() {
      const ctx = p.drawingContext;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 0.3 * SCALE;
      ctx.setLineDash([]);

      for (const [a, b] of sameEdges) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      const dash = 8 * SCALE;
      const step = 13 * SCALE; // traço de 8 + intervalo de 5
      for (const [a, b] of diffEdges) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (!len) continue;
        const ux = dx / len, uy = dy / len;
        for (let t = 0; t < len; t += step) {
          const s = Math.min(dash, len - t);
          const sx = a.x + ux * t, sy = a.y + uy * t;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + ux * s, sy + uy * s);
          ctx.stroke();
        }
      }
    }

    /*
      Linha contínua (config EDGES: "path"): uma só curva que atravessa as
      palavras por ordem de chegada. Cada troço é uma curva de Catmull-Rom
      convertida em Bézier cúbica; é contínuo se as duas palavras vêm do mesmo
      país e tracejado se não, como na legenda. Cada palavra nova prolonga a
      linha a partir do fim.
    */
    const PATH_TENSION = Number.isFinite(C.PATH_TENSION) ? C.PATH_TENSION : 1;

    function cubicPoints(a, c1, c2, b, n) {
      const out = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, u = 1 - t;
        out.push([
          u * u * u * a.x + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b.x,
          u * u * u * a.y + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b.y
        ]);
      }
      return out;
    }

    // Traça uma curva amostrada; tracejada com o padrão 8 / 5 do original,
    // em segmentos curtos independentes.
    function strokeSampled(ctx, pts, dashed) {
      if (!dashed) {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
        return;
      }
      const DASH = 8 * SCALE, GAP = 5 * SCALE;
      let carry = 0, on = true;
      for (let i = 1; i < pts.length; i++) {
        let [sx, sy] = pts[i - 1];
        const [x, y] = pts[i];
        let rem = Math.hypot(x - sx, y - sy);
        const ux = rem ? (x - sx) / rem : 0, uy = rem ? (y - sy) / rem : 0;
        while (rem > 0) {
          const need = (on ? DASH : GAP) - carry;
          const step = Math.min(need, rem);
          const ex = sx + ux * step, ey = sy + uy * step;
          if (on) { ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke(); }
          sx = ex; sy = ey; rem -= step; carry += step;
          if (carry >= (on ? DASH : GAP) - 1e-6) { carry = 0; on = !on; }
        }
      }
    }

    function drawPath() {
      const ns = nodes;
      if (ns.length < 2) return;
      const ctx = p.drawingContext;
      const k = PATH_TENSION / 6;
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = (isMobile ? 0.7 : 0.9) * SCALE;
      ctx.setLineDash([]);
      for (let i = 0; i + 1 < ns.length; i++) {
        const p0 = ns[Math.max(0, i - 1)], p1 = ns[i], p2 = ns[i + 1], p3 = ns[Math.min(ns.length - 1, i + 2)];
        const c1 = [p1.x + (p2.x - p0.x) * k, p1.y + (p2.y - p0.y) * k];
        const c2 = [p2.x - (p3.x - p1.x) * k, p2.y - (p3.y - p1.y) * k];
        const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const pts = cubicPoints(p1, c1, c2, p2, Math.max(12, Math.ceil(len / (10 * SCALE))));
        strokeSampled(ctx, pts, p1.country !== p2.country);
      }
    }

    let lastCoordsAt = 0;
    function updateCoords(force) {
      const now = performance.now();
      if (!force && now - lastCoordsAt < 100) return;
      lastCoordsAt = now;

      if (!nodes.length) {
        if (loading) el.coords.textContent = "loading responses";
        else if (!firstLoadDone && lastError) el.coords.textContent = "responses unavailable, retrying";
        else el.coords.textContent = "";
        return;
      }
      if (el.coords.dataset.format === "table") { updateCoordsTable(); return; }
      const start = Math.max(0, nodes.length - coordLines);
      el.coords.textContent = nodes
        .slice(start)
        .map(n => `${n.label} -> ${n.x.toFixed(1)} , ${n.y.toFixed(1)}`)
        .join("\n");
    }

    // Versão em tabela (palavra, x, y): linhas criadas uma vez e atualizadas.
    let coordRows = [];
    function updateCoordsTable() {
      const lines = Math.min(nodes.length, parseInt(el.coords.dataset.lines, 10) || coordLines);
      if (coordRows.length !== lines) {
        el.coords.textContent = "";
        coordRows = [];
        for (let i = 0; i < lines; i++) {
          const row = document.createElement("div");
          row.className = "r-row";
          const cells = [0, 1, 2].map(() => row.appendChild(document.createElement("span")));
          el.coords.appendChild(row);
          coordRows.push(cells);
        }
      }
      const start = nodes.length - lines;
      for (let i = 0; i < lines; i++) {
        const n = nodes[start + i];
        const [w, x, y] = coordRows[i];
        if (w.textContent !== n.label) w.textContent = n.label;
        x.textContent = n.x.toFixed(1);
        y.textContent = n.y.toFixed(1);
      }
    }

    function updateDebug() {
      if (el.debug.hidden) return;
      const t = lastSync ? lastSync.toLocaleTimeString() : "-";
      el.debug.textContent = [
        `mode       ${MODE}  scale ${SCALE}`,
        `source     ${lastSource}${loading ? " (updating)" : ""}`,
        `responses  ${rowsCount}`,
        `words      ${nodes.length}`,
        C.EDGES === "network"
          ? `edges      ${sameEdges.length + diffEdges.length} (same ${sameEdges.length} / different ${diffEdges.length})`
          : `path       ${Math.max(0, nodes.length - 1)} segments`,
        `last sync  ${t}`,
        `error      ${lastError || "-"}`,
        `fps        ${Math.round(p.frameRate())}`,
        `version    ${window.RCFT_VERSION || "-"}`
      ].join("\n");
    }

    // "inverted": módulos brancos sobre o azul da peça (por omissão).
    // "light": módulos pretos sobre branco, para telemóveis que não leiam a versão invertida.
    const QR_STYLE = params.get("qrstyle") || C.QR_STYLE || "inverted";

    function buildQR() {
      if (!SHOW_QR || typeof window.qrcode !== "function") return;
      const url = C.QR_URL || new URL("./", location.href).href;
      const qr = window.qrcode(0, "M");
      qr.addData(url);
      qr.make();
      // Margem de 2 módulos dentro do quadrado (zona de silêncio exigida pela leitura).
      el.qrCode.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 8, scalable: true });
      const svg = el.qrCode.querySelector("svg");
      const light = QR_STYLE === "light";
      if (svg) {
        svg.querySelectorAll("rect").forEach(r => r.setAttribute("fill", light ? "#ffffff" : "rgb(0,24,255)"));
        svg.querySelectorAll("path").forEach(path => path.setAttribute("fill", light ? "#000000" : "#ffffff"));
        svg.setAttribute("shape-rendering", "crispEdges");
        svg.setAttribute("aria-label", "QR code: " + url);
        svg.setAttribute("role", "img");
      }
      el.qr.dataset.style = light ? "light" : "inverted";
      el.qr.hidden = false;
    }

    // O QR tem 96 px (multiplicado por ?scale): o endereço das perguntas é mais
    // longo do que o do site e o código tem mais módulos.
    // Na instalação fica no canto inferior direito, nas margens do texto; no site
    // (se ativado com ?qr=1) fica por cima da legenda, à esquerda.
    function layoutQR() {
      if (el.qr.hidden) return;
      const size = 96 * SCALE;
      const frame = 6 * SCALE;
      const m = 40 * SCALE;
      let x, y;
      el.qr.style.setProperty("--qr-size", size + "px");
      if (MODE === "install") {
        x = p.width - m - size;
        y = p.height - m - size;
        el.qr.style.left = "auto";
        el.qr.style.top = "auto";
        el.qr.style.right = (m - frame) + "px";
        el.qr.style.bottom = (m - frame) + "px";
      } else {
        const legendEl = document.getElementById("legend") || document.querySelector(".cartouche");
        const anchor = legendEl ? legendEl.getBoundingClientRect() : { top: p.height - 40 * SCALE };
        x = m;
        y = Math.max(m, anchor.top - 24 * SCALE - size);
        el.qr.style.left = (x - frame) + "px";
        el.qr.style.top = (y - frame) + "px";
        el.qr.style.right = "auto";
        el.qr.style.bottom = "auto";
      }
    }

    // ---------- Atualização automática ----------

    /*
      O GitHub Pages deixa os browsers guardarem as páginas até 10 minutos, e
      numa instalação ou num iframe ninguém força o recarregamento. A página
      compara a sua versão com version.json (pedido sem cache) e, se houver uma
      mais recente, recarrega-se com ?v= novo, que obriga a ir buscar tudo de novo.
      Só tenta uma vez por versão, para nunca entrar em ciclo.
    */
    const VERSION_CHECK_MS = 5 * 60 * 1000;

    // ---------- Ciclo p5 ----------

    p.setup = () => {
      const c = p.createCanvas(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight));
      c.parent("stage");
      p.pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
      p.textFont("Helvetica");
      p.textAlign(p.CENTER, p.CENTER);

      buildQR();
      layoutQR();
      if (params.get("debug") === "1") el.debug.hidden = false;
      applyResponsive();
      rollNextPos();

      // Mostra logo a última versão guardada (e as respostas acabadas de enviar
      // a partir deste browser); a rede atualiza a seguir.
      const cached = D.loadCache();
      const startRows = D.withPending(cached ? cached.rows : []);
      if (startRows.length) applyRows(startRows, cached ? "cache" : "pending");

      // Assinala com o anel a palavra que a pessoa acabou de enviar.
      const justSent = D.recentPendingWords(3 * 60 * 1000);
      for (const n of nodes) {
        if (justSent.includes(n.key)) n.highlight = true;
      }
      updateCoords(true);

      refresh();
      setInterval(refresh, C.REFRESH_MS);
      setInterval(updateDebug, 500);
      setTimeout(D.checkVersion, 2000);
      setInterval(D.checkVersion, VERSION_CHECK_MS);
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) refresh();
      });
    };

    p.windowResized = () => {
      const ow = p.width, oh = p.height;
      const wasReady = canvasReady();
      p.resizeCanvas(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight));
      applyResponsive();
      layoutQR();
      rollNextPos();
      for (const n of nodes) {
        if (!wasReady || n.unplaced) {
          // O canvas acabou de ganhar tamanho: os nós aparecem já distribuídos.
          placeRandom(n);
        } else {
          n.x = n.x / ow * p.width;
          n.y = n.y / oh * p.height;
          keepInside(n);
        }
      }
    };

    p.draw = () => {
      // Salvaguarda: se o tamanho mudou sem evento de resize (iframes), ajusta.
      if (p.width !== Math.max(1, window.innerWidth) || p.height !== Math.max(1, window.innerHeight)) {
        p.windowResized();
      }

      const now = p.millis();
      p.background(0, 24, 255);
      if (!canvasReady()) return;

      cartesianGrid();
      if (C.EDGES === "network") drawEdges();
      else drawPath();
      for (const n of nodes) {
        if (!paused) n.update();
        n.display(now);
      }
      drawFlash(now);
      updateCoords(false);
    };

    p.keyPressed = () => {
      const k = String(p.key).toLowerCase();
      if (p.key === " ") paused = !paused;
      else if (k === "r") refresh();
      else if (k === "d") { el.debug.hidden = !el.debug.hidden; updateDebug(); }
      else if (k === "f") p.fullscreen(!p.fullscreen());
      else if (k === "t") { flashAt = -Infinity; triggerFlash(); }
    };
  });
})();
