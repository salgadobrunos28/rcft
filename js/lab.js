/*
  Relational Cartography (rcft): laboratório de variações

  Parâmetros de URL:
    rel=full|country|sequence|knn   que relações geram linhas
        full      todas as palavras ligadas a todas (versão atual)
        country   só palavras do mesmo país
        sequence  cada palavra ligada à seguinte, por ordem de chegada
        knn       cada palavra ligada às k mais próximas no ecrã (muda com a deriva)
    k=3              vizinhos para rel=knn
    forces=1         linhas atraem, todas as palavras repelem-se; a deriva perturba
    fade=1           opacidade das linhas diminui com o comprimento
    tracker=1        camada de seguimento: caixas que saltam entre palavras
    trails=1         rasto acumulado do percurso de cada palavra
    curve=0.12       linhas curvas: curvatura máxima em fração do comprimento
    curvemode=flow|sag|border
        flow      cada linha ondula devagar, com ruído próprio
        sag       as linhas descaem como fios suspensos, com ligeira oscilação
        border    só as linhas entre países diferentes (tracejadas) se curvam
    path=spline      uma só linha contínua e suave que atravessa as palavras por
                     ordem de chegada (curva de Catmull-Rom convertida em Bézier)
    tension=1        tensão da curva: 1 suave, 1.5 a 2.5 solta, com laçadas
    handles=1        mostra as alças de Bézier (linhas retas até aos pontos de
                     controlo), como num editor de desenho de letra
    coords=1         etiqueta cada ponto com as suas coordenadas
    net=0|faint|full rede de linhas retas por baixo da linha contínua
    seed=7           semente (mesmas posições iniciais entre variações)
    hideparams=1     esconde a legenda dos parâmetros
*/
(function () {
  const D = window.RCFT_DATA;
  const q = new URLSearchParams(location.search);
  const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);

  const P = {
    rel: ["full", "country", "sequence", "knn"].includes(q.get("rel")) ? q.get("rel") : "full",
    k: int(q.get("k"), 3),
    forces: q.get("forces") === "1",
    fade: q.get("fade") === "1",
    tracker: q.get("tracker") === "1",
    trails: q.get("trails") === "1",
    curve: Math.max(0, parseFloat(q.get("curve")) || 0),
    curvemode: ["flow", "sag", "border"].includes(q.get("curvemode")) ? q.get("curvemode") : "flow",
    path: q.get("path") === "spline",
    tension: parseFloat(q.get("tension")) || 1,
    handles: q.get("handles") === "1",
    coords: q.get("coords") === "1",
    net: ["0", "faint", "full"].includes(q.get("net")) ? q.get("net") : (q.get("path") === "spline" ? "0" : "full"),
    seed: int(q.get("seed"), 7)
  };

  const legend = document.getElementById("lab-params");
  if (q.get("hideparams") === "1") legend.hidden = true;
  else legend.textContent =
    `rel ${P.rel}${P.rel === "knn" ? " k " + P.k : ""}   forces ${+P.forces}   fade ${+P.fade}   tracker ${+P.tracker}   trails ${+P.trails}   curve ${P.curve}${P.curve ? " " + P.curvemode : ""}${P.path ? "   path spline t " + P.tension + "  handles " + (+P.handles) + "  net " + P.net : ""}   seed ${P.seed}`;

  // Parâmetros visuais da peça
  const MARGIN = 80, BASE_R = 8, LABEL = 10, LABEL_OFF = 16;
  const MOVE_AMT = 1, NOISE_STEP = 0.001;

  // Forças
  const REP_R = 190, REP_K = 0.06;          // repulsão entre todas as palavras
  const REST = 120, SPRING_K = 0.0009;      // molas ao longo das linhas
  const DAMP = 0.9, VMAX = 1.1;

  new p5(p => {
    let nodes = [];
    let edges = [];     // [a, b, sameCountry]
    let trails = null;
    let boxes = [];
    let nextTick = 0;

    class Node {
      constructor(key, idx, ts, country) {
        this.key = key;
        this.label = key.charAt(0).toUpperCase() + key.slice(1);
        this.idx = idx;
        this.ts = ts;
        this.country = country;
        this.f = 1;
        this.x = p.random(MARGIN, p.width - MARGIN);
        this.y = p.random(MARGIN, p.height - MARGIN);
        this.px = this.x; this.py = this.y;
        this.vx = 0; this.vy = 0;
        this.fx = 0; this.fy = 0;
        this.xoff = p.random(1000);
        this.yoff = p.random(2000);
        this.phase = p.random(p.TWO_PI);
        p.textSize(LABEL);
        this.lw = p.textWidth(this.label);
      }
      radius() {
        const pulse = this.f > 1 ? 1 + 0.15 * Math.sin(this.phase) : 1;
        return BASE_R * pulse * p.map(this.f, 1, 5, 1, 1.8);
      }
      update() {
        this.px = this.x; this.py = this.y;
        this.x += p.map(p.noise(this.xoff), 0, 1, -MOVE_AMT, MOVE_AMT);
        this.y += p.map(p.noise(this.yoff), 0, 1, -MOVE_AMT, MOVE_AMT);
        if (P.forces) {
          this.vx = (this.vx + this.fx) * DAMP;
          this.vy = (this.vy + this.fy) * DAMP;
          const s = Math.hypot(this.vx, this.vy);
          if (s > VMAX) { this.vx *= VMAX / s; this.vy *= VMAX / s; }
          this.x += this.vx; this.y += this.vy;
        }
        this.x = p.constrain(this.x, MARGIN, p.width - MARGIN);
        this.y = p.constrain(this.y, MARGIN, p.height - MARGIN);
        this.xoff += NOISE_STEP; this.yoff += NOISE_STEP;
        if (this.f > 1) this.phase += 0.03 * this.f;
      }
      display() {
        const r = this.radius();
        p.stroke(255); p.noFill();
        p.ellipse(this.x, this.y, r, r);
        p.fill(255); p.noStroke();
        p.textSize(LABEL);
        p.textAlign(p.CENTER, p.CENTER);
        p.text(this.label, this.x, this.y - LABEL_OFF);
      }
    }

    // ---------- dados ----------

    function build(rows) {
      rows = rows.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
      const byKey = new Map();
      let idx = 0;
      for (const r of rows) {
        idx++;
        const key = r.word.toLowerCase();
        let n = byKey.get(key);
        if (!n) {
          n = new Node(key, idx, r.ts, D.normCountry(r.country));
          n.f = 0;
          byKey.set(key, n);
        }
        n.f++;
      }
      nodes = [...byKey.values()].sort((a, b) => a.idx - b.idx);
      buildEdges();
    }

    function buildEdges() {
      edges = [];
      if (P.rel === "full" || P.rel === "country") {
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const same = nodes[i].country === nodes[j].country;
            if (P.rel === "full" || same) edges.push([nodes[i], nodes[j], same]);
          }
        }
      } else if (P.rel === "sequence") {
        for (let i = 0; i + 1 < nodes.length; i++) {
          edges.push([nodes[i], nodes[i + 1], nodes[i].country === nodes[i + 1].country]);
        }
      }
    }

    // Vizinhos mais próximos no ecrã, recalculados a cada frame.
    function knnEdges() {
      const seen = new Set();
      const out = [];
      for (const a of nodes) {
        const near = nodes
          .filter(b => b !== a)
          .map(b => [b, (a.x - b.x) ** 2 + (a.y - b.y) ** 2])
          .sort((u, v) => u[1] - v[1])
          .slice(0, P.k);
        for (const [b] of near) {
          const id = a.idx < b.idx ? a.idx + "-" + b.idx : b.idx + "-" + a.idx;
          if (seen.has(id)) continue;
          seen.add(id);
          out.push([a, b, a.country === b.country]);
        }
      }
      return out;
    }

    // ---------- forças ----------

    function applyForces(es) {
      for (const n of nodes) { n.fx = 0; n.fy = 0; }
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d < 0.01 || d > REP_R) continue;
          const f = REP_K * (1 - d / REP_R) ** 2;
          const ux = dx / d, uy = dy / d;
          a.fx -= f * ux; a.fy -= f * uy;
          b.fx += f * ux; b.fy += f * uy;
        }
      }
      for (const [a, b] of es) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.01) continue;
        const f = SPRING_K * (d - REST);
        const ux = dx / d, uy = dy / d;
        a.fx += f * ux; a.fy += f * uy;
        b.fx -= f * ux; b.fy -= f * uy;
      }
    }

    // ---------- desenho ----------

    function grid() {
      p.push();
      p.stroke(255, 18); p.strokeWeight(0.5);
      for (let x = 0; x <= p.width; x += 80) p.line(x, 0, x, p.height);
      for (let y = 0; y <= p.height; y += 80) p.line(0, y, p.width, y);
      p.stroke(255, 35); p.strokeWeight(0.7);
      p.line(p.width / 2, 0, p.width / 2, p.height);
      p.line(0, p.height / 2, p.width, p.height / 2);
      p.pop();
    }

    // Ponto de controlo da curva (bezier quadrática) de uma linha, ou null se reta.
    function controlPoint(a, b, same, len) {
      if (!P.curve) return null;
      if (P.curvemode === "border" && same) return null;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;   // perpendicular
      const seed = (Math.min(a.idx, b.idx) * 131 + Math.max(a.idx, b.idx) * 17) * 0.37;
      const t = p.frameCount * 0.004;
      const wave = (p.noise(seed, t) - 0.5) * 2;                 // -1 .. 1, lento
      if (P.curvemode === "sag") {
        // descai na vertical, com uma oscilação pequena
        const sag = P.curve * len * (0.8 + 0.2 * wave);
        return [mx + nx * P.curve * len * 0.15 * wave, my + sag];
      }
      const off = P.curve * len * wave;
      return [mx + nx * off, my + ny * off];
    }

    function drawEdges(es) {
      const ctx = p.drawingContext;
      const diag = Math.hypot(p.width, p.height);
      ctx.lineWidth = 0.3;
      ctx.setLineDash([]);
      const seg = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };

      for (const [a, b, same] of es) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (!len) continue;
        const alpha = P.fade ? Math.max(0.08, Math.min(1, 1 - len / (diag * 0.5))) : 1;
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        const c = controlPoint(a, b, same, len);

        if (!c) {
          if (same) { seg(a.x, a.y, b.x, b.y); continue; }
          const ux = dx / len, uy = dy / len;
          for (let t = 0; t < len; t += 13) {
            const s = Math.min(8, len - t);
            seg(a.x + ux * t, a.y + uy * t, a.x + ux * (t + s), a.y + uy * (t + s));
          }
          continue;
        }

        if (same) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.quadraticCurveTo(c[0], c[1], b.x, b.y);
          ctx.stroke();
          continue;
        }

        // Curva tracejada: amostra a curva em pontos e percorre-a com o padrão
        // 8 traço / 5 intervalo, sempre com segmentos curtos independentes.
        const n = Math.max(8, Math.ceil(len / 18));
        let px = a.x, py = a.y, carry = 0, on = true;
        for (let i = 1; i <= n; i++) {
          const t = i / n, u = 1 - t;
          const x = u * u * a.x + 2 * u * t * c[0] + t * t * b.x;
          const y = u * u * a.y + 2 * u * t * c[1] + t * t * b.y;
          let sx = px, sy = py;
          let rem = Math.hypot(x - px, y - py);
          const ux = rem ? (x - px) / rem : 0, uy = rem ? (y - py) / rem : 0;
          while (rem > 0) {
            const need = (on ? 8 : 5) - carry;
            const step = Math.min(need, rem);
            const ex = sx + ux * step, ey = sy + uy * step;
            if (on) seg(sx, sy, ex, ey);
            sx = ex; sy = ey; rem -= step; carry += step;
            if (carry >= (on ? 8 : 5) - 1e-6) { carry = 0; on = !on; }
          }
          px = x; py = y;
        }
      }
    }

    function drawTrails() {
      if (!trails) {
        trails = p.createGraphics(p.width, p.height);
        trails.pixelDensity(1);
        trails.clear();
      }
      trails.stroke(255, 70);
      trails.strokeWeight(0.6);
      for (const n of nodes) trails.line(n.px, n.py, n.x, n.y);
      p.image(trails, 0, 0);
    }

    // Camada de seguimento: escolhe algumas palavras, enquadra-as e liga as
    // caixas por ordem; muda de alvo a cada poucos frames e às vezes enquadra
    // um lugar onde não há nada.
    function trackerTick() {
      boxes = [];
      const pool = p.shuffle(nodes.slice()).slice(0, Math.floor(p.random(3, 9)));
      for (const n of pool) {
        boxes.push({ n, w: n.lw + p.random(14, 34), h: p.random(26, 48), jx: p.random(-5, 5), jy: p.random(-5, 5) });
      }
      if (p.random() < 0.3) {
        boxes.push({
          n: null,
          x: p.random(MARGIN, p.width - MARGIN), y: p.random(MARGIN, p.height - MARGIN),
          w: p.random(18, 60), h: p.random(14, 40), jx: 0, jy: 0
        });
      }
    }

    function stamp(ts) {
      if (!ts) return "";
      const d = new Date(ts);
      const z = v => String(v).padStart(2, "0");
      return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
    }

    function drawTracker() {
      if (p.frameCount >= nextTick) {
        trackerTick();
        nextTick = p.frameCount + Math.floor(p.random(3, 8));
      }
      const pts = [];
      p.push();
      p.textAlign(p.LEFT, p.BOTTOM);
      p.textSize(8);
      for (const b of boxes) {
        const cx = (b.n ? b.n.x : b.x) + b.jx;
        const cy = (b.n ? b.n.y - 8 : b.y) + b.jy;
        const x0 = cx - b.w / 2, y0 = cy - b.h / 2;
        p.noFill(); p.stroke(255, 230); p.strokeWeight(0.8);
        p.rect(x0, y0, b.w, b.h);
        p.noStroke(); p.fill(255, 230);
        const id = b.n ? "#" + String(b.n.idx).padStart(3, "0") + "  " + b.n.country.toUpperCase() + "  " + stamp(b.n.ts) : "#---  ?";
        p.text(id, x0, y0 - 3);
        pts.push([cx, cy]);
      }
      p.noFill(); p.stroke(255, 160); p.strokeWeight(0.6);
      for (let i = 0; i + 1 < pts.length; i++) p.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
      p.pop();
    }

    // ---------- linha contínua ----------

    // Segmentos tracejados ou contínuos de qualquer curva amostrada em pontos,
    // sempre como traços curtos independentes (padrão 8 / 5, como no original).
    function strokeSampled(pts, dashed) {
      const ctx = p.drawingContext;
      if (!dashed) {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
        return;
      }
      let carry = 0, on = true;
      for (let i = 1; i < pts.length; i++) {
        let [sx, sy] = pts[i - 1];
        const [x, y] = pts[i];
        let rem = Math.hypot(x - sx, y - sy);
        const ux = rem ? (x - sx) / rem : 0, uy = rem ? (y - sy) / rem : 0;
        while (rem > 0) {
          const need = (on ? 8 : 5) - carry;
          const step = Math.min(need, rem);
          const ex = sx + ux * step, ey = sy + uy * step;
          if (on) { ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke(); }
          sx = ex; sy = ey; rem -= step; carry += step;
          if (carry >= (on ? 8 : 5) - 1e-6) { carry = 0; on = !on; }
        }
      }
    }

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

    // Uma linha que passa por todas as palavras por ordem de chegada. Cada
    // troço é contínuo se as duas palavras vêm do mesmo país e tracejado se não.
    function drawPath() {
      const ctx = p.drawingContext;
      const ns = nodes;
      if (ns.length < 2) return;
      const k = P.tension / 6;
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      const handles = [];
      for (let i = 0; i + 1 < ns.length; i++) {
        const p0 = ns[Math.max(0, i - 1)], p1 = ns[i], p2 = ns[i + 1], p3 = ns[Math.min(ns.length - 1, i + 2)];
        const c1 = [p1.x + (p2.x - p0.x) * k, p1.y + (p2.y - p0.y) * k];
        const c2 = [p2.x - (p3.x - p1.x) * k, p2.y - (p3.y - p1.y) * k];
        const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const pts = cubicPoints(p1, c1, c2, p2, Math.max(12, Math.ceil(len / 10)));
        strokeSampled(pts, p1.country !== p2.country);
        handles.push([p1, c1], [p2, c2]);
      }
      if (P.handles) {
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = "rgba(255,255,255,0.6)";
        for (const [n, c] of handles) {
          ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(c[0], c[1]); ctx.stroke();
          ctx.beginPath(); ctx.arc(c[0], c[1], 1.8, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }

    function drawCoords() {
      p.push();
      p.noStroke(); p.fill(255, 210);
      p.textSize(8); p.textAlign(p.LEFT, p.TOP);
      for (const n of nodes) p.text(`${n.x.toFixed(0)} ${n.y.toFixed(0)}`, n.x + 7, n.y + 4);
      p.pop();
    }

    // ---------- ciclo ----------

    p.setup = async () => {
      p.createCanvas(window.innerWidth, window.innerHeight).parent("stage");
      p.pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
      p.randomSeed(P.seed);
      p.noiseSeed(P.seed);
      p.textFont("Helvetica");
      let rows = [];
      const cached = D.loadCache();
      if (cached) rows = cached.rows;
      try { rows = await D.fetchRows(); } catch (_) { /* usa a cache */ }
      p.randomSeed(P.seed);
      build(rows);
    };

    p.windowResized = () => {
      p.resizeCanvas(window.innerWidth, window.innerHeight);
      trails = null;
    };

    p.draw = () => {
      p.background(0, 24, 255);
      if (P.trails) drawTrails();
      grid();
      const es = P.rel === "knn" ? knnEdges() : edges;
      if (P.forces) applyForces(es);
      if (P.net !== "0") {
        if (P.net === "faint") p.drawingContext.globalAlpha = 0.28;
        drawEdges(es);
        p.drawingContext.globalAlpha = 1;
      }
      if (P.path) drawPath();
      for (const n of nodes) { n.update(); n.display(); }
      if (P.coords) drawCoords();
      if (P.tracker && nodes.length) drawTracker();
    };

    p.keyPressed = () => {
      if (p.key === "s" || p.key === "S") p.saveCanvas("rcft-lab-" + Date.now(), "png");
    };
  });
})();
