import React, { createContext, useContext } from 'react';
import { createStore, createEvent } from 'effector';
import { useUnit, useStoreMap } from 'effector-react';
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
// Fair, idiomatic Effector store.
//
// Previous version recomputed *every* relationship index from scratch inside a
// single global `combine(...)` on every mutation. Typing one character into a
// comment, renaming one user, or churning a few cards forced an O(total
// entities) rebuild of all card/deck indexes — work no real Effector app would
// do. That penalised Effector with synthetic CPU cost unrelated to React
// rendering.
//
// This version keeps entities in plain stores and maintains relationship
// indexes the way a performance-conscious Effector developer would:
//   - deck->cards, card->comments, card->users are structural and never change
//     in the workloads, so they are built once at init and read by key.
//   - card->cardTags is the only relationship that mutates (bulk tag toggle),
//     so it is updated incrementally, touching only the affected cards.
// Individual entity fields (comment text, card visibility, user name, ...) are
// read per-key via `useStoreMap`, so a single mutation only re-renders the
// components bound to that key.
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

type BulkToggleTagPayload = {
    toAdd: CardTag[];
    toRemove: ID[];
    // cardId -> next list of cardTag ids (only for affected cards)
    cardTagIdsByCard: IndexMap;
};

function createEffectorStore(initialData: RootState) {
    const indexes = buildIndexes(initialData);

    // Entity stores (plain entities — no embedded index arrays)
    const $decks = createStore<Record<ID, Deck>>(initialData.entities.decks);
    const $cards = createStore<Record<ID, Card>>(initialData.entities.cards);
    const $comments = createStore<Record<ID, Comment>>(initialData.entities.comments);
    const $users = createStore<Record<ID, User>>(initialData.entities.users);
    const $tags = createStore<Record<ID, Tag>>(initialData.entities.tags);
    const $cardAssignments = createStore<Record<ID, CardAssignment>>(
        initialData.entities.cardAssignments,
    );
    const $cardTags = createStore<Record<ID, CardTag>>(initialData.entities.cardTags);
    const $activeDeckId = createStore<ID | null>(initialData.activeDeckId);
    const $decksOrder = createStore<ID[]>(initialData.decksOrder);

    // Relationship index stores
    // Structural indexes — built once, never change in the workloads.
    const $cardIdsByDeckId = createStore<IndexMap>(indexes.cardIdsByDeckId);
    const $commentIdsByCardId = createStore<IndexMap>(indexes.commentIdsByCardId);
    const $userIdsByCardId = createStore<IndexMap>(indexes.userIdsByCardId);
    // Mutated by bulk tag toggle — updated incrementally.
    const $tagIdsByCardId = createStore<IndexMap>(indexes.cardTagIdsByCardId);

    // Events
    const setActiveDeckEvent = createEvent<ID>();
    const updateCommentTextEvent = createEvent<{ id: ID; text: string }>();
    const setCommentEditingEvent = createEvent<{ id: ID; isEditing: boolean }>();
    const renameUserEvent = createEvent<{ id: ID; name: string }>();
    const bulkToggleTagEvent = createEvent<BulkToggleTagPayload>();
    const updateCardEvent = createEvent<{ id: ID; changes: Partial<Card> }>();
    const bulkUpdateCardsEvent = createEvent<Array<{ id: ID; changes: Partial<Card> }>>();
    const setCardVisibilityEvent = createEvent<{ cardId: ID; isVisible: boolean }>();

    // Reducers — each touches only the entity it owns.
    $activeDeckId.on(setActiveDeckEvent, (_, id) => id);

    $comments.on(updateCommentTextEvent, (comments, { id, text }) => {
        const existing = comments[id];
        if (existing && existing.text === text) return comments;
        return { ...comments, [id]: { ...existing, id, text } as Comment };
    });

    $comments.on(setCommentEditingEvent, (comments, { id, isEditing }) => {
        const existing = comments[id];
        if (!!existing?.isEditing === isEditing) return comments;
        return { ...comments, [id]: { ...existing, id, isEditing } as Comment };
    });

    $users.on(renameUserEvent, (users, { id, name }) => {
        const existing = users[id];
        if (existing && existing.name === name) return users;
        return { ...users, [id]: { ...existing, id, name } as User };
    });

    $cards.on(setCardVisibilityEvent, (cards, { cardId, isVisible }) => {
        const existing = cards[cardId];
        if (!existing || existing.isVisible === isVisible) return cards;
        return { ...cards, [cardId]: { ...existing, isVisible } };
    });

    $cards.on(updateCardEvent, (cards, { id, changes }) => {
        const existing = cards[id];
        if (!existing) return cards;
        return { ...cards, [id]: { ...existing, ...changes } };
    });

    $cards.on(bulkUpdateCardsEvent, (cards, updates) => {
        let changed = false;
        const updated = { ...cards };
        for (const { id, changes } of updates) {
            const existing = updated[id];
            if (!existing) continue;
            updated[id] = { ...existing, ...changes };
            changed = true;
        }
        return changed ? updated : cards;
    });

    // Bulk tag toggle updates only the cardTags entity store and the affected
    // entries of the card->cardTags index. No global rebuild.
    $cardTags.on(bulkToggleTagEvent, (cardTags, { toAdd, toRemove }) => {
        if (toAdd.length === 0 && toRemove.length === 0) return cardTags;
        const updated = { ...cardTags };
        for (const id of toRemove) delete updated[id];
        for (const ct of toAdd) updated[ct.id] = ct;
        return updated;
    });

    $tagIdsByCardId.on(bulkToggleTagEvent, (index, { cardTagIdsByCard }) => {
        const cardIds = Object.keys(cardTagIdsByCard);
        if (cardIds.length === 0) return index;
        return { ...index, ...cardTagIdsByCard };
    });

    return {
        stores: {
            decks: $decks,
            cards: $cards,
            comments: $comments,
            users: $users,
            tags: $tags,
            cardAssignments: $cardAssignments,
            cardTags: $cardTags,
            activeDeckId: $activeDeckId,
            decksOrder: $decksOrder,
            cardIdsByDeckId: $cardIdsByDeckId,
            commentIdsByCardId: $commentIdsByCardId,
            userIdsByCardId: $userIdsByCardId,
            tagIdsByCardId: $tagIdsByCardId,
        },
        events: {
            setActiveDeck: setActiveDeckEvent,
            updateCommentText: updateCommentTextEvent,
            setCommentEditing: setCommentEditingEvent,
            renameUser: renameUserEvent,
            bulkToggleTag: bulkToggleTagEvent,
            updateCard: updateCardEvent,
            bulkUpdateCards: bulkUpdateCardsEvent,
            setCardVisibility: setCardVisibilityEvent,
        },
    };
}

type EffectorStore = ReturnType<typeof createEffectorStore>;

const EffectorStoreContext = createContext<EffectorStore | null>(null);

// Stable empty array - avoids creating a new array reference on every render
const EMPTY_ID_ARRAY: ID[] = [];

const EffectorProvider: React.FC<{ store: StoreHandle; children?: React.ReactNode }> = ({
    store,
    children,
}) => (
    <EffectorStoreContext.Provider value={store as EffectorStore}>
        {children}
    </EffectorStoreContext.Provider>
);

function useStore(): EffectorStore {
    return useContext(EffectorStoreContext)!;
}

function createHooks(): ViewModelHooksIdsBased {
    return {
        useDeckIds(): ID[] {
            return useUnit(useStore().stores.decksOrder);
        },
        useDeckById(id: ID): Deck | undefined {
            return useStoreMap({
                store: useStore().stores.decks,
                keys: [id],
                fn: (decks, [deckId]) => decks[deckId] || undefined,
            });
        },
        useCardById(id: ID): Card | undefined {
            return useStoreMap({
                store: useStore().stores.cards,
                keys: [id],
                fn: (cards, [cardId]) => cards[cardId] || undefined,
            });
        },
        useCommentById(id: ID): Comment | undefined {
            return useStoreMap({
                store: useStore().stores.comments,
                keys: [id],
                fn: (comments, [commentId]) => comments[commentId],
            });
        },
        useUserById(id: ID): User | undefined {
            return useStoreMap({
                store: useStore().stores.users,
                keys: [id],
                fn: (users, [userId]) => users[userId],
            });
        },
        useActiveDeckId(): ID | null {
            return useUnit(useStore().stores.activeDeckId);
        },
        useCardIdsByDeckId(deckId: ID): ID[] {
            return useStoreMap({
                store: useStore().stores.cardIdsByDeckId,
                keys: [deckId],
                fn: (index, [id]) => index[id] ?? EMPTY_ID_ARRAY,
            });
        },
        useCommentIdsByCardId(cardId: ID): ID[] {
            return useStoreMap({
                store: useStore().stores.commentIdsByCardId,
                keys: [cardId],
                fn: (index, [id]) => index[id] ?? EMPTY_ID_ARRAY,
            });
        },
        useAssigneeIdsByCardId(cardId: ID): ID[] {
            return useStoreMap({
                store: useStore().stores.userIdsByCardId,
                keys: [cardId],
                fn: (index, [id]) => index[id] ?? EMPTY_ID_ARRAY,
            });
        },
        useTagIdsByCardId(cardId: ID): ID[] {
            return useStoreMap({
                store: useStore().stores.tagIdsByCardId,
                keys: [cardId],
                fn: (index, [id]) => index[id] ?? EMPTY_ID_ARRAY,
            });
        },
    };
}

const actions = (store: EffectorStore) => ({
    setActiveDeck(id: ID) {
        store.events.setActiveDeck(id);
    },

    updateCard(cardId: ID, changes: Partial<Card>) {
        store.events.updateCard({ id: cardId, changes });
    },

    updateCommentText(commentId: ID, text: string) {
        store.events.updateCommentText({ id: commentId, text });
    },

    setCommentEditing(commentId: ID, isEditing: boolean) {
        store.events.setCommentEditing({ id: commentId, isEditing });
    },

    renameUser(userId: ID, name: string) {
        store.events.renameUser({ id: userId, name });
    },

    bulkToggleTagOnCards(cardIds: ID[], tagId: ID) {
        const cardTags = store.stores.cardTags.getState();
        const tagIdsByCard = store.stores.tagIdsByCardId.getState();
        let counter = Object.keys(cardTags).length;

        const toAdd: CardTag[] = [];
        const toRemove: ID[] = [];
        const cardTagIdsByCard: IndexMap = {};

        for (const cardId of cardIds) {
            const existingTagIds = tagIdsByCard[cardId] ?? EMPTY_ID_ARRAY;
            // Find an existing cardTag for this (cardId, tagId) pair using the
            // per-card index — O(tags per card), not O(all cardTags).
            let existingId: ID | undefined;
            for (const ctId of existingTagIds) {
                if (cardTags[ctId]?.tagId === tagId) {
                    existingId = ctId;
                    break;
                }
            }
            if (existingId) {
                toRemove.push(existingId);
                cardTagIdsByCard[cardId] = existingTagIds.filter((id) => id !== existingId);
            } else {
                const newCardTag: CardTag = {
                    id: `cardtag_${counter++}`,
                    cardId,
                    tagId,
                    createdAt: Date.now(),
                };
                toAdd.push(newCardTag);
                cardTagIdsByCard[cardId] = [...existingTagIds, newCardTag.id];
            }
        }

        store.events.bulkToggleTag({ toAdd, toRemove, cardTagIdsByCard });
    },

    backgroundChurnStart() {
        const cards = store.stores.cards.getState();
        const updates: Array<{ id: ID; changes: Partial<Card> }> = [];
        let count = 0;
        for (const id in cards) {
            if (count >= 100) break;
            updates.push({ id, changes: { updatedAt: Date.now() } });
            count++;
        }
        if (updates.length > 0) {
            store.events.bulkUpdateCards(updates);
        }
    },
    backgroundChurnStop() {},
    setCardVisibility(cardId: ID, isVisible: boolean) {
        store.events.setCardVisibility({ cardId, isVisible });
    },
});

function createEffectorAdapter(): StoreAdapter {
    return {
        name: 'Effector (ids-based)',
        createStore: createEffectorStore,
        Provider: EffectorProvider,
        get hooks() {
            return createHooks();
        },
        bindActions(storeHandle: StoreHandle) {
            return actions(storeHandle as EffectorStore);
        },
    };
}

export const effectorAdapter = createEffectorAdapter();

export default effectorAdapter;
