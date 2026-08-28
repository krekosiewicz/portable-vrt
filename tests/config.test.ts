import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { baselineParts } from '../src/render.js';
import { loadConfig, validateConfig } from '../src/config.js';
import type { PortableVrtConfig } from '../src/types.js';

const valid = (): PortableVrtConfig => ({
  server: { command: 'npm run dev', port: 4173 },
  viewports: { desktop: { width: 1366, height: 768 }, mobile: { width: 390, height: 844 } },
  states: [{ id: 'home/default', path: '/', ready: ['main'] }],
});

test('applies documented defaults', () => {
  const config = validateConfig(valid(), '/project/portable-vrt.config.ts');
  assert.equal(config.server.startupTimeout, 30_000);
  assert.equal(config.determinism.randomSeed, 0xc0ffee);
  assert.equal(config.output.baselines, 'vrt/__screenshots__');
});

test('rejects duplicate and unsafe state IDs', () => {
  const config = valid(); config.states.push({ ...config.states[0]! });
  assert.throws(() => validateConfig(config, '/project/config.ts'), /duplicate state id/);
  config.states = [{ id: '../escape', path: '/', ready: ['main'] }];
  assert.throws(() => validateConfig(config, '/project/config.ts'), /unsafe state id/);
});

test('rejects unsafe outputs and unjustified masks', () => {
  const config = valid(); config.output = { baselines: '../outside' };
  assert.throws(() => validateConfig(config, '/project/config.ts'), /must stay inside/);
  const masked = valid(); masked.states[0]!.masks = [{ selector: '.clock', reason: '' }];
  assert.throws(() => validateConfig(masked, '/project/config.ts'), /needs a reason/);
});

test('loads TypeScript config without consumer compilation', async () => {
  const directory = join(tmpdir(), `portable-vrt-${process.pid}-${Date.now()}`); await mkdir(directory);
  const path = join(directory, 'portable-vrt.config.ts');
  await writeFile(path, `const port: number = 4173; export default { server: { command: 'x', port }, viewports: { desktop: { width: 1, height: 1 } }, states: [{ id: 'a/b', path: '/', ready: ['main'] }] };`);
  try { assert.equal((await loadConfig(path)).server.port, 4173); }
  finally { await rm(directory, { recursive: true, force: true }); }
});

test('names nested baselines and viewport suffixes', () => {
  const state = valid().states[0]!;
  assert.deepEqual(baselineParts(state, 'desktop', 'desktop'), ['home', 'default.png']);
  assert.deepEqual(baselineParts(state, 'mobile', 'desktop'), ['home', 'default.mobile.png']);
});
