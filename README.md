# HostAIBot SDK

OpenClaw plugin for [hostaibot.com](https://hostaibot.com) — managed AI agent hosting.

## Installation

```bash
# Via OpenClaw plugin system
openclaw install hostaibot

# Or via npm
npm install hostaibot
```

## Configuration

The plugin is configured through OpenClaw's plugin config system. Set values via:

1. **Environment variables** (recommended for Docker):
   ```bash
   HOSTAIBOT_INSTANCE_TOKEN=your-token-here
   HOSTAIBOT_CONTROL_PLANE_URL=https://api.hostaibot.com  # optional
   ```

2. **OpenClaw config file** (`openclaw.json`):
   ```json
   {
     "plugins": {
       "hostaibot": {
         "instanceToken": "your-token-here",
         "enableBranding": true
       }
     }
   }
   ```

3. **OpenClaw GUI**: Settings → Plugins → HostAIBot

### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `instanceToken` | string | — | Token from your [dashboard](https://hostaibot.com/dashboard) |
| `controlPlaneUrl` | string | `https://api.hostaibot.com` | API endpoint |
| `heartbeatIntervalMs` | number | `30000` | Heartbeat interval (ms) |
| `enableBranding` | boolean | `true` | Replace OpenClaw branding in pairing messages |

## Features

- **Control Plane Connection** — persistent WebSocket to hostaibot.com with exponential backoff
- **Pairing Management** — RPC methods: `pairing.list`, `pairing.approve`, `pairing.reject`
- **Pairing File Watcher** — monitors credential files and broadcasts pairing events
- **Webhook Endpoint** — HMAC-signed push commands from the control plane
- **Branding** — automatic HostAIBot branding in pairing messages
- **Status API** — `hostaibot.status` RPC method for connection diagnostics

## Development

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run by category
npm run test:unit
npm run test:integration
npm run test:smoke

# Type check
npm run typecheck

# Build
npm run build
```

## License

Proprietary — see [LICENSE](./LICENSE)
