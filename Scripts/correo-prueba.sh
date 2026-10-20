#!/usr/bin/env bash
# Benjamin Orellana - 19/10/2026 - Buzón Mailpit local con STARTTLS; no envía correo a Internet.
set -euo pipefail
umask 077

FACTORE_ACCION="${1:-iniciar}"
case "$FACTORE_ACCION" in preparar|iniciar|comprobar|backend) ;; *) echo 'Usar: bash Scripts/correo-prueba.sh preparar|iniciar|comprobar|backend'; exit 1 ;; esac
test "$#" -le 1 || { echo 'La orden no admite otros argumentos.'; exit 1; }

FACTORE_RAIZ="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
FACTORE_CORREO_DIR="${FACTORE_CORREO_DIR:-$HOME/.local/share/factore-correo-prueba}"
case "$FACTORE_CORREO_DIR" in /*) ;; *) echo 'La carpeta de correo debe tener una ruta absoluta.'; exit 1 ;; esac
test ! -L "$FACTORE_CORREO_DIR" || { echo 'La carpeta de pruebas no puede ser un enlace simbólico.'; exit 1; }
mkdir -p "$FACTORE_CORREO_DIR"
chmod 700 "$FACTORE_CORREO_DIR"
FACTORE_BIN="$FACTORE_CORREO_DIR/mailpit-v1.31.6"
FACTORE_CERT="$FACTORE_CORREO_DIR/localhost-cert.pem"
FACTORE_KEY="$FACTORE_CORREO_DIR/localhost-key.pem"
FACTORE_CERT_CONFIG="$FACTORE_CORREO_DIR/localhost-openssl.cnf"
FACTORE_CERT_VERSION="$FACTORE_CORREO_DIR/certificado-v2"
FACTORE_PASS="$FACTORE_CORREO_DIR/smtp-password"
FACTORE_AUTH="$FACTORE_CORREO_DIR/smtp-auth"

preparar() {
  for FACTORE_DEP in curl tar openssl sha256sum; do
    command -v "$FACTORE_DEP" >/dev/null || { echo "Falta la herramienta: $FACTORE_DEP"; exit 1; }
  done
  if [ ! -x "$FACTORE_BIN" ]; then
    # SHA256 publicados por GitHub para los assets oficiales de la versión fijada.
    case "$(uname -m)" in
      x86_64) FACTORE_ARCH=amd64; FACTORE_SHA=10fa12ccc610f653d4ed4df848c1817f9935dcf4e9a6a458a19ab0fa02093f91 ;;
      aarch64|arm64) FACTORE_ARCH=arm64; FACTORE_SHA=de07955b783236d9129da76da9a5970f1777834a18b2c07611de957be784dafe ;;
      *) echo 'Arquitectura no contemplada.'; exit 1 ;;
    esac
    FACTORE_TMP="$(mktemp -d "$FACTORE_CORREO_DIR/descarga.XXXXXX")"
    trap 'rm -rf -- "$FACTORE_TMP"' EXIT
    curl --fail --location --retry 2 --connect-timeout 15 --max-time 180 \
      "https://github.com/axllent/mailpit/releases/download/v1.31.6/mailpit-linux-$FACTORE_ARCH.tar.gz" \
      -o "$FACTORE_TMP/mailpit.tar.gz"
    printf '%s  %s\n' "$FACTORE_SHA" "$FACTORE_TMP/mailpit.tar.gz" | sha256sum --check --status
    tar -xzf "$FACTORE_TMP/mailpit.tar.gz" --no-same-owner --no-same-permissions -C "$FACTORE_TMP" mailpit
    chmod 700 "$FACTORE_TMP/mailpit"
    mv "$FACTORE_TMP/mailpit" "$FACTORE_BIN"
    rm -rf -- "$FACTORE_TMP"
    trap - EXIT
  fi
  # Benjamin Orellana - 19/10/2026 - Configuración explícita: OpenSSL 1.1 no debe sumar extensiones del openssl.cnf del sistema.
  if [ ! -s "$FACTORE_CERT_VERSION" ] || [ ! -s "$FACTORE_CERT" ] || [ ! -s "$FACTORE_KEY" ] || ! openssl x509 -checkend 3600 -noout -in "$FACTORE_CERT" >/dev/null 2>&1; then
    cat > "$FACTORE_CERT_CONFIG" <<'OPENSSL'
[req]
prompt = no
distinguished_name = localhost_dn
x509_extensions = localhost_cert

[localhost_dn]
CN = localhost

[localhost_cert]
subjectAltName = DNS:localhost,IP:127.0.0.1
basicConstraints = critical,CA:TRUE
keyUsage = critical,keyCertSign,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
OPENSSL
    openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 30 \
      -config "$FACTORE_CERT_CONFIG" -extensions localhost_cert \
      -keyout "$FACTORE_KEY" -out "$FACTORE_CERT" >/dev/null 2>&1
    printf '2\n' > "$FACTORE_CERT_VERSION"
  fi
  if [ ! -s "$FACTORE_PASS" ]; then openssl rand -hex 24 > "$FACTORE_PASS"; fi
  IFS= read -r FACTORE_PASSWORD < "$FACTORE_PASS"
  [[ "$FACTORE_PASSWORD" =~ ^[0-9a-f]{48}$ ]] || { echo 'La credencial local no es válida.'; exit 1; }
  printf 'factore-pruebas:%s\n' "$FACTORE_PASSWORD" > "$FACTORE_AUTH"
  chmod 600 "$FACTORE_CERT" "$FACTORE_KEY" "$FACTORE_PASS" "$FACTORE_AUTH"
}

configurar_backend() {
  cd "$FACTORE_RAIZ"
  # Lee .env con el cargador del proyecto, sin ejecutar su contenido como código shell.
  node --input-type=module <<'JS'
import './src/DataBase/config.js';
if (process.env.NODE_ENV !== 'development' || process.env.MP_MODO !== 'PRUEBA') {
  console.error('El correo local requiere NODE_ENV=development y MP_MODO=PRUEBA.');
  process.exit(1);
}
JS
  export CORREO_HABILITADO=true CORREO_PRUEBA_LOCAL=true
  export SMTP_HOST=127.0.0.1 SMTP_PORT=1587 SMTP_USER=factore-pruebas SMTP_FROM=cuentas@factore.test
  export SMTP_PASSWORD="$FACTORE_PASSWORD" NODE_EXTRA_CA_CERTS="$FACTORE_CERT"
}

preparar
case "$FACTORE_ACCION" in
  preparar)
    echo 'Buzón local preparado. No se modificó .env ni se abrió MySQL.'
    ;;
  iniciar)
    echo 'Abrir el buzón en http://127.0.0.1:8025 y dejar esta terminal abierta.'
    # Entorno limpio: ninguna variable heredada puede habilitar relay, reenvíos o un webhook.
    exec env -i PATH="$PATH" "$FACTORE_BIN" \
      --listen 127.0.0.1:8025 --allowed-hosts 127.0.0.1,localhost \
      --smtp 127.0.0.1:1587 --smtp-tls-cert "$FACTORE_CERT" --smtp-tls-key "$FACTORE_KEY" \
      --smtp-require-starttls --smtp-auth-file "$FACTORE_AUTH" --smtp-disable-rdns \
      --database "$FACTORE_CORREO_DIR/mensajes.db" --disable-version-check --quiet
    ;;
  comprobar)
    configurar_backend
    node --input-type=module <<'JS'
import './src/DataBase/config.js';
import { configCorreoCuenta, enviarCorreoCuenta } from './src/Services/Usuario/correoCuenta.service.js';
try {
  const config = configCorreoCuenta();
  await enviarCorreoCuenta({ destinatario: 'prueba-local@example.com', enlace: config.front + '/login', activacion: false }, config);
  console.log('SMTP_LOCAL_OK: revisar el mensaje en http://127.0.0.1:8025. No se abrió MySQL.');
} catch {
  console.error('No se pudo confirmar el correo local. Comprobá que el buzón esté abierto.');
  process.exitCode = 1;
}
JS
    ;;
  backend)
    configurar_backend
    echo 'Backend con buzón local de pruebas. .env permanece sin cambios.'
    exec nodemon server.js
    ;;
esac
