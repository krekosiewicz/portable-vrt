import { defineConfig } from 'portable-vrt';

export default defineConfig({
  server: { command: 'npm run dev -- --hostname 0.0.0.0 --port 4173', port: 4173 },
  viewports: { desktop: { width: 1366, height: 768 }, mobile: { width: 390, height: 844 } },
  determinism: { time: '2026-01-01T12:00:00Z', timezone: 'UTC', locale: 'en-US', randomSeed: 0xc0ffee },
  states: [{ id: 'home/default', path: '/', ready: ['main', 'text=Welcome'] }],
});
