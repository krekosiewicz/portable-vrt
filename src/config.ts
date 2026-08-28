import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import type { PortableVrtConfig, ResolvedConfig } from './types.js';

export const defineConfig = (config: PortableVrtConfig): PortableVrtConfig => config;

const safeRelative = (value: string, field: string): string => {
  if (isAbsolute(value) || relative('.', value).startsWith('..')) throw new Error(`${field} must stay inside the project: ${value}`);
  return value;
};

export const validateConfig = (config: PortableVrtConfig, configPath: string): ResolvedConfig => {
  if (!config.server?.command) throw new Error('server.command is required');
  if (!Number.isInteger(config.server.port) || config.server.port < 1 || config.server.port > 65535) throw new Error('server.port must be an integer from 1 to 65535');
  if (!Object.keys(config.viewports ?? {}).length) throw new Error('at least one viewport is required');
  Object.entries(config.viewports).forEach(([name, viewport]) => {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error(`invalid viewport name: ${name}`);
    if (!Number.isInteger(viewport.width) || !Number.isInteger(viewport.height) || viewport.width < 1 || viewport.height < 1) throw new Error(`viewport ${name} needs positive integer width and height`);
  });
  const ids = new Set<string>();
  config.states.forEach((state) => {
    if (!/^[a-z0-9][a-z0-9/_-]*$/.test(state.id) || state.id.includes('//') || state.id.split('/').includes('..')) throw new Error(`unsafe state id: ${state.id}`);
    if (ids.has(state.id)) throw new Error(`duplicate state id: ${state.id}`);
    ids.add(state.id);
    if (!state.path.startsWith('/')) throw new Error(`state ${state.id} path must start with /`);
    if (!state.ready.length) throw new Error(`state ${state.id} needs at least one ready locator`);
    state.masks?.forEach((mask) => { if (!mask.reason.trim()) throw new Error(`mask ${mask.selector} in ${state.id} needs a reason`); });
  });
  const rootDir = dirname(configPath);
  const output = {
    baselines: safeRelative(config.output?.baselines ?? 'vrt/__screenshots__', 'output.baselines'),
    previews: safeRelative(config.output?.previews ?? 'vrt/.shots', 'output.previews'),
    results: safeRelative(config.output?.results ?? 'vrt/test-results', 'output.results'),
    report: safeRelative(config.output?.report ?? 'vrt/playwright-report', 'output.report'),
  };
  if (resolve(rootDir, output.baselines) === resolve(rootDir, output.previews)) throw new Error('preview and baseline paths must differ');
  const time = config.determinism?.time ?? '2026-01-01T12:00:00Z';
  if (Number.isNaN(Date.parse(time))) throw new Error(`determinism.time is invalid: ${time}`);
  return {
    ...config,
    configPath,
    rootDir,
    server: { ...config.server, env: config.server.env ?? {}, startupTimeout: config.server.startupTimeout ?? 30_000 },
    determinism: {
      time,
      timezone: config.determinism?.timezone ?? 'UTC',
      locale: config.determinism?.locale ?? 'en-US',
      reducedMotion: config.determinism?.reducedMotion ?? 'reduce',
      randomSeed: config.determinism?.randomSeed ?? 0xc0ffee,
    },
    output,
  };
};

export const findConfig = (cwd = process.cwd()): string => {
  const found = ['portable-vrt.config.ts', 'portable-vrt.config.mts', 'portable-vrt.config.js', 'portable-vrt.config.mjs']
    .map((name) => resolve(cwd, name)).find(existsSync);
  if (!found) throw new Error(`portable-vrt config not found in ${cwd}`);
  return found;
};

export const loadConfig = async (path = findConfig()): Promise<ResolvedConfig> => {
  let importPath = path;
  let temporary: string | undefined;
  if (/\.m?ts$/.test(path)) {
    temporary = `${path}.${process.pid}.${Date.now()}.mjs`;
    const output = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      fileName: path,
      reportDiagnostics: true,
    });
    const errors = output.diagnostics?.filter((item) => item.category === ts.DiagnosticCategory.Error) ?? [];
    if (errors.length) throw new Error(`could not compile ${path}: ${errors.map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('; ')}`);
    writeFileSync(temporary, output.outputText);
    importPath = temporary;
  }
  try {
    const loaded = await import(`${pathToFileURL(importPath).href}?t=${Date.now()}`) as { default?: PortableVrtConfig };
    if (!loaded.default) throw new Error(`${path} must have a default export`);
    return validateConfig(loaded.default, path);
  } finally {
    if (temporary) unlinkSync(temporary);
  }
};
