import React, { createContext, useContext, useState, useEffect, useMemo, useSyncExternalStore, useCallback, useRef } from 'react';
import { CNSProvider, useCNS } from '@cnstra/react';
import { CNS, neuron, collateral } from '@cnstra/core';
import { OIMEventQueue, OIMIndex, OIMRICollection, OIMReactiveCollection, OIMReactiveIndex, OIMReactiveIndexManual, TOIMPk } from '@oimdb/core';
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
  searchQuery: string;
  activeDeckId: string | null;
};

// Create cnstra + oimdb store
function createCnstraOimdbStore(initialData: RootState) {
  // Create OIMDB collections for entity management
  const queue = new OIMEventQueue();
  
  // Create indexes
  const allDecksIndex = new OIMReactiveIndexManual<string, string>(queue);
  const cardsByDeckIndex = new OIMReactiveIndexManual<string, string>(queue);
  const allCardsIndex = new OIMReactiveIndexManual<string, string>(queue);
  const commentsByCardIndex = new OIMReactiveIndexManual<string, string>(queue);
  const assignmentsByCardIndex = new OIMReactiveIndexManual<string, string>(queue);
  const tagsByCardIndex = new OIMReactiveIndexManual<string, string>(queue);
  
  // Create app state collection for reactive app state

  // Create collections
  const collections = {
    decks: new OIMRICollection(queue, {
      collectionOpts: { selectPk: (deck: Deck) => deck.id },
      indexes: { all: allDecksIndex },
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
    searchQuery: initialData.searchQuery,
    activeDeckId: initialData.activeDeckId,
  });

  // Build indexes
  allDecksIndex.setPks('all', Object.values(initialData.entities.decks).map(deck => deck.id));
  Object.values(initialData.entities.cards).forEach(card => {
    cardsByDeckIndex.addPks(card.deckId, [card.id]);
    allCardsIndex.addPks('all', [card.id]);
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
  const searchQueryCollateral = collateral<string>('setSearchQuery');
  const activeDeckCollateral = collateral<string>('setActiveDeck');
  const updateCommentCollateral = collateral<{id: ID, text: string}>('updateComment');
  const editCommentCollateral = collateral<{id: ID, editing: boolean}>('editComment');
  const renameUserCollateral = collateral<{id: ID, name: string}>('renameUser');
  const bulkTagCollateral = collateral<{cardIds: ID[], tagId: ID}>('bulkToggleTag');
  const churnCollateral = collateral<boolean>('backgroundChurn');
  
  const cns = new CNS([
    neuron('app', {}).dendrite({
      collateral: searchQueryCollateral,
      response: (payload: string) => {
        // Update OIMDB reactive state
        const currentState = collections.appState.getOneByPk('app');
        collections.appState.upsertOne({
          id: 'app',
          searchQuery: payload,
          activeDeckId: currentState?.activeDeckId || null
        });
        queue.flush();
      }
    }).dendrite({
      collateral: activeDeckCollateral,
      response: (payload: string) => {
        // Update OIMDB reactive state
        const currentState = collections.appState.getOneByPk('app');
        collections.appState.upsertOne({
          id: 'app',
          searchQuery: currentState?.searchQuery || '',
          activeDeckId: payload
        });
        queue.flush();
      }
    }),
    neuron('comments', {}).dendrite({
      collateral: updateCommentCollateral,
      response: (payload: {id: ID, text: string}) => {

        collections.comments.upsertOne({ id: payload.id, text: payload.text } as Comment);
        queue.flush();
      }
    }).dendrite({
      collateral: editCommentCollateral,
      response: (payload: {id: ID, editing: boolean}) => {
        collections.comments.upsertOne({ id: payload.id, isEditing: payload.editing as any } as Comment);
        queue.flush();
      }
    }),
    neuron('users', {}).dendrite({
      collateral: renameUserCollateral,
      response: (payload: {id: ID, name: string}) => {
        collections.users.upsertOne({ id: payload.id, name: payload.name } as User);
        queue.flush();
      }
    }),
    neuron('cardTags', {}).dendrite({
      collateral: bulkTagCollateral,
      response: (payload: {cardIds: ID[], tagId: ID}) => {
        let counter = collections.cardTags.indexes.byCard.getPksByKeys(payload.cardIds).size;
        
        payload.cardIds.forEach((cardId: string) => {
          // Check if relationship exists using index
          const existingCardTagIds = collections.cardTags.indexes.byCard.getPksByKey(cardId);
          const existingCardTags = existingCardTagIds.map(id => collections.cardTags.getOneByPk(id)).filter(Boolean) as CardTag[];
          const existing = existingCardTags.find(ct => ct.tagId === payload.tagId);
          
          if (existing) {
            // Remove the relationship
            collections.cardTags.removeOne({id: existing.id } as CardTag);
            tagsByCardIndex.removePks(cardId, [existing.id]);
          } else {
            // Add the relationship
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
        queue.flush();
        // No return needed
      }
    }),
    neuron('cards', {}).dendrite({
      collateral: churnCollateral,
      response: (payload: boolean) => {
        if (payload) {
          // Start churn - update some cards using all cards index
          const allCardIds = collections.cards.indexes.all.getPksByKey('all');
          const cardsToUpdate = Array.from(allCardIds)
            .slice(0, 10)
            .map(cardId => collections.cards.getOneByPk(cardId))
            .filter(Boolean)
            .map(card => ({
              ...(card as Card),
              updatedAt: Date.now()
            }));
          
          if (cardsToUpdate.length > 0) {
            collections.cards.upsertMany(cardsToUpdate);
          }
        }
        queue.flush();
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
      searchQueryCollateral,
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


export const selectEntityByPkTest = <TEntity extends object, TPk extends TOIMPk>(
  reactiveCollection: OIMReactiveCollection<TEntity, TPk>,
  pk: TPk
) => {
  const snapshotValueRef = useRef<TEntity | undefined>(
    reactiveCollection.getOneByPk(pk)
  );
  const osc = useRef<any>(() => {});
  const subscribe = useRef((onStoreChange: () => void) => {
    osc.current = onStoreChange;
    return () => {
      osc.current = () => {};
    }
  });
  useEffect(() => {
    const list: any = (pks: readonly TOIMPk[]) => {
      snapshotValueRef.current = reactiveCollection.getOneByPk(pk);
      osc.current();
    }
    reactiveCollection.updateEventEmitter.subscribeOnKey(pk, list);
    return () => {
      reactiveCollection.updateEventEmitter.unsubscribeFromKey(pk, list);
    }
  }, [pk, reactiveCollection.updateEventEmitter, reactiveCollection]);
  const getSnapshot = useMemo(() => () => snapshotValueRef.current, []);
  const snapshot = useSyncExternalStore(subscribe.current, getSnapshot, getSnapshot);
  return snapshot;
};


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

  useCardsByDeckId(deckId: ID, limit = 3): Card[] {
    const { cards } = useOIMCollectionsContext();
    const pks = Array.from(cards.indexes.byDeck.getPksByKey(deckId));
    const allCards = useSelectEntitiesByPks(cards, pks as readonly TOIMPk[]);
    return allCards as Card[];
    // return [];
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

  useCommentsByCardId(cardId: ID, limit = 3): Comment[] {
    // return []
    const { comments } = useOIMCollectionsContext();
    const pks = Array.from(comments.indexes.byCard.getPksByKey(cardId));
    const allComments = useSelectEntitiesByPks(comments, pks as readonly TOIMPk[]);
    return allComments as Comment[];
  },

  useUserById(id: ID): User | undefined {
    // return { id: '0', name: 'User 0', createdAt: 0 } as unknown as User;
    const { users } = useOIMCollectionsContext();
    return selectEntityByPkTest(users, id) as User | undefined;
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
