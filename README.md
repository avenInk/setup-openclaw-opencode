# OpenClaw + OpenCode SDK Setup

This repository contains the necessary files to configure OpenClaw to use OpenCode's free models (Big Pickle, MiMo V2, etc.) through the OpenCode SDK.

## No API Key Required

This setup allows you to use OpenCode's free models (Big Pickle, MiMo V2 Pro, MiMo V2 Omni, MiniMax, Nemotron) **without needing an API key**. The same models and limits available in the OpenCode CLI TUI are now accessible through OpenClaw's web interface.

## ⚠️ Security Notice

**NEVER commit API keys or tokens to this repository!**

- The `openclaw.json` file contains placeholder values for all sensitive fields
- Gateway tokens must be changed from `CHANGE_ME` to a secure value
- Environment variables for API keys are left empty
- Review the `.gitignore` file to ensure no sensitive data is committed

## ⚠️ Disclaimer

**This project is for educational and personal use only.**

- This setup uses the official OpenCode SDK and free models provided by OpenCode
- Use at your own risk. The author is not responsible for any issues or damages
- This is not affiliated with, endorsed by, or connected to OpenCode or its parent companies
- Before using this for commercial purposes, please review OpenCode's Terms of Service
- The free models may have usage limits or rate restrictions imposed by OpenCode
- If you're unsure about compliance, contact OpenCode directly before using this setup

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenClaw (UI/Gateway)                   │
│                     http://127.0.0.1:18789                  │
└────────────────────────────┬────────────────────────────────┘
                             │ OpenAI-compatible API
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              opencode-proxy.js (Port 5200)                  │
│        Translates OpenAI API → OpenCode SDK format          │
│                  SECURE: localhost only                     │
└────────────────────────────┬────────────────────────────────┘
                             │ OpenCode SDK
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              OpenCode SDK Server (Port 5100)               │
│                     opencode serve                          │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    OpenCode Models                          │
│  • Big Pickle (200k context)                                │
│  • MiMo V2 Pro Free (1M context)                            │
│  • MiMo V2 Omni Free (images supported)                     │
│  • MiniMax M2.5 Free                                       │
│  • Nemotron 3 Super Free                                   │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

- **Node.js** 18 or higher
- **npm** package manager
- **Linux/macOS** (Windows WSL should work too)

## Quick Installation

### Option 1: Automated Script

```bash
# Clone this repository
git clone https://github.com/avenInk/setup-openclaw-opencode
cd openclaw-opencode-setup

# Run the installer
chmod +x install.sh
./install.sh
```

### Option 2: Manual Installation

Follow the steps below:

#### Step 1: Install Dependencies

```bash
# Install OpenCode CLI
npm install -g opencode-ai

# Install OpenCode SDK
npm install -g @opencode-ai/sdk

# Install OpenClaw
npm install -g openclaw-ai
```

#### Step 2: Copy Configuration Files

```bash
# Create OpenClaw config directory
mkdir -p ~/.openclaw/logs

# Copy the files from this repository to ~/.openclaw/
cp openclaw.json ~/.openclaw/
cp opencode-proxy.js ~/.openclaw/
```

#### Step 3: Generate a Secure Gateway Token

Edit `~/.openclaw/openclaw.json` and replace `"CHANGE_ME"` in the gateway.auth.token field with a secure random token:

```bash
# Generate a random token
openssl rand -hex 32
```

#### Step 4: Start Services

```bash
# Option A: Using the start script
~/.openclaw/start-openclaw.sh

# Option B: Manual startup
# Terminal 1: Start OpenCode SDK
opencode serve --hostname=127.0.0.1 --port=5100 &

# Terminal 2: Start proxy
cd ~/.openclaw && node opencode-proxy.js &

# Terminal 3: Start OpenClaw
openclaw
```

## Available Models

| Model | Context Window | Best For |
|-------|---------------|----------|
| Big Pickle | 200,000 | General coding, recommended |
| MiMo V2 Pro Free | 1,048,576 | Large projects, maximum context |
| MiMo V2 Omni Free | 262,144 | Image analysis |
| MiniMax M2.5 Free | 100,000 | General use |
| Nemotron 3 Super Free | 100,000 | General use |

**Recommendation:** Use **Big Pickle** for most coding tasks. Use **MiMo V2 Pro Free** for large projects that need more context.

## Auto-Start on Boot

### Using systemd (Linux)

```bash
# Copy the service file
mkdir -p ~/.config/systemd/user
cp openclaw.service ~/.config/systemd/user/

# Enable and start
systemctl --user daemon-reload
systemctl --user enable openclaw
systemctl --user start openclaw

# Check status
systemctl --user status openclaw
```

### Using Crontab

```bash
crontab -e

# Add this line:
@reboot /home/YOUR_USERNAME/.openclaw/start-openclaw.sh
```

## Verification

### Check All Services Running

```bash
ss -tlnp | grep -E "(5100|5200|18789)"
```

Expected output:
```
LISTEN 127.0.0.1:5100   - OpenCode SDK
LISTEN 127.00.1:5200    - Proxy
LISTEN 127.0.0.1:18789  - OpenClaw
```

### Test the Proxy

```bash
curl http://127.0.0.1:5200/v1/models
```

Should return:
```json
{
  "data": [
    {"id": "opencode/big-pickle", "name": "Big Pickle"},
    {"id": "opencode/mimo-v2-pro-free", "name": "MiMo V2 Pro Free"},
    ...
  ]
}
```

### Test a Model

```bash
curl -X POST http://127.0.0.1:5200/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "opencode/big-pickle",
    "messages": [{"role": "user", "content": "Say hello"}],
    "stream": false
  }'
```

### Open the UI

Navigate to: **http://127.0.0.1:18789**

## Security Features

1. **Localhost Only Binding**: All services bind to `127.0.0.1` only
2. **No Public Ports**: Nothing is exposed to the internet
3. **No Embedded API Keys**: Configuration uses placeholders
4. **Secure Gateway Token**: Must be changed from default

### Port Status

| Port | Service | Binding | Public Access |
|------|---------|---------|---------------|
| 5100 | OpenCode SDK | 127.0.0.1 | ❌ No |
| 5200 | Proxy | 127.0.0.1 | ❌ No |
| 18789 | OpenClaw | 127.0.0.1 | ❌ No |

## Troubleshooting

### Port Already in Use

```bash
# Find what's using the port
lsof -i :5200

# Kill the process
pkill -f opencode-proxy.js
```

### Proxy Not Responding

```bash
# Check proxy logs
cat ~/.openclaw/logs/proxy.log

# Restart the proxy
cd ~/.openclaw
node opencode-proxy.js
```

### Models Not Showing in OpenClaw

1. Restart OpenClaw:
   ```bash
   pkill openclaw
   openclaw
   ```
2. Verify `openclaw.json` has the models configured
3. Check the proxy is responding (see test above)

### Token Statistics Not Working

This is a limitation of the OpenCode SDK - it doesn't always return token usage information. The proxy attempts to extract this data when available.

## File Descriptions

| File | Description |
|------|-------------|
| `opencode-proxy.js` | HTTP proxy that translates OpenAI API calls to OpenCode SDK |
| `openclaw.json` | OpenClaw configuration with model definitions |
| `install.sh` | Automated installation script |
| `start-openclaw.sh` | Script to start all services |
| `stop-openclaw.sh` | Script to stop all services |
| `openclaw.service` | systemd service unit file |

## OpenClaw CLI Usage

```bash
# Terminal UI (similar to OpenCode CLI)
openclaw tui

# List sessions
openclaw sessions list

# Check status
openclaw status

# Send a message
openclaw message send --target user@domain --message "Hello"

# Manage channels (Telegram, WhatsApp, etc.)
openclaw channels
```

## Adding Other Providers (Optional)

If you want to add more model providers (OpenRouter, Groq, etc.), edit `~/.openclaw/openclaw.json` and add their configurations. Make sure to include your own API keys in the `env` section.

## License

This setup is provided as-is. Follow OpenCode and OpenClaw's terms of service.

## Support

- [OpenClaw Documentation](https://docs.openclaw.ai)
- [OpenCode Documentation](https://opencode.ai)
- [OpenClaw GitHub](https://github.com/composiohq/openclaw)
- [OpenCode GitHub](https://github.com/anomalyco/opencode)

---

**Important:** Always keep your API keys and tokens secure. Never commit them to version control!
