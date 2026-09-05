# Changelog

## 0.1.2 - 2026-09-05

- `update` rejects `--grep` as documented; filtered runs are `verify` only.
- README and CI example say Node.js 24+ and `@0.1.1`, matching `engines`.
- Release workflow uses `npm stage publish`; each version must be approved on npmjs.com before it goes live.

## 0.1.1 - 2026-08-28

- Release version check fix; Node engine raised to 24. First published version.

## 0.1.0 - 2026-08-28

- Initial deterministic VRT, preview, probe, pixel, doctor, and CI workflow.
