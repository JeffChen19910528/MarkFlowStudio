import type http from "node:http";

export interface AppConfig {
  idleMs?: number;
  byeGraceMs?: number;
  startupMs?: number;
}

export interface App {
  handler: http.RequestListener;
  shouldExit(): boolean;
  startIdleWatch(onIdle: () => void, intervalMs?: number): () => void;
  state: { startedAt: number; everSeen: boolean; emptySince: number | null };
  pages: Map<string, number>;
}

export function createApp(opts: {
  manifest: Iterable<string>;
  readAsset: (key: string) => Buffer;
  getPort: () => number;
  now?: () => number;
  config?: AppConfig;
}): App;

export function startServer(opts: {
  manifest: Iterable<string>;
  readAsset: (key: string) => Buffer;
  ports: number[];
  config?: AppConfig;
  onIdle?: () => void;
}): Promise<{ reused: number } | { port: number; server: http.Server; app: App }>;

export function probe(port: number, timeoutMs?: number): Promise<boolean>;
export function listenOn(server: http.Server, port: number, host?: string): Promise<number>;
export const HEARTBEAT_JS: string;
export const CSP: string;
export const MIME: Record<string, string>;
