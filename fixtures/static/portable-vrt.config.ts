import { defineConfig } from 'portable-vrt';
export default defineConfig({ server: { command: 'npx serve . -l 4173', port: 4173 }, viewports: { desktop: { width: 800, height: 600 } }, states: [{ id: 'home/default', path: '/', ready: ['text=Welcome'] }] });
