/*
  Relational Cartography (rcft): configuração
  Este é o único ficheiro que normalmente é preciso editar.
*/
window.RCFT_CONFIG = {
  // Leitura das respostas (Apps Script que devolve JSON).
  READ_URL:
    "https://script.google.com/macros/s/AKfycbzZxQWYb62O8omqTvXzyrFXreB1ZSC09OAz-j_p8mo4gonkoLyHquVN3sRSRKrV4xtS/exec",

  // Escrita das respostas.
  WRITE_URL:
    "https://script.google.com/macros/s/AKfycbzViiA5v7CGS_Zf6RmDPooutllV09gOZMSJxEZlaXnSttFWDhdb8vFUGvVO7ysaiIDV/exec",

  // "legacy": envio GET para um iframe escondido (o Apps Script que já existe).
  //           A confirmação é feita relendo os dados até a resposta aparecer.
  // "post":   envio POST com resposta JSON (apps-script/Code.gs deste repositório).
  //           Com o Code.gs, READ_URL e WRITE_URL passam a ser o mesmo endereço.
  WRITE_MODE: "legacy",

  // Intervalo entre atualizações do mapa (ms).
  REFRESH_MS: 30000,

  // Tempo máximo de espera por uma resposta do Apps Script (ms).
  FETCH_TIMEOUT_MS: 25000,

  // Endereço do formulário usado no QR code do modo instalação.
  // null = calcula a partir do endereço onde a peça está alojada.
  CONTRIBUTE_URL: null
};
