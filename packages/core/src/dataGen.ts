import type { RootState, NormalizedEntities, Deck, Card, Comment, User, Tag, CardAssignment, CardTag, ID } from './types';

class Mulberry32 {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

const pick = <T,>(rng: Mulberry32, arr: T[]): T => arr[Math.floor(rng.next() * arr.length)];

const makeId = (prefix: string, n: number) => `${prefix}_${n}`;

export type DataGenOptions = {
  decks?: number; // default 1000
  cardsPerDeck?: number; // default 10
  minCommentsPerCard?: number; // default 3
  maxCommentsPerCard?: number; // default 5
  users?: number; // default ~2000
  tags?: number; // default 50
  seed?: number; // default 42
};

export function generateDataset(opts: DataGenOptions = {}): RootState {
  const {
    decks = 1000,
    cardsPerDeck = 10,
    minCommentsPerCard = 3,
    maxCommentsPerCard = 5,
    users = 2000,
    tags = 50,
    seed = 42,
  } = opts;

  const rng = new Mulberry32(seed);

  const usersMap: Record<ID, User> = {};
  for (let i = 0; i < users; i++) {
    const id = makeId('user', i);
    usersMap[id] = {
      id,
      name: `User ${i}`,
      avatarUrl: null,
    };
  }

  const tagsMap: Record<ID, Tag> = {};
  for (let i = 0; i < tags; i++) {
    const id = makeId('tag', i);
    tagsMap[id] = {
      id,
      label: `Tag ${i}`,
      color: `hsl(${Math.floor(rng.next() * 360)}, 70%, 50%)`,
    };
  }

  const decksMap: Record<ID, Deck> = {};
  const cardsMap: Record<ID, Card> = {};
  const commentsMap: Record<ID, Comment> = {};
  const cardAssignmentsMap: Record<ID, CardAssignment> = {};
  const cardTagsMap: Record<ID, CardTag> = {};
  const decksOrder: ID[] = [];

  let commentCounter = 0;
  let cardCounter = 0;
  let assignmentCounter = 0;
  let cardTagCounter = 0;

  for (let d = 0; d < decks; d++) {
    const deckId = makeId('deck', d);
    decksOrder.push(deckId);
    const deckCardIds: ID[] = [];

    for (let c = 0; c < cardsPerDeck; c++) {
      const cardId = makeId('card', cardCounter++);
      const authorId = makeId('user', Math.floor(rng.next() * users));
      const createdAt = Date.now() - Math.floor(rng.next() * 1000 * 60 * 60 * 24 * 365);
      const updatedAt = createdAt + Math.floor(rng.next() * 1000 * 60 * 60 * 24 * 30);

      // Create normalized card
      cardsMap[cardId] = {
        id: cardId,
        deckId,
        title: `Card ${cardId}`,
        description: `Description for ${cardId}`,
        authorId,
        createdAt,
        updatedAt,
      };

      // Create card assignments (normalized)
      const assigneeCount = Math.floor(rng.next() * 3);
      for (let a = 0; a < assigneeCount; a++) {
        const assignmentId = makeId('assignment', assignmentCounter++);
        const userId = makeId('user', Math.floor(rng.next() * users));
        cardAssignmentsMap[assignmentId] = {
          id: assignmentId,
          cardId,
          userId,
          createdAt,
        };
      }

      // Create card tags (normalized)
      const tagCount = Math.floor(rng.next() * 3);
      for (let t = 0; t < tagCount; t++) {
        const cardTagId = makeId('cardtag', cardTagCounter++);
        const tagId = makeId('tag', Math.floor(rng.next() * tags));
        cardTagsMap[cardTagId] = {
          id: cardTagId,
          cardId,
          tagId,
          createdAt,
        };
      }

      // Create comments
      const perCardComments = Math.floor(rng.next() * (maxCommentsPerCard - minCommentsPerCard + 1)) + minCommentsPerCard;
      for (let k = 0; k < perCardComments; k++) {
        const commentId = makeId('comment', commentCounter++);
        const author = makeId('user', Math.floor(rng.next() * users));
        commentsMap[commentId] = {
          id: commentId,
          authorId: author,
          cardId,
          createdAt: createdAt + k * 1000 * 60,
          text: `Comment ${commentId} on ${cardId}`,
        };
      }
    }

    decksMap[deckId] = {
      id: deckId,
      title: `Deck ${d}`,
      ownerId: makeId('user', Math.floor(rng.next() * users)),
      createdAt: Date.now() - Math.floor(rng.next() * 1000 * 60 * 60 * 24 * 365),
    };
  }

  const entities: NormalizedEntities = {
    users: usersMap,
    comments: commentsMap,
    cards: cardsMap,
    decks: decksMap,
    tags: tagsMap,
    cardAssignments: cardAssignmentsMap,
    cardTags: cardTagsMap,
  };

  const dataset: RootState = {
    entities,
    decksOrder,
    activeDeckId: decksOrder[0] ?? null,
  };

  return dataset;
}
