#!/bin/bash
# Automatic installation script for OpenClaw + OpenCode SDK
# Usage: chmod +x install.sh && ./install.sh

set -e

echo "========================================="
echo "  OpenClaw + OpenCode SDK Installer"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Functions
info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check Node.js
info "Checking Node.js..."
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
info "Checking OpenCode CLI..."
if ! command -v opencode &> /dev/null; then
    warn "OpenCode CLI not found. Installing..."
    npm install -g opencode-ai
else
    info "OpenCode CLI already installed ✓"
fi

# Install OpenCode SDK if not exists
info "Checking OpenCode SDK..."
if [ ! -d "$(npm root -g)/@opencode-ai/sdk" ]; then
    warn "OpenCode SDK not found. Installing..."
    npm install -g @opencode-ai/sdk
else
    info "OpenCode SDK already installed ✓"
fi

# Install OpenClaw if not exists
info "Checking OpenClaw..."
if ! command -v openclaw &> /dev/null; then
    warn "OpenClaw not found. Installing..."
    npm install -g openclaw-ai
else
    info "OpenClaw already installed ✓"
fi

# Create directories
info "Creating directory structure..."
mkdir -p ~/.openclaw/logs

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

info "Copying configuration files..."

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
info "Generating secure gateway token..."
TOKEN=$(openssl rand -hex 32 2>/dev/null || echo "dev-token-$(date +%s)")
sed -i "s/\"CHANGE_ME\"/\"$TOKEN\"/g" ~/.openclaw/openclaw.json
info "Gateway token generated ✓"

# Create start script
info "Creating start script..."
cat > ~/.openclaw/start-openclaw.sh << 'SCRIPT'
#!/bin/bash
LOG_DIR="$HOME/.openclaw/logs"
mkdir -p "$LOG_DIR"

check_port() {
    ss -tlnp 2>/dev/null | grep -q ":$1 " && return 0 || return 1
}

if ! check_port 5100; then
    echo "[$(date)] Starting OpenCode SDK..."
    nohup opencode serve --hostname=127.0.0.1 --port=5100 > "$LOG_DIR/opencode-sdk.log" 2>&1 &
    sleep 5
fi

if ! check_port 5200; then
    echo "[$(date)] Starting proxy..."
    cd ~/.openclaw
    nohup node opencode-proxy.js > "$LOG_DIR/proxy.log" 2>&1 &
    sleep 2
fi

if ! check_port 18789; then
    echo "[$(date)] Starting OpenClaw..."
    nohup openclaw > "$LOG_DIR/openclaw.log" 2>&1 &
fi

echo "Services started:"
echo "  - OpenCode SDK: http://127.0.0.1:5100"
echo "  - Proxy: http://127.0.0.1:5200"
echo "  - OpenClaw: http://127.0.0.1:18789"
SCRIPT
chmod +x ~/.openclaw/start-openclaw.sh

# Create stop script
info "Creating stop script..."
cat > ~/.openclaw/stop-openclaw.sh << 'SCRIPT'
#!/bin/bash
echo "[$(date)] Stopping services..."
pkill -f "opencode serve.*port=5100" 2>/dev/null || true
pkill -f "opencode-proxy.js" 2>/dev/null || true
pkill -f "^openclaw$" 2>/dev/null || true
echo "[$(date)] Services stopped"
SCRIPT
chmod +x ~/.openclaw/stop-openclaw.sh

# Copy systemd service
info "Setting up systemd service..."
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
echo "   systemctl --user enable openclaw"
echo "   systemctl --user start openclaw"
echo ""
echo "3. Open OpenClaw in browser:"
echo "   http://127.0.0.1:18789"
echo ""
echo "4. Select an OpenCode model:"
echo "   - Big Pickle (recommended)"
echo "   - MiMo V2 Pro Free"
echo "   - MiMo V2 Omni Free"
echo ""
