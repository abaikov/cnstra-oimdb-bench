import React, { createContext, useContext, useState, useEffect, useMemo, useSyncExternalStore, useCallback, useRef } from 'react';
import { CNSProvider, useCNS } from '@cnstra/react';
import { CNS, neuron, collateral } from '@cnstra/core';
import { OIMComparatorFactory, OIMEventQueue, OIMEventQueueSchedulerMicrotask, OIMIndex, OIMRICollection, OIMReactiveCollection, OIMReactiveIndex, OIMReactiveIndexManual, TOIMPk } from '@oimdb/core';
import { 
  OIMRICollectionsProvider, 
  useOIMCollectionsContext,
  selectEntityByPk,
  useSelectEntitiesByPks,
  selectEntitiesByIndexKey,
  useSelectPksByIndexKey
} from '@oimdb/react';
import type { StoreAdapter, StoreHandle } from '@bench/core';
import type { RootState, ID, Deck, Card, Comment, User, Tag, CardAssignment, CardTag } from '@bench/core';

// App state type for reactive app state management
type AppState = {
  id: 'app';
  activeDeckId: string | null;
};

// Create cnstra + oimdb store
function createCnstraOimdbStore(initialData: RootState) {
  // Create OIMDB collections for entity management
  const queue = new OIMEventQueue(
    { scheduler: new OIMEventQueueSchedulerMicrotask() }
  );
  
  // Create indexes
  const cardsByDeckIndex = new OIMReactiveIndexManual<string, string>(queue);
  const allCardsIndex = new OIMReactiveIndexManual<string, string>(queue);
  const commentsByCardIndex = new OIMReactiveIndexManual<string, string>(queue);
  const assignmentsByCardIndex = new OIMReactiveIndexManual<string, string>(queue);
  const tagsByCardIndex = new OIMReactiveIndexManual<string, string>(queue);
  
  // Create app state collection for reactive app state

  // Create collections
  const collections = {
    decks: new OIMRICollection(queue, {
      collectionOpts: { selectPk: (deck: Deck) => deck.id,},
      indexes: {
        all: new OIMReactiveIndexManual<string, string>(queue),
      },
    }),
    cards: new OIMRICollection(queue, {
      collectionOpts: { selectPk: (card: Card) => card.id },
      indexes: { byDeck: cardsByDeckIndex, all: allCardsIndex },
    }),
    comments: new OIMRICollection(queue, {
      collectionOpts: { selectPk: (comment: Comment) => comment.id },
      indexes: { byCard: commentsByCardIndex },
    }),
    users: new OIMRICollection(queue, {
      collectionOpts: { selectPk: (user: User) => user.id },
      indexes: {},
    }),
    tags: new OIMRICollection(queue, {
      collectionOpts: { selectPk: (tag: Tag) => tag.id },
      indexes: {},
    }),
    cardAssignments: new OIMRICollection(queue, {
      collectionOpts: { selectPk: (assignment: CardAssignment) => assignment.id },
      indexes: { byCard: assignmentsByCardIndex },
    }),
    cardTags: new OIMRICollection(queue, {
      collectionOpts: { selectPk: (cardTag: CardTag) => cardTag.id },
      indexes: { byCard: tagsByCardIndex },
    }),
    appState: new OIMRICollection(queue, {
      collectionOpts: { selectPk: (state: AppState) => state.id },
      indexes: {},
    }),
  };

  // Initialize data
  collections.decks.upsertMany(Object.values(initialData.entities.decks));
  collections.cards.upsertMany(Object.values(initialData.entities.cards));
  collections.comments.upsertMany(Object.values(initialData.entities.comments));
  collections.users.upsertMany(Object.values(initialData.entities.users));
  collections.tags.upsertMany(Object.values(initialData.entities.tags));
  collections.cardAssignments.upsertMany(Object.values(initialData.entities.cardAssignments));
  collections.cardTags.upsertMany(Object.values(initialData.entities.cardTags));
  
  // Initialize app state
  collections.appState.upsertOne({
    id: 'app',
    activeDeckId: initialData.activeDeckId,
  });

  // Build indexes
  Object.values(initialData.entities.decks).forEach(deck => {
    collections.decks.indexes.all.addPks('all', [deck.id]);
  });
  Object.values(initialData.entities.cards).forEach(card => {
    cardsByDeckIndex.addPks(card.deckId, [card.id]);
  });
  Object.values(initialData.entities.comments).forEach(comment => {
    commentsByCardIndex.addPks(comment.cardId, [comment.id]);
  });
  Object.values(initialData.entities.cardAssignments).forEach(assignment => {
    assignmentsByCardIndex.addPks(assignment.cardId, [assignment.id]);
  });
  Object.values(initialData.entities.cardTags).forEach(cardTag => {
    tagsByCardIndex.addPks(cardTag.cardId, [cardTag.id]);
  });
  queue.flush();

  // Create CNS for app state management
  const activeDeckCollateral = collateral<string>('setActiveDeck');
  const updateCommentCollateral = collateral<{id: ID, text: string}>('updateComment');
  const editCommentCollateral = collateral<{id: ID, editing: boolean}>('editComment');
  const renameUserCollateral = collateral<{id: ID, name: string}>('renameUser');
  const bulkTagCollateral = collateral<{cardIds: ID[], tagId: ID}>('bulkToggleTag');
  const churnCollateral = collateral<boolean>('backgroundChurn');
  
  const cns = new CNS([
    neuron('app', {}).dendrite({
      collateral: activeDeckCollateral,
      response: (payload: string) => {
        // Update only if changed
        const currentState = collections.appState.getOneByPk('app');
        if (currentState?.activeDeckId === payload) return;
        collections.appState.upsertOne({ id: 'app', activeDeckId: payload });
        queue.flush();
      }
    }),
    neuron('comments', {}).dendrite({
      collateral: updateCommentCollateral,
      response: (payload: {id: ID, text: string}) => {
        const existing = collections.comments.getOneByPk(payload.id) as Comment | undefined;
        if (existing && existing.text === payload.text) return;
        collections.comments.upsertOne({ id: payload.id, text: payload.text } as Comment);
        queue.flush();
      }
    }).dendrite({
      collateral: editCommentCollateral,
      response: (payload: {id: ID, editing: boolean}) => {
        const existing = collections.comments.getOneByPk(payload.id) as Comment | undefined;
        const prev = !!(existing as any)?.isEditing;
        if (prev === payload.editing) return;
        collections.comments.upsertOne({ id: payload.id, isEditing: payload.editing as any } as Comment);
        queue.flush();
      }
    }),
    neuron('users', {}).dendrite({
      collateral: renameUserCollateral,
      response: (payload: {id: ID, name: string}) => {
        const existing = collections.users.getOneByPk(payload.id) as User | undefined;
        if (existing && existing.name === payload.name) return;
        collections.users.upsertOne({ id: payload.id, name: payload.name } as User);
        queue.flush();
      }
    }),
    neuron('cardTags', {}).dendrite({
      collateral: bulkTagCollateral,
      response: (payload: {cardIds: ID[], tagId: ID}) => {
        let counter = Object.keys(collections.cardTags.collection.getAll() as any).length;
        
        payload.cardIds.forEach((cardId: string) => {
          // Find existing mapping for (cardId, tagId)
          const pks = Array.from(collections.cardTags.indexes.byCard.getPksByKey(cardId));
          let existingId: string | undefined;
          for (const pk of pks) {
            const ct = collections.cardTags.getOneByPk(pk as string) as CardTag | undefined;
            if (ct && ct.tagId === payload.tagId) { existingId = ct.id; break; }
          }
          if (existingId) {
            collections.cardTags.removeOne({ id: existingId } as CardTag);
            tagsByCardIndex.removePks(cardId, [existingId]);
          } else {
            const newCardTag: CardTag = {
              id: `cardtag_${counter++}`,
              cardId,
              tagId: payload.tagId,
              createdAt: Date.now(),
            };
            collections.cardTags.upsertOne(newCardTag);
            tagsByCardIndex.addPks(cardId, [newCardTag.id]);
          }
        });
        // No return needed
      }
    }),
    neuron('cards', {}).dendrite({
      collateral: churnCollateral,
      response: (payload: boolean) => {
        if (payload) {
          // Start churn - update some cards using all cards index
          collections.cards.collection.getAll().slice(0, 100).forEach(card => {
            collections.cards.upsertOne({
              id: card.id,
              updatedAt: Date.now()
            } as Card);
          });
        }
        // No return needed
      }
    })
  ]);

  // CNS is ready to handle actions that will update OIMDB reactive state

  return {
    cns,
    collections,
    decksOrder: initialData.decksOrder,
    queue,
    collaterals: {
      activeDeckCollateral,
      updateCommentCollateral,
      editCommentCollateral,
      renameUserCollateral,
      bulkTagCollateral,
      churnCollateral,
    },
  };
}

type CnstraOimdbStore = ReturnType<typeof createCnstraOimdbStore>;

const CnstraStoreContext = createContext<CnstraOimdbStore | null>(null);

const CnstraOimdbProvider: React.FC<{ store: StoreHandle; children?: React.ReactNode }> = ({ store, children }) => {
  const cnstraOimdbStore = store as CnstraOimdbStore;
  // const Provider = cnstraOimdbStore.Provider;
  
  return (
    <CnstraStoreContext.Provider value={cnstraOimdbStore}>
      <CNSProvider cns={cnstraOimdbStore.cns}>
        <OIMRICollectionsProvider collections={cnstraOimdbStore.collections}>
          {children}
        </OIMRICollectionsProvider>
      </CNSProvider>
    </CnstraStoreContext.Provider>
  );
};

function useCnstraOimdbStore(): CnstraOimdbStore {
  const store = useContext(CnstraStoreContext);
  if (!store) throw new Error('CnstraOimdbStore not found');
  return store;
}

const hooks = {
  useDeckIds(): ID[] {
    const { decks } = useOIMCollectionsContext();
    const allDecks = useSelectPksByIndexKey(decks.indexes.all, 'all');
    return allDecks as ID[];
    // // Use OIMDB index to get all deck entities reactively
    // return allDecks as ID[];
  },

  useDeckById(id: ID): Deck | undefined {
    // return { id: '0', title: 'Deck 0', ownerId: '0', createdAt: 0 } as Deck;
    const { decks } = useOIMCollectionsContext();
    return selectEntityByPk(decks, id) as Deck | undefined;
  },

  useCardById(id: ID): Card | undefined {
    // return { id: '0', deckId: '0', title: 'Card 0', ownerId: '0', createdAt: 0 } as unknown as Card;
    const { cards } = useOIMCollectionsContext();
    return selectEntityByPk(cards, id) as Card | undefined;
  },

  useCardsByDeckId(deckId: ID): Card[] {
    const { cards } = useOIMCollectionsContext();
    const pks = Array.from(cards.indexes.byDeck.getPksByKey(deckId));
    const allCards = useSelectEntitiesByPks(cards, pks as readonly TOIMPk[]);
    return allCards as Card[];
  },

  useAssigneesByCardId(cardId: ID): User[] {
    const { cardAssignments, users } = useOIMCollectionsContext();
    const assignments = selectEntitiesByIndexKey(cardAssignments, cardAssignments.indexes.byCard, cardId);
    const assignees = assignments.map(a => selectEntityByPk(users, (a as CardAssignment)?.userId || '')).filter(Boolean) as User[];
    return assignees;
    // return [];
  },

  useTagsByCardId(cardId: ID): string[] {
    const { cardTags } = useOIMCollectionsContext();
    const cardTagEntities = selectEntitiesByIndexKey(cardTags, cardTags.indexes.byCard, cardId);
    const tagIds = cardTagEntities.map(ct => (ct as CardTag)?.tagId).filter(Boolean) as string[];
    return tagIds;
    // return [];
  },

  useCommentById(id: ID): Comment | undefined {
    const { comments } = useOIMCollectionsContext();
    const comment = selectEntityByPk(comments, id) as Comment | undefined;
    return comment;

    // return { id: '0', cardId: '0', text: 'Comment 0', createdAt: 0 } as unknown as Comment;
  },

  useCommentsByCardId(cardId: ID): Comment[] {
    const { comments } = useOIMCollectionsContext();
    const pks = Array.from(comments.indexes.byCard.getPksByKey(cardId));
    const allComments = useSelectEntitiesByPks(comments, pks as readonly TOIMPk[]);
    return allComments as Comment[];
  },

  useUserById(id: ID): User | undefined {
    // return { id: '0', name: 'User 0', createdAt: 0 } as unknown as User;
    const { users } = useOIMCollectionsContext();
    return selectEntityByPk(users, id) as User | undefined;
  },

  useActiveDeckId(): ID | null {
    return '0';
  },

  useSearchQuery(): string {
    // const { appState } = useOIMCollectionsContext();
    // const state = selectEntityByPk(appState, 'app') as AppState | undefined;
    return '';
  },
};

const actions = (store: CnstraOimdbStore) => {
  const { collaterals } = store;
  
  return {
    setActiveDeck(id: ID) {
      // Use CNS to stimulate active deck change
      store.cns.stimulate(collaterals.activeDeckCollateral.createSignal(id));
    },

    setSearchQuery(query: string) {
      // Use CNS to stimulate search query change
      store.cns.stimulate(collaterals.searchQueryCollateral.createSignal(query));
    },

    updateCommentText(commentId: ID, text: string) {
      // Create stimulation for comment update
      store.cns.stimulate(collaterals.updateCommentCollateral.createSignal({id: commentId, text}));
    },

    setCommentEditing(commentId: ID, isEditing: boolean) {
      // Create stimulation for comment editing state
      store.cns.stimulate(collaterals.editCommentCollateral.createSignal({id: commentId, editing: isEditing}), {
    
      });
    },

    renameUser(userId: ID, name: string) {
      // Create stimulation for user rename
      store.cns.stimulate(collaterals.renameUserCollateral.createSignal({id: userId, name}));
    },

    bulkToggleTagOnCards(cardIds: ID[], tagId: ID) {
      // Create stimulation for bulk tag toggle
      store.cns.stimulate(collaterals.bulkTagCollateral.createSignal({cardIds, tagId}));
    },

    backgroundChurnStart() {
      // Create stimulation for background churn start
      store.cns.stimulate(collaterals.churnCollateral.createSignal(true));
    },

    backgroundChurnStop() {
      // Create stimulation for background churn stop
      store.cns.stimulate(collaterals.churnCollateral.createSignal(false));
    },
  };
};

export const cnstraOimdbAdapter: StoreAdapter = {
  name: 'Cnstra + Oimdb',
  createStore: createCnstraOimdbStore,
  Provider: CnstraOimdbProvider,
  get hooks() {
    return hooks;
  },
  bindActions(storeHandle: StoreHandle) {
    return actions(storeHandle as CnstraOimdbStore);
  },
};

export default cnstraOimdbAdapter;
