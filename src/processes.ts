import { spawn, type ChildProcess } from 'node:child_process';
import { createConnection, createServer } from 'node:net';
import type { ResolvedConfig } from './types.js';

export const isPortFree = (port: number, host = '127.0.0.1'): Promise<boolean> => new Promise((resolve) => {
  const server = createServer().once('error', () => resolve(false)).once('listening', () => server.close(() => resolve(true))).listen(port, host);
});

export const waitForPort = async (port: number, timeout: number, host = '127.0.0.1'): Promise<void> => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const ready = await new Promise<boolean>((resolve) => {
      const socket = createConnection({ port, host }).once('connect', () => { socket.destroy(); resolve(true); }).once('error', () => resolve(false));
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server did not become ready on ${host}:${port} within ${timeout}ms`);
};

export const startApp = async (config: ResolvedConfig): Promise<ChildProcess> => {
  if (!(await isPortFree(config.server.port))) throw new Error(`port ${config.server.port} is already occupied; stop that process or change server.port`);
  const child = spawn(config.server.command, { cwd: config.rootDir, env: { ...process.env, ...config.server.env }, shell: true, stdio: 'inherit', detached: process.platform !== 'win32' });
  try { await waitForPort(config.server.port, config.server.startupTimeout); return child; }
  catch (error) { stopProcess(child); throw error; }
};

export const stopProcess = (child: ChildProcess | undefined): void => {
  if (!child?.pid || child.killed) return;
  try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
};

export const installCleanup = (cleanup: () => void): (() => void) => {
  const handlers = new Map<NodeJS.Signals, () => void>();
  (['SIGINT', 'SIGTERM'] as NodeJS.Signals[]).forEach((signal) => {
    const handler = () => { cleanup(); process.exitCode = 130; };
    handlers.set(signal, handler); process.once(signal, handler);
  });
  return () => handlers.forEach((handler, signal) => process.off(signal, handler));
};
