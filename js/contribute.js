/*
  Relational Cartography (rcft): formulário

  O Apps Script demora 7 a 14 segundos a responder. Para a pessoa não ficar à
  espera, o envio é feito com "keepalive" (continua mesmo depois de a página
  mudar) e o formulário só espera 1,5 segundos: se nesse intervalo o pedido
  falhar (por exemplo, sem rede) mostra o erro e mantém os campos; caso
  contrário agradece e abre o mapa, onde a palavra aparece logo.
*/
(function () {
  const C = window.RCFT_CONFIG;
  const D = window.RCFT_DATA;

  const FIELDS = ["country", "meaning", "forms", "movement", "space", "oneword"];
  const REQUIRED = ["country", "meaning", "oneword"];
  const QUICK_FAIL_MS = 1500;     // tempo para detetar uma falha imediata
  const BACK_TO_MAP_MS = 1500;    // tempo da mensagem antes de abrir o mapa

  const form = document.getElementById("rcft-form");
  const status = document.getElementById("rcft-form-status");
  const button = form.querySelector("button[type=submit]");

  const wait = ms => new Promise(r => setTimeout(r, ms));

  // Dentro do Cargo (iframe), o fecho e o regresso depois do envio abrem a
  // página principal do rcft.cargo.site na janela inteira, e não dentro do iframe.
  const EMBEDDED = window.top !== window.self;
  const HOME_LOCAL = document.body.dataset.home || "./";
  const HOME = EMBEDDED && C.SITE_URL ? C.SITE_URL : HOME_LOCAL;

  function goHome() {
    if (EMBEDDED && C.SITE_URL) {
      try { window.top.location.href = C.SITE_URL; } catch (_) { /* bloqueado */ }
      // Se o browser bloquear a navegação da janela a partir do iframe, a página
      // continua aqui: mostra uma ligação para a pessoa voltar ao mapa.
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = C.SITE_URL;
        a.target = "_top";
        a.textContent = "See the cartography.";
        status.append(" ", a);
      }, 1500);
      return;
    }
    location.href = HOME_LOCAL;
  }

  const close = document.querySelector(".close");
  if (close) {
    close.href = HOME;
    if (EMBEDDED) close.target = "_top";
  }

  // As caixas de texto crescem com o que se escreve, até um limite.
  const TEXTAREA_MAX = 140;
  function grow(t) {
    t.style.height = "auto";
    t.style.height = Math.min(TEXTAREA_MAX, t.scrollHeight + 2) + "px";
    t.style.overflowY = t.scrollHeight + 2 > TEXTAREA_MAX ? "auto" : "hidden";
  }
  form.querySelectorAll("textarea").forEach(t => t.addEventListener("input", () => grow(t)));

  // Versão nova publicada: recarrega antes de a pessoa começar a escrever.
  D.checkVersion();

  function say(text) {
    status.textContent = text;
  }

  function collect() {
    const fd = new FormData(form);
    const out = new URLSearchParams();
    for (const k of FIELDS) out.append(k, String(fd.get(k) || "").trim());
    return out;
  }

  function send(params) {
    if (C.WRITE_MODE === "post") {
      // apps-script/Code.gs: POST com resposta JSON
      return fetch(C.WRITE_URL, { method: "POST", body: params, keepalive: true })
        .then(r => r.json())
        .then(json => {
          if (!json || json.ok !== true) throw new Error((json && json.error) || "rejected");
        });
    }
    // Apps Script atual: GET com os seis campos, como o formulário original.
    const url = C.WRITE_URL + (C.WRITE_URL.includes("?") ? "&" : "?") + params.toString();
    return fetch(url, { mode: "no-cors", cache: "no-store", keepalive: true });
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const params = collect();

    for (const k of REQUIRED) {
      if (!params.get(k)) {
        const input = form.elements[k];
        input.focus();
        say("Please answer: " + input.labels[0].textContent);
        return;
      }
    }

    button.disabled = true;
    say("Sending...");

    const sending = send(params);
    sending.catch(err => console.warn("[rcft] envio falhou:", err));

    try {
      await Promise.race([sending, wait(QUICK_FAIL_MS)]);
    } catch (_) {
      // Os campos mantêm-se preenchidos para a pessoa poder tentar outra vez.
      say("Your response could not be sent. Please check your connection and try again.");
      button.disabled = false;
      return;
    }

    D.addPending(params.get("oneword"), params.get("country"));
    form.reset();
    form.querySelectorAll("textarea").forEach(t => { t.style.height = ""; t.style.overflowY = ""; });
    say("Thank you. Your response has been added to the cartography.");
    setTimeout(goHome, BACK_TO_MAP_MS);
  });
})();
