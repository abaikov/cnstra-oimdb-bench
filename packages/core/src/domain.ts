export interface User {
  id: string;
  name: string;
  email: string;
  teamId: string;
}

export interface Comment {
  id: string;
  cardId: string;
  userId: string;
  text: string;
  createdAt: number;
}

export interface Card {
  id: string;
  deckId: string;
  title: string;
  description: string;
  authorId: string;
  assigneeIds: string[];
  commentIds: string[];
  tags: string[];
  createdAt: number;
}

export interface Deck {
  id: string;
  title: string;
  cardIds: string[];
  ownerId: string;
  createdAt: number;
}

export interface Entities {
  users: Record<string, User>;
  decks: Record<string, Deck>;
  cards: Record<string, Card>;
  comments: Record<string, Comment>;
}
