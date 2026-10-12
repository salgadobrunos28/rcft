#!/bin/bash
# Relational Cartography (rcft): prepara um Raspberry Pi para a instalação.
#
# Para Raspberry Pi 4 ou 5 com Raspberry Pi OS (64-bit) com ambiente de trabalho.
# Corre no terminal do Pi, com o utilizador normal (sem sudo):
#
#   curl -fsSL https://salgadobrunos28.github.io/rcft/tools/pi-setup.sh | bash
#
# O que faz:
#   1. atualiza o sistema e instala o Chromium
#   2. arranque direto para o ambiente de trabalho, sem pedir senha
#   3. desliga o apagamento do ecrã
#   4. cria ~/rcft-kiosk.sh, que abre a instalação em ecrã inteiro
#   5. põe esse script a arrancar com o ambiente de trabalho
#   6. reinicia o Pi todos os dias às 06:00 (limpa a memória)
#
# Variáveis opcionais:
#   RCFT_URL        endereço a abrir (por omissão a instalação no GitHub Pages)
#   RCFT_REBOOT_AT  hora do reinício diário, HH:MM; vazio desliga
#
# Para desligar o modo instalação: touch ~/.rcft-off e reiniciar.
# Para voltar a ligar:             rm ~/.rcft-off e reiniciar.

set -euo pipefail

URL="${RCFT_URL:-https://salgadobrunos28.github.io/rcft/installation.html}"
REBOOT_AT="${RCFT_REBOOT_AT-06:00}"

if [ "$(id -u)" = 0 ]; then
  echo "Corre este script com o utilizador normal, sem sudo." >&2
  exit 1
fi

echo "== 1/6 Atualizar o sistema e instalar o Chromium (pode demorar uns minutos)"
sudo apt-get update
sudo apt-get -y full-upgrade
sudo apt-get install -y chromium curl || sudo apt-get install -y chromium-browser curl
BROWSER="$(command -v chromium || command -v chromium-browser || true)"
if [ -z "$BROWSER" ]; then
  echo "Não encontrei o Chromium depois da instalação." >&2
  exit 1
fi

echo "== 2/6 Arranque direto para o ambiente de trabalho"
sudo raspi-config nonint do_boot_behaviour B4 || echo "   (não consegui mudar; confirma em raspi-config, System Options, Boot / Auto Login)"

echo "== 3/6 Desligar o apagamento do ecrã"
sudo raspi-config nonint do_blanking 1 || echo "   (não consegui mudar; confirma em raspi-config, Display Options, Screen Blanking)"

echo "== 4/6 Criar ~/rcft-kiosk.sh"
cat > "$HOME/rcft-kiosk.sh" <<EOF
#!/bin/bash
# Abre a Relational Cartography em ecrã inteiro (criado por tools/pi-setup.sh).
URL="$URL"
PROFILE="\$HOME/.config/rcft-chromium"

[ -f "\$HOME/.rcft-off" ] && exit 0
# Já está aberto (o arranque pode chamar este script por dois caminhos).
pgrep -f -- "--user-data-dir=\$PROFILE" >/dev/null && exit 0

# Espera pela rede até 2 minutos: sem rede, a página não carrega.
for i in \$(seq 1 60); do
  curl -fsI --max-time 3 "\$URL" >/dev/null 2>&1 && break
  sleep 2
done

# Depois de um corte de energia, o Chromium não mostra o aviso para restaurar páginas.
PREFS="\$PROFILE/Default/Preferences"
if [ -f "\$PREFS" ]; then
  sed -i 's/"exited_cleanly":false/"exited_cleanly":true/; s/"exit_type":"[^"]*"/"exit_type":"Normal"/' "\$PREFS"
fi

exec "$BROWSER" --user-data-dir="\$PROFILE" \\
  --kiosk --noerrdialogs --disable-infobars --no-first-run \\
  --password-store=basic --disable-session-crashed-bubble --disable-translate \\
  --check-for-update-interval=31536000 --ozone-platform-hint=auto \\
  "\$URL"
EOF
chmod +x "$HOME/rcft-kiosk.sh"

echo "== 5/6 Arrancar com o ambiente de trabalho"
# Wayland (labwc), o ambiente atual do Raspberry Pi OS.
if command -v labwc >/dev/null 2>&1; then
  AUTOSTART="$HOME/.config/labwc/autostart"
  mkdir -p "$(dirname "$AUTOSTART")"
  if [ ! -f "$AUTOSTART" ]; then
    # Se o labwc lê só o primeiro autostart que encontra, o do utilizador
    # substitui o do sistema: carrega-o primeiro para manter o ambiente de trabalho.
    if ! grep -qsE -- '(^|[[:space:]])(-m|--merge-config)([[:space:]]|$)' /usr/bin/labwc-pi /usr/share/wayland-sessions/*.desktop; then
      echo '[ -f /etc/xdg/labwc/autostart ] && . /etc/xdg/labwc/autostart' > "$AUTOSTART"
    fi
  fi
  grep -qF "rcft-kiosk.sh" "$AUTOSTART" 2>/dev/null || echo "\"\$HOME/rcft-kiosk.sh\" &" >> "$AUTOSTART"
fi
# X11 e outros ambientes: arranque automático normal (o script evita abrir duas vezes).
mkdir -p "$HOME/.config/autostart"
cat > "$HOME/.config/autostart/rcft.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Relational Cartography
Exec=$HOME/rcft-kiosk.sh
X-GNOME-Autostart-enabled=true
EOF

echo "== 6/6 Reinício diário"
if [ -n "$REBOOT_AT" ]; then
  H="${REBOOT_AT%%:*}"; M="${REBOOT_AT##*:}"
  echo "$((10#$M)) $((10#$H)) * * * root /sbin/shutdown -r now" | sudo tee /etc/cron.d/rcft-reboot >/dev/null
  echo "   todos os dias às $REBOOT_AT"
else
  sudo rm -f /etc/cron.d/rcft-reboot
  echo "   desligado"
fi

echo
echo "Pronto. Reinicia o Pi (sudo reboot): a instalação abre sozinha em ecrã inteiro."
echo "Endereço: $URL"
