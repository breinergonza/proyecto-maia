#!/bin/sh
# Escribe la configuración que lee el frontend en tiempo de ejecución (la misma imagen sirve en local y en Railway).
set -eu
case "${MAIA_ENTORNO:-local}" in
  local|demo|prueba|produccion) ;;
  *) echo "MAIA_ENTORNO no válido: ${MAIA_ENTORNO}" >&2; exit 1 ;;
esac
printf "window.__MAIA__ = { entorno: '%s' }\n" "${MAIA_ENTORNO:-local}" > /usr/share/nginx/html/config.js

# Railway usa IPv6 en su red; si el kernel del contenedor no tiene IPv6, se escucha solo en IPv4.
if [ ! -f /proc/net/if_inet6 ]; then
  sed -i '/listen \[::\]/d' /etc/nginx/conf.d/default.conf
fi
