# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Build specific package
npm run build -w packages/core
npm run build -w packages/react
npm run build -w packages/vue
npm run build -w packages/svelte

# Typecheck all packages
npm run typecheck

# Watch mode for development
npm run dev -w packages/core

# Clean build artifacts
npm run clean

# Lint all packages
npm run lint

# Lint and fix issues
npm run lint:fix

# Format code
npm run format

# Run tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Architecture

xray is a monorepo that exposes frontend app runtime state via HTTP endpoints for AI agents to query. It supports React, Vue, and Svelte.

### Package Structure

- **@deepnoodle/xray-core** (`packages/core/`): Framework-agnostic core with three responsibilities:
  - **Vite plugin** (`src/vite.ts`): Adds `/xray/*` HTTP endpoints to the dev server and injects client-side polling script
  - **Collector** (`src/collector.ts`): Manages state registry and captures (errors, console, network)
  - **Browser utilities** (`src/browser.ts`): DOM queries, clicks, navigation, screenshots - exposed on `window.__XRAY_BROWSER__`

- **@deepnoodle/xray-react** (`packages/react/`): React bindings
  - `XrayProvider`: Context provider that initializes collector and sets up interceptors
  - `useXray`: Hook to register component state for inspection
  - `useXrayAction`: Hook to register triggerable actions

- **@deepnoodle/xray-vue** (`packages/vue/`): Vue bindings with plugin pattern (`xrayVuePlugin`) and composables

- **@deepnoodle/xray-svelte** (`packages/svelte/`): Svelte bindings with `initXray()` and store tracking

### Communication Flow

1. Vite plugin injects client script that polls `/xray/__commands` and pushes state to `/xray/__push`
2. Framework bindings register state with the collector via `window.__XRAY_COLLECTOR__`
3. Browser utilities are exposed on `window.__XRAY_BROWSER__` for command execution
4. External tools (AI agents, curl) query state via HTTP endpoints like `/xray/state`, `/xray/errors`

### Key Types

All shared types are in `packages/core/src/types.ts`:
- `XrayState`: Full captured state including registered components, errors, console, network
- `XrayCollector`: Interface for state registration and capture
- `XrayAction`: Remotely triggerable action

### Production Builds

Each package exports a `/noop` subpath with empty implementations for tree-shaking in production.

## Skills

### xray-developer

Use the `/xray-developer` skill when working with a frontend application that has xray enabled. This skill teaches you how to:

- Inspect component state via HTTP endpoints
- Check for JavaScript errors and failed network requests
- Interact with the DOM (click, fill, scroll)
- Navigate the application
- Trigger registered actions
- Validate state with assertions

See `.claude/skills/xray-developer/SKILL.md` for the full reference.
