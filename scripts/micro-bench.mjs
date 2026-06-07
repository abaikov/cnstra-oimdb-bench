#!/usr/bin/env node
/**
 * State-update microbenchmark — NO React, NO requestAnimationFrame.
 *
 * The Puppeteer scenarios are bottlenecked by React rendering and frame timing
 * (update->paint latency floors at ~one frame, ~33ms at 60Hz), so the actual
 * state-layer cost — sub-microsecond per update — is invisible noise there.
 * This isolates it: one single-field entity update, WITH one active subscriber
 * per entity (the realistic case — every entity has a mounted component reading
 * it). Each run reports a `notify` count so you can verify the subscribers
 * actually fired (it must equal the iteration count — no short-circuiting).
 *
 * Measuring with subscribers matters: a batched store with NO subscribers does
 * almost nothing on flush, which would unfairly favour it. Here every update
 * delivers exactly one notification.
 *
 * Run: node scripts/micro-bench.mjs
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
const ITERS = 200_000; // single-field updates
const ids = Array.from({ length: N }, (_, i) => 'card_' + i);
const mk = (id) => ({
    id,
    deckId: 'd0',
    title: 't',
    description: 'd',
    authorId: 'u0',
    createdAt: 0,
    updatedAt: 0,
});

function time(label, fn) {
    const t = process.hrtime.bigint();
    const notify = fn();
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    console.log(
        label.padEnd(30),
        ms.toFixed(0).padStart(7) + ' ms',
        ((ms / ITERS) * 1000).toFixed(3).padStart(8) + ' µs/op',
        ' notify=' + notify,
    );
}

function bench(label, setup) {
    const run = setup();
    run(2000); // warmup (JIT)
    time(label, () => run(ITERS));
}

console.log(
    `Update cost WITH one subscriber per entity — ${ITERS.toLocaleString()} updates over ${N} entities\n`,
);

bench('oimdb upsert+flush', () => {
    const q = new OIMEventQueue({});
    const c = new OIMReactiveCollection(q, { selectPk: (e) => e.id });
    c.upsertMany(ids.map(mk));
    let count = 0;
    for (const id of ids) c.subscribeOnKey(id, () => { count++; });
    return (n) => {
        const start = count;
        for (let i = 0; i < n; i++) {
            c.upsertOne({ id: ids[i % N], updatedAt: i });
            q.flush();
        }
        return count - start;
    };
});

bench('oimdb in-place upsert+flush', () => {
    const q = new OIMEventQueue({});
    const c = new OIMReactiveCollection(q, {
        selectPk: (e) => e.id,
        updateEntity: createInPlaceEntityUpdater(),
    });
    c.upsertMany(ids.map(mk));
    let count = 0;
    for (const id of ids) c.subscribeOnKey(id, () => { count++; });
    return (n) => {
        const start = count;
        for (let i = 0; i < n; i++) {
            c.upsertOne({ id: ids[i % N], updatedAt: i });
            q.flush();
        }
        return count - start;
    };
});

bench('cnstra+oimdb stimulate', () => {
    const q = new OIMEventQueue({});
    const c = new OIMReactiveCollection(q, { selectPk: (e) => e.id });
    c.upsertMany(ids.map(mk));
    let count = 0;
    for (const id of ids) c.subscribeOnKey(id, () => { count++; });
    const updateCard = collateral();
    const cns = new CNS([
        neuron({}).dendrite({
            collateral: updateCard,
            response: (p) => {
                c.upsertOne({ id: p.id, updatedAt: p.v });
                q.flush();
            },
        }),
    ]);
    return (n) => {
        const start = count;
        for (let i = 0; i < n; i++) {
            cns.stimulate(updateCard.createSignal({ id: ids[i % N], v: i }));
        }
        return count - start;
    };
});

bench('mobx map.set + reaction', () => {
    const m = observable.map(Object.fromEntries(ids.map((id) => [id, mk(id)])), { deep: false });
    let count = 0;
    for (const id of ids) reaction(() => m.get(id), () => { count++; });
    return (n) => {
        const start = count;
        for (let i = 0; i < n; i++) {
            const id = ids[i % N];
            runInAction(() => m.set(id, { ...m.get(id), updatedAt: i }));
        }
        return count - start;
    };
});

bench('mobx deep in-place + reaction', () => {
    const m = observable.map(Object.fromEntries(ids.map((id) => [id, mk(id)])));
    let count = 0;
    for (const id of ids) reaction(() => m.get(id)?.updatedAt, () => { count++; });
    return (n) => {
        const start = count;
        for (let i = 0; i < n; i++) {
            const id = ids[i % N];
            runInAction(() => { m.get(id).updatedAt = i; });
        }
        return count - start;
    };
});

bench('effector atomic + watch', () => {
    const set = ids.map(() => createEvent());
    const st = ids.map((id, idx) => createStore(mk(id)).on(set[idx], (_, v) => v));
    let count = 0;
    st.forEach((s) => s.watch(() => { count++; }));
    return (n) => {
        const start = count;
        for (let i = 0; i < n; i++) {
            const k = i % N;
            set[k]({ ...st[k].getState(), updatedAt: i });
        }
        return count - start;
    };
});

// zustand single store: whole `cards` record copied per update; subscribeWithSelector
// runs all N per-entity selectors on every setState (the react-redux/zustand model).
bench('zustand setState + N selectors', () => {
    const store = createZustand(
        subscribeWithSelector(() => ({ cards: Object.fromEntries(ids.map((id) => [id, mk(id)])) })),
    );
    let count = 0;
    for (const id of ids) store.subscribe((s) => s.cards[id], () => { count++; });
    return (n) => {
        const start = count;
        for (let i = 0; i < n; i++) {
            const id = ids[i % N];
            store.setState((s) => ({ cards: { ...s.cards, [id]: { ...s.cards[id], updatedAt: i } } }));
        }
        return count - start;
    };
});

// redux (RTK createEntityAdapter): Immer update; store.subscribe is global so all N
// per-entity selector subscribers re-run on every dispatch (the useSelector model).
bench('redux dispatch + N selectors', () => {
    const ad = createEntityAdapter();
    const slice = createSlice({
        name: 'cards',
        initialState: ad.addMany(ad.getInitialState(), ids.map(mk)),
        reducers: { upd: (s, a) => ad.updateOne(s, { id: a.payload.id, changes: { updatedAt: a.payload.v } }) },
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
    return (n) => {
        const start = count;
        for (let i = 0; i < n; i++) store.dispatch(slice.actions.upd({ id: ids[i % N], v: i }));
        return count - start;
    };
});

// 500 derived stores models useStoreMap: every mounted selector re-runs on each
// store change, on top of the whole-record shallow copy.
bench('effector record + useStoreMap', () => {
    const ev = createEvent();
    const $c = createStore(Object.fromEntries(ids.map((id) => [id, mk(id)]))).on(
        ev,
        (s, { id, v }) => ({ ...s, [id]: { ...s[id], updatedAt: v } }),
    );
    let count = 0;
    ids.forEach((id) => { $c.map((s) => s[id]).watch(() => { count++; }); });
    return (n) => {
        const start = count;
        for (let i = 0; i < n; i++) ev({ id: ids[i % N], v: i });
        return count - start;
    };
});
