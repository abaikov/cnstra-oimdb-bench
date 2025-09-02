export type ID = string;

export type User = {
  id: ID;
  name: string;
  avatarUrl: string | null;
};

export type Comment = {
  id: ID;
  authorId: ID;
  cardId: ID;
  createdAt: number;
  text: string;
  isEditing?: boolean;
};

export type Card = {
  id: ID;
  deckId: ID;
  title: string;
  description: string;
  authorId: ID;
  createdAt: number;
  updatedAt: number;
};

export type Deck = {
  id: ID;
  title: string;
  ownerId: ID;
  createdAt: number;
};

export type CardAssignment = {
  id: ID;
  cardId: ID;
  userId: ID;
  createdAt: number;
};

export type CardTag = {
  id: ID;
  cardId: ID;
  tagId: ID;
  createdAt: number;
};

export type Tag = {
  id: ID;
  label: string;
  color: string;
};

export type NormalizedEntities = {
  users: Record<ID, User>;
  comments: Record<ID, Comment>;
  cards: Record<ID, Card>;
  decks: Record<ID, Deck>;
  tags: Record<ID, Tag>;
  cardAssignments: Record<ID, CardAssignment>;
  cardTags: Record<ID, CardTag>;
};

export type RootState = {
  entities: NormalizedEntities;
  decksOrder: ID[];
  searchQuery: string;
  activeDeckId: ID | null;
};
