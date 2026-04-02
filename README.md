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
│              opencode-proxy.js v2.0 (Port 5200)             │
│        Translates OpenAI API → OpenCode SDK format          │
│  ✓ Full conversation history  ✓ Per-model sessions          │
│  ✓ Chunked streaming          ✓ Timeout & validation        │
│  ✓ Health check endpoint      ✓ Graceful shutdown           │
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
cd setup-openclaw-opencode

# Run the installer
chmod +x install.sh
./install.sh
```

The installer will:
1. Check and install Node.js dependencies (OpenCode CLI, SDK, OpenClaw)
2. Copy `opencode-proxy.js` and `openclaw.json` to `~/.openclaw/`
3. Generate a secure gateway token automatically
4. Create `start-openclaw.sh` and `stop-openclaw.sh` scripts
5. Set up a systemd service for auto-start on boot

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

## Updating

When a new version of the proxy is released, update safely with:

### Option 1: Update Script (Recommended)

```bash
cd ~/.openclaw/setup-openclaw-opencode  # or wherever you cloned it
chmod +x update.sh
./update.sh
```

The update script will:
1. Pull the latest changes from GitHub (if it's a git repo)
2. **Backup** your current files to `~/.openclaw/backups/<timestamp>/`
3. **Preserve** your existing gateway token
4. Stop running services
5. Copy the new `opencode-proxy.js` and `openclaw.json`
6. Regenerate start/stop scripts
7. Restart all services

### Option 2: Manual Update

```bash
# 1. Stop services
~/.openclaw/stop-openclaw.sh

# 2. Pull latest changes
cd ~/.openclaw/setup-openclaw-opencode
git pull

# 3. Copy the proxy (always safe to overwrite)
cp opencode-proxy.js ~/.openclaw/

# 4. For openclaw.json — preserve your token:
#    Save your current token first
TOKEN=$(grep -o '"token"[[:space:]]*:[[:space:]]*"[^"]*"' ~/.openclaw/openclaw.json | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
cp openclaw.json ~/.openclaw/
sed -i "s/\"CHANGE_ME\"/\"$TOKEN\"/g" ~/.openclaw/openclaw.json

# 5. Restart services
~/.openclaw/start-openclaw.sh
```

> **Note:** `opencode-proxy.js` can always be safely overwritten — it has no user-specific data. `openclaw.json` contains your gateway token which must be preserved.

## Available Models

| Model | Context Window | Best For |
|-------|---------------|----------|
| Big Pickle | 200,000 | General coding, recommended |
| Big Pickle (High/Max) | 200,000 | Higher quality, slower |
| MiMo V2 Pro Free | 1,048,576 | Large projects, maximum context |
| MiMo V2 Omni Free | 262,144 | Image analysis + coding |
| MiniMax M2.5 Free | 100,000 | General use |
| Nemotron 3 Super Free | 100,000 | General use |

**Recommendation:** Use **Big Pickle** for most coding tasks. Use **MiMo V2 Pro Free** for large projects that need more context. Use **MiMo V2 Omni Free** if you need image understanding.

## Configuration

### Environment Variables

The proxy supports the following environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PROXY_PORT` | `5200` | Port for the proxy server |
| `SDK_URL` | `http://127.0.0.1:5100` | OpenCode SDK URL |
| `BIND_HOST` | `127.0.0.1` | Host to bind to |
| `REQUEST_TIMEOUT_MS` | `120000` | Timeout for SDK requests (ms) |
| `STREAM_CHUNK_SIZE` | `80` | Characters per streaming chunk |
| `STREAM_CHUNK_DELAY_MS` | `15` | Delay between stream chunks (ms) |
| `LOG_LEVEL` | `info` | Logging level: debug/info/warn/error |
| `AUTO_APPROVE_PERMISSIONS` | `true` | Auto-approve file read/write permissions |
| `AUTO_ANSWER_QUESTIONS` | `true` | Auto-answer model questions (picks first option) |
| `POLL_INTERVAL_MS` | `500` | How often to check for pending permissions/questions |
| `REASONING_FORMAT` | `blockquote` | How to display thinking text (see below) |

### Reasoning/Thinking Display

Big Pickle and other reasoning models show their "thinking process" before answering. The `REASONING_FORMAT` variable controls how this is displayed:

| Format | Description |
|--------|-------------|
| `blockquote` | Shows thinking as `> quoted text` with 💭 prefix (**default**, subtle) |
| `details` | Wraps in a collapsible `<details>` block |
| `hidden` | Hides thinking text completely, shows only the answer |
| `inline` | Shows thinking as regular text (no formatting) |

Example:
```bash
# Hide thinking, show debug logs, increase timeout
REASONING_FORMAT=hidden LOG_LEVEL=debug REQUEST_TIMEOUT_MS=180000 node opencode-proxy.js
```

### Permissions & Questions

When the model tries to read/write files or asks the user questions, OpenCode normally shows a dialog in its TUI for manual approval. Since OpenClaw doesn't have this mechanism, the proxy **automatically handles these**:

- **Permissions**: Auto-approved with `always` policy (the model can freely read/write files)
- **Questions**: Auto-answered by picking the first available option
- Set `AUTO_APPROVE_PERMISSIONS=false` to disable (will cause sessions to hang!)
- Set `AUTO_ANSWER_QUESTIONS=false` to disable (model may wait indefinitely)

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
LISTEN 127.0.0.1:5200   - Proxy
LISTEN 127.0.0.1:18789  - OpenClaw
```

### Health Check (new in v2.0)

```bash
curl http://127.0.0.1:5200/health
```

Expected output:
```json
{
  "status": "ok",
  "proxy": "running",
  "sdk": "reachable",
  "uptime": 123.45,
  "sessions": 0
}
```

### Test the Proxy

```bash
curl http://127.0.0.1:5200/v1/models
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
5. **Input Validation**: Malformed requests are rejected with clear errors
6. **Timeout Protection**: SDK requests timeout after configurable duration

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

# Check health endpoint
curl http://127.0.0.1:5200/health

# Restart the proxy with debug logging
cd ~/.openclaw
LOG_LEVEL=debug node opencode-proxy.js
```

### Models Not Showing in OpenClaw

1. Restart OpenClaw:
   ```bash
   pkill openclaw
   openclaw
   ```
2. Verify `openclaw.json` has the models configured
3. Check the proxy is responding (see test above)

### Timeout Errors

If you get 504 timeout errors, increase the timeout:
```bash
REQUEST_TIMEOUT_MS=180000 node opencode-proxy.js
```

### Token Statistics Not Working

This is a limitation of the OpenCode SDK — it doesn't always return token usage information. The proxy attempts to extract this data when available.

## Changelog

### v3.0 (Current)

#### Major: Permission & Question Auto-Handler
- **Auto-approve permissions**: Background poller monitors the SDK for pending `permission.asked` events and auto-approves them with `always` policy. This prevents sessions from hanging when the model tries to read/write files.
- **Auto-answer questions**: When the model asks the user a question (yes/no, multiple choice), the proxy auto-picks the first option. This prevents sessions from freezing in OpenClaw.
- **Session permission rules**: New sessions are created with `{ permission: '*', pattern: '**', action: 'allow' }` to pre-authorize all operations.

#### Major: Reasoning/Thinking Separation
- **ReasoningPart vs TextPart**: The proxy now distinguishes `type: "reasoning"` parts from `type: "text"` parts in SDK responses. Thinking text is formatted separately (blockquote by default) instead of being mixed into the response.
- **Configurable display**: `REASONING_FORMAT` env var controls how thinking text appears: `blockquote`, `details` (collapsible), `hidden`, or `inline`.

#### Major: Auto-Reconnection
- **Retry with fresh session**: If a prompt fails (stale session, timeout, SDK error), the proxy automatically clears the session and retries once with a new session.
- **System prompt forwarding**: The `system` role from OpenAI messages is now extracted and sent natively via the SDK's `system` parameter, not concatenated with user text.

### v2.0

#### Bug Fixes
- **Session per model**: Sessions are now cached by `auth + model + variant` instead of just auth key. Switching models no longer contaminates context.
- **Full conversation history**: All messages (system, user, assistant) are forwarded to the model, not just the last message.
- **Correct streaming**: Response is chunked progressively (not sent as one giant blob). Usage data sent before `[DONE]` per OpenAI spec.
- **Dynamic context window**: `context.available` now reflects the actual model's context window instead of hardcoded 200K.

#### New Features
- **Health check endpoint**: `GET /health` reports proxy/SDK status and uptime.
- **Request timeout**: SDK calls timeout after 120s (configurable) instead of hanging forever.
- **Input validation**: Malformed requests get clear 400 error messages.
- **Graceful shutdown**: SIGTERM/SIGINT are handled cleanly.
- **Structured logging**: Log levels (debug/info/warn/error) with emoji prefixes.
- **Environment variables**: All config is overridable via env vars.

#### Improvements
- **Single SDK client**: Reused across requests instead of creating a new one per request.
- **Centralized model catalog**: Models defined once in proxy code, response generated automatically.
- **Stale session cleanup**: If SDK returns an error, the session is cleared for retry.
- **Install script**: Now verifies each service actually started before proceeding to the next.

## File Descriptions

| File | Description |
|------|-------------|
| `opencode-proxy.js` | HTTP proxy v2.0 that translates OpenAI API calls to OpenCode SDK |
| `openclaw.json` | OpenClaw configuration with model definitions |
| `install.sh` | Automated installation script with health verification |
| `update.sh` | Safe update script that preserves token and creates backups |
| `start-openclaw.sh` | Script to start all services (generated by installer) |
| `stop-openclaw.sh` | Script to stop all services (generated by installer) |
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
