import React, { createContext, useContext } from 'react';
import { createStore as createZustandStore, type StoreApi } from 'zustand/vanilla';
import { useStore as useZustand } from 'zustand';
import type { StoreAdapter, StoreHandle, ViewModelHooksIdsBased } from '@bench/core';
import type {
    RootState,
    ID,
    Deck,
    Card,
    Comment,
    User,
    Tag,
    CardTag,
    CardAssignment,
} from '@bench/core';

// Extended entity types for Zustand store
type DeckWithCardIds = Deck & { cardIds: ID[] };
type CardWithIndexes = Card & {
    commentIds: ID[];
    userIds: ID[];
    cardTagIds: ID[];
    tagIds: ID[];
};

type ZustandState = Omit<RootState, 'entities'> & {
    entities: {
        users: Record<ID, User>;
        comments: Record<ID, Comment>;
        cards: Record<ID, CardWithIndexes>;
        decks: Record<ID, DeckWithCardIds>;
        tags: Record<ID, Tag>;
        cardAssignments: Record<ID, CardAssignment>;
        cardTags: Record<ID, CardTag>;
    };
};

type ZStore = StoreApi<ZustandState>;

const Ctx = createContext<ZStore | null>(null);

const Provider: React.FC<{ store: StoreHandle; children?: React.ReactNode }> = ({
    store,
    children,
}) => React.createElement(Ctx.Provider, { value: store as ZStore }, children);

function useZStore(): ZStore {
    const s = useContext(Ctx);
    if (!s) throw new Error('Zustand store not found');
    return s;
}

function shallowEqualStrings(a: string[] | undefined, b: string[] | undefined): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

// Helper to build extended entities with indexes from RootState
function buildExtendedEntities(initialData: RootState): ZustandState['entities'] {
    // Build cardIdsByDeckId first
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

    // Build extended decks with cardIds
    const decks: Record<ID, DeckWithCardIds> = {};
    for (const deck of Object.values(initialData.entities.decks)) {
        decks[deck.id] = {
            ...deck,
            cardIds: cardIdsByDeckId[deck.id] || [],
        };
    }

    // Build extended cards with indexes
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

    return {
        users: initialData.entities.users,
        comments: initialData.entities.comments,
        cards,
        decks,
        tags: initialData.entities.tags,
        cardAssignments: initialData.entities.cardAssignments,
        cardTags: initialData.entities.cardTags,
    };
}

function createHooks(): ViewModelHooksIdsBased {
    return {
        useDeckIds(): ID[] {
            const store = useZStore();
            return useZustand(store, (s: ZustandState) => s.decksOrder, shallowEqualStrings);
        },

        useDeckById(id: ID): Deck | undefined {
            const store = useZStore();
            // Return deck object directly from store (DeckWithCardIds extends Deck)
            // to preserve reference equality and avoid unnecessary re-renders
            return useZustand(store, (s: ZustandState) => s.entities.decks[id]);
        },

        useCardById(id: ID): Card | undefined {
            const store = useZStore();
            // Return card object directly from store (CardWithIndexes extends Card)
            // to preserve reference equality and avoid unnecessary re-renders
            return useZustand(store, (s: ZustandState) => s.entities.cards[id]);
        },

        useCommentById(id: ID): Comment | undefined {
            const store = useZStore();
            return useZustand(store, (s: ZustandState) => s.entities.comments[id]);
        },

        useUserById(id: ID): User | undefined {
            const store = useZStore();
            return useZustand(store, (s: ZustandState) => s.entities.users[id]);
        },

        useActiveDeckId(): ID | null {
            const store = useZStore();
            return useZustand(store, (s: ZustandState) => s.activeDeckId);
        },
        useCardIdsByDeckId(deckId: ID): ID[] {
            const store = useZStore();
            return useZustand(
                store,
                (s: ZustandState) => s.entities.decks[deckId]?.cardIds ?? [],
                shallowEqualStrings,
            );
        },
        useCommentIdsByCardId(cardId: ID): ID[] {
            const store = useZStore();
            return useZustand(
                store,
                (s: ZustandState) => s.entities.cards[cardId]?.commentIds ?? [],
                shallowEqualStrings,
            );
        },
        useAssigneeIdsByCardId(cardId: ID): ID[] {
            const store = useZStore();
            return useZustand(
                store,
                (s: ZustandState) => s.entities.cards[cardId]?.userIds ?? [],
                shallowEqualStrings,
            );
        },
        useTagIdsByCardId(cardId: ID): ID[] {
            const store = useZStore();
            return useZustand(
                store,
                (s: ZustandState) => s.entities.cards[cardId]?.tagIds ?? [],
                shallowEqualStrings,
            );
        },
    };
}

const actions = (store: ZStore) => ({
    setActiveDeck(id: ID) {
        store.setState((s) => ({ ...s, activeDeckId: id }));
    },

    updateCard(cardId: ID, changes: Partial<Card>) {
        store.setState((s) => {
            const existing = s.entities.cards[cardId];
            if (!existing) return s;
            return {
                ...s,
                entities: {
                    ...s.entities,
                    cards: { ...s.entities.cards, [cardId]: { ...existing, ...changes } },
                },
            };
        });
    },

    updateCommentText(commentId: ID, text: string) {
        store.setState((s) => {
            const existing = s.entities.comments[commentId];
            if (!existing) return s;
            return {
                ...s,
                entities: {
                    ...s.entities,
                    comments: { ...s.entities.comments, [commentId]: { ...existing, text } },
                },
            };
        });
    },

    renameUser(userId: ID, name: string) {
        store.setState((s) => {
            const user = s.entities.users[userId];
            if (!user) return s;
            return {
                ...s,
                entities: {
                    ...s.entities,
                    users: { ...s.entities.users, [userId]: { ...user, name } },
                },
            };
        });
    },

    setCommentEditing(commentId: ID, isEditing: boolean) {
        store.setState((s) => {
            const existing = s.entities.comments[commentId];
            if (!existing) return s;
            return {
                ...s,
                entities: {
                    ...s.entities,
                    comments: {
                        ...s.entities.comments,
                        [commentId]: { ...existing, isEditing } as Comment,
                    },
                },
            };
        });
    },

    bulkToggleTagOnCards(cardIds: ID[], tagId: ID) {
        store.setState((s) => {
            const cardTags = { ...s.entities.cardTags };
            let counter = Object.keys(cardTags).length;
            // Create a map for O(1) lookup: (cardId, tagId) -> CardTag
            const tagMap = new Map<string, CardTag>();
            for (const id in cardTags) {
                const ct = cardTags[id];
                if (ct) {
                    tagMap.set(`${ct.cardId}:${ct.tagId}`, ct);
                }
            }

            const affectedCardIds = new Set<ID>();
            const toRemove: string[] = [];
            const toAdd: CardTag[] = [];

            for (const cardId of cardIds) {
                const key = `${cardId}:${tagId}`;
                const existing = tagMap.get(key);
                if (existing) {
                    toRemove.push(existing.id);
                    delete cardTags[existing.id];
                    tagMap.delete(key);
                } else {
                    const newId = `cardtag_${counter++}`;
                    const newTag: CardTag = {
                        id: newId,
                        cardId,
                        tagId,
                        createdAt: Date.now(),
                    };
                    cardTags[newId] = newTag;
                    tagMap.set(key, newTag);
                    toAdd.push(newTag);
                }
                affectedCardIds.add(cardId);
            }

            // Rebuild tagIds and cardTagIds for affected cards - update them directly in card objects
            const cards = { ...s.entities.cards };
            for (const cardId of affectedCardIds) {
                const seenTagIds = new Set<ID>();
                const tagIds: ID[] = [];
                const cardTagIds: ID[] = [];

                // Get all cardTags for this card (from updated cardTags)
                for (const cardTagId in cardTags) {
                    const cardTag = cardTags[cardTagId];
                    if (
                        cardTag &&
                        cardTag.cardId === cardId &&
                        cardTag.tagId &&
                        s.entities.tags[cardTag.tagId]
                    ) {
                        if (!seenTagIds.has(cardTag.tagId)) {
                            seenTagIds.add(cardTag.tagId);
                            tagIds.push(cardTag.tagId);
                        }
                        cardTagIds.push(cardTag.id);
                    }
                }

                // Update card with new tagIds and cardTagIds
                const existingCard = cards[cardId];
                if (existingCard) {
                    cards[cardId] = {
                        ...existingCard,
                        tagIds,
                        cardTagIds,
                    };
                }
            }

            return {
                ...s,
                entities: { ...s.entities, cardTags, cards },
            };
        });
    },

    backgroundChurnStart() {
        store.setState((s) => {
            const cards = { ...s.entities.cards };
            let count = 0;
            for (const id in cards) {
                if (count >= 100) break;
                cards[id] = { ...cards[id]!, updatedAt: Date.now() };
                count++;
            }
            return { ...s, entities: { ...s.entities, cards } };
        });
    },
    backgroundChurnStop() {},
});

function createZustandAdapter(): StoreAdapter {
    return {
        name: 'Zustand (ids-based)',
        createStore(initial: RootState) {
            const entities = buildExtendedEntities(initial);
            return createZustandStore<ZustandState>(() => ({
                entities,
                decksOrder: initial.decksOrder,
                activeDeckId: initial.activeDeckId,
            }));
        },
        Provider,
        get hooks() {
            return createHooks();
        },
        bindActions(storeHandle: StoreHandle) {
            return actions(storeHandle as ZStore);
        },
    };
}

export const zustandAdapter = createZustandAdapter();

export default zustandAdapter;
