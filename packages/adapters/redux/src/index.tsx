import React, { useMemo } from 'react';
import { configureStore, createSlice, createEntityAdapter } from '@reduxjs/toolkit';
import { Provider, useSelector, useDispatch } from 'react-redux';
import type { StoreAdapter, StoreHandle } from '@bench/core';
import type { RootState, ID, Deck, Card, Comment, User, Tag, CardAssignment, CardTag } from '@bench/core';

// Entity adapters
const decksAdapter = createEntityAdapter<Deck>();
const cardsAdapter = createEntityAdapter<Card>();
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
  },
});

const cardsSlice = createSlice({
  name: 'cards',
  initialState: cardsAdapter.getInitialState(),
  reducers: {
    setCards: cardsAdapter.setAll,
    updateCard: cardsAdapter.updateOne,
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

  // Initialize data
  store.dispatch(decksSlice.actions.setDecks(Object.values(initialData.entities.decks)));
  store.dispatch(cardsSlice.actions.setCards(Object.values(initialData.entities.cards)));
  store.dispatch(commentsSlice.actions.setComments(Object.values(initialData.entities.comments)));
  store.dispatch(usersSlice.actions.setUsers(Object.values(initialData.entities.users)));
  store.dispatch(tagsSlice.actions.setTags(Object.values(initialData.entities.tags)));
  store.dispatch(cardAssignmentsSlice.actions.setCardAssignments(Object.values(initialData.entities.cardAssignments)));
  store.dispatch(cardTagsSlice.actions.setCardTags(Object.values(initialData.entities.cardTags)));
  store.dispatch(appSlice.actions.setActiveDeck(initialData.activeDeckId));
  store.dispatch(appSlice.actions.setDecksOrder(initialData.decksOrder));

  return store;
}

type ReduxStore = ReturnType<typeof createReduxStore>;
type RootReduxState = ReturnType<ReduxStore['getState']>;

const ReduxProvider: React.FC<{ store: StoreHandle; children?: React.ReactNode }> = ({ store, children }) => {
  return <Provider store={store as ReduxStore}>{children}</Provider>;
};

const hooks = {
  useDeckIds(): ID[] {
    const decksOrder = useSelector((state: RootReduxState) => state.app.decksOrder);
    return decksOrder;
  },

  useDeckById(id: ID): Deck | undefined {
    return useSelector((state: RootReduxState) => state.decks.entities[id]);
  },

  useCardById(id: ID): Card | undefined {
    return useSelector((state: RootReduxState) => state.cards.entities[id]);
  },

  useCardsByDeckId(deckId: ID): Card[] {
    const cardsEntities = useSelector((state: RootReduxState) => state.cards.entities);
    
    return useMemo(() => {
      return Object.values(cardsEntities).filter(card => card?.deckId === deckId) as Card[];
    }, [cardsEntities, deckId]);
  },

  useAssigneesByCardId(cardId: ID): User[] {
    const cardAssignmentsEntities = useSelector((state: RootReduxState) => state.cardAssignments.entities);
    const usersEntities = useSelector((state: RootReduxState) => state.users.entities);
    
    return useMemo(() => {
      const assignments = Object.values(cardAssignmentsEntities).filter(a => a?.cardId === cardId);
      const users = assignments.map(a => usersEntities[a?.userId || '']).filter(Boolean) as User[];
      return users;
    }, [cardAssignmentsEntities, usersEntities, cardId]);
  },

  useTagsByCardId(cardId: ID): string[] {
    const cardTagsEntities = useSelector((state: RootReduxState) => state.cardTags.entities);
    
    return useMemo(() => {
      const cardTags = Object.values(cardTagsEntities).filter(ct => ct?.cardId === cardId);
      const tagIds = cardTags.map(ct => ct?.tagId).filter(Boolean) as string[];
      return tagIds;
    }, [cardTagsEntities, cardId]);
  },

  useCommentById(id: ID): Comment | undefined {
    return useSelector((state: RootReduxState) => state.comments.entities[id]);
  },

  useCommentsByCardId(cardId: ID): Comment[] {
    const commentsEntities = useSelector((state: RootReduxState) => state.comments.entities);
    
    return useMemo(() => {
      return Object.values(commentsEntities).filter(comment => comment?.cardId === cardId) as Comment[];
    }, [commentsEntities, cardId]);
  },

  useUserById(id: ID): User | undefined {
    return useSelector((state: RootReduxState) => state.users.entities[id]);
  },

  useActiveDeckId(): ID | null {
    return useSelector((state: RootReduxState) => state.app.activeDeckId);
  },

  // search removed
};

const actions = (store: ReduxStore) => ({
  setActiveDeck(id: ID) {
    store.dispatch(appSlice.actions.setActiveDeck(id));
  },

  setSearchQuery(query: string) {
    store.dispatch(appSlice.actions.setSearchQuery(query));
  },

  updateCommentText(commentId: ID, text: string) {
    store.dispatch(commentsSlice.actions.updateComment({
      id: commentId,
      changes: { text },
    }));
  },

  setCommentEditing(commentId: ID, isEditing: boolean) {
    store.dispatch(commentsSlice.actions.updateComment({
      id: commentId,
      changes: { isEditing: isEditing as any },
    }));
  },

  renameUser(userId: ID, name: string) {
    store.dispatch(usersSlice.actions.updateUser({
      id: userId,
      changes: { name },
    }));
  },

  bulkToggleTagOnCards(cardIds: ID[], tagId: ID) {
    const state = store.getState();
    let counter = Object.keys(state.cardTags.entities).length;
    
    cardIds.forEach(cardId => {
      const existing = Object.values(state.cardTags.entities).find(ct => ct?.cardId === cardId && ct?.tagId === tagId);
      
      if (existing) {
        store.dispatch(cardTagsSlice.actions.removeCardTag(existing.id));
      } else {
        const newId = `cardtag_${counter++}`;
        store.dispatch(cardTagsSlice.actions.addCardTag({
          id: newId,
          cardId,
          tagId,
          createdAt: Date.now(),
        }));
      }
    });
  },

  backgroundChurnStart() {
    const state = store.getState();
    const allCards = Object.values(state.cards.entities);
    const cardIds = allCards.slice(0, 100).map(card => card?.id).filter(Boolean) as string[];
    
    cardIds.forEach(cardId => {
      store.dispatch(cardsSlice.actions.updateCard({
        id: cardId,
        changes: { updatedAt: Date.now() },
      }));
    });
  },

  backgroundChurnStop() {
    // No-op for Redux
  },
});

export const reduxAdapter: StoreAdapter = {
  name: 'Redux Toolkit',
  createStore: createReduxStore,
  Provider: ReduxProvider,
  get hooks() {
    return hooks;
  },
  bindActions(storeHandle: StoreHandle) {
    return actions(storeHandle as ReduxStore);
  },
};

export default reduxAdapter;
