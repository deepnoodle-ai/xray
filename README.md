# xray

Give your AI agent eyes into your app's runtime state. Works with **React**, **Vue**, and **Svelte**.

## Packages

| Package | Description |
|---------|-------------|
| [`xray-core`](./packages/core) | Core utilities and Vite plugin |
| [`xray-react`](./packages/react) | React bindings |
| [`xray-vue`](./packages/vue) | Vue bindings |
| [`xray-svelte`](./packages/svelte) | Svelte bindings |

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
npm install xray-react xray-core

# Vue
npm install xray-vue xray-core

# Svelte
npm install xray-svelte xray-core
```

### Add the Vite Plugin (all frameworks)

```ts
// vite.config.ts
import { xrayPlugin } from "xray-core/vite";

export default {
  plugins: [/* your framework plugin */, xrayPlugin()],
};
```

---

## React Setup

```tsx
// main.tsx
import { XrayProvider } from "xray-react";

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
import { useXray, useXrayAction } from "xray-react";

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
import { xrayVuePlugin } from "xray-vue";
import App from "./App.vue";

const app = createApp(App);
app.use(xrayVuePlugin);
app.mount("#app");
```

### Register Component State

```vue
<script setup>
import { ref, reactive } from "vue";
import { useXray, useXrayAction } from "xray-vue";

const filter = ref("all");
const data = reactive({ items: [], loading: false });

// Track reactive state
useXray("Dashboard", () => ({
  filter: filter.value,
  itemCount: data.items.length
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
  import { initXray } from "xray-svelte";
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
  import { trackStore, registerXrayAction } from "xray-svelte";
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

| Endpoint | Description |
|----------|-------------|
| `GET /xray/state` | Full state dump |
| `GET /xray/query?component=Name` | Query specific component |
| `GET /xray/errors` | Check for errors |
| `GET /xray/clear` | Clear captured state |
| `GET /xray/assert?errors=empty` | Make assertions |

### DOM & Interaction

| Endpoint | Description |
|----------|-------------|
| `GET /xray/dom?selector=.btn` | Query DOM elements |
| `GET /xray/click?selector=.btn` | Click an element |
| `POST /xray/fill` | Fill an input (`selector`, `value`) |
| `GET /xray/scroll?selector=#footer` | Scroll to element |

### Navigation

| Endpoint | Description |
|----------|-------------|
| `GET /xray/navigate?url=/path` | Navigate to URL |
| `GET /xray/refresh` | Refresh the page |
| `GET /xray/back` | Go back in history |
| `GET /xray/forward` | Go forward in history |

### Actions & Diagnostics

| Endpoint | Description |
|----------|-------------|
| `GET /xray/actions` | List registered actions |
| `POST /xray/action` | Execute action (`name`, `args`) |
| `GET /xray/screenshot` | Capture screenshot (needs html2canvas) |
| `GET /xray/diagnostics` | Viewport, performance, storage info |
| `GET /xray/a11y` | Accessibility information |

---

## What Gets Captured Automatically

- **Errors**: Uncaught exceptions and unhandled promise rejections
- **Console**: All console.log, warn, error, info, debug calls
- **Network**: All fetch requests with status, duration, and errors

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
    alias: import.meta.env.PROD ? {
      'xray-react': 'xray-react/noop',
      'xray-vue': 'xray-vue/noop',
      'xray-svelte': 'xray-svelte/noop',
    } : {}
  }
});
```

---

## Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Build specific package
npm run build -w packages/core
```

---

## License

MIT
