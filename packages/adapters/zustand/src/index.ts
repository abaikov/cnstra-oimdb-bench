import React, { createContext, useContext } from 'react';
import { createStore as createZustandStore } from 'zustand/vanilla';
import { useStore as useZustand } from 'zustand';
import type { StoreAdapter, StoreHandle } from '@bench/core';
import type { RootState, ID, Deck, Card, Comment, User } from '@bench/core';

type ZStore = ReturnType<typeof createZustandStore<RootState>>;

const Ctx = createContext<ZStore | null>(null);

const Provider: React.FC<{ store: StoreHandle; children?: React.ReactNode }> = ({ store, children }) => {
  return React.createElement(Ctx.Provider, { value: store as ZStore }, children);
};

function useZStore(): ZStore {
  const s = useContext(Ctx);
  if (!s) throw new Error('Zustand store not found');
  return s;
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
    const store = useZStore();
    return useZustand(store, (s) => s.decksOrder, shallowEqualStrings);
  },

  useDeckById(id: ID): Deck | undefined {
    const store = useZStore();
    return useZustand(store, (s) => s.entities.decks[id]);
  },

  useCardById(id: ID): Card | undefined {
    const store = useZStore();
    return useZustand(store, (s) => s.entities.cards[id]);
  },

  useCardsByDeckId(deckId: ID): Card[] {
    const store = useZStore();
    return useZustand(
      store,
      (s) => Object.values(s.entities.cards).filter((c) => c.deckId === deckId),
      (a, b) => shallowEqualIds((a as any) ?? [], (b as any) ?? [])
    );
  },

  useAssigneesByCardId(cardId: ID): User[] {
    const store = useZStore();
    return useZustand(
      store,
      (s) => {
        const assignments = Object.values(s.entities.cardAssignments).filter((a) => a.cardId === cardId);
        const users = assignments.map((a) => s.entities.users[a.userId]).filter(Boolean) as User[];
        return users;
      },
      (a, b) => shallowEqualIds((a as any) ?? [], (b as any) ?? [])
    );
  },

  useTagsByCardId(cardId: ID): string[] {
    const store = useZStore();
    return useZustand(
      store,
      (s) => {
        const cardTags = Object.values(s.entities.cardTags).filter((ct) => ct.cardId === cardId);
        return cardTags.map((ct) => ct.tagId);
      },
      shallowEqualStrings
    );
  },

  useCommentById(id: ID): Comment | undefined {
    const store = useZStore();
    return useZustand(store, (s) => s.entities.comments[id]);
  },

  useCommentsByCardId(cardId: ID): Comment[] {
    const store = useZStore();
    return useZustand(
      store,
      (s) => Object.values(s.entities.comments).filter((c) => c.cardId === cardId),
      (a, b) => shallowEqualIds((a as any) ?? [], (b as any) ?? [])
    );
  },

  useUserById(id: ID): User | undefined {
    const store = useZStore();
    return useZustand(store, (s) => s.entities.users[id]);
  },

  useActiveDeckId(): ID | null {
    const store = useZStore();
    return useZustand(store, (s) => s.activeDeckId);
  },
};

const actions = (store: ZStore) => ({
  setActiveDeck(id: ID) {
    store.setState((s) => ({ ...s, activeDeckId: id }));
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
          comments: { ...s.entities.comments, [commentId]: { ...existing, isEditing } as any },
        },
      };
    });
  },

  bulkToggleTagOnCards(cardIds: ID[], tagId: ID) {
    store.setState((s) => {
      const cardTags = { ...s.entities.cardTags };
      let counter = Object.keys(cardTags).length;
      for (const cardId of cardIds) {
        const existing = Object.values(cardTags).find((ct) => ct.cardId === cardId && ct.tagId === tagId);
        if (existing) {
          delete cardTags[existing.id];
        } else {
          const newId = `cardtag_${counter++}`;
          cardTags[newId] = { id: newId, cardId, tagId, createdAt: Date.now() } as any;
        }
      }
      return { ...s, entities: { ...s.entities, cardTags } };
    });
  },

  backgroundChurnStart() {
    store.setState((s) => {
      const cards = { ...s.entities.cards };
      let i = 0;
      for (const id of Object.keys(cards)) {
        if (i++ >= 100) break;
        const c = cards[id]!;
        cards[id] = { ...c, updatedAt: Date.now() };
      }
      return { ...s, entities: { ...s.entities, cards } };
    });
  },

  backgroundChurnStop() {
    // noop for zustand
  },
});

export const zustandAdapter: StoreAdapter = {
  name: 'Zustand',
  createStore(initial: RootState) {
    return createZustandStore<RootState>(() => initial);
  },
  Provider,
  get hooks() {
    return hooks;
  },
  bindActions(storeHandle: StoreHandle) {
    return actions(storeHandle as ZStore);
  },
};

export default zustandAdapter;
