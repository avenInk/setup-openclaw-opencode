#!/bin/bash
# Automatic installation script for OpenClaw + OpenCode SDK
# Usage: chmod +x install.sh && ./install.sh

set -e

echo "========================================="
echo "  OpenClaw + OpenCode SDK Installer v2.0"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Functions
info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
step() { echo -e "${CYAN}[STEP]${NC} $1"; }

# Check Node.js
step "Checking Node.js..."
if ! command -v node &> /dev/null; then
    error "Node.js is not installed. Install from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    error "Node.js 18+ required. Current version: $(node -v)"
    exit 1
fi
info "Node.js $(node -v) ✓"

# Check npm
if ! command -v npm &> /dev/null; then
    error "npm is not installed"
    exit 1
fi
info "npm $(npm -v) ✓"

# Install OpenCode CLI if not exists
step "Checking OpenCode CLI..."
if ! command -v opencode &> /dev/null; then
    warn "OpenCode CLI not found. Installing..."
    npm install -g opencode-ai
else
    info "OpenCode CLI already installed ✓"
fi

# Install OpenCode SDK if not exists
step "Checking OpenCode SDK..."
if [ ! -d "$(npm root -g)/@opencode-ai/sdk" ]; then
    warn "OpenCode SDK not found. Installing..."
    npm install -g @opencode-ai/sdk
else
    info "OpenCode SDK already installed ✓"
fi

# Install OpenClaw if not exists
step "Checking OpenClaw..."
if ! command -v openclaw &> /dev/null; then
    warn "OpenClaw not found. Installing..."
    npm install -g openclaw-ai
else
    info "OpenClaw already installed ✓"
fi

# Create directories
step "Creating directory structure..."
mkdir -p ~/.openclaw/logs

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

step "Copying configuration files..."

# Copy proxy
if [ -f "$SCRIPT_DIR/opencode-proxy.js" ]; then
    cp "$SCRIPT_DIR/opencode-proxy.js" ~/.openclaw/
    info "opencode-proxy.js copied ✓"
else
    error "opencode-proxy.js not found in $SCRIPT_DIR"
    exit 1
fi

# Copy OpenClaw config
if [ -f "$SCRIPT_DIR/openclaw.json" ]; then
    cp "$SCRIPT_DIR/openclaw.json" ~/.openclaw/
    info "openclaw.json copied ✓"
else
    warn "openclaw.json not found, using defaults..."
fi

# Generate secure gateway token
step "Generating secure gateway token..."
TOKEN=$(openssl rand -hex 32 2>/dev/null || echo "dev-token-$(date +%s)")
sed -i "s/\"CHANGE_ME\"/\"$TOKEN\"/g" ~/.openclaw/openclaw.json
info "Gateway token generated ✓"

# Create start script with health verification
step "Creating start script..."
cat > ~/.openclaw/start-openclaw.sh << 'SCRIPT'
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

# Start OpenCode SDK
if ! check_port 5100; then
    echo "[$(date)] Starting OpenCode SDK..."
    nohup opencode serve --hostname=127.0.0.1 --port=5100 > "$LOG_DIR/opencode-sdk.log" 2>&1 &
    wait_for_port 5100 "OpenCode SDK" 15
fi

# Start proxy (only after SDK is confirmed)
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

# Start OpenClaw (only after proxy is confirmed)
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

# Quick health check on the proxy
if check_port 5200; then
    HEALTH=$(curl -s http://127.0.0.1:5200/health 2>/dev/null)
    if [ -n "$HEALTH" ]; then
        echo "  Proxy health : $HEALTH"
    fi
fi
SCRIPT
chmod +x ~/.openclaw/start-openclaw.sh

# Create stop script
step "Creating stop script..."
cat > ~/.openclaw/stop-openclaw.sh << 'SCRIPT'
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
chmod +x ~/.openclaw/stop-openclaw.sh

# Copy systemd service
step "Setting up systemd service..."
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/openclaw.service << 'SERVICE'
[Unit]
Description=OpenClaw with OpenCode
After=network.target

[Service]
Type=simple
WorkingDirectory=%h/.openclaw
ExecStart=%h/.openclaw/start-openclaw.sh
ExecStop=%h/.openclaw/stop-openclaw.sh
Restart=on-failure
RestartSec=10
Environment=LOG_LEVEL=info

[Install]
WantedBy=default.target
SERVICE

info "Installation complete ✓"
echo ""
echo "========================================="
echo "  Next Steps:"
echo "========================================="
echo ""
echo "1. Start services manually:"
echo "   ~/.openclaw/start-openclaw.sh"
echo ""
echo "2. Or enable auto-start:"
echo "   systemctl --user daemon-reload"
echo "   systemctl --user enable openclaw"
echo "   systemctl --user start openclaw"
echo ""
echo "3. Open OpenClaw in browser:"
echo "   http://127.0.0.1:18789"
echo ""
echo "4. Verify health:"
echo "   curl http://127.0.0.1:5200/health"
echo ""
echo "5. Select an OpenCode model:"
echo "   - Big Pickle (recommended)"
echo "   - MiMo V2 Pro Free (1M context)"
echo "   - MiMo V2 Omni Free (images)"
echo "   - MiniMax M2.5 Free"
echo "   - Nemotron 3 Super Free"
echo ""
echo "6. Optional env vars (set before starting):"
echo "   LOG_LEVEL=debug      (debug|info|warn|error)"
echo "   REQUEST_TIMEOUT_MS=120000"
echo "   STREAM_CHUNK_SIZE=80"
echo ""
