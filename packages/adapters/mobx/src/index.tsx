import * as React from 'react';
import { makeAutoObservable, computed } from 'mobx';
import { observer, useObserver } from 'mobx-react-lite';
import type { StoreAdapter, StoreHandle, RootState, ID, Deck, Card, Comment, User, Tag, CardAssignment, CardTag } from '@bench/core';

// Entity stores
class DecksStore {
  entities: Record<ID, Deck> = {};

  constructor() {
    makeAutoObservable(this);
  }

  setDecks(decks: Deck[]) {
    this.entities = {};
    decks.forEach(deck => {
      this.entities[deck.id] = deck;
    });
  }

  getDeckById(id: ID): Deck | undefined {
    return this.entities[id];
  }
}

class CardsStore {
  entities: Record<ID, Card> = {};

  constructor() {
    makeAutoObservable(this);
  }

  setCards(cards: Card[]) {
    this.entities = {};
    cards.forEach(card => {
      this.entities[card.id] = card;
    });
  }

  updateCard(id: ID, changes: Partial<Card>) {
    if (this.entities[id]) {
      this.entities[id] = { ...this.entities[id], ...changes };
    }
  }

  getCardById(id: ID): Card | undefined {
    return this.entities[id];
  }

  getCardsByDeckId(deckId: ID): Card[] {
    return computed(() => {
      return Object.keys(this.entities)
        .map(key => this.entities[key])
        .filter(card => card.deckId === deckId);
    }).get();
  }
}

class CommentsStore {
  entities: Record<ID, Comment> = {};

  constructor() {
    makeAutoObservable(this);
  }

  setComments(comments: Comment[]) {
    this.entities = {};
    comments.forEach(comment => {
      this.entities[comment.id] = comment;
    });
  }

  updateComment(id: ID, changes: Partial<Comment>) {
    if (this.entities[id]) {
      this.entities[id] = { ...this.entities[id], ...changes };
    }
  }

  getCommentById(id: ID): Comment | undefined {
    return this.entities[id];
  }

  getCommentsByCardId(cardId: ID): Comment[] {
    return computed(() => {
      return Object.keys(this.entities)
        .map(key => this.entities[key])
        .filter(comment => comment.cardId === cardId);
    }).get();
  }
}

class UsersStore {
  entities: Record<ID, User> = {};

  constructor() {
    makeAutoObservable(this);
  }

  setUsers(users: User[]) {
    this.entities = {};
    users.forEach(user => {
      this.entities[user.id] = user;
    });
  }

  updateUser(id: ID, changes: Partial<User>) {
    if (this.entities[id]) {
      this.entities[id] = { ...this.entities[id], ...changes };
    }
  }

  getUserById(id: ID): User | undefined {
    return this.entities[id];
  }
}

class TagsStore {
  entities: Record<ID, Tag> = {};

  constructor() {
    makeAutoObservable(this);
  }

  setTags(tags: Tag[]) {
    this.entities = {};
    tags.forEach(tag => {
      this.entities[tag.id] = tag;
    });
  }

  getTagById(id: ID): Tag | undefined {
    return this.entities[id];
  }
}

class CardAssignmentsStore {
  entities: Record<ID, CardAssignment> = {};

  constructor() {
    makeAutoObservable(this);
  }

  setCardAssignments(assignments: CardAssignment[]) {
    this.entities = {};
    assignments.forEach(assignment => {
      this.entities[assignment.id] = assignment;
    });
  }

  getAssignmentsByCardId(cardId: ID): CardAssignment[] {
    return computed(() => {
      return Object.keys(this.entities)
        .map(key => this.entities[key])
        .filter(assignment => assignment.cardId === cardId);
    }).get();
  }
}

class CardTagsStore {
  entities: Record<ID, CardTag> = {};

  constructor() {
    makeAutoObservable(this);
  }

  setCardTags(cardTags: CardTag[]) {
    this.entities = {};
    cardTags.forEach(cardTag => {
      this.entities[cardTag.id] = cardTag;
    });
  }

  addCardTag(cardTag: CardTag) {
    this.entities[cardTag.id] = cardTag;
  }

  removeCardTag(id: ID) {
    delete this.entities[id];
  }

  getCardTagsByCardId(cardId: ID): CardTag[] {
    return computed(() => {
      return Object.keys(this.entities)
        .map(key => this.entities[key])
        .filter(cardTag => cardTag.cardId === cardId);
    }).get();
  }
}

class AppStore {
  activeDeckId: ID | null = null;
  decksOrder: ID[] = [];

  constructor() {
    makeAutoObservable(this);
  }

  // search removed

  setActiveDeck(id: ID) {
    this.activeDeckId = id;
  }

  setDecksOrder(order: ID[]) {
    this.decksOrder = order;
  }
}

class MobXStore {
  decks: DecksStore;
  cards: CardsStore;
  comments: CommentsStore;
  users: UsersStore;
  tags: TagsStore;
  cardAssignments: CardAssignmentsStore;
  cardTags: CardTagsStore;
  app: AppStore;

  constructor(initialData: RootState) {
    this.decks = new DecksStore();
    this.cards = new CardsStore();
    this.comments = new CommentsStore();
    this.users = new UsersStore();
    this.tags = new TagsStore();
    this.cardAssignments = new CardAssignmentsStore();
    this.cardTags = new CardTagsStore();
    this.app = new AppStore();

    makeAutoObservable(this);

    // Initialize data
    this.decks.setDecks(Object.keys(initialData.entities.decks).map(key => initialData.entities.decks[key]));
    this.cards.setCards(Object.keys(initialData.entities.cards).map(key => initialData.entities.cards[key]));
    this.comments.setComments(Object.keys(initialData.entities.comments).map(key => initialData.entities.comments[key]));
    this.users.setUsers(Object.keys(initialData.entities.users).map(key => initialData.entities.users[key]));
    this.tags.setTags(Object.keys(initialData.entities.tags).map(key => initialData.entities.tags[key]));
    this.cardAssignments.setCardAssignments(Object.keys(initialData.entities.cardAssignments).map(key => initialData.entities.cardAssignments[key]));
    this.cardTags.setCardTags(Object.keys(initialData.entities.cardTags).map(key => initialData.entities.cardTags[key]));
    if (initialData.activeDeckId) {
      this.app.setActiveDeck(initialData.activeDeckId);
    }
    this.app.setDecksOrder(initialData.decksOrder);
  }
}

function createMobXStore(initialData: RootState): MobXStore {
  return new MobXStore(initialData);
}

// Create context for MobX store
const MobXStoreContext = React.createContext<MobXStore | null>(null);

const MobXProvider: React.FC<{ store: StoreHandle; children?: React.ReactNode }> = observer(({ store, children }) => {
  return React.createElement(
    MobXStoreContext.Provider,
    { value: store as MobXStore },
    children
  );
});

// Create observer wrapper for components
const createObserverWrapper = (Component: React.ComponentType<any>) => {
  return observer(Component);
};

const hooks = {
  useDeckIds(): ID[] {
    const store = React.useContext(MobXStoreContext)!;
    return store.app.decksOrder;
  },

  useDeckById(id: ID): Deck | undefined {
    const store = React.useContext(MobXStoreContext)!;
    return store.decks.getDeckById(id);
  },

  useCardById(id: ID): Card | undefined {
    const store = React.useContext(MobXStoreContext)!;
    return store.cards.getCardById(id);
  },

  useCardsByDeckId(deckId: ID): Card[] {
    const store = React.useContext(MobXStoreContext)!;
    return store.cards.getCardsByDeckId(deckId);
  },

  useAssigneesByCardId(cardId: ID): User[] {
    const store = React.useContext(MobXStoreContext)!;
    const assignments = store.cardAssignments.getAssignmentsByCardId(cardId);
    const users = assignments.map(a => store.users.getUserById(a.userId)).filter(Boolean) as User[];
    return users;
  },

  useTagsByCardId(cardId: ID): string[] {
    const store = React.useContext(MobXStoreContext)!;
    const cardTags = store.cardTags.getCardTagsByCardId(cardId);
    const tagIds = cardTags.map(ct => ct.tagId).filter(Boolean) as string[];
    return tagIds;
  },

  useCommentById(id: ID): Comment | undefined {
    const store = React.useContext(MobXStoreContext)!;
    return store.comments.getCommentById(id);
  },

  useCommentsByCardId(cardId: ID): Comment[] {
    const store = React.useContext(MobXStoreContext)!;
    return store.comments.getCommentsByCardId(cardId);
  },

  useUserById(id: ID): User | undefined {
    const store = React.useContext(MobXStoreContext)!;
    return store.users.getUserById(id);
  },

  useActiveDeckId(): ID | null {
    const store = React.useContext(MobXStoreContext)!;
    return store.app.activeDeckId;
  },

  // search removed
};

const actions = (store: MobXStore) => ({
  setActiveDeck(id: ID) {
    store.app.setActiveDeck(id);
  },

  setSearchQuery(query: string) {
    store.app.setSearchQuery(query);
  },

  updateCommentText(commentId: ID, text: string) {
    store.comments.updateComment(commentId, { text });
  },

  setCommentEditing(commentId: ID, isEditing: boolean) {
    store.comments.updateComment(commentId, { isEditing });
  },

  renameUser(userId: ID, name: string) {
    store.users.updateUser(userId, { name });
  },

  bulkToggleTagOnCards(cardIds: ID[], tagId: ID) {
    let counter = Object.keys(store.cardTags.entities).length;
    
    cardIds.forEach(cardId => {
      const existing = Object.keys(store.cardTags.entities)
        .map(key => store.cardTags.entities[key])
        .find(ct => ct.cardId === cardId && ct.tagId === tagId);
      
      if (existing) {
        store.cardTags.removeCardTag(existing.id);
      } else {
        const newId = `cardtag_${counter++}`;
        store.cardTags.addCardTag({
          id: newId,
          cardId,
          tagId,
          createdAt: Date.now(),
        });
      }
    });
  },

  backgroundChurnStart() {
    const allCards = Object.keys(store.cards.entities)
      .map(key => store.cards.entities[key])
      .filter(card => card);
    const cardIds = allCards.slice(0, 100).map(card => card?.id).filter(Boolean) as string[];
    
    cardIds.forEach(cardId => {
      store.cards.updateCard(cardId, { updatedAt: Date.now() });
    });
  },

  backgroundChurnStop() {
    // No-op for MobX
  },
});

export const mobxAdapter: StoreAdapter = {
  name: 'MobX',
  createStore: createMobXStore,
  Provider: MobXProvider,
  get hooks() {
    return hooks;
  },
  bindActions(storeHandle: StoreHandle) {
    return actions(storeHandle as MobXStore);
  },
  // Add observer wrapper for components
  wrapComponent: createObserverWrapper,
};

export default mobxAdapter;
