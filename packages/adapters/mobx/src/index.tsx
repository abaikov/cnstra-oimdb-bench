import React, { createContext, useContext } from 'react';
import { observable, runInAction, type ObservableMap, type IObservableValue } from 'mobx';
import { useObserver, observer } from 'mobx-react-lite';
import type { StoreAdapter, StoreHandle, ViewModelHooksIdsBased } from '@bench/core';
import type {
    RootState,
    ID,
    Deck,
    Card,
    Comment,
    User,
    Tag,
    CardAssignment,
    CardTag,
} from '@bench/core';

// ---------------------------------------------------------------------------
// Idiomatic, fair MobX implementation.
//
// Entities live in shallow observable maps (`observable.map(..., {deep:false})`),
// so reads are tracked per key and a single `map.set(id, next)` only invalidates
// components observing that id. Components in the benchmark are NOT wrapped in
// `observer()` (they are shared across all adapters), so each hook uses
// `useObserver(...)` from mobx-react-lite to make just that read reactive — the
// canonical way to consume MobX from plain function components.
//
// Like the other adapters, structural relationship indexes (deck->cards,
// card->comments, card->users) never change in the workloads and are built once;
// the card->cardTags index is the only one mutated (bulk tag toggle) and is
// updated incrementally for affected cards only.
// ---------------------------------------------------------------------------

type IndexMap = Record<ID, ID[]>;

function buildIndexes(initialData: RootState): {
    cardIdsByDeckId: IndexMap;
    commentIdsByCardId: IndexMap;
    userIdsByCardId: IndexMap;
    cardTagIdsByCardId: IndexMap;
} {
    const cardIdsByDeckId: IndexMap = {};
    for (const card of Object.values(initialData.entities.cards)) {
        (cardIdsByDeckId[card.deckId] ??= []).push(card.id);
    }

    const commentIdsByCardId: IndexMap = {};
    for (const comment of Object.values(initialData.entities.comments)) {
        (commentIdsByCardId[comment.cardId] ??= []).push(comment.id);
    }

    const userIdsByCardId: IndexMap = {};
    const seenUserIdsByCard = new Map<ID, Set<ID>>();
    for (const assignment of Object.values(initialData.entities.cardAssignments)) {
        const { cardId, userId } = assignment;
        if (!userId || !initialData.entities.users[userId]) continue;
        let seen = seenUserIdsByCard.get(cardId);
        if (!seen) seenUserIdsByCard.set(cardId, (seen = new Set()));
        if (seen.has(userId)) continue;
        seen.add(userId);
        (userIdsByCardId[cardId] ??= []).push(userId);
    }

    const cardTagIdsByCardId: IndexMap = {};
    for (const cardTag of Object.values(initialData.entities.cardTags)) {
        (cardTagIdsByCardId[cardTag.cardId] ??= []).push(cardTag.id);
    }

    return { cardIdsByDeckId, commentIdsByCardId, userIdsByCardId, cardTagIdsByCardId };
}

function createMobxStore(initialData: RootState) {
    const indexes = buildIndexes(initialData);

    const shallow = { deep: false } as const;

    // Observable entity maps (values are plain objects, replaced on update)
    const cards: ObservableMap<ID, Card> = observable.map(initialData.entities.cards, shallow);
    const decks: ObservableMap<ID, Deck> = observable.map(initialData.entities.decks, shallow);
    const comments: ObservableMap<ID, Comment> = observable.map(
        initialData.entities.comments,
        shallow,
    );
    const users: ObservableMap<ID, User> = observable.map(initialData.entities.users, shallow);
    const tags: ObservableMap<ID, Tag> = observable.map(initialData.entities.tags, shallow);
    const cardAssignments: ObservableMap<ID, CardAssignment> = observable.map(
        initialData.entities.cardAssignments,
        shallow,
    );
    const cardTags: ObservableMap<ID, CardTag> = observable.map(
        initialData.entities.cardTags,
        shallow,
    );

    const activeDeckId: IObservableValue<ID | null> = observable.box(initialData.activeDeckId);

    // Relationship indexes — all observable (live per-key subscriptions in hooks),
    // for parity with the other adapters (every CardItem hook is a real subscription).
    const cardIdsByDeckId: ObservableMap<ID, ID[]> = observable.map(
        indexes.cardIdsByDeckId,
        shallow,
    );
    const commentIdsByCardId: ObservableMap<ID, ID[]> = observable.map(
        indexes.commentIdsByCardId,
        shallow,
    );
    const userIdsByCardId: ObservableMap<ID, ID[]> = observable.map(
        indexes.userIdsByCardId,
        shallow,
    );
    const tagIdsByCardId: ObservableMap<ID, ID[]> = observable.map(
        indexes.cardTagIdsByCardId,
        shallow,
    );

    return {
        cards,
        decks,
        comments,
        users,
        tags,
        cardAssignments,
        cardTags,
        activeDeckId,
        decksOrder: initialData.decksOrder,
        cardIdsByDeckId,
        commentIdsByCardId,
        userIdsByCardId,
        tagIdsByCardId,
    };
}

type MobxStore = ReturnType<typeof createMobxStore>;

const MobxStoreContext = createContext<MobxStore | null>(null);

const EMPTY_ID_ARRAY: ID[] = [];

const MobxProvider: React.FC<{ store: StoreHandle; children?: React.ReactNode }> = ({
    store,
    children,
}) => (
    <MobxStoreContext.Provider value={store as MobxStore}>{children}</MobxStoreContext.Provider>
);

function useStore(): MobxStore {
    const s = useContext(MobxStoreContext);
    if (!s) throw new Error('MobX store not found');
    return s;
}

function createHooks(): ViewModelHooksIdsBased {
    return {
        useDeckIds(): ID[] {
            // decksOrder is static in the workloads
            return useStore().decksOrder;
        },
        useDeckById(id: ID): Deck | undefined {
            const store = useStore();
            return useObserver(() => store.decks.get(id));
        },
        useCardById(id: ID): Card | undefined {
            const store = useStore();
            return useObserver(() => store.cards.get(id));
        },
        useCommentById(id: ID): Comment | undefined {
            const store = useStore();
            return useObserver(() => store.comments.get(id));
        },
        useUserById(id: ID): User | undefined {
            const store = useStore();
            return useObserver(() => store.users.get(id));
        },
        useActiveDeckId(): ID | null {
            const store = useStore();
            return useObserver(() => store.activeDeckId.get());
        },
        useCardIdsByDeckId(deckId: ID): ID[] {
            const store = useStore();
            return useObserver(() => store.cardIdsByDeckId.get(deckId) ?? EMPTY_ID_ARRAY);
        },
        useCommentIdsByCardId(cardId: ID): ID[] {
            const store = useStore();
            return useObserver(() => store.commentIdsByCardId.get(cardId) ?? EMPTY_ID_ARRAY);
        },
        useAssigneeIdsByCardId(cardId: ID): ID[] {
            const store = useStore();
            return useObserver(() => store.userIdsByCardId.get(cardId) ?? EMPTY_ID_ARRAY);
        },
        useTagIdsByCardId(cardId: ID): ID[] {
            const store = useStore();
            return useObserver(() => store.tagIdsByCardId.get(cardId) ?? EMPTY_ID_ARRAY);
        },
    };
}

const actions = (store: MobxStore) => ({
    setActiveDeck(id: ID) {
        runInAction(() => store.activeDeckId.set(id));
    },

    updateCard(cardId: ID, changes: Partial<Card>) {
        runInAction(() => {
            const existing = store.cards.get(cardId);
            if (!existing) return;
            store.cards.set(cardId, { ...existing, ...changes });
        });
    },

    updateCommentText(commentId: ID, text: string) {
        runInAction(() => {
            const existing = store.comments.get(commentId);
            if (existing && existing.text === text) return;
            store.comments.set(commentId, { ...(existing as Comment), id: commentId, text });
        });
    },

    setCommentEditing(commentId: ID, isEditing: boolean) {
        runInAction(() => {
            const existing = store.comments.get(commentId);
            if (!!existing?.isEditing === isEditing) return;
            store.comments.set(commentId, {
                ...(existing as Comment),
                id: commentId,
                isEditing,
            });
        });
    },

    renameUser(userId: ID, name: string) {
        runInAction(() => {
            const existing = store.users.get(userId);
            if (existing && existing.name === name) return;
            store.users.set(userId, { ...(existing as User), id: userId, name });
        });
    },

    bulkToggleTagOnCards(cardIds: ID[], tagId: ID) {
        runInAction(() => {
            let counter = store.cardTags.size;
            for (const cardId of cardIds) {
                const existingTagIds = store.tagIdsByCardId.get(cardId) ?? EMPTY_ID_ARRAY;
                // Find existing cardTag for this (cardId, tagId) via the per-card
                // index — O(tags-per-card), not O(all cardTags).
                let existingId: ID | undefined;
                for (const ctId of existingTagIds) {
                    if (store.cardTags.get(ctId)?.tagId === tagId) {
                        existingId = ctId;
                        break;
                    }
                }
                if (existingId) {
                    store.cardTags.delete(existingId);
                    store.tagIdsByCardId.set(
                        cardId,
                        existingTagIds.filter((id) => id !== existingId),
                    );
                } else {
                    const newCardTag: CardTag = {
                        id: `cardtag_${counter++}`,
                        cardId,
                        tagId,
                        createdAt: Date.now(),
                    };
                    store.cardTags.set(newCardTag.id, newCardTag);
                    store.tagIdsByCardId.set(cardId, [...existingTagIds, newCardTag.id]);
                }
            }
        });
    },

    backgroundChurnStart() {
        runInAction(() => {
            let count = 0;
            for (const [id, card] of store.cards) {
                if (count >= 100) break;
                store.cards.set(id, { ...card, updatedAt: Date.now() });
                count++;
            }
        });
    },
    backgroundChurnStop() {},
    setCardVisibility(cardId: ID, isVisible: boolean) {
        runInAction(() => {
            const existing = store.cards.get(cardId);
            if (!existing || existing.isVisible === isVisible) return;
            store.cards.set(cardId, { ...existing, isVisible });
        });
    },
});

function createMobxAdapter(): StoreAdapter {
    return {
        name: 'MobX (ids-based)',
        createStore: createMobxStore,
        Provider: MobxProvider,
        get hooks() {
            return createHooks();
        },
        bindActions(storeHandle: StoreHandle) {
            return actions(storeHandle as MobxStore);
        },
    };
}

export const mobxAdapter = createMobxAdapter();

// ---------------------------------------------------------------------------
// MobX "deep / in-place" variant — MobX's native idiom: entities are DEEP
// observables and updates MUTATE fields in place (no new entity object, no
// allocation in the action). Because the benchmark's components are not wrapped
// in observer(), each hook reads the fields inside useObserver and returns a
// snapshot, so field-level changes still trigger a re-render.
//
// NOTE: this plays by different rules than the other adapters (which all replace
// the entity object immutably) — it does less allocation in the write path. Shown
// as a separate, clearly-labelled adapter so the comparison stays transparent.
// ---------------------------------------------------------------------------
function createMobxDeepStore(initialData: RootState) {
    const indexes = buildIndexes(initialData);
    // Deep observable maps (values become observable → field-level reactivity)
    const cards: ObservableMap<ID, Card> = observable.map(initialData.entities.cards);
    const decks: ObservableMap<ID, Deck> = observable.map(initialData.entities.decks);
    const comments: ObservableMap<ID, Comment> = observable.map(initialData.entities.comments);
    const users: ObservableMap<ID, User> = observable.map(initialData.entities.users);
    const cardTags: ObservableMap<ID, CardTag> = observable.map(initialData.entities.cardTags);
    const activeDeckId: IObservableValue<ID | null> = observable.box(initialData.activeDeckId);
    const shallow = { deep: false } as const;
    const cardIdsByDeckId: ObservableMap<ID, ID[]> = observable.map(
        indexes.cardIdsByDeckId,
        shallow,
    );
    const commentIdsByCardId: ObservableMap<ID, ID[]> = observable.map(
        indexes.commentIdsByCardId,
        shallow,
    );
    const userIdsByCardId: ObservableMap<ID, ID[]> = observable.map(
        indexes.userIdsByCardId,
        shallow,
    );
    const tagIdsByCardId: ObservableMap<ID, ID[]> = observable.map(
        indexes.cardTagIdsByCardId,
        shallow,
    );
    return {
        cards,
        decks,
        comments,
        users,
        cardTags,
        activeDeckId,
        decksOrder: initialData.decksOrder,
        cardIdsByDeckId,
        commentIdsByCardId,
        userIdsByCardId,
        tagIdsByCardId,
    };
}

type MobxDeepStore = ReturnType<typeof createMobxDeepStore>;
const MobxDeepStoreContext = createContext<MobxDeepStore | null>(null);
const MobxDeepProvider: React.FC<{ store: StoreHandle; children?: React.ReactNode }> = ({
    store,
    children,
}) => (
    <MobxDeepStoreContext.Provider value={store as MobxDeepStore}>
        {children}
    </MobxDeepStoreContext.Provider>
);
function useDeepStore(): MobxDeepStore {
    const s = useContext(MobxDeepStoreContext);
    if (!s) throw new Error('MobX deep store not found');
    return s;
}

// Canonical MobX: the leaf components are wrapped in observer() (via the
// adapter's `observer` HOC), so these hooks just return the raw observables /
// read fields directly — every read happens inside the component's reaction and
// is tracked at field granularity. No useObserver, no snapshot, no allocation.
function createDeepHooks(): ViewModelHooksIdsBased {
    return {
        useDeckIds(): ID[] {
            return useDeepStore().decksOrder;
        },
        useDeckById(id: ID): Deck | undefined {
            return useDeepStore().decks.get(id);
        },
        useCardById(id: ID): Card | undefined {
            return useDeepStore().cards.get(id);
        },
        useCommentById(id: ID): Comment | undefined {
            return useDeepStore().comments.get(id);
        },
        useUserById(id: ID): User | undefined {
            return useDeepStore().users.get(id);
        },
        useActiveDeckId(): ID | null {
            return useDeepStore().activeDeckId.get();
        },
        useCardIdsByDeckId(deckId: ID): ID[] {
            return useDeepStore().cardIdsByDeckId.get(deckId) ?? EMPTY_ID_ARRAY;
        },
        useCommentIdsByCardId(cardId: ID): ID[] {
            return useDeepStore().commentIdsByCardId.get(cardId) ?? EMPTY_ID_ARRAY;
        },
        useAssigneeIdsByCardId(cardId: ID): ID[] {
            return useDeepStore().userIdsByCardId.get(cardId) ?? EMPTY_ID_ARRAY;
        },
        useTagIdsByCardId(cardId: ID): ID[] {
            return useDeepStore().tagIdsByCardId.get(cardId) ?? EMPTY_ID_ARRAY;
        },
    };
}

const deepActions = (store: MobxDeepStore) => ({
    setActiveDeck(id: ID) {
        runInAction(() => store.activeDeckId.set(id));
    },
    updateCard(cardId: ID, changes: Partial<Card>) {
        runInAction(() => {
            const c = store.cards.get(cardId);
            if (!c) return;
            Object.assign(c, changes); // in-place mutation — no new object
        });
    },
    updateCommentText(commentId: ID, text: string) {
        runInAction(() => {
            const c = store.comments.get(commentId);
            if (!c || c.text === text) return;
            c.text = text;
        });
    },
    setCommentEditing(commentId: ID, isEditing: boolean) {
        runInAction(() => {
            const c = store.comments.get(commentId);
            if (!c || !!c.isEditing === isEditing) return;
            c.isEditing = isEditing;
        });
    },
    renameUser(userId: ID, name: string) {
        runInAction(() => {
            const u = store.users.get(userId);
            if (!u || u.name === name) return;
            u.name = name;
        });
    },
    bulkToggleTagOnCards(cardIds: ID[], tagId: ID) {
        runInAction(() => {
            let counter = store.cardTags.size;
            for (const cardId of cardIds) {
                const existingTagIds = store.tagIdsByCardId.get(cardId) ?? EMPTY_ID_ARRAY;
                let existingId: ID | undefined;
                for (const ctId of existingTagIds) {
                    if (store.cardTags.get(ctId)?.tagId === tagId) {
                        existingId = ctId;
                        break;
                    }
                }
                if (existingId) {
                    store.cardTags.delete(existingId);
                    store.tagIdsByCardId.set(
                        cardId,
                        existingTagIds.filter((id) => id !== existingId),
                    );
                } else {
                    const newCardTag: CardTag = {
                        id: `cardtag_${counter++}`,
                        cardId,
                        tagId,
                        createdAt: Date.now(),
                    };
                    store.cardTags.set(newCardTag.id, newCardTag);
                    store.tagIdsByCardId.set(cardId, [...existingTagIds, newCardTag.id]);
                }
            }
        });
    },
    backgroundChurnStart() {
        runInAction(() => {
            let count = 0;
            const now = Date.now();
            for (const card of store.cards.values()) {
                if (count >= 100) break;
                card.updatedAt = now; // in-place
                count++;
            }
        });
    },
    backgroundChurnStop() {},
    setCardVisibility(cardId: ID, isVisible: boolean) {
        runInAction(() => {
            const c = store.cards.get(cardId);
            if (!c || c.isVisible === isVisible) return;
            c.isVisible = isVisible;
        });
    },
});

function createMobxDeepAdapter(): StoreAdapter {
    return {
        name: 'MobX (deep/in-place)',
        createStore: createMobxDeepStore,
        Provider: MobxDeepProvider,
        get hooks() {
            return createDeepHooks();
        },
        bindActions(storeHandle: StoreHandle) {
            return deepActions(storeHandle as MobxDeepStore);
        },
        // Canonical MobX reactivity: wrap entity-reading leaf components in observer()
        // so direct observable reads in their JSX are tracked (no snapshot needed).
        observer: observer as <P extends object>(
            c: React.ComponentType<P>,
        ) => React.ComponentType<P>,
    };
}

export const mobxDeepAdapter = createMobxDeepAdapter();

export default mobxAdapter;
