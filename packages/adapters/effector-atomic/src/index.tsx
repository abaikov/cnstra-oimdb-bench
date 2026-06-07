import React, { createContext, useContext } from 'react';
import { createStore, createEvent, type Store, type EventCallable } from 'effector';
import { useUnit, useStoreMap } from 'effector-react';
import type { StoreAdapter, StoreHandle, ViewModelHooksIdsBased } from '@bench/core';
import type {
    RootState,
    ID,
    Deck,
    Card,
    Comment,
    User,
    CardTag,
} from '@bench/core';

// ---------------------------------------------------------------------------
// Effector — "atomic stores" variant.
//
// Where the idiomatic adapter keeps each entity *kind* in one `Record` store and
// reads slices via `useStoreMap`, this variant gives every mutable entity its
// own tiny store + setter event. An update touches exactly one store, so there
// is no per-update shallow copy of the whole record and delivery is truly
// per-key — the most granular shape Effector can take. It costs more units and
// boilerplate at init (one store + event per entity), which is the trade-off.
//
// This adapter exists alongside the idiomatic one specifically so the comparison
// can't be accused of handicapping Effector: even its maximally-granular form is
// measured here.
// ---------------------------------------------------------------------------

type Atom<T> = { store: Store<T>; set: EventCallable<T> };

function atom<T>(initial: T): Atom<T> {
    const set = createEvent<T>();
    const store = createStore<T>(initial).on(set, (_prev, next) => next);
    return { store, set };
}

type IndexMap = Record<ID, ID[]>;

function createAtomicEffectorStore(initialData: RootState) {
    // Atomic stores for the entities that actually mutate in the workloads.
    const cardAtoms = new Map<ID, Atom<Card>>();
    for (const card of Object.values(initialData.entities.cards)) {
        cardAtoms.set(card.id, atom(card));
    }
    const commentAtoms = new Map<ID, Atom<Comment>>();
    for (const comment of Object.values(initialData.entities.comments)) {
        commentAtoms.set(comment.id, atom(comment));
    }
    const userAtoms = new Map<ID, Atom<User>>();
    for (const user of Object.values(initialData.entities.users)) {
        userAtoms.set(user.id, atom(user));
    }

    // Per-card list of cardTag ids — the one relationship that mutates.
    const tagByCardAtoms = new Map<ID, Atom<ID[]>>();
    // cardTags kept as a plain map purely for action bookkeeping (no view reads it).
    const cardTags = new Map<ID, CardTag>(
        Object.entries(initialData.entities.cardTags) as [ID, CardTag][],
    );

    const activeDeck = atom<ID | null>(initialData.activeDeckId);

    // Static, immutable lookups (never change in the workloads).
    const decks = new Map<ID, Deck>(
        Object.entries(initialData.entities.decks) as [ID, Deck][],
    );
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
    // One tag-list atom per card (so every card id resolves to a stable store).
    const cardTagIdsByCardId: IndexMap = {};
    for (const cardTag of cardTags.values()) {
        (cardTagIdsByCardId[cardTag.cardId] ??= []).push(cardTag.id);
    }
    for (const cardId of cardAtoms.keys()) {
        tagByCardAtoms.set(cardId, atom<ID[]>(cardTagIdsByCardId[cardId] ?? []));
    }

    return {
        cardAtoms,
        commentAtoms,
        userAtoms,
        tagByCardAtoms,
        cardTags,
        activeDeck,
        decks,
        decksOrder: initialData.decksOrder,
        // structural indexes as stores → live per-key subscriptions in hooks (parity)
        cardIdsByDeckId: createStore<IndexMap>(cardIdsByDeckId),
        commentIdsByCardId: createStore<IndexMap>(commentIdsByCardId),
        userIdsByCardId: createStore<IndexMap>(userIdsByCardId),
    };
}

type AtomicEffectorStore = ReturnType<typeof createAtomicEffectorStore>;

const Ctx = createContext<AtomicEffectorStore | null>(null);

const EMPTY_ID_ARRAY: ID[] = [];
// Fallback for empty/unknown ids (e.g. useUserById('') when a comment has no author).
const EMPTY_USER_STORE = createStore<User | undefined>(undefined, { skipVoid: false });

const Provider: React.FC<{ store: StoreHandle; children?: React.ReactNode }> = ({
    store,
    children,
}) => <Ctx.Provider value={store as AtomicEffectorStore}>{children}</Ctx.Provider>;

function useStore(): AtomicEffectorStore {
    const s = useContext(Ctx);
    if (!s) throw new Error('Atomic Effector store not found');
    return s;
}

function createHooks(): ViewModelHooksIdsBased {
    return {
        useDeckIds(): ID[] {
            return useStore().decksOrder;
        },
        useDeckById(id: ID): Deck | undefined {
            return useStore().decks.get(id);
        },
        useCardById(id: ID): Card | undefined {
            const a = useStore().cardAtoms.get(id);
            return useUnit(a ? a.store : (EMPTY_USER_STORE as unknown as Store<Card | undefined>));
        },
        useCommentById(id: ID): Comment | undefined {
            const a = useStore().commentAtoms.get(id);
            return useUnit(
                a ? a.store : (EMPTY_USER_STORE as unknown as Store<Comment | undefined>),
            );
        },
        useUserById(id: ID): User | undefined {
            const a = useStore().userAtoms.get(id);
            return useUnit(a ? a.store : EMPTY_USER_STORE);
        },
        useActiveDeckId(): ID | null {
            return useUnit(useStore().activeDeck.store);
        },
        useCardIdsByDeckId(deckId: ID): ID[] {
            return useStoreMap({
                store: useStore().cardIdsByDeckId,
                keys: [deckId],
                fn: (idx, [id]) => idx[id] ?? EMPTY_ID_ARRAY,
            });
        },
        useCommentIdsByCardId(cardId: ID): ID[] {
            return useStoreMap({
                store: useStore().commentIdsByCardId,
                keys: [cardId],
                fn: (idx, [id]) => idx[id] ?? EMPTY_ID_ARRAY,
            });
        },
        useAssigneeIdsByCardId(cardId: ID): ID[] {
            return useStoreMap({
                store: useStore().userIdsByCardId,
                keys: [cardId],
                fn: (idx, [id]) => idx[id] ?? EMPTY_ID_ARRAY,
            });
        },
        useTagIdsByCardId(cardId: ID): ID[] {
            const a = useStore().tagByCardAtoms.get(cardId);
            return useUnit(a ? a.store : (EMPTY_USER_STORE as unknown as Store<ID[]>)) ?? EMPTY_ID_ARRAY;
        },
    };
}

const actions = (store: AtomicEffectorStore) => ({
    setActiveDeck(id: ID) {
        store.activeDeck.set(id);
    },

    updateCard(cardId: ID, changes: Partial<Card>) {
        const a = store.cardAtoms.get(cardId);
        if (!a) return;
        a.set({ ...a.store.getState(), ...changes });
    },

    updateCommentText(commentId: ID, text: string) {
        const a = store.commentAtoms.get(commentId);
        if (!a) return;
        const prev = a.store.getState();
        if (prev.text === text) return;
        a.set({ ...prev, text });
    },

    setCommentEditing(commentId: ID, isEditing: boolean) {
        const a = store.commentAtoms.get(commentId);
        if (!a) return;
        const prev = a.store.getState();
        if (!!prev.isEditing === isEditing) return;
        a.set({ ...prev, isEditing });
    },

    renameUser(userId: ID, name: string) {
        const a = store.userAtoms.get(userId);
        if (!a) return;
        const prev = a.store.getState();
        if (prev.name === name) return;
        a.set({ ...prev, name });
    },

    bulkToggleTagOnCards(cardIds: ID[], tagId: ID) {
        let counter = store.cardTags.size;
        for (const cardId of cardIds) {
            const tagAtom = store.tagByCardAtoms.get(cardId);
            if (!tagAtom) continue;
            const existingTagIds = tagAtom.store.getState();
            let existingId: ID | undefined;
            for (const ctId of existingTagIds) {
                if (store.cardTags.get(ctId)?.tagId === tagId) {
                    existingId = ctId;
                    break;
                }
            }
            if (existingId) {
                store.cardTags.delete(existingId);
                tagAtom.set(existingTagIds.filter((id) => id !== existingId));
            } else {
                const newCardTag: CardTag = {
                    id: `cardtag_${counter++}`,
                    cardId,
                    tagId,
                    createdAt: Date.now(),
                };
                store.cardTags.set(newCardTag.id, newCardTag);
                tagAtom.set([...existingTagIds, newCardTag.id]);
            }
        }
    },

    backgroundChurnStart() {
        let count = 0;
        const now = Date.now();
        for (const a of store.cardAtoms.values()) {
            if (count >= 100) break;
            a.set({ ...a.store.getState(), updatedAt: now });
            count++;
        }
    },
    backgroundChurnStop() {},
    setCardVisibility(cardId: ID, isVisible: boolean) {
        const a = store.cardAtoms.get(cardId);
        if (!a) return;
        const prev = a.store.getState();
        if (prev.isVisible === isVisible) return;
        a.set({ ...prev, isVisible });
    },
});

function createAtomicEffectorAdapter(): StoreAdapter {
    return {
        name: 'Effector (atomic stores)',
        createStore: createAtomicEffectorStore,
        Provider,
        get hooks() {
            return createHooks();
        },
        bindActions(storeHandle: StoreHandle) {
            return actions(storeHandle as AtomicEffectorStore);
        },
    };
}

export const effectorAtomicAdapter = createAtomicEffectorAdapter();

export default effectorAtomicAdapter;
