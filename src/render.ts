import type { Page } from '@playwright/test';
import type { ResolvedConfig, VrtState } from './types.js';

const seededRandom = (seed: number): string => `{
  let s = ${seed >>> 0};
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}`;

export const preparePage = async (page: Page, state: VrtState, config: ResolvedConfig): Promise<void> => {
  await page.emulateMedia({ reducedMotion: config.determinism.reducedMotion });
  await page.addInitScript(seededRandom(config.determinism.randomSeed));
  const storage = { local: state.localStorage ?? {}, session: state.sessionStorage ?? {} };
  if (Object.keys(storage.local).length || Object.keys(storage.session).length) {
    await page.addInitScript(({ local, session }) => {
      Object.entries(local).forEach(([key, value]) => localStorage.setItem(key, value));
      Object.entries(session).forEach(([key, value]) => sessionStorage.setItem(key, value));
    }, storage);
  }
  await page.clock.setFixedTime(new Date(config.determinism.time));
  await page.goto(state.path);
  for (const selector of state.ready) await page.locator(selector).first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  if (state.actions) await state.actions(page);
  for (const selector of state.settled ?? []) await page.locator(selector).first().waitFor({ state: 'visible', timeout: 30_000 });
};

export const baselineParts = (state: VrtState, viewportName: string, firstViewport: string): string[] => {
  const parts = state.id.split('/');
  const leaf = parts.pop()!;
  return [...parts, `${leaf}${viewportName === firstViewport ? '' : `.${viewportName}`}.png`];
};
