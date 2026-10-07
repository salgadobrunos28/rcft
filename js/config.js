/*
  Relational Cartography (rcft): configuração
  Este é o único ficheiro que normalmente é preciso editar.
*/
window.RCFT_CONFIG = {
  // Leitura das respostas: Apps Script "rcft endpoint" (apps-script/Code.gs),
  // implementado a 7/10/2026. Devolve [{ ts, country, word }], com cache de 20 s.
  READ_URL:
    "https://script.google.com/macros/s/AKfycbxmnDCOgJxJQ1NKyJaY1wZNU1ERVZaExmIrOgJNlAzpPZ_Q_LXjOgOHgqugtdaNjV4W/exec",

  // Escrita das respostas: o mesmo endereço (POST).
  // Endpoint antigo, ainda ativo: https://script.google.com/macros/s/AKfycbzViiA5v7CGS_Zf6RmDPooutllV09gOZMSJxEZlaXnSttFWDhdb8vFUGvVO7ysaiIDV/exec
  WRITE_URL:
    "https://script.google.com/macros/s/AKfycbxmnDCOgJxJQ1NKyJaY1wZNU1ERVZaExmIrOgJNlAzpPZ_Q_LXjOgOHgqugtdaNjV4W/exec",

  // "post":   envio POST com resposta JSON (apps-script/Code.gs deste repositório).
  // "legacy": envio GET com os seis campos, para o endpoint antigo indicado acima.
  WRITE_MODE: "post",

  // Intervalo entre atualizações do mapa (ms).
  REFRESH_MS: 30000,

  // Tempo máximo de espera por uma resposta do Apps Script (ms).
  FETCH_TIMEOUT_MS: 45000,

  // Endereço para onde aponta o QR code da instalação
  // (o mesmo do QR code que estava no rcinstallation.cargo.site).
  QR_URL: "https://rcft.cargo.site/"
};
