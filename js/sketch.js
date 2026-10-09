/*
  Relational Cartography (rcft): sketch
  p5.js em modo instância. O texto da interface está no HTML (index.html),
  transparente, por cima do canvas: os nós e as linhas veem-se por baixo dele.

  Duas páginas usam este sketch:
    index.html          site (web e telemóvel), com o botão para o formulário
    installation.html   instalação: sem botão nem cursor, com QR code

  Parâmetros de URL (opcionais):
    ?scale=1.5      escala da interface e do desenho (ecrãs grandes)
    ?scale=auto     escala pelo lado menor do ecrã (por omissão na instalação nova)
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
  // Escala: ?scale= ou automática (data.js). A automática acompanha a altura da
  // janela e é recalculada no resize (um iframe do Cargo começa sem tamanho).
  let SCALE = D.scale();
  const SHOW_QR = MODE === "install" ? params.get("qr") !== "0" : params.get("qr") === "1";

  document.documentElement.dataset.mode = MODE;

  // Dentro do Cargo, o botão abre a página das perguntas do rcft.cargo.site.
  if (window.top !== window.self && C.CONTRIBUTE_PAGE) {
    const btn = document.getElementById("contribute");
    if (btn) { btn.href = C.CONTRIBUTE_PAGE; btn.target = "_top"; }
  }
  if (MODE === "install") document.title = "Relational Cartography (rcft) - Installation";

  // Parâmetros visuais (iguais à versão original, multiplicados pela escala)
  let MOVE_AMT = 1 * SCALE;
  const NOISE_STEP = 0.001;
  let LABEL_OFFSET = 16 * SCALE;

  function applyScale() {
    if (D.scaleIsAuto()) SCALE = D.scale();
    MOVE_AMT = 1 * SCALE;
    LABEL_OFFSET = 16 * SCALE;
    document.documentElement.style.setProperty("--s", String(SCALE));
  }
  applyScale();
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
  let totalResponses = 0;

  // Clicar numa palavra (só no site, e só com data-inspect na página).
  const INSPECT = MODE === "web" && document.documentElement.hasAttribute("data-inspect");
  let selected = null;
  let selEdges = null;   // { mineSame, mineDiff, restSame, restDiff }
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

      // dt: fotogramas de 60 Hz decorridos. A deriva tem a mesma velocidade num
      // computador a 60 fps e num aparelho mais lento (Raspberry Pi).
      update(dt) {
        const [px, py] = edgePush(this);
        this.x += (p.map(p.noise(this.xoff), 0, 1, -MOVE_AMT, MOVE_AMT) + px) * dt;
        this.y += (p.map(p.noise(this.yoff), 0, 1, -MOVE_AMT, MOVE_AMT) + py) * dt;
        keepInside(this);
        this.xoff += NOISE_STEP * dt;
        this.yoff += NOISE_STEP * dt;
        if (this.f > 1) this.phase += 0.03 * this.f * dt;
      }

      display(now) {
        if (this.highlight) { this.bornAt = now; this.highlight = false; }
        const r = this.radius();
        // Com uma palavra escolhida, as outras ficam esbatidas.
        const a = selected && selected !== this ? 120 : 255;
        p.stroke(255, a);
        p.noFill();
        p.ellipse(this.x, this.y, r, r);
        if (selected === this) {
          p.stroke(255);
          p.ellipse(this.x, this.y, r + 22 * SCALE, r + 22 * SCALE);
        }

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

        p.fill(255, a);
        p.noStroke();
        p.textSize(labelSize);
        p.text(this.label, this.x, this.y - LABEL_OFFSET);
      }
    }

    // ---------- Espaço disponível ----------

    /*
      Limites do centro do nó. Com a folha de mapa, o limite é a própria moldura
      (js/ui.js): a palavra pode chegar até ela, com a etiqueta e o círculo
      sempre do lado de dentro.
    */
    function bounds(n) {
      const pad = 3 * SCALE;
      const halfW = (n ? Math.max(n.radius() / 2, n.lw / 2) : 0) + pad;
      const b = {
        minX: margin + halfW,
        maxX: p.width - margin - halfW,
        minY: margin + LABEL_OFFSET + labelSize * 0.6 + pad,
        maxY: p.height - margin - (n ? n.radius() / 2 : 0) - pad
      };
      if (b.maxX < b.minX) b.minX = b.maxX = p.width / 2;
      if (b.maxY < b.minY) b.minY = b.maxY = p.height / 2;
      return b;
    }

    // Os nós atravessam livremente as zonas de texto, como na versão original.
    function keepInside(n) {
      const b = bounds(n);
      n.x = p.constrain(n.x, b.minX, b.maxX);
      n.y = p.constrain(n.y, b.minY, b.maxY);
    }

    /*
      Margem suave junto à moldura: dentro de EDGE_BAND px da borda, a palavra
      recebe um empurrão para dentro que cresce com a proximidade (até
      EDGE_PUSH vezes o passo da deriva). Abranda e curva de volta, sem ressalto;
      se o ruído for forte pode tocar na moldura, mas não fica lá presa. Sem
      isto, as palavras ficavam encostadas às bordas enquanto o ruído as
      empurrasse para fora e acumulavam-se nos cantos.
    */
    const EDGE_BAND = 70;
    const EDGE_PUSH = 0.6;

    function edgePush(n) {
      const b = bounds(n), band = EDGE_BAND * SCALE, k = EDGE_PUSH * MOVE_AMT;
      const f = d => (d >= band ? 0 : Math.pow(1 - Math.max(0, d) / band, 2));
      return [
        k * (f(n.x - b.minX) - f(b.maxX - n.x)),
        k * (f(n.y - b.minY) - f(b.maxY - n.y))
      ];
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

    // Distância da moldura às bordas, igual à de js/ui.js (na instalação, à escala).
    function frameInset() {
      const root = document.documentElement;
      if (root.dataset.ui !== "sheet") return null;
      const m = parseFloat(getComputedStyle(root).getPropertyValue("--m")) || 0;
      return Math.round(m * (MODE === "install" ? SCALE : 1));
    }

    function applyResponsive() {
      isMobile = window.innerWidth < 768;
      // Com a interface de folha de mapa, as palavras vão até à moldura.
      const inset = frameInset();
      margin = inset !== null ? inset + 1 : (isMobile ? 6 : 80) * SCALE;
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
          a = { key, f: 0, country: D.normCountry(r.country), entries: [] };
          agg.set(key, a);
        }
        a.f++;
        a.entries.push({ ts: r.ts || null, country: D.normCountry(r.country) });
      }
      // Ordem de chegada da primeira vez que a palavra foi escrita (1 = a mais antiga).
      rows.forEach((r, i) => {
        const a = agg.get(r.word.toLowerCase());
        if (a && a.first === undefined) a.first = i + 1;
      });

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
        n.entries = a.entries;
        n.first = a.first;
        next.push(n);
      }

      nodes = next;
      totalResponses = rows.length;
      if (selected) {
        // A ficha acompanha os dados novos (por exemplo, mais uma repetição).
        selected = nodes.find(n => n.key === selected.key) || null;
        announceSelection();
      }
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
      partitionEdges();
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
      // Dentro dos mesmos limites das palavras, com folga para uma etiqueta longa.
      const half = 60 * SCALE;
      const b = bounds(null);
      const minX = margin + half, maxX = Math.max(minX, p.width - margin - half);
      const minY = b.minY, maxY = Math.max(minY, b.maxY - baseRadius);
      nextPos = { x: p.random(minX, maxX), y: p.random(minY, maxY) };
      updateQRLabel();
    }

    function updateQRLabel() {
      // Instalação no sistema da folha: x e y em colunas, como na tabela.
      const qx = document.getElementById("qr-x"), qy = document.getElementById("qr-y");
      if (qx && qy) {
        qx.textContent = nextPos ? nextPos.x.toFixed(1) : "--";
        qy.textContent = nextPos ? nextPos.y.toFixed(1) : "--";
      }
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

    // Grelha de 80 px a partir do centro: os eixos centrais são linhas da grelha,
    // e a graduação da moldura (js/ui.js) marca exatamente estas linhas.
    function cartesianGrid() {
      const cx = Math.round(p.width / 2), cy = Math.round(p.height / 2);
      p.push();
      p.stroke(255, 18);
      p.strokeWeight(0.5);
      for (let x = cx % GRID_SPACING; x <= p.width; x += GRID_SPACING) p.line(x, 0, x, p.height);
      for (let y = cy % GRID_SPACING; y <= p.height; y += GRID_SPACING) p.line(0, y, p.width, y);
      p.stroke(255, 35);
      p.strokeWeight(0.7);
      p.line(cx, 0, cx, p.height);
      p.line(0, cy, p.width, cy);
      p.pop();
    }

    /*
      Arestas: cada linha e cada traço do tracejado (8 / 5) é um segmento curto,
      como na versão original. Há duas formas de os traçar, com a mesma imagem:
        "segments"  um stroke por segmento. Com aceleração gráfica (Chrome num
                    Mac, por exemplo) é a forma rápida.
        "batched"   segmentos juntos em blocos de EDGE_BATCH, um stroke por bloco.
                    Sem aceleração gráfica (renderização por software) é 2 a 4
                    vezes mais rápida; com aceleração, um caminho com pedaços
                    espalhados pelo ecrã inteiro é rasterizado inteiro e o desenho
                    cai para poucos fps (medido: cerca de 4 fps num Mac).
      Começa em "segments". Se o aparelho não passar de EDGE_PROBE_FPS, o sketch
      mede a outra forma durante uns segundos e fica com a mais rápida; volta a
      medir quando o número de palavras cresce um quarto. ?edges=segments ou
      ?edges=batched fixa uma delas. O tracejado nativo (setLineDash) não é usado.
    */
    const EDGE_BATCH = 1000;
    const EDGE_PROBE_FPS = 30;
    const EDGE_PARAM = params.get("edges");
    let edgeMode = EDGE_PARAM === "batched" ? "batched" : "segments";
    const probe = EDGE_PARAM ? null : { ms: 0, mt: 0, frames: 0, fps: {}, words: 0, done: false };

    function probeEdges(dtMs) {
      if (!probe || C.EDGES !== "network" || nodes.length < 2) return;
      if (probe.done) {
        if (nodes.length < probe.words * 1.25) return;
        Object.assign(probe, { ms: 0, mt: 0, frames: 0, fps: {}, done: false });
        edgeMode = "segments";
      }
      if (document.hidden || paused || dtMs > 1000) { probe.ms = probe.mt = probe.frames = 0; return; }
      probe.ms += dtMs;
      if (probe.ms < 600) return;          // aquecimento de cada forma, não conta
      probe.mt += dtMs;
      probe.frames++;
      if (probe.mt < 2500) return;
      const fps = probe.frames / (probe.mt / 1000);
      probe.fps[edgeMode] = Math.round(fps);
      probe.ms = probe.mt = probe.frames = 0;
      if (edgeMode === "segments" && fps < EDGE_PROBE_FPS && !("batched" in probe.fps)) {
        edgeMode = "batched";
        return;
      }
      if ("batched" in probe.fps && probe.fps.batched <= probe.fps.segments * 1.1) edgeMode = "segments";
      probe.done = true;
      probe.words = nodes.length;
    }

    // Com uma palavra escolhida: as ligações dela por cima, a branco e mais
    // grossas; as restantes esbatidas.
    function partitionEdges() {
      if (!selected) { selEdges = null; return; }
      const has = ([a, b]) => a === selected || b === selected;
      selEdges = {
        mineSame: sameEdges.filter(has), mineDiff: diffEdges.filter(has),
        restSame: sameEdges.filter(e => !has(e)), restDiff: diffEdges.filter(e => !has(e))
      };
    }

    function drawEdges() {
      if (!selEdges) { strokeEdges(sameEdges, diffEdges, "#ffffff", 0.3); return; }
      strokeEdges(selEdges.restSame, selEdges.restDiff, "rgba(255,255,255,0.22)", 0.3);
      strokeEdges(selEdges.mineSame, selEdges.mineDiff, "#ffffff", 0.7);
    }

    function strokeEdges(sameList, diffList, color, width) {
      const ctx = p.drawingContext;
      ctx.strokeStyle = color;
      ctx.lineWidth = width * SCALE;
      ctx.setLineDash([]);
      const batched = edgeMode === "batched";

      let k = 0;
      if (batched) ctx.beginPath();
      const add = batched
        ? (x1, y1, x2, y2) => {
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            if (++k >= EDGE_BATCH) { ctx.stroke(); ctx.beginPath(); k = 0; }
          }
        : (x1, y1, x2, y2) => {
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
          };

      for (const [a, b] of sameList) add(a.x, a.y, b.x, b.y);

      const dash = 8 * SCALE;
      const step = 13 * SCALE; // traço de 8 + intervalo de 5
      for (const [a, b] of diffList) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (!len) continue;
        const ux = dx / len, uy = dy / len;
        for (let t = 0; t < len; t += step) {
          const s = Math.min(dash, len - t);
          const sx = a.x + ux * t, sy = a.y + uy * t;
          add(sx, sy, sx + ux * s, sy + uy * s);
        }
      }
      if (batched && k > 0) ctx.stroke();
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
      if (!el.coords) return;   // página sem painel de coordenadas (fundo do formulário)
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
    // Com data-mark-new, a linha de uma palavra acabada de chegar leva a classe
    // is-new enquanto o anel dura (a instalação inverte-a).
    let coordRows = [];
    function updateCoordsTable() {
      const lines = Math.min(nodes.length, parseInt(el.coords.dataset.lines, 10) || coordLines);
      const markNew = "markNew" in el.coords.dataset;
      if (coordRows.length !== lines) {
        el.coords.textContent = "";
        coordRows = [];
        for (let i = 0; i < lines; i++) {
          const row = document.createElement("div");
          row.className = "r-row";
          const cells = [0, 1, 2].map(() => row.appendChild(document.createElement("span")));
          cells.row = row;
          el.coords.appendChild(row);
          coordRows.push(cells);
        }
      }
      const start = nodes.length - lines;
      for (let i = 0; i < lines; i++) {
        const n = nodes[start + i];
        const cells = coordRows[i];
        const [w, x, y] = cells;
        if (w.textContent !== n.label) w.textContent = n.label;
        x.textContent = n.x.toFixed(1);
        y.textContent = n.y.toFixed(1);
        if (markNew) cells.row.classList.toggle("is-new", n.bornAt !== null || n.highlight === true);
      }
    }

    function updateDebug() {
      if (!el.debug || el.debug.hidden) return;
      const t = lastSync ? lastSync.toLocaleTimeString() : "-";
      el.debug.textContent = [
        `mode       ${MODE}  scale ${SCALE}`,
        `source     ${lastSource}${loading ? " (updating)" : ""}`,
        `responses  ${rowsCount}`,
        `words      ${nodes.length}`,
        C.EDGES === "network"
          ? `edges      ${sameEdges.length + diffEdges.length} (same ${sameEdges.length} / different ${diffEdges.length})`
          : `path       ${Math.max(0, nodes.length - 1)} segments`,
        `drawing    ${edgeMode}${probe ? "  " + Object.entries(probe.fps).map(([k, v]) => k + " " + v + " fps").join(" / ") + (probe.done ? "" : " (measuring)") : " (fixed)"}`,
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
      if (!el.qr || el.qr.hidden) return;
      // Instalação no sistema da folha: o bloco do QR é posto pelo CSS (css/install.css).
      if (el.qr.classList.contains("i-qr")) return;
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

    // ---------- Escolha de uma palavra (site) ----------

    /*
      Clicar numa palavra abre a ficha dela (js/ui.js): ordem de chegada, data,
      origem e repetições. A palavra fica parada e marcada, as ligações dela
      destacam-se e o resto esbate. Fecha com outro clique, fora, ou com Esc.
      Só no site e com data-inspect na página; na instalação não há rato.
    */
    function nodeAt(mx, my) {
      const tol = (isMobile ? 14 : 8) * SCALE;
      let best = null, bestD = Infinity;
      for (const n of nodes) {
        const d = Math.hypot(mx - n.x, my - n.y);
        const ly = n.y - LABEL_OFFSET;
        const onLabel = Math.abs(mx - n.x) <= n.lw / 2 + tol / 2 &&
          Math.abs(my - ly) <= labelSize / 2 + tol / 2;
        if ((d <= n.radius() / 2 + tol || onLabel) && d < bestD) { best = n; bestD = d; }
      }
      return best;
    }

    function select(n) {
      if (selected === n) return;
      selected = n;
      partitionEdges();
      announceSelection();
    }

    function announceSelection() {
      const n = selected;
      window.dispatchEvent(new CustomEvent("rcft:select", {
        detail: n ? {
          word: n.label,
          x: n.x, y: n.y, r: n.radius() / 2, labelTop: n.y - LABEL_OFFSET - labelSize / 2,
          first: n.first, total: totalResponses,
          entries: n.entries || []
        } : null
      }));
    }

    function setupInspect(canvasEl) {
      if (!INSPECT) return;
      const pos = e => [e.clientX, e.clientY];
      canvasEl.addEventListener("click", e => {
        const n = nodeAt(...pos(e));
        select(n && n !== selected ? n : null);
      });
      canvasEl.addEventListener("pointermove", e => {
        if (e.pointerType !== "mouse") return;
        canvasEl.style.cursor = nodeAt(...pos(e)) ? "pointer" : "";
      });
      window.addEventListener("rcft:deselect", () => select(null));
    }

    // ---------- Ciclo p5 ----------

    p.setup = () => {
      const c = p.createCanvas(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight));
      c.parent("stage");
      setupInspect(c.elt);
      p.pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
      p.textFont("Helvetica");
      p.textAlign(p.CENTER, p.CENTER);

      buildQR();
      layoutQR();
      if (params.get("debug") === "1" && el.debug) el.debug.hidden = false;
      // Para testes: posições das palavras na consola (só com ?debug=1).
      if (params.get("debug") === "1") window.RCFT_NODES = () => nodes.map(n => ({ word: n.label, x: n.x, y: n.y, f: n.f }));
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
      if (selected) select(null);
      const ow = p.width, oh = p.height;
      const wasReady = canvasReady();
      p.resizeCanvas(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight));
      applyScale();
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
      probeEdges(p.deltaTime);
      const dt = Math.min(4, Math.max(0, p.deltaTime / (1000 / 60)));
      for (const n of nodes) {
        if (!paused && n !== selected) n.update(dt);
        n.display(now);
      }
      drawFlash(now);
      updateCoords(false);
    };

    p.keyPressed = () => {
      // Não reage às teclas enquanto se escreve num campo (formulário).
      const a = document.activeElement;
      if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable)) return;
      const k = String(p.key).toLowerCase();
      if (p.key === "Escape") { select(null); return; }
      if (p.key === " ") paused = !paused;
      else if (k === "r") refresh();
      else if (k === "d" && el.debug) { el.debug.hidden = !el.debug.hidden; updateDebug(); }
      else if (k === "f") p.fullscreen(!p.fullscreen());
      else if (k === "t") { flashAt = -Infinity; triggerFlash(); }
    };
  });
})();
