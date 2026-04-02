#!/bin/bash
# Update script for OpenClaw + OpenCode Proxy
# This safely updates the proxy without losing your gateway token or custom config.
# Usage: cd setup-openclaw-opencode && chmod +x update.sh && ./update.sh

set -e

echo "========================================="
echo "  OpenClaw Proxy Updater"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
step() { echo -e "${CYAN}[STEP]${NC} $1"; }

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
OPENCLAW_DIR="$HOME/.openclaw"
BACKUP_DIR="$OPENCLAW_DIR/backups/$(date +%Y%m%d-%H%M%S)"

# ── Pre-flight checks ──────────────────────────────────────────────────────
if [ ! -f "$SCRIPT_DIR/opencode-proxy.js" ]; then
    error "opencode-proxy.js not found in $SCRIPT_DIR"
    error "Run this script from the repository directory."
    exit 1
fi

if [ ! -d "$OPENCLAW_DIR" ]; then
    error "$OPENCLAW_DIR does not exist. Run install.sh first."
    exit 1
fi

# ── Step 1: Pull latest changes (if it's a git repo) ───────────────────────
step "Checking for latest version..."
if [ -d "$SCRIPT_DIR/.git" ]; then
    cd "$SCRIPT_DIR"
    CURRENT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    
    if git pull --ff-only 2>/dev/null; then
        LATEST=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
        if [ "$CURRENT" = "$LATEST" ]; then
            info "Already up to date ($CURRENT)"
        else
            info "Updated: $CURRENT → $LATEST"
        fi
    else
        warn "Could not auto-pull. Continuing with local files..."
    fi
    cd - > /dev/null
else
    warn "Not a git repository. Using local files as-is."
fi

# ── Step 2: Create backup ──────────────────────────────────────────────────
step "Creating backup..."
mkdir -p "$BACKUP_DIR"

if [ -f "$OPENCLAW_DIR/opencode-proxy.js" ]; then
    cp "$OPENCLAW_DIR/opencode-proxy.js" "$BACKUP_DIR/"
    info "Backed up opencode-proxy.js"
fi

if [ -f "$OPENCLAW_DIR/openclaw.json" ]; then
    cp "$OPENCLAW_DIR/openclaw.json" "$BACKUP_DIR/"
    info "Backed up openclaw.json"
fi

info "Backup saved to: $BACKUP_DIR"

# ── Step 3: Preserve existing token ────────────────────────────────────────
step "Preserving gateway token..."
EXISTING_TOKEN=""
if [ -f "$OPENCLAW_DIR/openclaw.json" ]; then
    # Extract existing token (handles JSON with grep+sed)
    EXISTING_TOKEN=$(grep -o '"token"[[:space:]]*:[[:space:]]*"[^"]*"' "$OPENCLAW_DIR/openclaw.json" | head -1 | sed 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
    
    if [ -n "$EXISTING_TOKEN" ] && [ "$EXISTING_TOKEN" != "CHANGE_ME" ]; then
        info "Found existing token: ${EXISTING_TOKEN:0:8}... (preserved)"
    else
        EXISTING_TOKEN=""
        warn "No custom token found — will generate a new one"
    fi
fi

# ── Step 4: Stop services ──────────────────────────────────────────────────
step "Stopping services..."
if [ -f "$OPENCLAW_DIR/stop-openclaw.sh" ]; then
    bash "$OPENCLAW_DIR/stop-openclaw.sh" 2>/dev/null || true
else
    pkill -f "opencode-proxy.js" 2>/dev/null || true
fi
sleep 1
info "Services stopped"

# ── Step 5: Update opencode-proxy.js ───────────────────────────────────────
step "Updating opencode-proxy.js..."
cp "$SCRIPT_DIR/opencode-proxy.js" "$OPENCLAW_DIR/"
info "opencode-proxy.js updated ✓"

# ── Step 6: Update openclaw.json (preserving token) ────────────────────────
step "Updating openclaw.json..."
cp "$SCRIPT_DIR/openclaw.json" "$OPENCLAW_DIR/"

if [ -n "$EXISTING_TOKEN" ]; then
    sed -i "s/\"CHANGE_ME\"/\"$EXISTING_TOKEN\"/g" "$OPENCLAW_DIR/openclaw.json"
    info "openclaw.json updated with preserved token ✓"
else
    TOKEN=$(openssl rand -hex 32 2>/dev/null || echo "dev-token-$(date +%s)")
    sed -i "s/\"CHANGE_ME\"/\"$TOKEN\"/g" "$OPENCLAW_DIR/openclaw.json"
    info "openclaw.json updated with new token ✓"
fi

# ── Step 7: Regenerate start/stop scripts ──────────────────────────────────
step "Regenerating start/stop scripts..."

cat > "$OPENCLAW_DIR/start-openclaw.sh" << 'SCRIPT'
#!/bin/bash
LOG_DIR="$HOME/.openclaw/logs"
mkdir -p "$LOG_DIR"

check_port() {
    ss -tlnp 2>/dev/null | grep -q ":$1 " && return 0 || return 1
}

wait_for_port() {
    local port=$1
    local name=$2
    local max_wait=$3
    local waited=0
    while ! check_port "$port" && [ "$waited" -lt "$max_wait" ]; do
        sleep 1
        waited=$((waited + 1))
    done
    if check_port "$port"; then
        echo "[$(date)] $name is ready on port $port (${waited}s)"
        return 0
    else
        echo "[$(date)] WARNING: $name failed to start on port $port after ${max_wait}s"
        return 1
    fi
}

if ! check_port 5100; then
    echo "[$(date)] Starting OpenCode SDK..."
    nohup opencode serve --hostname=127.0.0.1 --port=5100 > "$LOG_DIR/opencode-sdk.log" 2>&1 &
    wait_for_port 5100 "OpenCode SDK" 15
fi

if ! check_port 5200; then
    if check_port 5100; then
        echo "[$(date)] Starting proxy..."
        cd ~/.openclaw
        nohup node opencode-proxy.js > "$LOG_DIR/proxy.log" 2>&1 &
        wait_for_port 5200 "Proxy" 10
    else
        echo "[$(date)] ERROR: Cannot start proxy — OpenCode SDK not running on port 5100"
        exit 1
    fi
fi

if ! check_port 18789; then
    if check_port 5200; then
        echo "[$(date)] Starting OpenClaw..."
        nohup openclaw > "$LOG_DIR/openclaw.log" 2>&1 &
        wait_for_port 18789 "OpenClaw" 10
    else
        echo "[$(date)] ERROR: Cannot start OpenClaw — Proxy not running on port 5200"
        exit 1
    fi
fi

echo ""
echo "========================================="
echo "  Services Status"
echo "========================================="
echo "  OpenCode SDK : $(check_port 5100 && echo '✅ http://127.0.0.1:5100' || echo '❌ NOT RUNNING')"
echo "  Proxy        : $(check_port 5200 && echo '✅ http://127.0.0.1:5200' || echo '❌ NOT RUNNING')"
echo "  OpenClaw     : $(check_port 18789 && echo '✅ http://127.0.0.1:18789' || echo '❌ NOT RUNNING')"
echo "========================================="

if check_port 5200; then
    HEALTH=$(curl -s http://127.0.0.1:5200/health 2>/dev/null)
    if [ -n "$HEALTH" ]; then
        echo "  Proxy health : $HEALTH"
    fi
fi
SCRIPT
chmod +x "$OPENCLAW_DIR/start-openclaw.sh"

cat > "$OPENCLAW_DIR/stop-openclaw.sh" << 'SCRIPT'
#!/bin/bash
echo "[$(date)] Stopping services..."
pkill -f "opencode serve.*port=5100" 2>/dev/null || true
pkill -f "opencode-proxy.js" 2>/dev/null || true
pkill -f "^openclaw$" 2>/dev/null || true
sleep 1
echo "[$(date)] Verifying..."
for port in 5100 5200 18789; do
    if ss -tlnp 2>/dev/null | grep -q ":$port "; then
        echo "  WARNING: Port $port still in use"
    else
        echo "  Port $port: freed ✓"
    fi
done
echo "[$(date)] Done"
SCRIPT
chmod +x "$OPENCLAW_DIR/stop-openclaw.sh"

info "Start/stop scripts regenerated ✓"

# ── Step 8: Restart services ───────────────────────────────────────────────
step "Restarting services..."
bash "$OPENCLAW_DIR/start-openclaw.sh"

echo ""
echo "========================================="
echo "  Update Complete ✓"
echo "========================================="
echo ""
echo "  Backup at: $BACKUP_DIR"
echo "  To rollback: cp $BACKUP_DIR/* $OPENCLAW_DIR/"
echo ""
