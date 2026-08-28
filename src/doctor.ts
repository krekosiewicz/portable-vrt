import { execFile } from 'node:child_process';
import { access, readFile, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { dockerAvailable, imageName } from './docker.js';
import { isPortFree } from './processes.js';
import type { ResolvedConfig } from './types.js';

const exec = promisify(execFile);
type Check = { name: string; ok: boolean; fix?: string; detail?: string };

export const runDoctor = async (config: ResolvedConfig): Promise<Check[]> => {
  const checks: Check[] = [];
  checks.push({ name: 'Node >= 20', ok: Number(process.versions.node.split('.')[0]) >= 20, detail: process.versions.node, fix: 'install Node.js 20 or newer' });
  const docker = await dockerAvailable();
  checks.push({ name: 'Docker daemon', ok: docker, detail: imageName(), fix: 'start Docker Desktop (macOS) or the Docker daemon (Linux)' });
  try { await exec('git', ['lfs', 'version'], { cwd: config.rootDir }); checks.push({ name: 'Git LFS', ok: true }); }
  catch { checks.push({ name: 'Git LFS', ok: false, fix: 'install Git LFS, then run: git lfs install' }); }
  checks.push({ name: `port ${config.server.port} free`, ok: await isPortFree(config.server.port), fix: `stop the process using port ${config.server.port} or change server.port` });
  try { const browser = await chromium.launch(); await browser.close(); checks.push({ name: 'host Chromium', ok: true }); }
  catch { checks.push({ name: 'host Chromium', ok: false, fix: 'run: npx playwright install chromium' }); }
  const baselineRoot = resolve(config.rootDir, config.output.baselines);
  try {
    await access(baselineRoot);
    const expected = config.states.flatMap((state) => Object.keys(config.viewports).map((viewport, index) => resolve(baselineRoot, ...state.id.split('/').slice(0, -1), `${state.id.split('/').at(-1)}${index ? `.${viewport}` : ''}.png`)));
    const pointers = [];
    for (const file of expected) {
      try { if ((await stat(file)).size < 1024 && (await readFile(file, 'utf8')).startsWith('version https://git-lfs.github.com/spec')) pointers.push(file); } catch { /* missing baselines are valid before first update */ }
    }
    checks.push({ name: 'materialized baseline PNGs', ok: !pointers.length, ...(pointers.length ? { detail: `${pointers.length} LFS pointer file(s)` } : {}), fix: 'run: git lfs pull' });
  } catch { checks.push({ name: 'baseline directory', ok: true, detail: 'not created yet' }); }
  return checks;
};
