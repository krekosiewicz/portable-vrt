import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { installCleanup, startApp, stopProcess } from './processes.js';
import type { ResolvedConfig } from './types.js';

const require = createRequire(import.meta.url);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const playwrightRoot = resolve(dirname(require.resolve('@playwright/test/package.json')));
const playwrightVersion = (require('@playwright/test/package.json') as { version: string }).version;

const run = (command: string, args: string[], options: { cwd?: string; stdio?: 'inherit' | 'pipe' } = {}): Promise<{ code: number; output: string }> => new Promise((done, reject) => {
  const child = spawn(command, args, { cwd: options.cwd, stdio: options.stdio === 'inherit' ? 'inherit' : ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout?.on('data', (chunk) => { output += chunk; }); child.stderr?.on('data', (chunk) => { output += chunk; });
  child.once('error', reject); child.once('exit', (code) => done({ code: code ?? 1, output }));
});

export const dockerAvailable = async (): Promise<boolean> => (await run('docker', ['info'])).code === 0;
export const imageName = (): string => `mcr.microsoft.com/playwright:v${playwrightVersion}-noble`;

const runtimeFiles = async (config: ResolvedConfig, grep: string | undefined): Promise<{ directory: string; spec: string; pwConfig: string }> => {
  const directory = resolve(config.rootDir, config.output.results, '..', '.portable-vrt-runtime');
  await mkdir(directory, { recursive: true });
  const configModule = pathToFileURL(resolve(packageRoot, 'dist/config.js')).href;
  const renderModule = pathToFileURL(resolve(packageRoot, 'dist/render.js')).href;
  const configUrl = pathToFileURL(config.configPath).href;
  const spec = resolve(directory, 'portable-vrt.spec.mjs');
  const pwConfig = resolve(directory, 'playwright.config.mjs');
  await writeFile(spec, `import { test, expect } from ${JSON.stringify(pathToFileURL(resolve(playwrightRoot, 'index.mjs')).href)};\nimport { loadConfig } from ${JSON.stringify(configModule)};\nimport { preparePage, baselineParts } from ${JSON.stringify(renderModule)};\nconst config = await loadConfig(${JSON.stringify(config.configPath)});\nconst first = Object.keys(config.viewports)[0];\nfor (const state of config.states) {\n  test(state.id, async ({ page }, info) => {\n    await preparePage(page, state, config);\n    await expect(page).toHaveScreenshot(baselineParts(state, info.project.name, first), { mask: (state.masks ?? []).map((item) => page.locator(item.selector)) });\n  });\n}\n`);
  await writeFile(pwConfig, `export default { testDir: ${JSON.stringify(directory)}, testMatch: ${JSON.stringify(spec)}, fullyParallel: false, workers: 1, retries: 0, reporter: [['list'], ['html', { outputFolder: ${JSON.stringify(resolve(config.rootDir, config.output.report))}, open: 'never' }]], timeout: 60000, grep: ${grep ? `new RegExp(${JSON.stringify(grep)})` : 'undefined'}, expect: { timeout: 10000, toHaveScreenshot: { maxDiffPixels: 0, animations: 'disabled', caret: 'hide' } }, snapshotPathTemplate: ${JSON.stringify(resolve(config.rootDir, config.output.baselines))} + '/{arg}{ext}', outputDir: ${JSON.stringify(resolve(config.rootDir, config.output.results))}, use: { baseURL: 'http://host.docker.internal:${config.server.port}', browserName: 'chromium', deviceScaleFactor: 1, locale: ${JSON.stringify(config.determinism.locale)}, timezoneId: ${JSON.stringify(config.determinism.timezone)}, trace: 'retain-on-failure' }, projects: ${JSON.stringify(Object.entries(config.viewports).map(([name, viewport]) => ({ name, use: { viewport } })))} };\n`);
  return { directory, spec, pwConfig };
};

export const runDocker = async (config: ResolvedConfig, update: boolean, grep?: string): Promise<void> => {
  if (update && grep) throw new Error('filtered updates are forbidden; run a complete portable-vrt update');
  if (!(await dockerAvailable())) throw new Error('Docker is unavailable; start Docker Desktop (macOS) or the Docker daemon (Linux), then retry');
  const app = await startApp(config);
  const runtime = await runtimeFiles(config, grep);
  const mounts = new Set([config.rootDir, packageRoot, playwrightRoot]);
  const name = `portable-vrt-${process.pid}-${Date.now()}`;
  const args = ['run', '--rm', '--name', name, '--platform', 'linux/amd64', '--add-host', 'host.docker.internal:host-gateway', '--ipc=host'];
  mounts.forEach((mount) => args.push('--volume', `${mount}:${mount}`));
  args.push('--workdir', config.rootDir, imageName(), 'node', resolve(playwrightRoot, 'cli.js'), 'test', runtime.spec, '--config', runtime.pwConfig);
  if (update) args.push('--update-snapshots');
  const removeHandlers = installCleanup(() => { void run('docker', ['stop', name]); stopProcess(app); });
  try {
    const result = await run('docker', args, { stdio: 'inherit' });
    if (result.code) throw new Error(`Playwright exited with status ${result.code}`);
  } finally {
    removeHandlers(); stopProcess(app); await rm(runtime.directory, { recursive: true, force: true });
  }
};
