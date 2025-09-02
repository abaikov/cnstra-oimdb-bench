import React, { createContext, useContext, useMemo, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import type { StoreAdapter, StoreHandle } from '@bench/core';
import type { RootState, ID, Deck, Card, Comment, User } from '@bench/core';

function createSimpleStore(initial: RootState) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    setState: (updater: (s: RootState) => RootState) => {
      state = updater(state);
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

type SimpleStore = ReturnType<typeof createSimpleStore>;

const Ctx = createContext<SimpleStore | null>(null);

const Provider: React.FC<{ store: StoreHandle; children?: React.ReactNode }> = ({ store, children }) => {
  return <Ctx.Provider value={store as SimpleStore}>{children}</Ctx.Provider>;
};

function useStore(): SimpleStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('Store not found');
  return ctx;
}

function useSelector<T>(selector: (s: RootState) => T, equals?: (a: T, b: T) => boolean): T {
    const store = useStore();
    const selectorRef = useRef(selector);
    const equalsRef = useRef(equals);
    const stateRef = useRef<{ value: T; hasValue: boolean }>({ value: undefined as T, hasValue: false });
    
    // Update refs
    selectorRef.current = selector;
    equalsRef.current = equals;
    
    const subscribe = useMemo(() => store.subscribe, [store]);
    
    const getSnapshot = useMemo(() => () => {
        const current = selectorRef.current(store.getState());
        const { value: previous, hasValue } = stateRef.current;
        
        if (!hasValue || 
            (current !== previous && (!equalsRef.current || !equalsRef.current(previous, current)))) {
            stateRef.current = { value: current, hasValue: true };
        }
        
        return stateRef.current.value;
    }, [store]);
    
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function shallowEqualIds(a: { id: string }[] | undefined, b: { id: string }[] | undefined): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if ((a[i] as any).id !== (b[i] as any).id) return false;
    return true;
}

function shallowEqualStrings(a: string[] | undefined, b: string[] | undefined): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

const hooks = {
  useDeckIds(): ID[] {
    return useSelector(
      (s) => {
        const q = s.searchQuery.trim().toLowerCase();
        if (!q) return s.decksOrder;
        const result: ID[] = [];
        for (const id of s.decksOrder) {
          const d = s.entities.decks[id];
          if (!d) continue;
          if (d.title.toLowerCase().includes(q)) result.push(id);
        }
        return result;
      },
      shallowEqualStrings
    );
  },
  useDeckById(id: ID): Deck | undefined {
    return useSelector((s) => s.entities.decks[id]);
  },
  useCardsByDeckId(deckId: ID, limit = 3): Card[] {
    return useSelector(
      (s) => {
        const allCards = Object.values(s.entities.cards).filter(card => card.deckId === deckId);
        const arr = allCards.slice(0, limit);
        return arr;
      },
      (a, b) => shallowEqualIds((a as any) ?? [], (b as any) ?? [])
    );
  },

  useAssigneesByCardId(cardId: ID): User[] {
    return useSelector(
      (s) => {
        const assignments = Object.values(s.entities.cardAssignments).filter(a => a.cardId === cardId);
        const users = assignments.map(a => s.entities.users[a.userId]).filter(Boolean) as User[];
        return users;
      },
      (a, b) => shallowEqualIds((a as any) ?? [], (b as any) ?? [])
    );
  },

  useTagsByCardId(cardId: ID): string[] {
    return useSelector(
      (s) => {
        const cardTags = Object.values(s.entities.cardTags).filter(ct => ct.cardId === cardId);
        const tagIds = cardTags.map(ct => ct.tagId);
        return tagIds;
      },
      shallowEqualStrings
    );
  },
  useCommentsByCardId(cardId: ID, limit = 3): Comment[] {
    return useSelector(
      (s) => {
        const allComments = Object.values(s.entities.comments).filter(comment => comment.cardId === cardId);
        const arr = allComments.slice(0, limit);
        return arr;
      },
      (a, b) => shallowEqualIds((a as any) ?? [], (b as any) ?? [])
    );
  },
  useCardById(id: ID): Card | undefined {
    return useSelector((s) => s.entities.cards[id]);
  },
  useCommentById(id: ID): Comment | undefined {
    return useSelector((s) => s.entities.comments[id]);
  },
  useUserById(id: ID): User | undefined {
    return useSelector((s) => s.entities.users[id]);
  },
  useActiveDeckId(): ID | null {
    return useSelector((s) => s.activeDeckId);
  },
  useSearchQuery(): string {
    return useSelector((s) => s.searchQuery);
  },
};

const actions = (store: SimpleStore) => ({
  setActiveDeck(id: ID) {
    store.setState((s) => ({ ...s, activeDeckId: id }));
  },
  setSearchQuery(q: string) {
    store.setState((s) => ({ ...s, searchQuery: q }));
  },
  updateCommentText(commentId: ID, text: string) {
    store.setState((s) => {
      const existing = s.entities.comments[commentId];
      if (!existing) return s;
      return {
        ...s,
        entities: {
          ...s.entities,
          comments: {
            ...s.entities.comments,
            [commentId]: { ...existing, text },
          },
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
  bulkToggleTagOnCards(cardIds: ID[], tagId: ID) {
    store.setState((s) => {
      const cardTags = { ...s.entities.cardTags };
      let counter = Object.keys(cardTags).length;
      
      for (const cardId of cardIds) {
        // Find existing card-tag relationship
        const existing = Object.values(cardTags).find(ct => ct.cardId === cardId && ct.tagId === tagId);
        
        if (existing) {
          // Remove the relationship
          delete cardTags[existing.id];
        } else {
          // Add the relationship
          const newId = `cardtag_${counter++}`;
          cardTags[newId] = {
            id: newId,
            cardId,
            tagId,
            createdAt: Date.now(),
          };
        }
      }
      
      return { ...s, entities: { ...s.entities, cardTags } };
    });
  },
  backgroundChurnStart() {
    // For placeholder, apply a small random update batch
    store.setState((s) => {
      const cards = { ...s.entities.cards };
      let i = 0;
      for (const id of Object.keys(cards)) {
        if (i++ > 10) break;
        const c = cards[id]!;
        cards[id] = { ...c, updatedAt: Date.now() };
      }
      return { ...s, entities: { ...s.entities, cards } };
    });
  },
  backgroundChurnStop() {
    // noop for placeholder
  },
});

export const placeholderAdapter: StoreAdapter = {
    name: 'Placeholder',
    createStore(initial: RootState) {
        return createSimpleStore(initial);
    },
    Provider,
    get hooks() {
        return hooks;
    },
    bindActions(storeHandle: StoreHandle) {
        return actions(storeHandle as SimpleStore);
    },
};

export default placeholderAdapter;
