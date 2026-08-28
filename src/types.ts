import type { Page } from '@playwright/test';

export type { Page } from '@playwright/test';

export type Viewport = { width: number; height: number };
export type StorageSeed = Record<string, string>;

export type VrtState = {
  /** Stable slash-separated ID, also used as the baseline path. */
  id: string;
  /** Route relative to the configured server origin. */
  path: string;
  /** Visible locators proving asynchronous content is ready. */
  ready: string[];
  actions?: (page: Page) => Promise<void>;
  settled?: string[];
  localStorage?: StorageSeed;
  sessionStorage?: StorageSeed;
  /** Nondeterministic regions. Every mask requires a human-readable reason. */
  masks?: Array<{ selector: string; reason: string }>;
};

export type PortableVrtConfig = {
  server: {
    command: string;
    port: number;
    env?: Record<string, string>;
    startupTimeout?: number;
  };
  viewports: Record<string, Viewport>;
  states: VrtState[];
  determinism?: {
    time?: string;
    timezone?: string;
    locale?: string;
    reducedMotion?: 'reduce' | 'no-preference';
    randomSeed?: number;
  };
  output?: {
    baselines?: string;
    previews?: string;
    results?: string;
    report?: string;
  };
};

export type ResolvedConfig = Omit<PortableVrtConfig, 'determinism' | 'output' | 'server'> & {
  rootDir: string;
  configPath: string;
  server: Required<Pick<PortableVrtConfig['server'], 'command' | 'port' | 'startupTimeout'>> & {
    env: Record<string, string>;
  };
  determinism: Required<NonNullable<PortableVrtConfig['determinism']>>;
  output: Required<NonNullable<PortableVrtConfig['output']>>;
};
