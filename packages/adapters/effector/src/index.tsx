import React, { createContext, useContext } from 'react';
import { createStore, createEvent, combine } from 'effector';
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

// Extended entity types for Effector store
type DeckWithCardIds = Deck & { cardIds: ID[] };
type CardWithIndexes = Card & {
    commentIds: ID[];
    userIds: ID[];
    cardTagIds: ID[];
    tagIds: ID[];
};

// Helper to build extended entities with indexes from RootState
function buildExtendedEntities(initialData: RootState): {
    decks: Record<ID, DeckWithCardIds>;
    cards: Record<ID, CardWithIndexes>;
} {
    // Build cardIdsByDeckId
    const cardIdsByDeckId: Record<ID, ID[]> = {};
    for (const card of Object.values(initialData.entities.cards)) {
        if (!cardIdsByDeckId[card.deckId]) {
            cardIdsByDeckId[card.deckId] = [];
        }
        cardIdsByDeckId[card.deckId].push(card.id);
    }

    // Build commentIdsByCardId
    const commentIdsByCardId: Record<ID, ID[]> = {};
    for (const comment of Object.values(initialData.entities.comments)) {
        if (!commentIdsByCardId[comment.cardId]) {
            commentIdsByCardId[comment.cardId] = [];
        }
        commentIdsByCardId[comment.cardId].push(comment.id);
    }

    // Build userIdsByCardId
    const userIdsByCardId: Record<ID, ID[]> = {};
    const seenUserIdsByCard = new Map<ID, Set<ID>>();
    for (const assignment of Object.values(initialData.entities.cardAssignments)) {
        const userId = assignment.userId;
        const cardId = assignment.cardId;
        if (userId && initialData.entities.users[userId]) {
            if (!seenUserIdsByCard.has(cardId)) {
                seenUserIdsByCard.set(cardId, new Set());
            }
            if (!seenUserIdsByCard.get(cardId)!.has(userId)) {
                seenUserIdsByCard.get(cardId)!.add(userId);
                if (!userIdsByCardId[cardId]) {
                    userIdsByCardId[cardId] = [];
                }
                userIdsByCardId[cardId].push(userId);
            }
        }
    }

    // Build cardTagIdsByCardId and tagIdsByCardId
    const cardTagIdsByCardId: Record<ID, ID[]> = {};
    const tagIdsByCardId: Record<ID, ID[]> = {};
    const seenTagIdsByCard = new Map<ID, Set<ID>>();
    for (const cardTag of Object.values(initialData.entities.cardTags)) {
        if (!cardTagIdsByCardId[cardTag.cardId]) {
            cardTagIdsByCardId[cardTag.cardId] = [];
        }
        cardTagIdsByCardId[cardTag.cardId].push(cardTag.id);

        const tagId = cardTag.tagId;
        const cardId = cardTag.cardId;
        if (tagId && initialData.entities.tags[tagId]) {
            if (!seenTagIdsByCard.has(cardId)) {
                seenTagIdsByCard.set(cardId, new Set());
            }
            if (!seenTagIdsByCard.get(cardId)!.has(tagId)) {
                seenTagIdsByCard.get(cardId)!.add(tagId);
                if (!tagIdsByCardId[cardId]) {
                    tagIdsByCardId[cardId] = [];
                }
                tagIdsByCardId[cardId].push(tagId);
            }
        }
    }

    // Build extended decks
    const decks: Record<ID, DeckWithCardIds> = {};
    for (const deck of Object.values(initialData.entities.decks)) {
        decks[deck.id] = {
            ...deck,
            cardIds: cardIdsByDeckId[deck.id] || [],
        };
    }

    // Build extended cards
    const cards: Record<ID, CardWithIndexes> = {};
    for (const card of Object.values(initialData.entities.cards)) {
        cards[card.id] = {
            ...card,
            commentIds: commentIdsByCardId[card.id] || [],
            userIds: userIdsByCardId[card.id] || [],
            cardTagIds: cardTagIdsByCardId[card.id] || [],
            tagIds: tagIdsByCardId[card.id] || [],
        };
    }

    return { decks, cards };
}

// Create stores for entities
function createEffectorStore(initialData: RootState) {
    const { decks, cards } = buildExtendedEntities(initialData);

    // Entity stores with extended types
    const $decks = createStore<Record<ID, DeckWithCardIds>>(decks);
    const $cards = createStore<Record<ID, CardWithIndexes>>(cards);
    const $comments = createStore<Record<ID, Comment>>(initialData.entities.comments);
    const $users = createStore<Record<ID, User>>(initialData.entities.users);
    const $tags = createStore<Record<ID, Tag>>(initialData.entities.tags);
    const $cardAssignments = createStore<Record<ID, CardAssignment>>(
        initialData.entities.cardAssignments,
    );
    const $cardTags = createStore<Record<ID, CardTag>>(initialData.entities.cardTags);
    const $activeDeckId = createStore<ID | null>(initialData.activeDeckId);
    const $decksOrder = createStore<ID[]>(initialData.decksOrder);

    // Events
    const setActiveDeckEvent = createEvent<ID>();
    const updateCommentTextEvent = createEvent<{ id: ID; text: string }>();
    const setCommentEditingEvent = createEvent<{ id: ID; isEditing: boolean }>();
    const renameUserEvent = createEvent<{ id: ID; name: string }>();
    const bulkToggleTagEvent = createEvent<{ cardIds: ID[]; tagId: ID }>();
    const updateCardEvent = createEvent<{ id: ID; changes: Partial<Card> }>();
    const bulkUpdateCardsEvent = createEvent<Array<{ id: ID; changes: Partial<Card> }>>();

    // Reducers
    $activeDeckId.on(setActiveDeckEvent, (_, id) => id);

    $comments.on(updateCommentTextEvent, (comments, { id, text }) => {
        const existing = comments[id];
        if (existing && existing.text === text) return comments;
        return { ...comments, [id]: { ...existing, id, text } as Comment };
    });

    $comments.on(setCommentEditingEvent, (comments, { id, isEditing }) => {
        const existing = comments[id];
        const prev = !!existing?.isEditing;
        if (prev === isEditing) return comments;
        return { ...comments, [id]: { ...existing, id, isEditing } as Comment };
    });

    $users.on(renameUserEvent, (users, { id, name }) => {
        const existing = users[id];
        if (existing && existing.name === name) return users;
        return { ...users, [id]: { ...existing, id, name } as User };
    });

    $cards.on(updateCardEvent, (cards, { id, changes }) => {
        const existing = cards[id];
        if (!existing) return cards;
        return { ...cards, [id]: { ...existing, ...changes } as CardWithIndexes };
    });

    $cards.on(bulkUpdateCardsEvent, (cards, updates) => {
        let changed = false;
        const updated = { ...cards };
        for (const { id, changes } of updates) {
            const existing = updated[id];
            if (!existing) continue;
            updated[id] = { ...existing, ...changes } as CardWithIndexes;
            changed = true;
        }
        return changed ? updated : cards;
    });

    $cardTags.on(bulkToggleTagEvent, (cardTags, { cardIds, tagId }) => {
        let counter = Object.keys(cardTags).length;
        const updated = { ...cardTags };
        // Create a map for O(1) lookup: (cardId, tagId) -> CardTag
        const tagMap = new Map<string, CardTag>();
        for (const id in updated) {
            const ct = updated[id];
            if (ct) {
                tagMap.set(`${ct.cardId}:${ct.tagId}`, ct);
            }
        }
        for (const cardId of cardIds) {
            const key = `${cardId}:${tagId}`;
            const existing = tagMap.get(key);
            if (existing) {
                delete updated[existing.id];
                tagMap.delete(key);
            } else {
                const newId = `cardtag_${counter++}`;
                const newTag: CardTag = { id: newId, cardId, tagId, createdAt: Date.now() };
                updated[newId] = newTag;
                tagMap.set(key, newTag);
            }
        }
        return updated;
    });

    const createGroupMap = <T, K extends string | number>(
        entities: Record<ID, T>,
        getKey: (e: T) => K,
        getValue: (e: T) => any,
    ): Map<K, any[]> => {
        const map = new Map<K, any[]>();
        for (const id in entities) {
            const e = entities[id];
            if (!e) continue;
            const k = getKey(e);
            if (!map.has(k)) map.set(k, []);
            map.get(k)!.push(getValue(e));
        }
        return map;
    };

    // Indexes for direct mode (entities)
    const $cardsByDeckId = combine($cards, (cards) =>
        createGroupMap(
            cards,
            (c) => c.deckId,
            (c) => c,
        ),
    );
    const $commentsByCardId = combine($comments, (comments) =>
        createGroupMap(
            comments,
            (c) => c.cardId,
            (c) => c,
        ),
    );
    const $assignmentsByCardId = combine($cardAssignments, (assignments) =>
        createGroupMap(
            assignments,
            (a) => a.cardId,
            (a) => a,
        ),
    );
    const $tagsByCardId = combine([$cardTags, $tags], ([cardTags, tags]) => {
        const map = new Map<ID, Tag[]>();
        for (const id in cardTags) {
            const ct = cardTags[id];
            if (!ct?.tagId) continue;
            const cardId = ct.cardId;
            const tag = tags[ct.tagId];
            if (!tag) continue;
            if (!map.has(cardId)) map.set(cardId, []);
            const tagList = map.get(cardId)!;
            const exists = tagList.some((t) => t.id === ct.tagId);
            if (!exists) tagList.push(tag);
        }
        return map;
    });

    // Helper to rebuild cardIds in decks
    const rebuildDeckCardIds = (
        cards: Record<ID, CardWithIndexes>,
        decks: Record<ID, DeckWithCardIds>,
    ) => {
        const cardIdsByDeckId: Record<ID, ID[]> = {};
        for (const id in cards) {
            const card = cards[id];
            if (!card) continue;
            const deckId = card.deckId;
            if (!cardIdsByDeckId[deckId]) {
                cardIdsByDeckId[deckId] = [];
            }
            cardIdsByDeckId[deckId].push(card.id);
        }
        const updated: Record<ID, DeckWithCardIds> = {};
        for (const id in decks) {
            const deck = decks[id];
            if (!deck) continue;
            const newCardIds = cardIdsByDeckId[id] || [];
            if (
                !deck.cardIds ||
                deck.cardIds.length !== newCardIds.length ||
                !newCardIds.every((cid, idx) => deck.cardIds[idx] === cid)
            ) {
                updated[id] = { ...deck, cardIds: newCardIds };
            } else {
                updated[id] = deck;
            }
        }
        return updated;
    };

    // Helper to rebuild indexes in cards
    const rebuildCardIndexes = (
        comments: Record<ID, Comment>,
        cardAssignments: Record<ID, CardAssignment>,
        users: Record<ID, User>,
        cardTags: Record<ID, CardTag>,
        tags: Record<ID, Tag>,
        cards: Record<ID, CardWithIndexes>,
    ) => {
        // Build commentIdsByCardId
        const commentIdsByCardId: Record<ID, ID[]> = {};
        for (const id in comments) {
            const comment = comments[id];
            if (!comment) continue;
            if (!commentIdsByCardId[comment.cardId]) {
                commentIdsByCardId[comment.cardId] = [];
            }
            commentIdsByCardId[comment.cardId].push(comment.id);
        }

        // Build userIdsByCardId
        const userIdsByCardId: Record<ID, ID[]> = {};
        const seenUserIdsByCard = new Map<ID, Set<ID>>();
        for (const id in cardAssignments) {
            const assignment = cardAssignments[id];
            if (!assignment) continue;
            const cardId = assignment.cardId;
            const userId = assignment.userId;
            if (!userId || !users[userId]) continue;
            if (!seenUserIdsByCard.has(cardId)) seenUserIdsByCard.set(cardId, new Set());
            if (!seenUserIdsByCard.get(cardId)!.has(userId)) {
                seenUserIdsByCard.get(cardId)!.add(userId);
                if (!userIdsByCardId[cardId]) userIdsByCardId[cardId] = [];
                userIdsByCardId[cardId].push(userId);
            }
        }

        // Build cardTagIdsByCardId and tagIdsByCardId
        const cardTagIdsByCardId: Record<ID, ID[]> = {};
        const tagIdsByCardId: Record<ID, ID[]> = {};
        const seenTagIdsByCard = new Map<ID, Set<ID>>();
        for (const id in cardTags) {
            const ct = cardTags[id];
            if (!ct) continue;
            if (!cardTagIdsByCardId[ct.cardId]) cardTagIdsByCardId[ct.cardId] = [];
            cardTagIdsByCardId[ct.cardId].push(ct.id);

            const tagId = ct.tagId;
            const cardId = ct.cardId;
            if (tagId && tags[tagId]) {
                if (!seenTagIdsByCard.has(cardId)) seenTagIdsByCard.set(cardId, new Set());
                if (!seenTagIdsByCard.get(cardId)!.has(tagId)) {
                    seenTagIdsByCard.get(cardId)!.add(tagId);
                    if (!tagIdsByCardId[cardId]) tagIdsByCardId[cardId] = [];
                    tagIdsByCardId[cardId].push(tagId);
                }
            }
        }

        // Update cards with new indexes, preserving references when arrays don't change
        const updated: Record<ID, CardWithIndexes> = {};
        for (const id in cards) {
            const card = cards[id];
            if (!card) continue;
            const newCommentIds = commentIdsByCardId[id] || [];
            const newUserIds = userIdsByCardId[id] || [];
            const newCardTagIds = cardTagIdsByCardId[id] || [];
            const newTagIds = tagIdsByCardId[id] || [];

            // Only update if any array changed
            const commentIdsChanged =
                !card.commentIds ||
                card.commentIds.length !== newCommentIds.length ||
                !newCommentIds.every((cid, idx) => card.commentIds[idx] === cid);
            const userIdsChanged =
                !card.userIds ||
                card.userIds.length !== newUserIds.length ||
                !newUserIds.every((uid, idx) => card.userIds[idx] === uid);
            const cardTagIdsChanged =
                !card.cardTagIds ||
                card.cardTagIds.length !== newCardTagIds.length ||
                !newCardTagIds.every((ctid, idx) => card.cardTagIds[idx] === ctid);
            const tagIdsChanged =
                !card.tagIds ||
                card.tagIds.length !== newTagIds.length ||
                !newTagIds.every((tid, idx) => card.tagIds[idx] === tid);

            if (commentIdsChanged || userIdsChanged || cardTagIdsChanged || tagIdsChanged) {
                updated[id] = {
                    ...card,
                    commentIds: newCommentIds,
                    userIds: newUserIds,
                    cardTagIds: newCardTagIds,
                    tagIds: newTagIds,
                };
            } else {
                updated[id] = card; // Preserve reference
            }
        }
        return updated;
    };

    // Computed stores (derived) that reactively reflect indexes without writing back
    const $decksWithCardIds = combine($cards, $decks, (cards, decks) => {
        return rebuildDeckCardIds(cards, decks);
    });

    const $cardsWithIndexes = combine(
        $comments,
        $cardAssignments,
        $users,
        $cardTags,
        $tags,
        $cards,
        (comments, cardAssignments, users, cardTags, tags, cards) => {
            return rebuildCardIndexes(comments, cardAssignments, users, cardTags, tags, cards);
        },
    );

    // NOTE: We intentionally do NOT write derived stores back into base stores.
    // Best practice in Effector is to keep derived state as separate stores and
    // consume them directly from the view layer. This avoids feedback loops and
    // preserves referential stability for unchanged entities.

    return {
        stores: {
            // base entity stores
            decks: $decks,
            cards: $cards,
            // derived (view) stores with computed indexes
            decksView: $decksWithCardIds,
            cardsView: $cardsWithIndexes,
            comments: $comments,
            users: $users,
            tags: $tags,
            cardAssignments: $cardAssignments,
            cardTags: $cardTags,
            activeDeckId: $activeDeckId,
            decksOrder: $decksOrder,
            // Direct mode indexes (entities) - kept for compatibility
            cardsByDeckId: $cardsByDeckId,
            commentsByCardId: $commentsByCardId,
            assignmentsByCardId: $assignmentsByCardId,
            tagsByCardId: $tagsByCardId,
        },
        events: {
            setActiveDeck: setActiveDeckEvent,
            updateCommentText: updateCommentTextEvent,
            setCommentEditing: setCommentEditingEvent,
            renameUser: renameUserEvent,
            bulkToggleTag: bulkToggleTagEvent,
            updateCard: updateCardEvent,
            bulkUpdateCards: bulkUpdateCardsEvent,
        },
    };
}

type EffectorStore = ReturnType<typeof createEffectorStore>;

const EffectorStoreContext = createContext<EffectorStore | null>(null);

// Stable empty array - used to prevent creating new arrays on every render
const EMPTY_ID_ARRAY: ID[] = [];

const EffectorProvider: React.FC<{ store: StoreHandle; children?: React.ReactNode }> = ({
    store,
    children,
}) => (
    <EffectorStoreContext.Provider value={store as EffectorStore}>
        {children}
    </EffectorStoreContext.Provider>
);

function createHooks(): ViewModelHooksIdsBased {
    return {
        useDeckIds(): ID[] {
            const store = useContext(EffectorStoreContext)!;
            return useUnit(store.stores.decksOrder);
        },
        useDeckById(id: ID): Deck | undefined {
            const store = useContext(EffectorStoreContext)!;
            return useStoreMap({
                store: store.stores.decksView,
                keys: [id],
                fn: (decks, [deckId]) => {
                    // Return the stored deck reference directly to preserve referential equality
                    return (decks[deckId] as unknown as Deck) || undefined;
                },
            });
        },
        useCardById(id: ID): Card | undefined {
            const store = useContext(EffectorStoreContext)!;
            return useStoreMap({
                store: store.stores.cardsView,
                keys: [id],
                fn: (cards, [cardId]) => {
                    // Return the stored card reference directly to preserve referential equality
                    return (cards[cardId] as unknown as Card) || undefined;
                },
            });
        },
        useCommentById(id: ID): Comment | undefined {
            const store = useContext(EffectorStoreContext)!;
            return useStoreMap({
                store: store.stores.comments,
                keys: [id],
                fn: (comments, [commentId]) => comments[commentId],
            });
        },
        useUserById(id: ID): User | undefined {
            const store = useContext(EffectorStoreContext)!;
            return useStoreMap({
                store: store.stores.users,
                keys: [id],
                fn: (users, [userId]) => users[userId],
            });
        },
        useActiveDeckId(): ID | null {
            const store = useContext(EffectorStoreContext)!;
            return useUnit(store.stores.activeDeckId);
        },
        useCardIdsByDeckId(deckId: ID): ID[] {
            const store = useContext(EffectorStoreContext)!;
            return useStoreMap({
                store: store.stores.decksView,
                keys: [deckId],
                fn: (decks, [id]) => {
                    // Read cardIds directly from deck object
                    return decks[id]?.cardIds ?? EMPTY_ID_ARRAY;
                },
            });
        },
        useCommentIdsByCardId(cardId: ID): ID[] {
            const store = useContext(EffectorStoreContext)!;
            return useStoreMap({
                store: store.stores.cardsView,
                keys: [cardId],
                fn: (cards, [id]) => {
                    // Read commentIds directly from card object
                    return cards[id]?.commentIds ?? EMPTY_ID_ARRAY;
                },
            });
        },
        useAssigneeIdsByCardId(cardId: ID): ID[] {
            const store = useContext(EffectorStoreContext)!;
            return useStoreMap({
                store: store.stores.cardsView,
                keys: [cardId],
                fn: (cards, [id]) => {
                    // Read userIds directly from card object
                    return cards[id]?.userIds ?? EMPTY_ID_ARRAY;
                },
            });
        },
        useTagIdsByCardId(cardId: ID): ID[] {
            const store = useContext(EffectorStoreContext)!;
            return useStoreMap({
                store: store.stores.cardsView,
                keys: [cardId],
                fn: (cards, [id]) => {
                    // Read tagIds directly from card object
                    return cards[id]?.tagIds ?? EMPTY_ID_ARRAY;
                },
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
        store.events.bulkToggleTag({ cardIds, tagId });
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
