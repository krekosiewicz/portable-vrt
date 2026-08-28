# Migration from a copied Playwright harness

1. Preserve the existing baseline directory and Git LFS objects.
2. Translate the manifest into `portable-vrt.config.ts`, keeping every route,
   readiness locator, action, storage seed, viewport, and mask.
3. Configure `output.baselines` to point at the existing PNG directory.
4. Replace local runners with `portable-vrt shot`, `verify`, and `update`.
5. Run a full `verify`. A harness-only migration must not require a rebaseline.
