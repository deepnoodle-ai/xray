/**
 * No-op implementations for production builds.
 * Import this instead of xray-react in production for zero bundle impact.
 */

import type { ReactNode, ReactElement } from "react";

// React-specific no-ops
export function XrayProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return children as ReactElement;
}

export function useXrayCollector() {
  return null;
}

export function useXray(_name: string, _state: unknown): void {
  // no-op
}

export function useXrayCustom(_name: string, _state: unknown): void {
  // no-op
}

export function useXrayLazy(
  _name: string,
  _getValue: () => unknown,
  _deps: unknown[]
): void {
  // no-op
}

export function useXrayAction(
  _name: string,
  _handler: (...args: unknown[]) => unknown,
  _description?: string
): void {
  // no-op
}

// Re-export core no-ops
export * from "xray-core/noop";
