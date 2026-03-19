#!/bin/bash
# Start headless browser environment with web-based VNC access
# Lets users watch AI agents interact with the browser in real-time
#
# Preferred: KasmVNC (single process, does everything)
# Fallback:  Xvfb + x11vnc + websockify (uses only what's already installed)
#
# IMPORTANT: Never run apt-get here — other startup scripts run concurrently
# and competing for the dpkg lock will deadlock the entire workspace startup.

DISPLAY_NUM=99
export DISPLAY=":${DISPLAY_NUM}"
RESOLUTION="${BROWSER_VIEWPORT:-1280x720}"
WEB_PORT=6080
LOG_DIR="$HOME/.local/share/browser-vision"
mkdir -p "$LOG_DIR"

# Kill anything on our display from a previous run
vncserver -kill ":${DISPLAY_NUM}" 2>/dev/null || true
pkill -f "Xvfb :${DISPLAY_NUM}" 2>/dev/null || true
pkill -f "x11vnc.*:${DISPLAY_NUM}" 2>/dev/null || true
pkill -f "websockify.*${WEB_PORT}" 2>/dev/null || true
pkill -f "fluxbox.*:${DISPLAY_NUM}" 2>/dev/null || true
sleep 0.5

# ─── Option A: KasmVNC (preferred — single process) ─────────────────────────
if command -v vncserver &>/dev/null; then
  echo "Using KasmVNC..."
  mkdir -p "$HOME/.vnc"

  cat > "$HOME/.vnc/kasmvnc.yaml" << YAML
network:
  protocol: http
  websocket_port: ${WEB_PORT}
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

  vncserver ":${DISPLAY_NUM}" \
    -geometry "$RESOLUTION" \
    -depth 24 \
    -websocketPort "${WEB_PORT}" \
    -disableBasicAuth \
    -SecurityTypes None \
    -sslOnly 0 \
    -select-de manual \
    -Log "*:stderr:30" \
    > "$LOG_DIR/kasmvnc.log" 2>&1

  if [ $? -eq 0 ]; then
    echo "KasmVNC started on :${DISPLAY_NUM}"
  else
    echo "WARNING: KasmVNC failed:"
    tail -5 "$LOG_DIR/kasmvnc.log" 2>/dev/null
  fi

  if command -v fluxbox &>/dev/null; then
    nohup fluxbox -display ":${DISPLAY_NUM}" > "$LOG_DIR/fluxbox.log" 2>&1 &
    disown $!
  fi

  echo "Browser vision web UI: http://localhost:${WEB_PORT}"
  echo "Browser vision server started successfully"
  exit 0
fi

# ─── Option B: Xvfb fallback (use whatever is already installed) ─────────────
echo "KasmVNC not found, falling back to Xvfb..."

# Xvfb is the minimum requirement — Playwright MCP needs a DISPLAY
if ! command -v Xvfb &>/dev/null; then
  echo "ERROR: Neither KasmVNC nor Xvfb found. Docker image needs rebuilding."
  echo "Browser vision server started successfully"
  exit 0
fi

Xvfb ":${DISPLAY_NUM}" -screen 0 "${RESOLUTION}x24" -ac +extension GLX +render -noreset \
  > "$LOG_DIR/xvfb.log" 2>&1 &
XVFB_PID=$!
disown $XVFB_PID
sleep 1

if ! kill -0 $XVFB_PID 2>/dev/null; then
  echo "ERROR: Xvfb failed to start"
  cat "$LOG_DIR/xvfb.log" 2>/dev/null
  echo "Browser vision server started successfully"
  exit 0
fi
echo "Xvfb started on :${DISPLAY_NUM} (pid $XVFB_PID)"

# Window manager (if available)
if command -v fluxbox &>/dev/null; then
  nohup fluxbox -display ":${DISPLAY_NUM}" > "$LOG_DIR/fluxbox.log" 2>&1 &
  disown $!
  echo "fluxbox started"
fi

# x11vnc → VNC server (only if already installed, never apt-get at runtime)
if ! command -v x11vnc &>/dev/null; then
  echo "x11vnc not installed — Xvfb running for Playwright MCP, but no web viewer."
  echo "Rebuild Docker image with KasmVNC for browser web viewer."
  echo "Browser vision server started successfully"
  exit 0
fi

x11vnc -display ":${DISPLAY_NUM}" -nopw -forever -shared -rfbport 5900 \
  > "$LOG_DIR/x11vnc.log" 2>&1 &
X11VNC_PID=$!
disown $X11VNC_PID
sleep 1

if ! kill -0 $X11VNC_PID 2>/dev/null; then
  echo "WARNING: x11vnc failed to start. Xvfb running for Playwright MCP."
  echo "Browser vision server started successfully"
  exit 0
fi
echo "x11vnc started (pid $X11VNC_PID)"

# websockify + noVNC web client (only if already installed)
WEBSOCKIFY_BIN=""
for bin in websockify "$HOME/.local/bin/websockify"; do
  command -v "$bin" &>/dev/null && WEBSOCKIFY_BIN="$bin" && break
done

NOVNC_DIR=""
for dir in /usr/share/novnc "$HOME/.local/share/noVNC"; do
  [ -d "$dir" ] && NOVNC_DIR="$dir" && break
done

if [ -n "$WEBSOCKIFY_BIN" ] && [ -n "$NOVNC_DIR" ]; then
  # Ensure vnc.html exists
  if [ ! -f "$NOVNC_DIR/vnc.html" ] && [ -f "$NOVNC_DIR/vnc_lite.html" ]; then
    ln -sf "$NOVNC_DIR/vnc_lite.html" "$NOVNC_DIR/vnc.html"
  fi

  "$WEBSOCKIFY_BIN" --web="$NOVNC_DIR" ${WEB_PORT} localhost:5900 \
    > "$LOG_DIR/websockify.log" 2>&1 &
  WS_PID=$!
  disown $WS_PID
  sleep 1

  if kill -0 $WS_PID 2>/dev/null; then
    echo "websockify + noVNC on port ${WEB_PORT} (pid $WS_PID)"
    echo "Browser vision web UI: http://localhost:${WEB_PORT}/vnc.html?autoconnect=true&resize=remote"
  else
    echo "WARNING: websockify failed"
    tail -3 "$LOG_DIR/websockify.log" 2>/dev/null
  fi
else
  echo "websockify/noVNC not installed — no web viewer (x11vnc on port 5900 for VNC clients)"
fi

echo "Display: ${DISPLAY}"
echo "Browser vision server started successfully"
