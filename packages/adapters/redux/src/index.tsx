import React from 'react';
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
    searchQuery: '',
    activeDeckId: null as ID | null,
    decksOrder: [] as ID[],
  },
  reducers: {
    setSearchQuery: (state, action) => {
      state.searchQuery = action.payload;
    },
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
  });

  // Initialize data
  store.dispatch(decksSlice.actions.setDecks(Object.values(initialData.entities.decks)));
  store.dispatch(cardsSlice.actions.setCards(Object.values(initialData.entities.cards)));
  store.dispatch(commentsSlice.actions.setComments(Object.values(initialData.entities.comments)));
  store.dispatch(usersSlice.actions.setUsers(Object.values(initialData.entities.users)));
  store.dispatch(tagsSlice.actions.setTags(Object.values(initialData.entities.tags)));
  store.dispatch(cardAssignmentsSlice.actions.setCardAssignments(Object.values(initialData.entities.cardAssignments)));
  store.dispatch(cardTagsSlice.actions.setCardTags(Object.values(initialData.entities.cardTags)));
  store.dispatch(appSlice.actions.setSearchQuery(initialData.searchQuery));
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
    const searchQuery = useSelector((state: RootReduxState) => state.app.searchQuery);
    const decksOrder = useSelector((state: RootReduxState) => state.app.decksOrder);
    const decks = useSelector((state: RootReduxState) => state.decks.entities);
    
    if (!searchQuery.trim()) return decksOrder;
    
    const query = searchQuery.trim().toLowerCase();
    return decksOrder.filter(id => {
      const deck = decks[id];
      return deck && deck.title.toLowerCase().includes(query);
    });
  },

  useDeckById(id: ID): Deck | undefined {
    return useSelector((state: RootReduxState) => state.decks.entities[id]);
  },

  useCardById(id: ID): Card | undefined {
    return useSelector((state: RootReduxState) => state.cards.entities[id]);
  },

  useCardsByDeckId(deckId: ID, limit = 3): Card[] {
    return useSelector((state: RootReduxState) => {
      const allCards = Object.values(state.cards.entities).filter(card => card?.deckId === deckId);
      return allCards as Card[];
    });
  },

  useAssigneesByCardId(cardId: ID): User[] {
    return useSelector((state: RootReduxState) => {
      const assignments = Object.values(state.cardAssignments.entities).filter(a => a?.cardId === cardId);
      const users = assignments.map(a => state.users.entities[a?.userId || '']).filter(Boolean) as User[];
      return users;
    });
  },

  useTagsByCardId(cardId: ID): string[] {
    return useSelector((state: RootReduxState) => {
      const cardTags = Object.values(state.cardTags.entities).filter(ct => ct?.cardId === cardId);
      const tagIds = cardTags.map(ct => ct?.tagId).filter(Boolean) as string[];
      return tagIds;
    });
  },

  useCommentById(id: ID): Comment | undefined {
    return useSelector((state: RootReduxState) => state.comments.entities[id]);
  },

  useCommentsByCardId(cardId: ID, limit = 3): Comment[] {
    return useSelector((state: RootReduxState) => {
      const allComments = Object.values(state.comments.entities).filter(comment => comment?.cardId === cardId);
      return allComments as Comment[];
    });
  },

  useUserById(id: ID): User | undefined {
    return useSelector((state: RootReduxState) => state.users.entities[id]);
  },

  useActiveDeckId(): ID | null {
    return useSelector((state: RootReduxState) => state.app.activeDeckId);
  },

  useSearchQuery(): string {
    return useSelector((state: RootReduxState) => state.app.searchQuery);
  },
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
    const cardIds = state.app.decksOrder.slice(0, 2).flatMap(deckId => {
      const allCards = Object.values(state.cards.entities).filter(card => card?.deckId === deckId);
      return allCards.slice(0, 5).map(card => card?.id).filter(Boolean) as string[];
    });
    
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
