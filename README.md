# Community Agent Bridge (CAB)

> **Open Source AI Agent Bridge for Microsoft Teams Meetings**

A minimalistic desktop client for Azure Communication Services built with Tauri, React, and TypeScript. Enables AI-powered agent responses in Teams meetings through integration with Microsoft Copilot Studio and Azure AI Foundry.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Development](#development)
- [Building & Distribution](#building--distribution)
- [Security](#security)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Overview

Community Agent Bridge (CAB) allows you to bring AI agents into Microsoft Teams meetings. When participants mention the agent's name and ask questions, the system automatically:

1. Detects the question from closed captions
2. Sends it to your configured AI agent (Copilot Studio or Azure AI Foundry)
3. Receives the response
4. Speaks the answer into the meeting using Text-to-Speech

**Use Cases:**
- Customer service bots joining support calls
- Knowledge base assistants for internal meetings
- AI note-takers and meeting summarizers
- Automated Q&A during presentations

---

## Features

| Feature | Description |
|---------|-------------|
| 🚀 **Minimal Bundle Size** | ~3-10 MB using Tauri's native webview (vs 150+ MB for Electron) |
| 📞 **Azure Communication Services** | Full voice/video calling integration for Teams meetings |
| 🤖 **Multi-Agent Support** | Connect to Copilot Studio (Auth/Anonymous) or Azure AI Foundry agents |
| 🎤 **Text-to-Speech** | Azure Speech SDK for natural voice responses |
| 🧠 **Intent Detection** | AI-powered question detection using GPT models |
| 📝 **Live Captions** | Real-time closed caption processing and display |
| 📊 **Call Analytics** | Session tracking with AI-generated meeting summaries |
| 🔐 **Secure Configuration** | System credential manager for secrets (Windows/macOS/Linux) |
| 💻 **Cross-Platform** | Windows, macOS, and Linux support |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Teams Agent Bridge                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   React +   │  │   Zustand   │  │    Azure Services       │  │
│  │ TypeScript  │  │   Stores    │  │  • Communication Svcs   │  │
│  │     UI      │  │             │  │  • Speech Services      │  │
│  └──────┬──────┘  └──────┬──────┘  │  • OpenAI              │  │
│         │                │         └───────────┬─────────────┘  │
│         └────────┬───────┘                     │                │
│                  ▼                             │                │
│  ┌─────────────────────────────────────────────┼──────────────┐ │
│  │              Provider Architecture          │              │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────▼────────┐     │ │
│  │  │   Meeting    │  │    Agent     │  │   Speech     │     │ │
│  │  │  Provider    │  │  Providers   │  │  Provider    │     │ │
│  │  │  (ACS)       │  │  • Copilot   │  │  (TTS)       │     │ │
│  │  │              │  │  • Foundry   │  │              │     │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘     │ │
│  └────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                     Tauri (Rust Backend)                        │
│                   Native OS Integration                         │
└─────────────────────────────────────────────────────────────────┘
```

### Project Structure

```
teams_agent_bridge/
├── src-react/                    # React + TypeScript frontend
│   ├── components/              # UI components (stages, tabs, layout)
│   ├── hooks/                   # Custom React hooks
│   ├── providers/               # Service providers (agent, meeting, speech)
│   ├── services/                # API service layer
│   ├── stores/                  # Zustand state management
│   └── types/                   # TypeScript type definitions
├── src-tauri/                   # Tauri backend (Rust)
│   ├── src/main.rs             # Rust entry point
│   └── tauri.conf.json         # Tauri configuration
├── index.html                   # Main application entry
├── package.json                 # Node dependencies
└── .env.example                 # Environment template
```

---

## Prerequisites

Before building, ensure you have:

1. **Node.js** (v18 or later) - [Download](https://nodejs.org/)
2. **Rust** (latest stable) - [Install via rustup](https://rustup.rs/)
3. **Visual Studio Build Tools** (Windows only)
   - Install from [Visual Studio](https://visualstudio.microsoft.com/downloads/)
   - Select "Desktop development with C++"

---

## Quick Start

### 1. Clone and Install

```powershell
git clone https://github.com/your-org/teams_agent_bridge.git
cd teams_agent_bridge
npm install
```

### 2. Configure Environment

```powershell
# Copy the environment template
copy .env.example .env

# Edit with your credentials (NEVER commit this file!)
notepad .env
```

### 3. Run in Development Mode

```powershell
npm run tauri:dev
```

### 4. Using the App

1. **Setup Stage**: Configure your Azure services (ACS, Speech, OpenAI)
2. **Agent Setup**: Add your AI agent (Copilot Studio or Azure AI Foundry)
3. **Connect**: Enter a Teams meeting URL and join
4. **Meeting**: Agent automatically responds when mentioned in captions

---

## Configuration

### Required Environment Variables

```env
# Azure Communication Services
VITE_ACS_ENDPOINT=https://your-acs.communication.azure.com/
VITE_ACS_ACCESS_KEY=your-access-key

# Azure Speech Service (for TTS)
VITE_SPEECH_KEY=your-speech-key
VITE_SPEECH_REGION=eastus

# Azure OpenAI (for intent detection & TTS preprocessing)
VITE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/openai/v1/
VITE_OPENAI_API_KEY=your-api-key
VITE_OPENAI_DEPLOYMENT=gpt-4

# Agent Configuration
VITE_AGENT_NAME=Your Agent Name
```

### Agent Types

#### Copilot Studio (Microsoft Auth)
- Uses OAuth2 Device Code Flow
- Requires: `appClientId`, `tenantId`, `environmentId`, `agentIdentifier`

#### Copilot Studio (Anonymous)
- Uses Direct Line API
- Requires: `directLineSecret` or `tokenEndpoint`

#### Azure AI Foundry
- Uses Service Principal authentication
- Requires: `projectEndpoint`, `agentName`, `tenantId`, `clientId`, `clientSecret`

---

## Development

### Available Scripts

```powershell
npm run dev           # Vite dev server only
npm run tauri:dev     # Full Tauri development mode with hot reload
npm run build         # Build frontend
npm run tauri:build   # Build production executable
npm run test          # Run tests with Vitest
npm run lint          # Run ESLint
npm run format        # Format code with Prettier
npm run typecheck     # TypeScript type checking
```

### Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, shadcn/ui
- **State Management**: Zustand
- **Backend**: Tauri (Rust)
- **Testing**: Vitest, Testing Library
- **Build**: Vite

---

## Building & Distribution

### Build Production Executable

```powershell
npm run tauri:build
```

Output locations:
- **Executable**: `src-tauri/target/release/teams-agent-bridge.exe`
- **Installer**: `src-tauri/target/release/bundle/`

### Build Size Optimization

The `Cargo.toml` is configured for minimal size:
- LTO (Link Time Optimization) enabled
- Symbol stripping
- Size optimization (`opt-level = "s"`)

**Expected size: ~3-10 MB** (vs 150+ MB for Electron)

### Distribution Options

| Platform | Formats |
|----------|---------|
| Windows | `.msi` installer, `.exe` portable |
| macOS | `.dmg`, `.app` bundle |
| Linux | `.deb`, `.AppImage`, `.rpm` |

---

## Security

### ⚠️ Critical: Never Commit Credentials

This project follows security best practices:

- ✅ **No hardcoded credentials** in source code
- ✅ **`.env` files are gitignored**
- ✅ **Runtime configuration** via Settings UI
- ✅ **System Credential Manager** for all secrets (Windows Credential Manager, macOS Keychain, Linux Secret Service)

### Secure Credential Storage

All sensitive credentials are stored in the OS-native credential manager via the `keyring` crate:

| Credential Type | Storage Key Pattern |
|-----------------|---------------------|
| ACS Access Key | `config.accessKey` |
| Azure Speech Key | `config.speech.key` |
| Azure OpenAI API Key | `config.openai.apiKey` |
| Agent Client Secret | `agent.<id>.clientSecret` |
| Agent API Key | `agent.<id>.apiKey` |
| Direct Line Secret | `agent.<id>.directLineSecret` |

Non-sensitive configuration (endpoints, regions, agent names) remains in localStorage.

### Verification

```powershell
# Verify no secrets are exposed
node verify-security.js
```

### Best Practices

1. Never commit `.env` files
2. Use environment variables for all secrets
3. Rotate credentials regularly
4. Use separate credentials for dev/test/prod

---

## Contributing

We welcome contributions! Here's how to get started:

### Getting Started

1. **Fork** the repository
2. **Clone** your fork locally
3. **Create a branch** for your feature: `git checkout -b feature/my-feature`
4. **Make your changes** and test thoroughly
5. **Commit** with clear messages: `git commit -m "feat: add new feature"`
6. **Push** to your fork: `git push origin feature/my-feature`
7. **Open a Pull Request** against `main`

### Development Guidelines

- Follow the existing code style (ESLint + Prettier configured)
- Write TypeScript with proper types (avoid `any`)
- Add tests for new features
- Update documentation as needed
- Keep commits atomic and well-described

### Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation only
- `style:` Code style (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

### Code of Conduct

Be respectful and inclusive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/).

---

## Troubleshooting

### Build Errors

| Issue | Solution |
|-------|----------|
| Rust not found | Run `rustup update` and restart terminal |
| Windows build fails | Install Visual Studio Build Tools with C++ |
| Node modules issues | Delete `node_modules` and run `npm install` |

### Runtime Errors

| Issue | Solution |
|-------|----------|
| CSP Errors | CSP is disabled for dev; enable for production |
| Token Errors | Verify ACS token is valid and not expired |
| Video Issues | Check camera permissions in OS settings |
| Agent not responding | Verify agent is published and credentials are correct |

### Common Issues

**"Failed to get Direct Line token"**
- Verify `environmentId` and `agentIdentifier` are correct
- Check that agent is published in Copilot Studio

**"Sign-in popup was blocked"**
- Enable popups for the application
- Try signing in again

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- Microsoft Azure Communication Services
- Microsoft Copilot Studio
- Tauri Framework
- The open source community

---

**Made with ❤️ by the Community**
