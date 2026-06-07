# React State Management Benchmark Results

> **Read this first (2026-06).** These results were produced after a long effort
> to make the comparison honest and hard to dispute. The two things that matter:
>
> 1. **Measure the PRODUCTION React build.** The dev build (`vite dev`) carries
>    ~2× overhead (`jsxDEV`, `assignFiberPropertiesInDEV`, prop validation) that
>    *dominates and masks* the state layer entirely. Earlier runs that put one
>    library ahead of another inside the fast tier were measuring dev-mode noise
>    and instrumentation, not the libraries. All numbers below are from
>    `vite build` + `preview` (prod).
> 2. **React's per-commit overhead drowns out every fine-grained store.** Once a
>    store delivers updates strictly per-key (no whole-collection copy), the
>    bottleneck is React, not the store. Those libraries tie at the React floor;
>    the sub-millisecond ordering between them is **a coin flip, not a ranking.**
>
> What *is* measurable and meaningful: the **tier split** (fine-grained vs coarse
> stores), the **state layer in isolation** (no React — where the real
> architectural differences live), and **memory footprint**.

## Tested adapters (9)

| # | Adapter | Shape |
|---|---|---|
| 1 | **Cnstra + Oimdb (ids-based)** | OIMDB reactive collections + indexes, CNS carries writes, merge updater (new entity ref per change) |
| 2 | **Cnstra + Oimdb (in-place)** | Same, but `createInPlaceEntityUpdater` mutates entities in place + signal hooks (no new refs, no allocation per write) |
| 3 | **Oimdb (no cnstra)** | OIMDB collections written directly (`upsertOne` + `flush`), no CNS orchestration — isolates the DB cost |
| 4 | **MobX (ids-based)** | `observable.map` (shallow), entity replacement via `map.set`, `useObserver` hooks |
| 5 | **MobX (deep/in-place)** | Deep `observable.map`, in-place field mutation, `observer()` components reading raw observables (canonical MobX) |
| 6 | **Effector (atomic stores)** | One store + setter event per entity — maximally granular, no record copy |
| 7 | **Effector (ids-based)** | Idiomatic: entities in `Record` stores, incremental indexes, `useStoreMap` |
| 8 | **Zustand (ids-based)** | Single store, manual normalization, shallow-equal selectors |
| 9 | **Redux Toolkit (ids-based)** | `createSlice` + `createEntityAdapter` + memoized selectors |

Library versions: `@cnstra/core` 2.3, `@cnstra/react` 1.1, `@oimdb/core` 3.0,
`@oimdb/react` 2.1.

## Environment

- Chrome (system), macOS, 8 logical cores.
- **Production** React build (`vite build` + `preview`, :4173).
- Throughput driven via Puppeteer using `flushSync` (no `requestAnimationFrame`,
  so updates are not frame-capped); best-of-N runs; 1500 mounted components.
- Run-to-run variance is real on a single machine — treat differences inside the
  fast tier (≈33–36 µs) as noise.

---

## 1. React throughput — production (µs / update, lower is better)

How fast the full stack (store write → React commit) can apply one single-field
update, unthrottled. `renders/update = 1` for every adapter — all use id-based
subscriptions and re-render exactly the changed component.

| Adapter | µs / update | updates / s | renders / update |
|---|---:|---:|---:|
| MobX (deep/in-place) | 33.0 | 30 300 | 1 |
| MobX (ids-based) | 33.3 | 30 060 | 1 |
| Oimdb (no cnstra) | 33.4 | 29 940 | 1 |
| Cnstra + Oimdb (in-place) | 33.9 | 29 470 | 1 |
| Cnstra + Oimdb (ids-based) | 34.2 | 29 210 | 1 |
| Effector (atomic stores) | 36.1 | 27 700 | 1 |
| Effector (ids-based) | ~1 230 | ~810 | 1 |
| Zustand (ids-based) | ~2 300 | ~430 | 1 |
| Redux Toolkit (ids-based) | ~5 600 | ~180 | 1 |

**Two tiers, and only the split is real:**

- **Fast tier (~33–36 µs): MobX ×2, Oimdb, Cnstra + Oimdb ×2, Effector atomic.**
  They all deliver updates per-key with no whole-collection copy. The ~3 µs
  spread across these six is **inside the noise** — it is React commit overhead,
  not the store. Do not read a ranking into it.
- **Coarse tier: Effector idiomatic (~1230), Zustand (~2300), Redux (~5600)** —
  **35×–160× slower.** Each pays a per-update cost proportional to how much it
  touches beyond the changed entity: a whole-record shallow copy plus every
  mounted selector re-running (Effector `useStoreMap`, Zustand selectors), or
  Immer drafting + selector plumbing (Redux).

---

## 2. State layer in isolation — no React, no rAF (µs / update)

`scripts/micro-bench.mjs` (`npm run bench:micro`). 200,000 single-field updates
over 500 entities, **with one active subscriber per entity** (the realistic case
— every entity has a mounted component reading it), JIT warmed. Each row's
`notify` count equals the iteration count, proving subscribers actually fired
(no short-circuiting). This is where the React floor is removed and real
architectural differences become visible.

> Measuring *with* subscribers matters: a batched store with none does almost
> nothing on `flush()`, which would unfairly flatter it. Here every update
> delivers exactly one notification.

| State layer (what runs per update, 1 subscriber/entity) | µs / update |
|---|---:|
| **OIMDB** in-place `upsertOne` + `flush` | **0.25** |
| **OIMDB** merge `upsertOne` + `flush` | 0.34 |
| **Cnstra → OIMDB** full `stimulate` → dendrite → `upsert` + `flush` | 0.48 |
| **MobX** deep in-place + reaction | 0.67 |
| **MobX** `map.set` + reaction | 0.74 |
| **Effector (atomic)** per-entity `set` + watch | 0.89 |
| **Zustand** `setState` + N selectors | ~95 |
| **Effector (ids-based)** `{...record}` copy + N `useStoreMap` selectors | ~248 |
| **Redux** `dispatch` (Immer) + N selectors | ~302 |

What this says:

- **The fine-grained group is all sub-microsecond (0.25–0.89 µs)** — ~40,000×
  smaller than one React commit. That is *why* they tie in table 1: at React
  scale the difference is invisible.
- **Within that group, OIMDB leads.** A specialised keyed store delivers straight
  to the changed key; in-place avoids even the new-object allocation. MobX and
  Effector-atomic do a bit more per write but are still excellent.
- **Cnstra's full action path (0.48 µs) ≈ 1.4× the bare OIMDB write (0.34 µs)** —
  `cns.stimulate` adds neuron-graph traversal (signal → dendrite) on top of the
  storage write. That orchestration (deterministic, hop-bounded flow) is the
  *point* of Cnstra; the storage underneath remains the fastest in the table.
- **The coarse tier (95–302 µs) is ~100–1000× the fine-grained group** — the
  whole-record copy plus every selector re-running on each change. This is the
  real, visible cost that puts these three in the slow tier of table 1.

---

## 3. Memory — steady-state heap (MB, lower is better)

Production build, full dataset + mounted UI, forced GC (CDP
`HeapProfiler.collectGarbage`), then `JSHeapUsedSize`. DOM node count is 50,162
for **every** adapter (identical UI), so the difference is purely the store's
data representation.

| Adapter | heap MB |
|---|---:|
| **Cnstra + Oimdb (in-place)** | **25.8** |
| Cnstra + Oimdb (ids-based) | 28.1 |
| Oimdb (no cnstra) | 28.1 |
| Zustand (ids-based) | 30.2 |
| MobX (ids-based) | 31.5 |
| MobX (deep/in-place) | 37.4 |
| Redux Toolkit (ids-based) | 37.7 |
| Effector (ids-based) | 42.0 |
| **Effector (atomic stores)** | **89.7** |

- **Cnstra / Oimdb have the lightest footprint** (25.8–28.1 MB); in-place is
  lowest, as it also avoids per-write allocations.
- **Effector (atomic) is the heaviest by far — 89.7 MB, ~3.5× the lightest.**
  That is the cost of "one store + one event per entity": thousands of Effector
  units. Atomic-Effector buys its fast-tier update speed with memory — an
  explicit trade-off, not a free win.
- **MobX deep (37.4) > MobX ids (31.5):** deep observables wrap every field
  (proxies/atoms), so the canonical mode costs memory too.
- Redux and idiomatic Effector sit at ~38–42 MB.

---

## Key findings

1. **The fast tier is a six-way tie at the React floor** (~33–36 µs): MobX (both
   modes), Oimdb, Cnstra + Oimdb (both modes), Effector atomic. **React's
   per-commit overhead drowns out any well-designed fine-grained store** — once
   you deliver updates per-key, React *is* the bottleneck, and the ordering
   between these six is a coin flip. Their React-throughput numbers carry no
   signal.
2. **Only three things are actually measurable:** the **tier split** (fine-grained
   vs coarse, a 35×–160× gap that is unambiguous), the **state layer in
   isolation** (where Oimdb/Cnstra lead at 0.25–0.48 µs), and **memory**
   (where Cnstra/Oimdb are lightest and atomic-Effector is 3.5× heavier).
3. **Cnstra + Oimdb's honest standing:** in React — even with the best of them
   (the React floor hides everyone); on the raw state layer — **fastest**; on
   memory — **lightest**. That is a genuinely strong result that React throughput
   alone cannot show.
4. **The earlier "X is faster than Y in the fast tier" confusion was a
   measurement artifact** — dev-build React plus benchmark instrumentation, not
   the libraries. Prod + minimal instrumentation makes the tier flat.
5. **Coarse stores (Redux, idiomatic Effector, Zustand) pay for breadth:** a
   whole-record copy and a fan-out of selector re-runs on every single update.

---

## Architecture → why the numbers differ

- **Cnstra + Oimdb** — normalized collections keyed by PK with reactive
  `Map<Key, PK[]>` indexes; writes update PKs incrementally and `flush()` applies
  them atomically; components subscribe at the exact id/index-key via
  `useSyncExternalStore`. The in-place variant mutates the existing entity object
  (no new ref, no allocation) and re-renders via key-signal hooks. Per-key
  delivery, no record copies.
- **Oimdb (no cnstra)** — the same DB written directly, isolating the storage
  cost from CNS orchestration.
- **MobX** — `observable.map` per entity kind tracks reads per key; an update
  invalidates only observers of that id. The deep/in-place variant uses
  `observer()` components reading raw deep observables (canonical MobX, no
  snapshot copy into render). Per-key delivery, no record copies.
- **Effector (atomic stores)** — one store + setter event per entity; an update
  fires exactly one store. Same update granularity as the leaders, at the cost of
  many units (the memory hit) and more init boilerplate.
- **Effector (ids-based)** — entities in one `Record` store per kind; an update
  produces a new record object (`{...record}`, O(entities) copy) and every
  mounted `useStoreMap` re-runs its selector on each store change.
- **Zustand** — single store of `Record` maps + per-entity id arrays; per-selector
  shallow-equal subscriptions; pays record copies on update.
- **Redux Toolkit** — `createEntityAdapter` `{ids, entities}`; action → Immer
  draft → structural sharing; memoized selectors. Immer proxying is the dominant
  fixed cost.

## Methodology / reproduce

- **Always measure the production build.** Dev-mode React (~2× overhead) masks
  the state layer; it is the single biggest source of misleading results.
- React throughput: `npm run bench:throughput` (uses `flushSync`, best-of-N).
- State layer: `npm run bench:micro`.
- Memory: load each adapter on the prod preview, CDP `HeapProfiler.collectGarbage`
  ×N, read `page.metrics().JSHeapUsedSize`.
- On recent macOS the bundled Chromium may fail to launch; run with
  `PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`.
