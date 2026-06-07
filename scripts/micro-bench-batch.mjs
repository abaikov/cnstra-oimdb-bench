#!/usr/bin/env node
/**
 * Batching-efficiency microbenchmark — NO React, NO requestAnimationFrame.
 *
 * Companion to micro-bench.mjs. Same workload (200,000 single-field updates over
 * 500 entities, one active subscriber per entity, JIT warmed), but each system is
 * driven through ONE parametrised code path with a batch size B:
 *
 *   - B = 1   → commit (flush / action / dispatch / setState) after every update.
 *   - B = 100 → apply 100 updates to 100 distinct entities, then commit ONCE.
 *
 * Because both modes share the identical code path (only B changes), the ratio
 * B1µs / B100µs is a clean measure of how much each library's commit machinery
 * amortises across a batch — i.e. its batching efficiency.
 *
 * Every batch touches B *distinct* entities (B <= N), so total notifications =
 * 200,000 in both modes; the `notify` count proves subscribers fired and that
 * batching is not silently dropping updates.
 *
 * Run: node scripts/micro-bench-batch.mjs
 */
import { observable, runInAction, reaction } from 'mobx';
import { createStore, createEvent } from 'effector';
import {
    OIMEventQueue,
    OIMReactiveCollection,
    createInPlaceEntityUpdater,
} from '@oimdb/core';
import { CNS, neuron, collateral } from '@cnstra/core';
import { createStore as createZustand } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';
import { configureStore, createSlice, createEntityAdapter } from '@reduxjs/toolkit';

const N = 500; // entities
const ITERS = 200_000; // total single-field updates
const BATCH = 100; // batched commit size
const ids = Array.from({ length: N }, (_, i) => 'card_' + i);
const mk = (id) => ({
    id, deckId: 'd0', title: 't', description: 'd',
    authorId: 'u0', createdAt: 0, updatedAt: 0,
});

// Each system exposes runner(B): applies `n` updates in chunks of B, one commit
// per chunk, and returns the number of notifications observed.

const systems = [];
const add = (label, setup) => systems.push({ label, setup });

add('oimdb (merge)', () => {
    const q = new OIMEventQueue({});
    const c = new OIMReactiveCollection(q, { selectPk: (e) => e.id });
    c.upsertMany(ids.map(mk));
    let count = 0;
    for (const id of ids) c.subscribeOnKey(id, () => { count++; });
    return (n, B) => {
        const start = count;
        for (let off = 0; off < n; off += B) {
            for (let j = 0; j < B; j++) c.upsertOne({ id: ids[(off + j) % N], updatedAt: off + j });
            q.flush();
        }
        return count - start;
    };
});

add('oimdb (in-place)', () => {
    const q = new OIMEventQueue({});
    const c = new OIMReactiveCollection(q, {
        selectPk: (e) => e.id,
        updateEntity: createInPlaceEntityUpdater(),
    });
    c.upsertMany(ids.map(mk));
    let count = 0;
    for (const id of ids) c.subscribeOnKey(id, () => { count++; });
    return (n, B) => {
        const start = count;
        for (let off = 0; off < n; off += B) {
            for (let j = 0; j < B; j++) c.upsertOne({ id: ids[(off + j) % N], updatedAt: off + j });
            q.flush();
        }
        return count - start;
    };
});

add('cnstra + oimdb', () => {
    const q = new OIMEventQueue({});
    const c = new OIMReactiveCollection(q, { selectPk: (e) => e.id });
    c.upsertMany(ids.map(mk));
    let count = 0;
    for (const id of ids) c.subscribeOnKey(id, () => { count++; });
    const updateBatch = collateral();
    const cns = new CNS([
        neuron({}).dendrite({
            collateral: updateBatch,
            response: (items) => {
                for (const it of items) c.upsertOne({ id: it.id, updatedAt: it.v });
                q.flush();
            },
        }),
    ]);
    return (n, B) => {
        const start = count;
        for (let off = 0; off < n; off += B) {
            const batch = new Array(B);
            for (let j = 0; j < B; j++) batch[j] = { id: ids[(off + j) % N], v: off + j };
            cns.stimulate(updateBatch.createSignal(batch));
        }
        return count - start;
    };
});

add('mobx (map.set)', () => {
    const m = observable.map(Object.fromEntries(ids.map((id) => [id, mk(id)])), { deep: false });
    let count = 0;
    for (const id of ids) reaction(() => m.get(id), () => { count++; });
    return (n, B) => {
        const start = count;
        for (let off = 0; off < n; off += B) {
            runInAction(() => {
                for (let j = 0; j < B; j++) {
                    const id = ids[(off + j) % N];
                    m.set(id, { ...m.get(id), updatedAt: off + j });
                }
            });
        }
        return count - start;
    };
});

add('mobx (deep in-place)', () => {
    const m = observable.map(Object.fromEntries(ids.map((id) => [id, mk(id)])));
    let count = 0;
    for (const id of ids) reaction(() => m.get(id)?.updatedAt, () => { count++; });
    return (n, B) => {
        const start = count;
        for (let off = 0; off < n; off += B) {
            runInAction(() => {
                for (let j = 0; j < B; j++) m.get(ids[(off + j) % N]).updatedAt = off + j;
            });
        }
        return count - start;
    };
});

// Effector atomic: one store + event per entity. There is no cross-store batch
// primitive — each event propagates and notifies immediately — so a "batch" is
// just B independent set() calls with no amortisation. Included to show that.
add('effector (atomic)', () => {
    const set = ids.map(() => createEvent());
    const st = ids.map((id, idx) => createStore(mk(id)).on(set[idx], (_, v) => v));
    let count = 0;
    st.forEach((s) => s.watch(() => { count++; }));
    return (n, B) => {
        const start = count;
        for (let off = 0; off < n; off += B) {
            for (let j = 0; j < B; j++) {
                const k = (off + j) % N;
                set[k]({ ...st[k].getState(), updatedAt: off + j });
            }
        }
        return count - start;
    };
});

// Zustand: one setState applies the whole batch; subscribeWithSelector runs all
// N selectors ONCE per commit, so batching turns the O(N) scan from per-update
// into per-batch.
add('zustand', () => {
    const store = createZustand(
        subscribeWithSelector(() => ({ cards: Object.fromEntries(ids.map((id) => [id, mk(id)])) })),
    );
    let count = 0;
    for (const id of ids) store.subscribe((s) => s.cards[id], () => { count++; });
    return (n, B) => {
        const start = count;
        for (let off = 0; off < n; off += B) {
            store.setState((s) => {
                const cards = { ...s.cards };
                for (let j = 0; j < B; j++) {
                    const id = ids[(off + j) % N];
                    cards[id] = { ...cards[id], updatedAt: off + j };
                }
                return { cards };
            });
        }
        return count - start;
    };
});

// Effector ids: one event carries the whole batch; the reducer copies the record
// once and every useStoreMap selector re-runs once per commit.
add('effector (ids)', () => {
    const ev = createEvent();
    const $c = createStore(Object.fromEntries(ids.map((id) => [id, mk(id)]))).on(
        ev,
        (s, items) => {
            const next = { ...s };
            for (const it of items) next[it.id] = { ...next[it.id], updatedAt: it.v };
            return next;
        },
    );
    let count = 0;
    ids.forEach((id) => { $c.map((s) => s[id]).watch(() => { count++; }); });
    return (n, B) => {
        const start = count;
        for (let off = 0; off < n; off += B) {
            const batch = new Array(B);
            for (let j = 0; j < B; j++) batch[j] = { id: ids[(off + j) % N], v: off + j };
            ev(batch);
        }
        return count - start;
    };
});

// Redux: one dispatch(updateMany) per commit — one Immer pass, subscribers run
// once.
add('redux', () => {
    const ad = createEntityAdapter();
    const slice = createSlice({
        name: 'cards',
        initialState: ad.addMany(ad.getInitialState(), ids.map(mk)),
        reducers: { updMany: (s, a) => ad.updateMany(s, a.payload) },
    });
    const store = configureStore({
        reducer: { cards: slice.reducer },
        middleware: (g) => g({ serializableCheck: false, immutableCheck: false }),
    });
    let count = 0;
    const prev = {};
    for (const id of ids) {
        prev[id] = store.getState().cards.entities[id];
        store.subscribe(() => {
            const v = store.getState().cards.entities[id];
            if (v !== prev[id]) { prev[id] = v; count++; }
        });
    }
    return (n, B) => {
        const start = count;
        for (let off = 0; off < n; off += B) {
            const batch = new Array(B);
            for (let j = 0; j < B; j++) batch[j] = { id: ids[(off + j) % N], changes: { updatedAt: off + j } };
            store.dispatch(slice.actions.updMany(batch));
        }
        return count - start;
    };
});

function measure(run, B) {
    run(2000, B); // warmup
    const t = process.hrtime.bigint();
    const notify = run(ITERS, B);
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    return { us: (ms / ITERS) * 1000, notify };
}

console.log(
    `Batching efficiency — ${ITERS.toLocaleString()} updates over ${N} entities, ` +
    `1 subscriber/entity. B=1 commits per update, B=${BATCH} commits per ${BATCH}.\n`,
);
console.log(
    'system'.padEnd(22),
    'B=1 µs/upd'.padStart(12),
    `B=${BATCH} µs/upd`.padStart(13),
    'speedup'.padStart(9),
    '  notify(B1/BN)',
);
console.log('-'.repeat(78));
for (const { label, setup } of systems) {
    const a = measure(setup(), 1);
    const b = measure(setup(), BATCH);
    const ratio = a.us / b.us;
    console.log(
        label.padEnd(22),
        a.us.toFixed(3).padStart(12),
        b.us.toFixed(3).padStart(13),
        (ratio.toFixed(1) + '×').padStart(9),
        ('  ' + a.notify + '/' + b.notify),
    );
}
