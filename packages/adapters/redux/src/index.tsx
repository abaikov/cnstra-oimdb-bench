import React, { useMemo } from 'react';
import {
    configureStore,
    createSlice,
    createEntityAdapter,
    createSelector,
    PayloadAction,
} from '@reduxjs/toolkit';
import { Provider, useSelector, batch } from 'react-redux';
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

// Extended entity types for Redux store
type DeckWithCardIds = Deck & { cardIds: ID[] };
type CardWithCommentIds = Card & {
    commentIds: ID[];
    userIds?: ID[];
    cardTagIds?: ID[];
    tagIds?: ID[];
};

// Entity adapters
const decksAdapter = createEntityAdapter<DeckWithCardIds>();
const cardsAdapter = createEntityAdapter<CardWithCommentIds>();
const commentsAdapter = createEntityAdapter<Comment>();
const usersAdapter = createEntityAdapter<User>();
const tagsAdapter = createEntityAdapter<Tag>();
const cardAssignmentsAdapter = createEntityAdapter<CardAssignment>();
const cardTagsAdapter = createEntityAdapter<CardTag>();

// Slices
const decksSlice = createSlice({
    name: 'decks',
    initialState: decksAdapter.getInitialState(),
    reducers: {
        setDecks: decksAdapter.setAll,
        // Add cardIds directly to deck object
        setDeckCardIds: (state, action: { payload: { deckId: ID; cardIds: ID[] } }) => {
            const deck = state.entities[action.payload.deckId];
            if (deck) {
                // Update deck with cardIds - using immer directly
                deck.cardIds = action.payload.cardIds;
            }
        },
    },
    extraReducers: (builder) => {
        // When cards are set, update cardIds in decks
        builder.addCase('cards/setCards', (state, action) => {
            if (!('payload' in action)) return;
            const cards = action.payload as CardWithCommentIds[];
            // Group cards by deckId
            const cardIdsByDeckId: Record<ID, ID[]> = {};
            for (const card of cards) {
                if (!cardIdsByDeckId[card.deckId]) {
                    cardIdsByDeckId[card.deckId] = [];
                }
                cardIdsByDeckId[card.deckId].push(card.id);
            }
            // Update each deck with its cardIds
            for (const [deckId, cardIds] of Object.entries(cardIdsByDeckId)) {
                const deck = state.entities[deckId];
                if (deck) {
                    deck.cardIds = cardIds;
                }
            }
        });
        // When card is updated (deckId might change), update deck.cardIds
        builder.addCase('cards/updateCard', (_state, _action) => {
            // If deckId changed, we need to update both old and new deck
            // For now, just rebuild all - optimization can come later
            // This will be handled by the initial setCards
        });
    },
});

const cardsSlice = createSlice({
    name: 'cards',
    initialState: cardsAdapter.getInitialState(),
    reducers: {
        setCards: cardsAdapter.setAll,
        updateCard: cardsAdapter.updateOne,
        bulkUpdateCards: (
            state,
            action: PayloadAction<Array<{ id: ID; changes: Partial<CardWithCommentIds> }>>,
        ) => {
            // Update multiple cards in one reducer call for better performance
            for (const { id, changes } of action.payload) {
                const card = state.entities[id];
                if (card) {
                    Object.assign(card, changes);
                }
            }
        },
        setCardVisibility: (state, action: PayloadAction<{ cardId: ID; isVisible: boolean }>) => {
            const card = state.entities[action.payload.cardId];
            if (card) {
                card.isVisible = action.payload.isVisible;
            }
        },
    },
    extraReducers: (builder) => {
        // When comments are set, update commentIds in cards
        builder.addCase('comments/setComments', (state, action) => {
            if (!('payload' in action)) return;
            const comments = action.payload as Comment[];
            // Group comments by cardId
            const commentIdsByCardId: Record<ID, ID[]> = {};
            for (const comment of comments) {
                if (!commentIdsByCardId[comment.cardId]) {
                    commentIdsByCardId[comment.cardId] = [];
                }
                commentIdsByCardId[comment.cardId].push(comment.id);
            }
            // Update each card with its commentIds
            for (const [cardId, commentIds] of Object.entries(commentIdsByCardId)) {
                const card = state.entities[cardId];
                if (card) {
                    card.commentIds = commentIds;
                }
            }
        });
        // When cardAssignments are set, update userIds in cards
        builder.addCase('cardAssignments/setCardAssignments', (state, action) => {
            if (!('payload' in action)) return;
            const assignments = action.payload as CardAssignment[];
            // Group userIds by cardId
            const userIdsByCardId: Record<ID, ID[]> = {};
            for (const assignment of assignments) {
                if (!userIdsByCardId[assignment.cardId]) {
                    userIdsByCardId[assignment.cardId] = [];
                }
                if (!userIdsByCardId[assignment.cardId].includes(assignment.userId)) {
                    userIdsByCardId[assignment.cardId].push(assignment.userId);
                }
            }
            // Update each card with its userIds
            for (const [cardId, userIds] of Object.entries(userIdsByCardId)) {
                const card = state.entities[cardId];
                if (card) {
                    card.userIds = userIds;
                }
            }
        });
        // When cardTags are set, update cardTagIds and tagIds in cards
        builder.addCase('cardTags/setCardTags', (state, action) => {
            if (!('payload' in action)) return;
            const cardTags = action.payload as CardTag[];
            const cardTagIdsByCardId: Record<ID, ID[]> = {};
            const tagIdsByCardId: Record<ID, ID[]> = {};
            const seenTagIdsByCard = new Map<ID, Set<ID>>();

            // Get tags from action meta (passed from thunk) or empty object
            const tags = (action as { meta?: { tags: Record<ID, Tag> } }).meta?.tags || {};

            for (const cardTag of cardTags) {
                // Update cardTagIds
                if (!cardTagIdsByCardId[cardTag.cardId]) {
                    cardTagIdsByCardId[cardTag.cardId] = [];
                }
                cardTagIdsByCardId[cardTag.cardId].push(cardTag.id);

                // Update tagIds (unique tag IDs per card)
                if (cardTag.tagId && tags[cardTag.tagId]) {
                    if (!seenTagIdsByCard.has(cardTag.cardId)) {
                        seenTagIdsByCard.set(cardTag.cardId, new Set());
                    }
                    if (!seenTagIdsByCard.get(cardTag.cardId)!.has(cardTag.tagId)) {
                        seenTagIdsByCard.get(cardTag.cardId)!.add(cardTag.tagId);
                        if (!tagIdsByCardId[cardTag.cardId]) {
                            tagIdsByCardId[cardTag.cardId] = [];
                        }
                        tagIdsByCardId[cardTag.cardId].push(cardTag.tagId);
                    }
                }
            }

            // Update each card with its cardTagIds and tagIds
            for (const [cardId, cardTagIds] of Object.entries(cardTagIdsByCardId)) {
                const card = state.entities[cardId];
                if (card) {
                    card.cardTagIds = cardTagIds;
                }
            }
            for (const [cardId, tagIds] of Object.entries(tagIdsByCardId)) {
                const card = state.entities[cardId];
                if (card) {
                    card.tagIds = tagIds;
                }
            }
        });
    },
});

const commentsSlice = createSlice({
    name: 'comments',
    initialState: commentsAdapter.getInitialState(),
    reducers: {
        setComments: commentsAdapter.setAll,
        updateComment: commentsAdapter.updateOne,
    },
});

const usersSlice = createSlice({
    name: 'users',
    initialState: usersAdapter.getInitialState(),
    reducers: {
        setUsers: usersAdapter.setAll,
        updateUser: usersAdapter.updateOne,
    },
});

const tagsSlice = createSlice({
    name: 'tags',
    initialState: tagsAdapter.getInitialState(),
    reducers: {
        setTags: tagsAdapter.setAll,
    },
});

const cardAssignmentsSlice = createSlice({
    name: 'cardAssignments',
    initialState: cardAssignmentsAdapter.getInitialState(),
    reducers: {
        setCardAssignments: cardAssignmentsAdapter.setAll,
    },
});

const cardTagsSlice = createSlice({
    name: 'cardTags',
    initialState: cardTagsAdapter.getInitialState(),
    reducers: {
        setCardTags: cardTagsAdapter.setAll,
        addCardTag: cardTagsAdapter.addOne,
        removeCardTag: cardTagsAdapter.removeOne,
        bulkAddCardTags: (state, action: PayloadAction<CardTag[]>) => {
            // Add multiple cardTags in one reducer call for better performance
            for (const cardTag of action.payload) {
                if (!state.entities[cardTag.id]) {
                    state.ids.push(cardTag.id);
                    state.entities[cardTag.id] = cardTag;
                }
            }
        },
        bulkRemoveCardTags: (state, action: PayloadAction<ID[]>) => {
            // Remove multiple cardTags in one reducer call for better performance
            const idsToRemove = new Set(action.payload);
            state.ids = state.ids.filter((id) => {
                if (idsToRemove.has(id)) {
                    delete state.entities[id];
                    return false;
                }
                return true;
            });
        },
    },
});

const appSlice = createSlice({
    name: 'app',
    initialState: {
        activeDeckId: null as ID | null,
        decksOrder: [] as ID[],
    },
    reducers: {
        setActiveDeck: (state, action) => {
            state.activeDeckId = action.payload;
        },
        setDecksOrder: (state, action) => {
            state.decksOrder = action.payload;
        },
    },
});

function createReduxStore(initialData: RootState) {
    const store = configureStore({
        reducer: {
            decks: decksSlice.reducer,
            cards: cardsSlice.reducer,
            comments: commentsSlice.reducer,
            users: usersSlice.reducer,
            tags: tagsSlice.reducer,
            cardAssignments: cardAssignmentsSlice.reducer,
            cardTags: cardTagsSlice.reducer,
            app: appSlice.reducer,
        },
        middleware: (getDefaultMiddleware) =>
            getDefaultMiddleware({
                serializableCheck: false,
                immutableCheck: false,
            }),
    });

    batch(() => {
        store.dispatch(
            decksSlice.actions.setDecks(
                Object.values(initialData.entities.decks).map(
                    (deck): DeckWithCardIds => ({ ...deck, cardIds: [] }),
                ),
            ),
        );
        store.dispatch(
            cardsSlice.actions.setCards(
                Object.values(initialData.entities.cards).map(
                    (card): CardWithCommentIds => ({
                        ...card,
                        commentIds: [],
                        userIds: [],
                        cardTagIds: [],
                        tagIds: [],
                    }),
                ),
            ),
        );
        store.dispatch(
            commentsSlice.actions.setComments(Object.values(initialData.entities.comments)),
        );
        store.dispatch(usersSlice.actions.setUsers(Object.values(initialData.entities.users)));
        store.dispatch(tagsSlice.actions.setTags(Object.values(initialData.entities.tags)));
        store.dispatch(
            cardAssignmentsSlice.actions.setCardAssignments(
                Object.values(initialData.entities.cardAssignments),
            ),
        );
        // Pass tags in meta so extraReducers can compute tagIds
        store.dispatch({
            type: 'cardTags/setCardTags',
            payload: Object.values(initialData.entities.cardTags),
            meta: { tags: initialData.entities.tags },
        });
        store.dispatch(appSlice.actions.setActiveDeck(initialData.activeDeckId));
        store.dispatch(appSlice.actions.setDecksOrder(initialData.decksOrder));
    });

    return store;
}

type ReduxStore = ReturnType<typeof createReduxStore>;
type RootReduxState = ReturnType<ReduxStore['getState']>;

const ReduxProvider: React.FC<{ store: StoreHandle; children?: React.ReactNode }> = ({
    store,
    children,
}) => <Provider store={store as ReduxStore}>{children}</Provider>;

function createHooks(): ViewModelHooksIdsBased {
    return {
        useDeckIds(): ID[] {
            return useSelector((state: RootReduxState) => state.app.decksOrder);
        },
        useDeckById(id: ID): Deck | undefined {
            return useSelector((state: RootReduxState) => state.decks.entities[id]);
        },
        useCardById(id: ID): Card | undefined {
            return useSelector((state: RootReduxState) => state.cards.entities[id]);
        },
        useCommentById(id: ID): Comment | undefined {
            return useSelector((state: RootReduxState) => state.comments.entities[id]);
        },
        useUserById(id: ID): User | undefined {
            return useSelector((state: RootReduxState) => state.users.entities[id]);
        },
        useActiveDeckId(): ID | null {
            return useSelector((state: RootReduxState) => state.app.activeDeckId);
        },
        useCardIdsByDeckId(deckId: ID): ID[] {
            // Read cardIds directly from deck object
            // Use createSelector to memoize and return same reference if cardIds array doesn't change
            const EMPTY_ARRAY: ID[] = useMemo(() => [], []); // Stable empty array reference
            const selectCardIds = useMemo(
                () =>
                    createSelector(
                        [(state: RootReduxState) => state.decks.entities[deckId]?.cardIds],
                        (cardIds) => {
                            // Return cardIds array directly if it exists - preserves reference
                            // If cardIds is the same reference, createSelector returns cached result
                            return cardIds ?? EMPTY_ARRAY;
                        },
                    ),
                [deckId, EMPTY_ARRAY],
            );
            return useSelector(selectCardIds);
        },
        useCommentIdsByCardId(cardId: ID): ID[] {
            // Read commentIds directly from card object
            // Use createSelector to memoize and return same reference if commentIds array doesn't change
            const EMPTY_ARRAY: ID[] = useMemo(() => [], []); // Stable empty array reference
            const selectCommentIds = useMemo(
                () =>
                    createSelector(
                        [(state: RootReduxState) => state.cards.entities[cardId]?.commentIds],
                        (commentIds) => {
                            // Return commentIds array directly if it exists - preserves reference
                            // If commentIds is the same reference, createSelector returns cached result
                            return commentIds ?? EMPTY_ARRAY;
                        },
                    ),
                [cardId, EMPTY_ARRAY],
            );
            return useSelector(selectCommentIds);
        },
        useAssigneeIdsByCardId(cardId: ID): ID[] {
            // Read userIds directly from card object
            // Use createSelector to memoize and return same reference if userIds array doesn't change
            const EMPTY_ARRAY: ID[] = useMemo(() => [], []); // Stable empty array reference
            const selectUserIds = useMemo(
                () =>
                    createSelector(
                        [(state: RootReduxState) => state.cards.entities[cardId]?.userIds],
                        (userIds) => {
                            // Return userIds array directly if it exists - preserves reference
                            // If userIds is the same reference, createSelector returns cached result
                            return userIds ?? EMPTY_ARRAY;
                        },
                    ),
                [cardId, EMPTY_ARRAY],
            );
            return useSelector(selectUserIds);
        },
        useTagIdsByCardId(cardId: ID): ID[] {
            // Read tagIds directly from card object
            // Use createSelector to memoize and return same reference if tagIds array doesn't change
            const EMPTY_ARRAY: ID[] = useMemo(() => [], []); // Stable empty array reference
            const selectTagIds = useMemo(
                () =>
                    createSelector(
                        [(state: RootReduxState) => state.cards.entities[cardId]?.tagIds],
                        (tagIds) => {
                            // Return tagIds array directly if it exists - preserves reference
                            // If tagIds is the same reference, createSelector returns cached result
                            return tagIds ?? EMPTY_ARRAY;
                        },
                    ),
                [cardId, EMPTY_ARRAY],
            );
            return useSelector(selectTagIds);
        },
        useCardVisibility(cardId: ID): boolean {
            return useSelector(
                (state: RootReduxState) => state.cards.entities[cardId]?.isVisible ?? false,
            );
        },
    };
}

const actions = (store: ReduxStore) => ({
    setActiveDeck(id: ID) {
        store.dispatch(appSlice.actions.setActiveDeck(id));
    },

    updateCard(cardId: ID, changes: Partial<Card>) {
        store.dispatch(cardsSlice.actions.updateCard({ id: cardId, changes }));
    },

    updateCommentText(commentId: ID, text: string) {
        store.dispatch(commentsSlice.actions.updateComment({ id: commentId, changes: { text } }));
    },
    setCommentEditing(commentId: ID, isEditing: boolean) {
        store.dispatch(
            commentsSlice.actions.updateComment({
                id: commentId,
                changes: { isEditing } as Partial<Comment>,
            }),
        );
    },
    renameUser(userId: ID, name: string) {
        store.dispatch(usersSlice.actions.updateUser({ id: userId, changes: { name } }));
    },

    bulkToggleTagOnCards(cardIds: ID[], tagId: ID) {
        const state = store.getState();
        let counter = Object.keys(state.cardTags.entities).length;
        // Create a map for O(1) lookup: (cardId, tagId) -> CardTag
        const existingTagMap = new Map<string, CardTag>();
        for (const id in state.cardTags.entities) {
            const ct = state.cardTags.entities[id];
            if (ct) {
                existingTagMap.set(`${ct.cardId}:${ct.tagId}`, ct);
            }
        }

        // Track what we're doing: removals and additions
        const toRemove: string[] = [];
        const toAdd: CardTag[] = [];
        const affectedCardIds = new Set<ID>();

        for (const cardId of cardIds) {
            const key = `${cardId}:${tagId}`;
            const existing = existingTagMap.get(key);
            if (existing) {
                toRemove.push(existing.id);
                existingTagMap.delete(key); // Remove from map so we can use it to track final state
            } else {
                const newId = `cardtag_${counter++}`;
                const newCardTag: CardTag = {
                    id: newId,
                    cardId,
                    tagId,
                    createdAt: Date.now(),
                };
                toAdd.push(newCardTag);
                existingTagMap.set(key, newCardTag); // Add to map to track final state
            }
            affectedCardIds.add(cardId);
        }

        // Use bulk operations instead of individual actions
        batch(() => {
            if (toRemove.length > 0) {
                store.dispatch(cardTagsSlice.actions.bulkRemoveCardTags(toRemove));
            }
            if (toAdd.length > 0) {
                store.dispatch(cardTagsSlice.actions.bulkAddCardTags(toAdd));
            }
        });

        // Rebuild tagIds and cardTagIds ONLY for affected cards - update them directly in card objects
        // Get state after cardTags updates (outside batch to get final state)
        const currentState = store.getState();

        // Collect all card updates in one array for bulk update
        const cardUpdates: Array<{ id: ID; changes: Partial<CardWithCommentIds> }> = [];

        for (const cardId of affectedCardIds) {
            const seenTagIds = new Set<ID>();
            const tagIds: ID[] = [];
            const cardTagIds: ID[] = [];

            // Get all cardTags for this card (from updated state)
            for (const cardTag of Object.values(currentState.cardTags.entities)) {
                if (
                    cardTag?.cardId === cardId &&
                    cardTag.tagId &&
                    currentState.tags.entities[cardTag.tagId]
                ) {
                    if (!seenTagIds.has(cardTag.tagId)) {
                        seenTagIds.add(cardTag.tagId);
                        tagIds.push(cardTag.tagId);
                    }
                    cardTagIds.push(cardTag.id);
                }
            }

            // Check if update is needed
            const currentCard = currentState.cards.entities[cardId];
            if (currentCard) {
                const currentTagIds = currentCard.tagIds;
                const currentCardTagIds = currentCard.cardTagIds;

                // Only update if different (check length and content)
                const tagIdsChanged =
                    !currentTagIds ||
                    currentTagIds.length !== tagIds.length ||
                    !tagIds.every((id, idx) => currentTagIds[idx] === id);

                const cardTagIdsChanged =
                    !currentCardTagIds ||
                    currentCardTagIds.length !== cardTagIds.length ||
                    !cardTagIds.every((id, idx) => currentCardTagIds[idx] === id);

                if (tagIdsChanged || cardTagIdsChanged) {
                    cardUpdates.push({
                        id: cardId,
                        changes: {
                            ...(tagIdsChanged && { tagIds }),
                            ...(cardTagIdsChanged && { cardTagIds }),
                        } as Partial<CardWithCommentIds>,
                    });
                }
            }
        }

        // Bulk update all cards at once
        if (cardUpdates.length > 0) {
            store.dispatch(cardsSlice.actions.bulkUpdateCards(cardUpdates));
        }
    },

    backgroundChurnStart() {
        const state = store.getState();
        const now = Date.now();
        const updates: Array<{ id: ID; changes: Partial<CardWithCommentIds> }> = [];
        let count = 0;

        for (const id in state.cards.entities) {
            if (count >= 100) break;
            updates.push({ id, changes: { updatedAt: now } });
            count++;
        }

        // Single bulk update instead of 100 individual updates
        if (updates.length > 0) {
            store.dispatch(cardsSlice.actions.bulkUpdateCards(updates));
        }
    },

    backgroundChurnStop() {},
    setCardVisibility(cardId: ID, isVisible: boolean) {
        store.dispatch(cardsSlice.actions.setCardVisibility({ cardId, isVisible }));
    },
});

function createReduxAdapter(): StoreAdapter {
    return {
        name: 'Redux Toolkit (ids-based)',
        createStore: createReduxStore,
        Provider: ReduxProvider,
        get hooks() {
            return createHooks();
        },
        bindActions(storeHandle: StoreHandle) {
            return actions(storeHandle as ReduxStore);
        },
    };
}

export const reduxAdapter = createReduxAdapter();

export default reduxAdapter;
