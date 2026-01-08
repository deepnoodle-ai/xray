# xray

Give your AI agent eyes into your app's runtime state. Works with **React**, **Vue**, and **Svelte**.

## Packages

| Package                                              | Description                    |
| ---------------------------------------------------- | ------------------------------ |
| [`@deepnoodle/xray-core`](./packages/core)           | Core utilities and Vite plugin |
| [`@deepnoodle/xray-react`](./packages/react)         | React bindings                 |
| [`@deepnoodle/xray-vue`](./packages/vue)             | Vue bindings                   |
| [`@deepnoodle/xray-svelte`](./packages/svelte)       | Svelte bindings                |

## The Problem

AI coding agents can write frontend code, but they can't easily see if it works. They can run tests, but they can't inspect live app state, see console errors, or verify that a component actually rendered.

## The Solution

xray exposes your app's runtime state via HTTP endpoints that AI agents (or humans) can query:

```bash
# Check for errors
curl localhost:5173/xray/errors

# Get full app state
curl localhost:5173/xray/state

# Click a button
curl "localhost:5173/xray/click?selector=button.submit"

# Navigate to a page
curl "localhost:5173/xray/navigate?url=/dashboard"
```

## Quick Start

### Install

```bash
# React
npm install @deepnoodle/xray-react @deepnoodle/xray-core

# Vue
npm install @deepnoodle/xray-vue @deepnoodle/xray-core

# Svelte
npm install @deepnoodle/xray-svelte @deepnoodle/xray-core
```

### Add the Vite Plugin (all frameworks)

```ts
// vite.config.ts
import { xrayPlugin } from "@deepnoodle/xray-core/vite";

export default {
  plugins: [, /* your framework plugin */ xrayPlugin()],
};
```

---

## React Setup

```tsx
// main.tsx
import { XrayProvider } from "@deepnoodle/xray-react";

function App() {
  return (
    <XrayProvider>
      <YourApp />
    </XrayProvider>
  );
}
```

### Register Component State

```tsx
import { useXray, useXrayAction } from "@deepnoodle/xray-react";

function Dashboard() {
  const [filter, setFilter] = useState("all");
  const [data, setData] = useState([]);

  // Make this state queryable
  useXray("Dashboard", { filter, dataCount: data.length });

  // Register an action agents can trigger
  useXrayAction("refreshData", () => fetchData(), "Refresh dashboard data");

  return <div>...</div>;
}
```

---

## Vue Setup

```ts
// main.ts
import { createApp } from "vue";
import { xrayVuePlugin } from "@deepnoodle/xray-vue";
import App from "./App.vue";

const app = createApp(App);
app.use(xrayVuePlugin);
app.mount("#app");
```

### Register Component State

```vue
<script setup>
import { ref, reactive } from "vue";
import { useXray, useXrayAction } from "@deepnoodle/xray-vue";

const filter = ref("all");
const data = reactive({ items: [], loading: false });

// Track reactive state
useXray("Dashboard", () => ({
  filter: filter.value,
  itemCount: data.items.length,
}));

// Register an action agents can trigger
useXrayAction("refreshData", () => fetchData(), "Refresh dashboard data");
</script>
```

---

## Svelte Setup

```svelte
<!-- +layout.svelte -->
<script>
  import { initXray } from "@deepnoodle/xray-svelte";
  import { onDestroy } from "svelte";

  const cleanup = initXray();
  onDestroy(cleanup);
</script>

<slot />
```

### Register Store State

```svelte
<script>
  import { writable } from "svelte/store";
  import { trackStore, registerXrayAction } from "@deepnoodle/xray-svelte";
  import { onDestroy } from "svelte";

  const filter = writable("all");
  const data = writable([]);

  // Track stores
  const untrackFilter = trackStore("Filter", filter);
  const untrackData = trackStore("Data", data);

  // Register an action
  const unregisterAction = registerXrayAction(
    "refreshData",
    () => fetchData(),
    "Refresh data"
  );

  onDestroy(() => {
    untrackFilter();
    untrackData();
    unregisterAction();
  });
</script>
```

---

## HTTP Endpoints

### State & Query

| Endpoint                         | Description              |
| -------------------------------- | ------------------------ |
| `GET /xray/state`                | Full state dump          |
| `GET /xray/query?component=Name` | Query specific component |
| `GET /xray/errors`               | Check for errors         |
| `GET /xray/clear`                | Clear captured state     |
| `GET /xray/assert?errors=empty`  | Make assertions          |

### DOM & Interaction

| Endpoint                            | Description                         |
| ----------------------------------- | ----------------------------------- |
| `GET /xray/dom?selector=.btn`       | Query DOM elements                  |
| `GET /xray/click?selector=.btn`     | Click an element                    |
| `POST /xray/fill`                   | Fill an input (`selector`, `value`) |
| `GET /xray/scroll?selector=#footer` | Scroll to element                   |

### Navigation

| Endpoint                       | Description           |
| ------------------------------ | --------------------- |
| `GET /xray/navigate?url=/path` | Navigate to URL       |
| `GET /xray/refresh`            | Refresh the page      |
| `GET /xray/back`               | Go back in history    |
| `GET /xray/forward`            | Go forward in history |

### Functions & Actions

| Endpoint                 | Description                            |
| ------------------------ | -------------------------------------- |
| `GET /xray/functions`    | List registered functions              |
| `GET /xray/call/:name`   | Call a function (no args)              |
| `POST /xray/call/:name`  | Call a function with `{ args: [...] }` |
| `GET /xray/actions`      | List registered actions                |
| `POST /xray/action`      | Execute action (`name`, `args`)        |

### Diagnostics

| Endpoint                | Description                            |
| ----------------------- | -------------------------------------- |
| `GET /xray/screenshot`  | Capture screenshot (needs html2canvas) |
| `GET /xray/diagnostics` | Viewport, performance, storage info    |
| `GET /xray/a11y`        | Accessibility information              |

---

## What Gets Captured Automatically

- **Errors**: Uncaught exceptions and unhandled promise rejections
- **Console**: All console.log, warn, error, info, debug calls
- **Network**: All fetch requests with status, duration, and errors

---

## Custom Functions

Register custom functions that agents can call remotely. Unlike actions (for triggering side effects), functions are for **data retrieval** - screenshots, canvas captures, game state dumps, etc.

### React

```tsx
import { useXrayFunction, useXrayScope } from "@deepnoodle/xray-react";

function GameCanvas({ canvasId }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Simple function registration
  useXrayFunction("captureCanvas", () => {
    return canvasRef.current?.toDataURL("image/png");
  });

  // Scoped functions (for multiple instances)
  const xray = useXrayScope(`canvas.${canvasId}`);

  useEffect(() => {
    xray.registerFunction("capture", () => canvasRef.current?.toDataURL());
    xray.registerFunction("getSize", () => ({
      width: canvasRef.current?.width,
      height: canvasRef.current?.height,
    }));
  }, [xray]);

  return <canvas ref={canvasRef} />;
}
```

### Vue

```vue
<script setup>
import { ref } from "vue";
import { useXrayFunction, useXrayScope } from "@deepnoodle/xray-vue";

const props = defineProps<{ canvasId: string }>();
const canvasRef = ref<HTMLCanvasElement>();

// Simple function registration
useXrayFunction("captureCanvas", () => {
  return canvasRef.value?.toDataURL("image/png");
});

// Scoped functions
const xray = useXrayScope(`canvas.${props.canvasId}`);
xray.registerFunction("capture", () => canvasRef.value?.toDataURL());
</script>
```

### Svelte

```svelte
<script>
  import { registerXrayFunction, createXrayScopeWithCleanup } from "@deepnoodle/xray-svelte";
  import { onDestroy } from "svelte";

  export let canvasId;
  let canvas;

  // Simple function registration
  const unregister = registerXrayFunction("captureCanvas", () => {
    return canvas?.toDataURL("image/png");
  });

  // Scoped functions
  const { scope, cleanup } = createXrayScopeWithCleanup(`canvas.${canvasId}`);
  scope.registerFunction("capture", () => canvas?.toDataURL());

  onDestroy(() => {
    unregister();
    cleanup();
  });
</script>

<canvas bind:this={canvas} />
```

### Calling Functions

```bash
# List available functions
curl localhost:5173/xray/functions

# Call a simple function
curl localhost:5173/xray/call/captureCanvas

# Call a scoped function
curl localhost:5173/xray/call/canvas.main.capture

# Call with arguments
curl -X POST localhost:5173/xray/call/getGameState \
  -H "Content-Type: application/json" \
  -d '{"args": ["detailed"]}'
```

---

## Production Builds

xray is designed to have zero overhead in production. Options:

### Option 1: Disable via prop/option

```tsx
// React
<XrayProvider enabled={import.meta.env.DEV}>

// Vue
app.use(xrayVuePlugin, { enabled: import.meta.env.DEV })

// Svelte
initXray({ enabled: import.meta.env.DEV })
```

### Option 2: Use the noop export

For zero bundle impact in production:

```ts
// vite.config.ts
export default defineConfig({
  resolve: {
    alias: import.meta.env.PROD
      ? {
          "@deepnoodle/xray-react": "@deepnoodle/xray-react/noop",
          "@deepnoodle/xray-vue": "@deepnoodle/xray-vue/noop",
          "@deepnoodle/xray-svelte": "@deepnoodle/xray-svelte/noop",
        }
      : {},
  },
});
```

---

## Security

### Authentication (Optional)

Protect your xray endpoints with a shared secret:

```ts
// vite.config.ts
import { xrayPlugin } from "@deepnoodle/xray-core/vite";

export default {
  plugins: [
    xrayPlugin({
      secret: process.env.XRAY_SECRET, // Optional: require authentication
    }),
  ],
};
```

When a secret is configured, all requests must include it via header or query parameter:

```bash
# Via header
curl -H "X-Xray-Secret: your-secret" localhost:5173/xray/state

# Via query parameter
curl "localhost:5173/xray/state?secret=your-secret"
```

### Additional Security

- **Environment check**: xray endpoints are disabled in production (`NODE_ENV=production`) as a second defense layer
- **Request body limits**: POST request bodies are limited to 1MB by default (configurable via `maxRequestBodySize`)

---

## Development

```bash
make help         # Show all available commands
make install      # Install dependencies
make build        # Build all packages
make test         # Run tests
make lint         # Lint all packages
make typecheck    # Type check all packages
```

Or use npm directly:

```bash
npm run build -w packages/core   # Build specific package
npm run test:watch               # Run tests in watch mode
npm run test:coverage            # Run tests with coverage
```

---

## License

Apache-2.0
