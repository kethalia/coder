#!/bin/bash
# Start headless browser environment with noVNC web access
# This lets users watch AI agents interact with the browser in real-time
set -e

DISPLAY_NUM=99
export DISPLAY=":${DISPLAY_NUM}"
RESOLUTION="${BROWSER_VIEWPORT:-1280x720}"
VNC_PORT=5999
NOVNC_PORT=6080
LOG_DIR="$HOME/.local/share/browser-vision"
mkdir -p "$LOG_DIR"

# Kill any existing instances
pkill -f "Xvfb :${DISPLAY_NUM}" 2>/dev/null || true
pkill -f "fluxbox" 2>/dev/null || true
pkill -f "x11vnc.*:${DISPLAY_NUM}" 2>/dev/null || true
pkill -f "websockify.*${NOVNC_PORT}" 2>/dev/null || true
sleep 1

# Start Xvfb (virtual framebuffer)
Xvfb ":${DISPLAY_NUM}" -screen 0 "${RESOLUTION}x24" -ac +extension GLX +render -noreset \
  > "$LOG_DIR/xvfb.log" 2>&1 &
sleep 1

# Start fluxbox (lightweight window manager — needed for proper window rendering)
fluxbox -display ":${DISPLAY_NUM}" \
  > "$LOG_DIR/fluxbox.log" 2>&1 &
sleep 1

# Start x11vnc (VNC server attached to Xvfb)
x11vnc -display ":${DISPLAY_NUM}" -rfbport "${VNC_PORT}" \
  -nopw -shared -forever -noxdamage -noxfixes \
  > "$LOG_DIR/x11vnc.log" 2>&1 &
sleep 1

# Determine noVNC web directory
NOVNC_DIR=""
for dir in /usr/share/novnc /usr/share/novnc/utils/../ /opt/novnc; do
  if [ -d "$dir" ]; then
    NOVNC_DIR="$dir"
    break
  fi
done

if [ -z "$NOVNC_DIR" ]; then
  echo "WARNING: noVNC directory not found, web UI will not be available"
  echo "VNC is still accessible on port ${VNC_PORT}"
  exit 0
fi

# Start noVNC (WebSocket proxy → web browser access)
websockify --web="$NOVNC_DIR" "${NOVNC_PORT}" "localhost:${VNC_PORT}" \
  > "$LOG_DIR/novnc.log" 2>&1 &

echo "Browser vision web UI running:"
echo "  noVNC:   http://localhost:${NOVNC_PORT}/vnc.html?autoconnect=true&resize=remote"
echo "  VNC:     localhost:${VNC_PORT}"
echo "  Display: ${DISPLAY}"
echo "  Logs:    ${LOG_DIR}/"
