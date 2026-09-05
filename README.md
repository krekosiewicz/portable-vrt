# portable-vrt

Deterministic visual regression tests without moving your application into a
container. Your app runs normally on the host; matching Playwright client and
Chromium versions run in a pinned `linux/amd64` container. Host Chromium handles
fast previews and numeric probes. Only the container may write baselines.

> Pre-1.0: pin an exact version. A Playwright/Chromium upgrade can require a
> deliberate mass rebaseline and will be isolated in its own release.

## Ten-minute integration

Requirements: Node.js 24+, npm, Docker on macOS or Linux, Git LFS, and a dev
server that can bind to `0.0.0.0`.

```sh
npm install --save-dev --save-exact portable-vrt@0.1.1
git lfs install
git lfs track 'vrt/__screenshots__/**/*.png'
```

Add `portable-vrt.config.ts`:

```ts
import { defineConfig } from 'portable-vrt';

export default defineConfig({
  server: {
    command: 'npm run dev -- --hostname 0.0.0.0 --port 4173',
    port: 4173,
  },
  viewports: {
    desktop: { width: 1366, height: 768 },
    mobile: { width: 390, height: 844 },
  },
  determinism: {
    time: '2026-01-01T12:00:00Z',
    timezone: 'UTC',
    locale: 'en-US',
    randomSeed: 0xc0ffee,
  },
  states: [{ id: 'home/default', path: '/', ready: ['main', 'text=Welcome'] }],
});
```

Add scripts:

```json
{
  "scripts": {
    "shot": "portable-vrt shot",
    "vrt": "portable-vrt verify",
    "vrt:update": "portable-vrt update"
  }
}
```

Then diagnose the environment and capture the initial baseline:

```sh
npx portable-vrt doctor
npm run vrt:update
```

Commit `.gitattributes`, the config, and `vrt/__screenshots__`. Copy
[`examples/github-actions/vrt.yml`](examples/github-actions/vrt.yml) into your
repository's workflows.

Normal workflow: use `shot`, `probe`, and `pixel` while developing; run one full
`verify`; inspect actual/diff images in `vrt/test-results`; run one final full
`update`; commit the changed LFS baselines once. Never use host previews as
baselines.

## Commands

```sh
portable-vrt doctor
portable-vrt list
portable-vrt shot home/default
portable-vrt shot home/default --viewport mobile
portable-vrt shot home/default --clip '.card'
portable-vrt probe home/default '.card, nav'
portable-vrt pixel home/default '.scene@34,7'
portable-vrt verify
portable-vrt verify --grep 'home/'
portable-vrt update
```

`update` always renders every configured state and rejects `--grep`. Preview
artifacts default to `vrt/.shots`, separate from committed baselines. Add that
directory, `vrt/test-results`, `vrt/playwright-report`, and the transient
`vrt/.portable-vrt-runtime` (written for each Docker run, removed after) to
`.gitignore`.

## States and actions

Actions receive the package-exported Playwright `Page` type:

```ts
import { defineConfig, type Page } from 'portable-vrt';

const openMenu = async (page: Page) => page.getByRole('button', { name: 'Menu' }).click();

export default defineConfig({
  // server and viewports omitted
  states: [{
    id: 'home/menu-open',
    path: '/',
    ready: ['main'],
    actions: openMenu,
    settled: ['nav[aria-label="Main"]'],
  }],
});
```

`ready` proves fetched content and upgraded components exist before actions.
`settled` proves the action reached its intended state. Do not use
`networkidle` as readiness evidence.

## Authentication and deterministic data

Seed storage before application scripts execute:

```ts
{
  id: 'account/authenticated',
  path: '/account',
  ready: ['text=Signed in'],
  localStorage: { theme: 'dark' },
  sessionStorage: { accessToken: 'fixture-token' },
}
```

Use fixture accounts and deterministic API responses; never put production
credentials in config. `portable-vrt` freezes wall time, timezone, locale,
`Math.random`, reduced motion, viewport, and device scale. It waits for
self-hosted fonts through `document.fonts.ready`. Remote fonts and live APIs
remain sources of variance and should be replaced by local test fixtures.

## Masks

Masks are for regions that cannot be made deterministic, not for hiding bugs.
Every mask requires a reviewable reason:

```ts
masks: [{ selector: '.third-party-map', reason: 'tiles vary by provider edge' }]
```

## Baselines and conflicts

The first viewport is unsuffixed; later viewports use `.<viewport>`:
`home/default.png`, `home/default.mobile.png`. Nested state IDs create nested
directories. PNGs should be Git LFS objects. Never hand-merge a baseline
conflict: rebase, run a full verification, inspect diffs, then perform one full
update with owner approval. LFS stores whole objects, so repeated updates cost
storage.

## Next.js and host networking

Next.js must bind to `0.0.0.0`, for example:

```ts
server: {
  command: 'npm run dev -- --hostname 0.0.0.0 --port 4173',
  port: 4173,
}
```

The browser container reaches the host through `host.docker.internal`; Linux
uses Docker's `host-gateway` mapping. The app stays on the host while Chromium
runs in the pinned container.

## Troubleshooting

Run `portable-vrt doctor` first. It reports exact remedies for unsupported
Node, a stopped Docker daemon, missing Git LFS, unresolved LFS pointer files,
an occupied app port, or a missing host Chromium. If startup times out, run the
configured server command directly and confirm it listens on `server.port`.

When Playwright changes, expect raster differences. Keep that dependency bump
alone, inspect every diff, update once, and mention expected rendering changes
in the release notes.

## Output defaults

| Purpose | Default |
| --- | --- |
| Committed baselines | `vrt/__screenshots__` |
| Host previews | `vrt/.shots` |
| Failure results | `vrt/test-results` |
| HTML report | `vrt/playwright-report` |

Paths are project-relative and may not escape the project root.

## License

MIT
