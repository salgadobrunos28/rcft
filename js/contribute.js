/*
  Relational Cartography (rcft): formulário
  Envia os seis campos e agradece quando o servidor do Google responde ao envio.
*/
(function () {
  const C = window.RCFT_CONFIG;

  const FIELDS = ["country", "meaning", "forms", "movement", "space", "oneword"];
  const REQUIRED = ["country", "meaning", "oneword"];
  const SEND_TIMEOUT_MS = 45000;

  const form = document.getElementById("rcft-form");
  const status = document.getElementById("rcft-form-status");
  const button = form.querySelector("button[type=submit]");

  function say(text, withLink) {
    status.textContent = text;
    if (withLink) {
      status.append(" ");
      const a = document.createElement("a");
      a.href = "./";
      a.textContent = "See the cartography.";
      status.append(a);
    }
  }

  function collect() {
    const fd = new FormData(form);
    const out = new URLSearchParams();
    for (const k of FIELDS) out.append(k, String(fd.get(k) || "").trim());
    return out;
  }

  async function withTimeout(run) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SEND_TIMEOUT_MS);
    try {
      return await run(ctrl.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  /*
    Apps Script atual: pedido GET com os seis campos, o mesmo que o formulário
    original fazia. O modo "no-cors" não deixa ler a resposta, mas a promessa só
    se resolve depois de o Google ter executado o script e respondido; uma falha
    de rede rejeita-a. A releitura dos dados para confirmar foi retirada porque o
    Apps Script de leitura demora 20 a 40 segundos por pedido.
  */
  function sendLegacy(params) {
    const url = C.WRITE_URL + (C.WRITE_URL.includes("?") ? "&" : "?") + params.toString();
    return withTimeout(signal => fetch(url, { mode: "no-cors", cache: "no-store", signal }));
  }

  // Apps Script deste repositório (apps-script/Code.gs): POST com resposta JSON.
  async function sendPost(params) {
    const res = await withTimeout(signal => fetch(C.WRITE_URL, { method: "POST", body: params, signal }));
    const json = await res.json();
    if (!json || json.ok !== true) throw new Error((json && json.error) || "rejected");
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

    try {
      if (C.WRITE_MODE === "post") await sendPost(params);
      else await sendLegacy(params);
      form.reset();
      say("Thank you. Your response has been added to the cartography.", true);
    } catch (err) {
      // Os campos mantêm-se preenchidos para a pessoa poder tentar outra vez.
      console.warn("[rcft] envio falhou:", err);
      say("Your response could not be sent. Please check your connection and try again.");
    } finally {
      button.disabled = false;
    }
  });
})();
