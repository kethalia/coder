#!/bin/bash
# Start headless browser environment with KasmVNC web access
# This lets users watch AI agents interact with the browser in real-time
# KasmVNC replaces Xvfb + x11vnc + websockify + noVNC in a single process

DISPLAY_NUM=99
export DISPLAY=":${DISPLAY_NUM}"
RESOLUTION="${BROWSER_VIEWPORT:-1280x720}"
NOVNC_PORT=6080
LOG_DIR="$HOME/.local/share/browser-vision"
mkdir -p "$LOG_DIR" "$HOME/.vnc"

# Check for KasmVNC
if ! command -v vncserver &>/dev/null; then
  echo "ERROR: KasmVNC (vncserver) not found. Docker image needs rebuilding."
  exit 0
fi

# Kill any existing VNC server on this display
vncserver -kill ":${DISPLAY_NUM}" 2>/dev/null || true
sleep 1

# Write KasmVNC config for no-auth, HTTP (not HTTPS), correct websocket port
cat > "$HOME/.vnc/kasmvnc.yaml" << YAML
network:
  protocol: http
  websocket_port: ${NOVNC_PORT}
  udp:
    public_ip: 127.0.0.1
  ssl:
    require_ssl: false
    pem_certificate:
    pem_key:
desktop:
  resolution:
    width: $(echo "$RESOLUTION" | cut -dx -f1)
    height: $(echo "$RESOLUTION" | cut -dx -f2)
  allow_resize: true
YAML

# Start KasmVNC server (creates its own virtual X display + VNC + web server)
echo "Starting KasmVNC on display :${DISPLAY_NUM}, web port ${NOVNC_PORT}..."
vncserver ":${DISPLAY_NUM}" \
  -geometry "$RESOLUTION" \
  -depth 24 \
  -websocketPort "${NOVNC_PORT}" \
  -disableBasicAuth \
  -SecurityTypes None \
  -sslOnly 0 \
  -select-de manual \
  -Log "*:stderr:30" \
  > "$LOG_DIR/kasmvnc.log" 2>&1

if [ $? -eq 0 ]; then
  echo "KasmVNC started successfully"
else
  echo "WARNING: KasmVNC may have failed. Log:"
  cat "$LOG_DIR/kasmvnc.log" 2>/dev/null || true
fi

# Start fluxbox window manager on the KasmVNC display
nohup fluxbox -display ":${DISPLAY_NUM}" \
  > "$LOG_DIR/fluxbox.log" 2>&1 &
disown $!
echo "fluxbox started (pid $!)"

echo "Browser vision web UI running:"
echo "  Web:     http://localhost:${NOVNC_PORT}"
echo "  Display: ${DISPLAY}"
echo "  Logs:    ${LOG_DIR}/"
echo "Browser vision server started successfully"
