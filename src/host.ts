import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { chromium, type Browser, type Page } from 'playwright';
import { preparePage } from './render.js';
import { installCleanup, startApp, stopProcess } from './processes.js';
import type { ResolvedConfig, VrtState } from './types.js';

const styles = ['fill', 'fill-opacity', 'background-color', 'color', 'transform', 'z-index', 'pointer-events', 'display', 'opacity', 'overflow'];

export const selectState = (config: ResolvedConfig, id: string): VrtState => {
  const state = config.states.find((candidate) => candidate.id === id);
  if (!state) throw new Error(`unknown state: ${id}\navailable:\n${config.states.map((item) => `  ${item.id}`).join('\n')}`);
  return state;
};

const samplePixel = async (page: Page, spec: string): Promise<string> => {
  const [selector, coordinates] = spec.includes('@') ? spec.split('@', 2) : [undefined, spec];
  const values = coordinates!.split(',').map(Number);
  if (values.length !== 2 || values.some(Number.isNaN)) throw new Error(`invalid pixel spec: ${spec}; use selector@x,y or x,y`);
  let point = { x: values[0]!, y: values[1]! };
  if (selector) {
    const locator = page.locator(selector).first();
    const box = await locator.boundingBox();
    if (!box) throw new Error(`${selector} has no visible box`);
    const viewBox = await locator.getAttribute('viewBox');
    if (viewBox) {
      const [, , width, height] = viewBox.split(/\s+/).map(Number);
      point = { x: box.x + point.x * box.width / width!, y: box.y + point.y * box.height / height! };
    } else point = { x: box.x + point.x, y: box.y + point.y };
  }
  const viewport = page.viewportSize()!;
  if (point.x < 0 || point.y < 0 || point.x >= viewport.width || point.y >= viewport.height) throw new Error(`pixel point is outside the ${viewport.width}x${viewport.height} viewport`);
  const png = await page.screenshot({ clip: { x: Math.round(point.x), y: Math.round(point.y), width: 1, height: 1 }, animations: 'disabled', caret: 'hide' });
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const [, r, g, b] = inflateSync(Buffer.concat(chunks));
  return `rgb(${r}, ${g}, ${b}) #${[r, g, b].map((value) => value!.toString(16).padStart(2, '0')).join('')}`;
};

type HostMode = { kind: 'shot'; clip?: string } | { kind: 'probe'; selectors: string[] } | { kind: 'pixel'; specs: string[] };

export const runHost = async (config: ResolvedConfig, id: string, viewportName: string, mode: HostMode): Promise<unknown> => {
  const state = selectState(config, id);
  const viewport = config.viewports[viewportName];
  if (!viewport) throw new Error(`unknown viewport: ${viewportName}`);
  const app = await startApp(config);
  let browser: Browser | undefined;
  const removeHandlers = installCleanup(() => { void browser?.close(); stopProcess(app); });
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, baseURL: `http://127.0.0.1:${config.server.port}`, locale: config.determinism.locale, timezoneId: config.determinism.timezone });
    const page = await context.newPage();
    await preparePage(page, state, config);
    if (mode.kind === 'probe') return await page.evaluate(([selectors, properties]) => Object.fromEntries(selectors.map((selector) => [selector, [...document.querySelectorAll(selector)].map((element) => {
      const rect = element.getBoundingClientRect(); const computed = getComputedStyle(element);
      return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, styles: Object.fromEntries(properties.map((property) => [property, computed.getPropertyValue(property)])) };
    })])), [mode.selectors, styles] as const);
    if (mode.kind === 'pixel') return await Promise.all(mode.specs.map(async (spec) => ({ spec, color: await samplePixel(page, spec) })));
    const parts = state.id.split('/');
    const output = resolve(config.rootDir, config.output.previews, ...parts.slice(0, -1), `${parts.at(-1)}${viewportName === Object.keys(config.viewports)[0] ? '' : `.${viewportName}`}.png`);
    await mkdir(dirname(output), { recursive: true });
    const clip = mode.clip ? await page.locator(mode.clip).first().boundingBox() : undefined;
    if (mode.clip && !clip) throw new Error(`${mode.clip} has no visible box`);
    await page.screenshot({ path: output, ...(clip ? { clip } : {}), mask: (state.masks ?? []).map((mask) => page.locator(mask.selector)), animations: 'disabled', caret: 'hide' });
    return output;
  } finally {
    removeHandlers(); await browser?.close(); stopProcess(app);
  }
};
