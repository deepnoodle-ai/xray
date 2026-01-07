import type { Plugin, ViteDevServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { XrayState, AssertionResult } from "./types.js";

interface XrayPluginOptions {
  /** Port for the API (uses Vite's port, endpoints at /xray/*) */
  enabled?: boolean;
}

// State is pushed from the browser via a special endpoint
let currentState: XrayState | null = null;

// Command queue for browser execution
interface PendingCommand {
  id: string;
  command: string;
  args: unknown[];
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

const pendingCommands = new Map<string, PendingCommand>();
const commandResults = new Map<string, unknown>();

function queueCommand(
  command: string,
  args: unknown[] = [],
  timeoutMs = 5000
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    const timeout = setTimeout(() => {
      pendingCommands.delete(id);
      reject(new Error(`Command "${command}" timed out`));
    }, timeoutMs);

    pendingCommands.set(id, { id, command, args, resolve, reject, timeout });
  });
}

function getPendingCommands(): Array<{ id: string; command: string; args: unknown[] }> {
  return Array.from(pendingCommands.values()).map(({ id, command, args }) => ({
    id,
    command,
    args,
  }));
}

function resolveCommand(id: string, result: unknown, error?: string): void {
  const pending = pendingCommands.get(id);
  if (pending) {
    clearTimeout(pending.timeout);
    pendingCommands.delete(id);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }
  }
}

export function xrayPlugin(options: XrayPluginOptions = {}): Plugin {
  const { enabled = true } = options;

  if (!enabled) {
    return { name: "react-xray" };
  }

  return {
    name: "react-xray",
    apply: "serve", // Only in dev mode

    configureServer(server: ViteDevServer) {
      // Endpoint for browser to push state
      server.middlewares.use(
        "/xray/__push",
        (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end("Method not allowed");
            return;
          }

          let body = "";
          req.on("data", (chunk: Buffer) => {
            body += chunk.toString();
          });
          req.on("end", () => {
            try {
              currentState = JSON.parse(body);
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true }));
            } catch {
              res.statusCode = 400;
              res.end("Invalid JSON");
            }
          });
        }
      );

      // GET /xray/state - Full state dump
      server.middlewares.use(
        "/xray/state",
        (_req: IncomingMessage, res: ServerResponse) => {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");

          if (!currentState) {
            res.end(
              JSON.stringify({
                error: "No state available. Is XrayProvider mounted?",
              })
            );
            return;
          }

          res.end(JSON.stringify(currentState, null, 2));
        }
      );

      // GET /xray/query - Filtered queries
      server.middlewares.use(
        "/xray/query",
        (req: IncomingMessage, res: ServerResponse) => {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");

          if (!currentState) {
            res.end(JSON.stringify({ error: "No state available" }));
            return;
          }

          const url = new URL(req.url ?? "", "http://localhost");
          const select = url.searchParams.get("select");
          const component = url.searchParams.get("component");
          const limit = parseInt(url.searchParams.get("limit") ?? "0", 10);

          let result: Record<string, unknown> = {};

          if (component) {
            // Query specific component/registered state
            const registered = currentState.registered[component];
            if (registered) {
              result = { [component]: registered };
            } else {
              result = { error: `Component "${component}" not found` };
            }
          } else if (select) {
            // Select specific fields
            const fields = select.split(",").map((f) => f.trim());
            for (const field of fields) {
              if (field in currentState) {
                let value = currentState[field as keyof XrayState];
                if (limit > 0 && Array.isArray(value)) {
                  value = value.slice(-limit);
                }
                result[field] = value;
              }
            }
          } else {
            // Return summary
            result = {
              url: currentState.url,
              route: currentState.route,
              registeredCount: Object.keys(currentState.registered).length,
              errorCount: currentState.errors.length,
              warningCount: currentState.warnings.length,
              consoleCount: currentState.console.length,
              networkCount: currentState.network.length,
            };
          }

          res.end(JSON.stringify(result, null, 2));
        }
      );

      // GET /xray/assert - Make assertions
      server.middlewares.use(
        "/xray/assert",
        (req: IncomingMessage, res: ServerResponse) => {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");

          if (!currentState) {
            res.end(JSON.stringify({ error: "No state available" }));
            return;
          }

          const url = new URL(req.url ?? "", "http://localhost");
          const params = Object.fromEntries(url.searchParams.entries());

          const result = evaluateAssertion(currentState, params);
          res.end(JSON.stringify(result, null, 2));
        }
      );

      // GET /xray/errors - Quick error check
      server.middlewares.use(
        "/xray/errors",
        (_req: IncomingMessage, res: ServerResponse) => {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");

          if (!currentState) {
            res.end(JSON.stringify({ error: "No state available" }));
            return;
          }

          const hasErrors = currentState.errors.length > 0;
          res.end(
            JSON.stringify({
              hasErrors,
              count: currentState.errors.length,
              errors: currentState.errors,
            })
          );
        }
      );

      // GET /xray/clear - Clear captured state
      server.middlewares.use(
        "/xray/clear",
        (_req: IncomingMessage, res: ServerResponse) => {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");

          if (currentState) {
            currentState.errors = [];
            currentState.warnings = [];
            currentState.console = [];
            currentState.network = [];
          }

          res.end(JSON.stringify({ ok: true, message: "State cleared" }));
        }
      );

      // GET /xray/__commands - Browser polls for pending commands
      server.middlewares.use(
        "/xray/__commands",
        (_req: IncomingMessage, res: ServerResponse) => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(getPendingCommands()));
        }
      );

      // POST /xray/__result - Browser sends command results
      server.middlewares.use(
        "/xray/__result",
        (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end("Method not allowed");
            return;
          }

          let body = "";
          req.on("data", (chunk: Buffer) => {
            body += chunk.toString();
          });
          req.on("end", () => {
            try {
              const { id, result, error } = JSON.parse(body);
              resolveCommand(id, result, error);
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true }));
            } catch {
              res.statusCode = 400;
              res.end("Invalid JSON");
            }
          });
        }
      );

      // GET /xray/dom - Query DOM elements
      server.middlewares.use(
        "/xray/dom",
        async (req: IncomingMessage, res: ServerResponse) => {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");

          const url = new URL(req.url ?? "", "http://localhost");
          const selector = url.searchParams.get("selector");
          const includeStyles = url.searchParams.get("styles") === "true";
          const all = url.searchParams.get("all") === "true";

          if (!selector) {
            res.end(JSON.stringify({ error: "Missing selector parameter" }));
            return;
          }

          try {
            const result = await queueCommand("queryDom", [
              selector,
              { includeStyles, all },
            ]);
            res.end(JSON.stringify(result, null, 2));
          } catch (err) {
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              })
            );
          }
        }
      );

      // GET /xray/screenshot - Capture screenshot
      server.middlewares.use(
        "/xray/screenshot",
        async (_req: IncomingMessage, res: ServerResponse) => {
          res.setHeader("Access-Control-Allow-Origin", "*");

          try {
            const result = await queueCommand("captureScreenshot", [], 10000);
            if (result) {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ screenshot: result }));
            } else {
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  error:
                    "Screenshot capture not available. Add html2canvas to your project.",
                  hint: "npm install html2canvas, then add: window.html2canvas = (await import('html2canvas')).default",
                })
              );
            }
          } catch (err) {
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              })
            );
          }
        }
      );

      // GET /xray/actions - List available actions
      server.middlewares.use(
        "/xray/actions",
        async (_req: IncomingMessage, res: ServerResponse) => {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");

          try {
            const result = await queueCommand("getActions", []);
            res.end(JSON.stringify(result, null, 2));
          } catch (err) {
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              })
            );
          }
        }
      );

      // POST /xray/action - Execute a registered action
      server.middlewares.use(
        "/xray/action",
        async (req: IncomingMessage, res: ServerResponse) => {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");

          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: "Method not allowed. Use POST." }));
            return;
          }

          let body = "";
          req.on("data", (chunk: Buffer) => {
            body += chunk.toString();
          });
          req.on("end", async () => {
            try {
              const { name, args = [] } = JSON.parse(body);
              if (!name) {
                res.end(JSON.stringify({ error: "Missing action name" }));
                return;
              }

              const result = await queueCommand("executeAction", [name, args]);
              res.end(JSON.stringify(result, null, 2));
            } catch (err) {
              res.end(
                JSON.stringify({
                  error: err instanceof Error ? err.message : String(err),
                })
              );
            }
          });
        }
      );

      // POST /xray/click - Click an element
      server.middlewares.use(
        "/xray/click",
        async (req: IncomingMessage, res: ServerResponse) => {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");

          const url = new URL(req.url ?? "", "http://localhost");
          const selector = url.searchParams.get("selector");

          if (!selector) {
            res.end(JSON.stringify({ error: "Missing selector parameter" }));
            return;
          }

          try {
            const result = await queueCommand("clickElement", [selector]);
            res.end(JSON.stringify(result, null, 2));
          } catch (err) {
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              })
            );
          }
        }
      );

      // POST /xray/fill - Fill an input
      server.middlewares.use(
        "/xray/fill",
        async (req: IncomingMessage, res: ServerResponse) => {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");

          if (req.method !== "POST") {
            // Also support GET for simple cases
            const url = new URL(req.url ?? "", "http://localhost");
            const selector = url.searchParams.get("selector");
            const value = url.searchParams.get("value");

            if (!selector || value === null) {
              res.end(
                JSON.stringify({ error: "Missing selector or value parameter" })
              );
              return;
            }

            try {
              const result = await queueCommand("fillInput", [selector, value]);
              res.end(JSON.stringify(result, null, 2));
            } catch (err) {
              res.end(
                JSON.stringify({
                  error: err instanceof Error ? err.message : String(err),
                })
              );
            }
            return;
          }

          let body = "";
          req.on("data", (chunk: Buffer) => {
            body += chunk.toString();
          });
          req.on("end", async () => {
            try {
              const { selector, value } = JSON.parse(body);
              if (!selector || value === undefined) {
                res.end(
                  JSON.stringify({ error: "Missing selector or value" })
                );
                return;
              }

              const result = await queueCommand("fillInput", [selector, value]);
              res.end(JSON.stringify(result, null, 2));
            } catch (err) {
              res.end(
                JSON.stringify({
                  error: err instanceof Error ? err.message : String(err),
                })
              );
            }
          });
        }
      );

      // GET /xray/diagnostics - Extended diagnostics
      server.middlewares.use(
        "/xray/diagnostics",
        async (_req: IncomingMessage, res: ServerResponse) => {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");

          try {
            const [viewport, performance, storage, focus, a11y] =
              await Promise.all([
                queueCommand("getViewportInfo", []),
                queueCommand("getPerformanceMetrics", []),
                queueCommand("getStorageInfo", []),
                queueCommand("getFocusInfo", []),
                queueCommand("getAccessibilityInfo", []),
              ]);

            res.end(
              JSON.stringify(
                {
                  viewport,
                  performance,
                  storage,
                  focus,
                  accessibility: a11y,
                },
                null,
                2
              )
            );
          } catch (err) {
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              })
            );
          }
        }
      );

      // GET /xray/a11y - Accessibility info
      server.middlewares.use(
        "/xray/a11y",
        async (req: IncomingMessage, res: ServerResponse) => {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");

          const url = new URL(req.url ?? "", "http://localhost");
          const selector = url.searchParams.get("selector") || undefined;

          try {
            const result = await queueCommand("getAccessibilityInfo", [
              selector,
            ]);
            res.end(JSON.stringify(result, null, 2));
          } catch (err) {
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              })
            );
          }
        }
      );

      // POST /xray/navigate - Navigate to a URL
      server.middlewares.use(
        "/xray/navigate",
        async (req: IncomingMessage, res: ServerResponse) => {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");

          const url = new URL(req.url ?? "", "http://localhost");
          const targetUrl = url.searchParams.get("url");
          const replace = url.searchParams.get("replace") === "true";

          if (!targetUrl) {
            res.end(JSON.stringify({ error: "Missing url parameter" }));
            return;
          }

          try {
            const result = await queueCommand("navigate", [targetUrl, { replace }]);
            res.end(JSON.stringify(result, null, 2));
          } catch (err) {
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              })
            );
          }
        }
      );

      // POST /xray/refresh - Refresh the page
      server.middlewares.use(
        "/xray/refresh",
        async (_req: IncomingMessage, res: ServerResponse) => {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");

          try {
            const result = await queueCommand("refresh", []);
            res.end(JSON.stringify(result, null, 2));
          } catch (err) {
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              })
            );
          }
        }
      );

      // POST /xray/back - Go back in history
      server.middlewares.use(
        "/xray/back",
        async (_req: IncomingMessage, res: ServerResponse) => {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");

          try {
            const result = await queueCommand("goBack", []);
            res.end(JSON.stringify(result, null, 2));
          } catch (err) {
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              })
            );
          }
        }
      );

      // POST /xray/forward - Go forward in history
      server.middlewares.use(
        "/xray/forward",
        async (_req: IncomingMessage, res: ServerResponse) => {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");

          try {
            const result = await queueCommand("goForward", []);
            res.end(JSON.stringify(result, null, 2));
          } catch (err) {
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              })
            );
          }
        }
      );

      // GET /xray/scroll - Scroll to element or position
      server.middlewares.use(
        "/xray/scroll",
        async (req: IncomingMessage, res: ServerResponse) => {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");

          const url = new URL(req.url ?? "", "http://localhost");
          const selector = url.searchParams.get("selector");
          const x = url.searchParams.get("x");
          const y = url.searchParams.get("y");

          let target: string | { x: number; y: number };
          if (selector) {
            target = selector;
          } else if (x !== null && y !== null) {
            target = { x: parseInt(x, 10), y: parseInt(y, 10) };
          } else {
            res.end(JSON.stringify({ error: "Missing selector or x,y parameters" }));
            return;
          }

          try {
            const result = await queueCommand("scrollTo", [target]);
            res.end(JSON.stringify(result, null, 2));
          } catch (err) {
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              })
            );
          }
        }
      );

      console.log("\n  🔬 react-xray endpoints available:");
      console.log("     State & Query:");
      console.log("       GET  /xray/state       - Full state dump");
      console.log("       GET  /xray/query       - Filtered queries");
      console.log("       GET  /xray/errors      - Quick error check");
      console.log("       GET  /xray/clear       - Clear captured state");
      console.log("       GET  /xray/assert      - Make assertions");
      console.log("     DOM & Interaction:");
      console.log("       GET  /xray/dom         - Query DOM (selector=)");
      console.log("       GET  /xray/click       - Click element (selector=)");
      console.log("       POST /xray/fill        - Fill input (selector=, value=)");
      console.log("       GET  /xray/scroll      - Scroll to element/position");
      console.log("     Navigation:");
      console.log("       GET  /xray/navigate    - Navigate to URL (url=)");
      console.log("       GET  /xray/refresh     - Refresh the page");
      console.log("       GET  /xray/back        - Go back in history");
      console.log("       GET  /xray/forward     - Go forward in history");
      console.log("     Actions & Diagnostics:");
      console.log("       GET  /xray/actions     - List registered actions");
      console.log("       POST /xray/action      - Execute action (name=)");
      console.log("       GET  /xray/screenshot  - Capture screenshot");
      console.log("       GET  /xray/diagnostics - Extended diagnostics");
      console.log("       GET  /xray/a11y        - Accessibility info\n");
    },

    // Inject client-side script to push state to server
    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: { type: "module" },
          children: `
            // react-xray: Push state to dev server and poll for commands
            (function() {
              let pushing = false;
              let polling = false;

              async function pushState() {
                if (pushing) return;
                if (!window.__XRAY_COLLECTOR__) return;

                pushing = true;
                try {
                  const state = window.__XRAY_COLLECTOR__.getState();
                  await fetch('/xray/__push', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(state),
                  });
                } catch (e) {
                  // Ignore push errors
                } finally {
                  pushing = false;
                }
              }

              async function pollCommands() {
                if (polling) return;
                if (!window.__XRAY_BROWSER__) return;

                polling = true;
                try {
                  const res = await fetch('/xray/__commands');
                  const commands = await res.json();

                  for (const cmd of commands) {
                    const { id, command, args } = cmd;
                    let result, error;

                    try {
                      const fn = window.__XRAY_BROWSER__[command];
                      if (typeof fn === 'function') {
                        result = await fn(...args);
                      } else {
                        error = 'Command not found: ' + command;
                      }
                    } catch (e) {
                      error = e instanceof Error ? e.message : String(e);
                    }

                    // Send result back to server
                    await fetch('/xray/__result', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ id, result, error }),
                    });
                  }
                } catch (e) {
                  // Ignore poll errors
                } finally {
                  polling = false;
                }
              }

              // Push state periodically and on changes
              setInterval(pushState, 500);
              window.addEventListener('error', () => setTimeout(pushState, 10));
              window.addEventListener('xray:ready', pushState);

              // Poll for commands frequently
              setInterval(pollCommands, 100);
            })();
          `,
          injectTo: "body",
        },
      ];
    },
  };
}

function evaluateAssertion(
  state: XrayState,
  params: Record<string, string>
): AssertionResult {
  const assertion = new URLSearchParams(params).toString();

  // Check for errors
  if ("errors" in params) {
    const expected = params.errors;
    if (expected === "empty") {
      return {
        passed: state.errors.length === 0,
        assertion,
        details: {
          expected: "no errors",
          actual: state.errors.length,
          errors: state.errors,
        },
        hint:
          state.errors.length > 0
            ? `Found ${state.errors.length} error(s): ${state.errors[0]?.message}`
            : undefined,
      };
    }
  }

  // Check component state
  if ("component" in params) {
    const componentName = params.component;
    const registered = state.registered[componentName];

    if (!registered) {
      return {
        passed: false,
        assertion,
        details: {
          expected: `component "${componentName}" to exist`,
          actual: "not found",
          available: Object.keys(state.registered),
        },
        hint: `Component "${componentName}" is not registered. Available: ${Object.keys(state.registered).join(", ") || "none"}`,
      };
    }

    // Check state properties
    const stateChecks = Object.entries(params).filter(
      ([key]) => key.startsWith("state.") || key === "state"
    );

    if (stateChecks.length > 0) {
      for (const [key, expected] of stateChecks) {
        const path = key.replace("state.", "");
        const actual = getNestedValue(registered.state, path);
        const expectedValue = parseValue(expected);

        if (actual !== expectedValue) {
          return {
            passed: false,
            assertion,
            details: {
              component: componentName,
              path,
              expected: expectedValue,
              actual,
            },
            hint: `${componentName}.${path} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expectedValue)}`,
          };
        }
      }
    }

    return {
      passed: true,
      assertion,
      details: {
        component: componentName,
        state: registered.state,
      },
    };
  }

  // Check route
  if ("route" in params) {
    const expected = params.route;
    const passed = state.route === expected;
    return {
      passed,
      assertion,
      details: {
        expected,
        actual: state.route,
      },
      hint: passed ? undefined : `Route is "${state.route}", expected "${expected}"`,
    };
  }

  // Check network
  if ("network" in params) {
    const status = params.status;
    if (status) {
      const statusPattern = status.replace("xx", "\\d\\d");
      const regex = new RegExp(`^${statusPattern}$`);
      const matches = state.network.filter(
        (r) => r.status !== null && regex.test(r.status.toString())
      );

      if (status.includes("5") || status.includes("4")) {
        // Looking for errors
        return {
          passed: matches.length === 0,
          assertion,
          details: {
            pattern: status,
            matches: matches.length,
            requests: matches,
          },
          hint:
            matches.length > 0
              ? `Found ${matches.length} request(s) with status ${status}`
              : undefined,
        };
      }
    }
  }

  return {
    passed: false,
    assertion,
    details: { error: "Unknown assertion type" },
    hint: "Supported: errors=empty, component=Name, route=/path, network with status",
  };
}

function getNestedValue(obj: unknown, path: string): unknown {
  if (path === "state" || path === "") return obj;

  const parts = path.split(".");
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function parseValue(str: string): unknown {
  if (str === "true") return true;
  if (str === "false") return false;
  if (str === "null") return null;
  if (str === "undefined") return undefined;
  const num = Number(str);
  if (!isNaN(num)) return num;
  return str;
}

export default xrayPlugin;
