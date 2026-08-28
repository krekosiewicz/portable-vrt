import { chmodSync } from 'node:fs';
const cli = new URL('../dist/cli.js', import.meta.url);
chmodSync(cli, 0o755);
