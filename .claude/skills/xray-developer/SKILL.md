---
name: xray-developer
description: Interact with xray to inspect frontend app state, errors, network requests, and DOM. Use when debugging React/Vue/Svelte apps with xray enabled, testing UI interactions, or verifying component state.
---

# xray Developer Skill

Use this skill when working with a frontend application that has xray enabled. xray exposes runtime state via HTTP endpoints, allowing you to inspect component state, errors, console output, network requests, and interact with the DOM.

## When to Use This Skill

- When debugging frontend application issues
- When you need to verify component state after making changes
- When testing user interactions like clicks, form fills, navigation
- When checking for JavaScript errors or failed network requests
- When you need to understand what's happening in the running app

## Prerequisites

The application must be running with xray enabled (typically `npm run dev`). All endpoints are served from the dev server (e.g., `http://localhost:5173/xray/...`).

## Core Endpoints

### Get Full State

```bash
curl http://localhost:5173/xray/state
```

Returns all registered component state, errors, console output, and network requests.

### Query Specific Data

```bash
# Get summary
curl http://localhost:5173/xray/query

# Query specific component
curl "http://localhost:5173/xray/query?component=ComponentName"

# Query specific fields with limit
curl "http://localhost:5173/xray/query?select=errors,console,network&limit=5"
```

### Check for Errors

```bash
curl http://localhost:5173/xray/errors
```

Returns `{ hasErrors: boolean, count: number, errors: [] }`.

### Clear Captured Data

```bash
curl http://localhost:5173/xray/clear
```

Clears all captured errors, console entries, and network requests.

## DOM Interaction

### Query DOM Elements

```bash
# Query single element
curl "http://localhost:5173/xray/dom?selector=button.submit"

# Query with computed styles
curl "http://localhost:5173/xray/dom?selector=.modal&styles=true"

# Query all matching elements
curl "http://localhost:5173/xray/dom?selector=li.item&all=true"
```

Returns visibility, text content, attributes, bounding rect.

### Click Elements

```bash
curl "http://localhost:5173/xray/click?selector=button.submit"
```

### Fill Form Inputs

```bash
# GET method
curl "http://localhost:5173/xray/fill?selector=input%23email&value=test@example.com"

# POST method (preferred for complex values)
curl -X POST http://localhost:5173/xray/fill \
  -H "Content-Type: application/json" \
  -d '{"selector":"input#email","value":"test@example.com"}'
```

### Scroll

```bash
# Scroll to element
curl "http://localhost:5173/xray/scroll?selector=%23footer"

# Scroll to coordinates
curl "http://localhost:5173/xray/scroll?x=0&y=500"
```

## Navigation

```bash
# Navigate to URL
curl "http://localhost:5173/xray/navigate?url=/dashboard"

# Navigate with history replace
curl "http://localhost:5173/xray/navigate?url=/login&replace=true"

# Refresh page
curl http://localhost:5173/xray/refresh

# Browser back/forward
curl http://localhost:5173/xray/back
curl http://localhost:5173/xray/forward
```

## Actions

Components can register named actions that can be triggered remotely.

```bash
# List available actions
curl http://localhost:5173/xray/actions

# Execute an action
curl -X POST http://localhost:5173/xray/action \
  -H "Content-Type: application/json" \
  -d '{"name":"resetForm"}'

# Execute with arguments
curl -X POST http://localhost:5173/xray/action \
  -H "Content-Type: application/json" \
  -d '{"name":"setFilter","args":["completed"]}'
```

## Assertions

Validate application state programmatically:

```bash
# Assert no errors
curl "http://localhost:5173/xray/assert?errors=empty"

# Assert component exists
curl "http://localhost:5173/xray/assert?component=LoginForm"

# Assert component state value
curl "http://localhost:5173/xray/assert?component=Cart&state.itemCount=3"

# Assert current route
curl "http://localhost:5173/xray/assert?route=/dashboard"
```

Returns `{ passed: boolean, assertion: string, details: {}, hint?: string }`.

## Diagnostics

```bash
# Full diagnostics (viewport, performance, storage, focus, a11y)
curl http://localhost:5173/xray/diagnostics

# Accessibility info
curl http://localhost:5173/xray/a11y
curl "http://localhost:5173/xray/a11y?selector=form.login"

# Screenshot (requires html2canvas in the app)
curl http://localhost:5173/xray/screenshot
```

## Typical Debugging Workflow

1. **Check current state**: `curl http://localhost:5173/xray/state | jq .`
2. **Verify no errors**: `curl http://localhost:5173/xray/assert?errors=empty`
3. **Query specific component**: `curl "http://localhost:5173/xray/query?component=MyComponent"`
4. **Perform interaction**: `curl "http://localhost:5173/xray/click?selector=button.action"`
5. **Wait briefly**: `sleep 0.5`
6. **Check new state**: `curl http://localhost:5173/xray/state | jq .registered`
7. **Check for errors**: `curl http://localhost:5173/xray/errors`
8. **Verify expected route**: `curl "http://localhost:5173/xray/assert?route=/expected-path"`

## State Structure

The full state object includes:

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "url": "http://localhost:5173/dashboard",
  "route": "/dashboard",
  "title": "Page Title",
  "registered": {
    "ComponentName": {
      "name": "ComponentName",
      "state": { "key": "value" },
      "updatedAt": 1705317045123
    }
  },
  "errors": [{ "message": "...", "stack": "...", "timestamp": 123 }],
  "console": [{ "level": "warn", "message": "...", "timestamp": 123 }],
  "network": [
    { "url": "...", "method": "GET", "status": 200, "duration": 145 }
  ],
  "warnings": []
}
```

## Tips

- Always URL-encode selectors with special characters (`#` becomes `%23`)
- Use `jq` to parse JSON responses for readability
- Check `/xray/errors` after interactions to catch any issues
- Use `/xray/clear` before testing to start fresh
- The dev server must be running for xray to work
- Commands are executed asynchronously via polling (100ms intervals)
- Default timeout for commands is 5 seconds
