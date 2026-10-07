#!/bin/sh
# Sobe o número de versão em version.json, no RCFT_VERSION do index.html e nos
# ?v= dos ficheiros CSS e JS. Usar antes de cada commit que altere a peça:
# as páginas abertas (incluindo a da instalação) recarregam-se sozinhas.
set -e
cd "$(dirname "$0")/.."
old=$(sed -E 's/[^0-9]//g' version.json)
new=$((old + 1))
printf '{ "v": %s }\n' "$new" > version.json
sed -i.bak -E "s/window\.RCFT_VERSION = [0-9]+;/window.RCFT_VERSION = $new;/" index.html contribute.html
sed -i.bak -E "s/\?v=[0-9]+\"/?v=$new\"/g" index.html contribute.html
rm -f index.html.bak contribute.html.bak
echo "versão $old -> $new"
