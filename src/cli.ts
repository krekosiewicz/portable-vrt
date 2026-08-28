#!/usr/bin/env node
import { loadConfig } from './config.js';
import { runDocker } from './docker.js';
import { runDoctor } from './doctor.js';
import { runHost } from './host.js';

const [command, ...args] = process.argv.slice(2);
const value = (flag: string): string | undefined => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const positional = args.filter((item, index) => !item.startsWith('--') && (index === 0 || !args[index - 1]!.startsWith('--')));

const usage = `portable-vrt <command>\n\n  doctor\n  list\n  shot <state> [--viewport <name>] [--clip <selector>]\n  probe <state> <selector[, selector]> [--viewport <name>]\n  pixel <state> <selector@x,y|x,y> [more specs] [--viewport <name>]\n  verify [--grep <pattern>]\n  update`;

try {
  if (!command || command === '--help' || command === 'help') { console.log(usage); process.exit(0); }
  const config = await loadConfig();
  const viewport = value('--viewport') ?? Object.keys(config.viewports)[0]!;
  if (command === 'list') config.states.forEach((state) => console.log(state.id));
  else if (command === 'doctor') {
    const checks = await runDoctor(config); checks.forEach((check) => console.log(`${check.ok ? 'ok  ' : 'FAIL'} ${check.name}${check.detail ? ` (${check.detail})` : ''}${!check.ok && check.fix ? `\n     fix: ${check.fix}` : ''}`));
    if (checks.some((check) => !check.ok)) process.exitCode = 1;
  } else if (command === 'shot') console.log(await runHost(config, positional[0]!, viewport, { kind: 'shot', ...(value('--clip') ? { clip: value('--clip')! } : {}) }));
  else if (command === 'probe') console.log(JSON.stringify(await runHost(config, positional[0]!, viewport, { kind: 'probe', selectors: positional[1]!.split(',').map((item) => item.trim()).filter(Boolean) }), null, 2));
  else if (command === 'pixel') console.log(JSON.stringify(await runHost(config, positional[0]!, viewport, { kind: 'pixel', specs: positional.slice(1) }), null, 2));
  else if (command === 'verify') await runDocker(config, false, value('--grep'));
  else if (command === 'update') await runDocker(config, true, value('--grep'));
  else throw new Error(`unknown command: ${command}\n\n${usage}`);
} catch (error) {
  console.error(`portable-vrt: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1;
}
