/*
  Relational Cartography (rcft): formulário
  Envia os seis campos e só agradece quando a resposta está confirmada.
*/
(function () {
  const C = window.RCFT_CONFIG;
  const D = window.RCFT_DATA;

  const FIELDS = ["country", "meaning", "forms", "movement", "space", "oneword"];
  const REQUIRED = ["country", "meaning", "oneword"];

  const form = document.getElementById("rcft-form");
  const status = document.getElementById("rcft-form-status");
  const button = form.querySelector("button[type=submit]");
  const sink = document.getElementById("rcft-sink");

  const wait = ms => new Promise(r => setTimeout(r, ms));

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

  // Apps Script atual: pedido GET num iframe escondido (o mesmo mecanismo que
  // já funcionava quando se chegava ao formulário pelo botão do mapa).
  function sendLegacy(params) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        sink.onload = null;
        reject(new Error("timeout"));
      }, C.FETCH_TIMEOUT_MS + 5000);
      sink.onload = () => {
        clearTimeout(timer);
        sink.onload = null;
        resolve();
      };
      sink.src = C.WRITE_URL + (C.WRITE_URL.includes("?") ? "&" : "?") + params.toString();
    });
  }

  // Apps Script deste repositório (apps-script/Code.gs): POST com resposta JSON.
  async function sendPost(params) {
    const res = await fetch(C.WRITE_URL, { method: "POST", body: params });
    const json = await res.json();
    if (!json || json.ok !== true) throw new Error((json && json.error) || "rejected");
  }

  // Relê os dados até a palavra enviada aparecer.
  async function confirmInData(word, sentAt) {
    const w = word.toLowerCase();
    for (let i = 0; i < 4; i++) {
      await wait(i === 0 ? 1500 : 5000);
      try {
        const rows = await D.fetchRows();
        const found = rows.some(r =>
          r.word.toLowerCase() === w &&
          (r.ts === null || r.ts >= sentAt - 10 * 60 * 1000)
        );
        if (found) return true;
      } catch (_) { /* tenta outra vez */ }
    }
    return false;
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
    const sentAt = Date.now();

    try {
      if (C.WRITE_MODE === "post") {
        await sendPost(params);
        form.reset();
        say("Thank you. Your response has been added to the cartography.", true);
      } else {
        await sendLegacy(params);
        say("Sent. Confirming...");
        const ok = await confirmInData(params.get("oneword"), sentAt);
        form.reset();
        if (ok) say("Thank you. Your response has been added to the cartography.", true);
        else say("Your response was sent. It may take a few minutes to appear in the cartography.", true);
      }
    } catch (err) {
      console.warn("[rcft] envio falhou:", err);
      say("Your response could not be sent. Please check your connection and try again.");
    } finally {
      button.disabled = false;
    }
  });
})();
