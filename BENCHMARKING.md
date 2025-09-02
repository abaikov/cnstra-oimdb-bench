# Benchmarking Guide (Best Conditions)

This project aims to evaluate state managers under their best-practice, production conditions. This guide documents configurations, patterns, and exclusions to ensure fairness and reproducibility.

## Global rules
- Production builds only (NODE_ENV=production, minified, dead code eliminated).
- Same React version and virtualization library across apps.
- Deterministic dataset via core generator (seeded).
- Normalized entities across all managers.
- Avoid dev-only helpers, debug wrappers, or general-purpose event buses.
- Disable overlays with `?overlays=0` for pure measurements.

## Common UI rules
- Virtualized deck list: 100 visible rows.
- Memoize row renderers/selectors per manager idioms.
- Strictly avoid prop drilling of large data structures.
- Fine-grained subscriptions/selectors where supported.

## What we measure
- Time-to-interactive (TTI) for the first deck render.
- Render counts per component (optional overlays).
- Input latency during typing (optional overlay).
- FPS under background churn (optional overlay).
- Update amplification (# of components touched per change).
- Memory after mount (Chrome Memory, optional).

## Per-library best practices

### Redux Toolkit
- Use `@reduxjs/toolkit` with `createEntityAdapter` for users, cards, comments, decks.
- Co-locate slices, keep selectors memoized with `createSelector`.
- Use `react-redux` `useSelector` with strict, narrow selectors and referentially stable projections.
- Prefer `useCallback` for action dispatchers, avoid inline objects in props.
- Enable `batch()` where appropriate for bulk updates.

### Effector
- Use `createStoreMap` or split stores for fine-grained reactivity.
- Access data via `useUnit` or `useStoreMap` to minimize recomputation.
- Events for granular updates; avoid broad derived stores for entire trees.

### MobX
- Model normalized maps as observable maps (`observable.map`).
- Use `observer` and `computed` for derived data.
- Avoid large observable arrays of objects; prefer maps + ids.
- Strict actions for mutations.

### Zustand
- Use slice-based stores, selectors with referential equality.
- Avoid setting new objects unless changed; use shallow compare where needed.
- Use `subscribeWithSelector` for targeted subscriptions.

### Recoil
- Normalize entities into atom families/selectors families.
- Use `waitForNone` for fetch-like selectors; memoize selectors.
- Minimize large atom invalidations; use atom families keyed by ids.

### Jotai
- Atom families for entities, derived atoms for computed fields.
- Use `selectAtom` for fine-grained subscriptions.

### Valtio
- Split proxies; avoid deep nested large objects.
- Use `useSnapshot` on the smallest possible proxy.

### @cnstra/react + @oimdb/react
- Use reactive collections and fine-grained queries.
- Prefer collaterals/references over joining in render.
- Subscribe to the smallest unit (e.g., document-level, not entire table).

## Exclusions (remove from bench builds)
- Devtools integrations (Redux DevTools, MobX devtools, Zustand devtools).
- Runtime schema validators, immutability dev helpers, debug logs.
- Any layer that causes extra renders but isn’t essential to the manager.

## Repro steps
1. `npm run build`
2. Start the app (`npm run preview`) and load with `?overlays=0` for raw results.
3. Run workloads via UI buttons.
4. Capture timings with Chrome Performance Panel for definitive numbers.
