import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import test from 'node:test';
import { isPortFree, waitForPort } from '../src/processes.js';

test('detects occupied ports', async () => {
  const server = createServer(); await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert(address && typeof address === 'object');
  assert.equal(await isPortFree(address.port), false);
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('server timeout is actionable', async () => {
  await assert.rejects(waitForPort(9, 30), /did not become ready/);
});
