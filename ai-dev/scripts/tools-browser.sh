#!/bin/bash
set -e

BOLD='\033[0;1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RESET='\033[0m'

# Ensure PATH includes tool directories
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$HOME/.claude/local/bin:$PATH"
mkdir -p "$HOME/.local/bin"

# Force npm global installs into ~/.local (user-writable, already on PATH)
export npm_config_prefix="$HOME/.local"

printf "${BOLD}[browser] Setting up browser vision tools...${RESET}\n"

# Detect a REAL chromium binary (not the Ubuntu 24.04 snap stub)
# On Ubuntu 24.04, /usr/bin/chromium-browser is a stub that says "install the snap"
CHROMIUM_BIN=""
for bin in /usr/bin/google-chrome-stable /usr/bin/google-chrome /usr/bin/chromium-browser /usr/bin/chromium /snap/bin/chromium; do
  if [ -x "$bin" ]; then
    # Test if it's a real binary by checking --version
    if "$bin" --version 2>&1 | grep -qi "chromium\|chrome"; then
      CHROMIUM_BIN="$bin"
      echo "Chromium binary: $CHROMIUM_BIN ($("$bin" --version 2>&1 | head -1))"
      break
    else
      echo "Skipping $bin (stub/not working: $("$bin" --version 2>&1 | head -1))"
    fi
  fi
done

# If no working system chromium, install Playwright's bundled browser
USE_PLAYWRIGHT_BROWSER=false
if [ -z "$CHROMIUM_BIN" ]; then
  printf "${YELLOW}[warn] No working system chromium found${RESET}\n"
  echo "Installing Playwright's bundled Chromium..."
  if npx -y playwright install chromium 2>&1; then
    USE_PLAYWRIGHT_BROWSER=true
    printf "${GREEN}[ok] Playwright Chromium installed${RESET}\n"
  else
    printf "${YELLOW}[warn] Playwright browser install failed, MCP may not work${RESET}\n"
  fi
fi

# Build MCP args based on which browser we're using
if [ "$USE_PLAYWRIGHT_BROWSER" = "true" ] || [ -z "$CHROMIUM_BIN" ]; then
  # Use Playwright's own chromium - no --executable-path needed
  MCP_ARGS_JSON='["-y", "@playwright/mcp", "--no-sandbox"]'
  MCP_ARGS_CLI="--no-sandbox"
else
  # Use system browser (chrome or chromium)
  # Detect browser type from binary name
  if echo "$CHROMIUM_BIN" | grep -q "chrome"; then
    BROWSER_TYPE="chrome"
  else
    BROWSER_TYPE="chromium"
  fi
  MCP_ARGS_JSON="[\"-y\", \"@playwright/mcp\", \"--browser\", \"$BROWSER_TYPE\", \"--executable-path\", \"$CHROMIUM_BIN\", \"--no-sandbox\"]"
  MCP_ARGS_CLI="--browser $BROWSER_TYPE --executable-path $CHROMIUM_BIN --no-sandbox"
fi

# Configure Claude Code MCP
printf "${BOLD}[browser] Configuring Claude Code MCP...${RESET}\n"

# Wait for claude binary (installed concurrently by claude-install.sh)
printf "${BOLD}[browser] Waiting for Claude Code to be installed...${RESET}\n"
for i in $(seq 1 30); do
  command -v claude &>/dev/null && break
  sleep 2
done

CLAUDE_MCP_DONE=false

if command -v claude &>/dev/null; then
  # Try 'claude mcp add' first (proper way)
  echo "Trying 'claude mcp add'..."
  if claude mcp add playwright -- npx -y @playwright/mcp $MCP_ARGS_CLI 2>&1; then
    CLAUDE_MCP_DONE=true
    printf "${GREEN}[ok] Claude Code MCP added via 'claude mcp add'${RESET}\n"
  else
    echo "claude mcp add failed, trying settings.json..."
  fi
fi

if [ "$CLAUDE_MCP_DONE" = "false" ]; then
  # Write to settings.json directly
  mkdir -p "$HOME/.claude"
  CLAUDE_SETTINGS="$HOME/.claude/settings.json"

  MCP_CONFIG=$(cat << MCPJSON
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": $MCP_ARGS_JSON,
      "env": {
        "DISPLAY": ":99"
      }
    }
  }
}
MCPJSON
)

  if [ -f "$CLAUDE_SETTINGS" ] && command -v jq &>/dev/null; then
    # Merge into existing settings using jq
    MERGED=$(jq --argjson args "$MCP_ARGS_JSON" \
      '.mcpServers.playwright = {"command": "npx", "args": $args, "env": {"DISPLAY": ":99"}}' \
      "$CLAUDE_SETTINGS" 2>/dev/null) && echo "$MERGED" > "$CLAUDE_SETTINGS" || {
      echo "$MCP_CONFIG" > "$CLAUDE_SETTINGS"
    }
  else
    echo "$MCP_CONFIG" > "$CLAUDE_SETTINGS"
  fi
  echo "Wrote Claude settings.json"
fi

# Write .mcp.json in home dir as fallback (Claude Code reads this from cwd)
cat > "$HOME/.mcp.json" << MCPFILE
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": $MCP_ARGS_JSON,
      "env": {
        "DISPLAY": ":99"
      }
    }
  }
}
MCPFILE
# Validate the JSON we wrote
if command -v jq &>/dev/null; then
  if jq . "$HOME/.mcp.json" > /dev/null 2>&1; then
    echo "Wrote ~/.mcp.json (valid JSON)"
  else
    printf "${YELLOW}[warn] ~/.mcp.json has invalid JSON, removing${RESET}\n"
    rm -f "$HOME/.mcp.json"
  fi
fi

printf "${GREEN}[ok] Claude Code MCP configured for Playwright${RESET}\n"

# Configure OpenCode MCP server for Playwright
OPENCODE_CONFIG="$HOME/.config/opencode/config.json"
OPENCODE_MCP='{"type": "local", "command": ["npx", "-y", "@playwright/mcp"'

if [ "$USE_PLAYWRIGHT_BROWSER" = "true" ] || [ -z "$CHROMIUM_BIN" ]; then
  OPENCODE_CMD='["npx", "-y", "@playwright/mcp", "--no-sandbox"]'
else
  OPENCODE_CMD="[\"npx\", \"-y\", \"@playwright/mcp\", \"--browser\", \"chromium\", \"--executable-path\", \"$CHROMIUM_BIN\", \"--no-sandbox\"]"
fi

if [ -f "$OPENCODE_CONFIG" ] && command -v jq &>/dev/null; then
  MERGED=$(jq --argjson cmd "$OPENCODE_CMD" \
    '.mcp.playwright = {"type": "local", "command": $cmd, "enabled": true, "environment": {"DISPLAY": ":99"}}' \
    "$OPENCODE_CONFIG" 2>/dev/null) && echo "$MERGED" > "$OPENCODE_CONFIG" || {
    printf "${YELLOW}[warn] Could not merge MCP into OpenCode config${RESET}\n"
  }
else
  mkdir -p "$HOME/.config/opencode"
  cat > "$OPENCODE_CONFIG" << OPMCP
{
  "mcp": {
    "playwright": {
      "type": "local",
      "command": $OPENCODE_CMD,
      "enabled": true,
      "environment": {
        "DISPLAY": ":99"
      }
    }
  }
}
OPMCP
fi
printf "${GREEN}[ok] OpenCode MCP configured for Playwright${RESET}\n"

# Determine the chromium binary for helper scripts
# Use Playwright's chromium path if available, else system
if [ "$USE_PLAYWRIGHT_BROWSER" = "true" ]; then
  # Playwright stores chromium in ~/.cache/ms-playwright/
  PW_CHROME=$(find "$HOME/.cache/ms-playwright" -name "chromium" -o -name "chrome" -type f 2>/dev/null | head -1)
  HELPER_CHROMIUM="${PW_CHROME:-chromium}"
else
  HELPER_CHROMIUM="${CHROMIUM_BIN:-chromium}"
fi

# Create screenshot helper script for Pi and GSD agents
cat > "$HOME/.local/bin/browser-screenshot" << SCREENSHOT
#!/bin/bash
set -e
URL="\${1:?Usage: browser-screenshot <url> [output-path]}"
OUTPUT="\${2:-/tmp/screenshot-\$(date +%s).png}"
VIEWPORT="\${BROWSER_VIEWPORT:-1280x720}"
WIDTH=\$(echo "\$VIEWPORT" | cut -dx -f1)
HEIGHT=\$(echo "\$VIEWPORT" | cut -dx -f2)
$HELPER_CHROMIUM \\
  --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage \\
  --window-size="\$WIDTH,\$HEIGHT" --screenshot="\$OUTPUT" --hide-scrollbars \\
  "\$URL" 2>/dev/null
[ -f "\$OUTPUT" ] && echo "\$OUTPUT" || { echo "ERROR: Screenshot failed" >&2; exit 1; }
SCREENSHOT
chmod +x "$HOME/.local/bin/browser-screenshot"

# Create browser-html helper to dump rendered HTML
cat > "$HOME/.local/bin/browser-html" << BROWSERHTML
#!/bin/bash
set -e
URL="\${1:?Usage: browser-html <url>}"
$HELPER_CHROMIUM \\
  --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage \\
  --dump-dom "\$URL" 2>/dev/null
BROWSERHTML
chmod +x "$HOME/.local/bin/browser-html"

printf "${GREEN}[ok] Browser vision tools ready${RESET}\n"
printf "  Claude Code & OpenCode: Playwright MCP (navigate, screenshot, click, type)\n"
printf "  Pi & GSD: browser-screenshot <url> and browser-html <url>\n"
