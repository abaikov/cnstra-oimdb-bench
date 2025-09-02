import type { Deck, Card, Comment, User, Entities } from './domain';

// Lightweight deterministic RNG to avoid external deps during build
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

export function generateData(
    seed = 'default',
    opts = {
        decks: 1000,
        cardsPerDeck: 10,
        users: 2000,
        commentsPerCard: 5,
    },
): Entities {
    const seedNum = Array.from(seed).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 0) >>> 0;
    const rng = new Mulberry32(seedNum);
    const users: Record<string, User> = {};
    const decks: Record<string, Deck> = {};
    const cards: Record<string, Card> = {};
    const comments: Record<string, Comment> = {};

    for (let i = 0; i < opts.users; i++) {
        const id = `u${i}`;
        users[id] = {
            id,
            name: `User ${i}`,
            email: `user${i}@example.com`,
            teamId: `team${Math.floor(rng.next() * 50)}`,
        };
    }

    for (let d = 0; d < opts.decks; d++) {
        const deckId = `d${d}`;
        const cardIds: string[] = [];

        for (let c = 0; c < opts.cardsPerDeck; c++) {
            const cardId = `${deckId}-c${c}`;
            cardIds.push(cardId);

            const assigneeCount = Math.floor(rng.next() * 3);
            const assigneeIds = Array.from({ length: assigneeCount }, () => {
                const u = Math.floor(rng.next() * opts.users);
                return `u${u}`;
            });

            const commentIds: string[] = [];
            const commentCount = Math.floor(rng.next() * opts.commentsPerCard);
            for (let k = 0; k < commentCount; k++) {
                const commentId = `${cardId}-cm${k}`;
                commentIds.push(commentId);
                const uid = `u${Math.floor(rng.next() * opts.users)}`;
                comments[commentId] = {
                    id: commentId,
                    cardId,
                    userId: uid,
                    text: `Comment ${k} on card ${cardId}`,
                    createdAt: Date.now() - Math.floor(rng.next() * 1000000),
                };
            }

            const authorId = `u${Math.floor(rng.next() * opts.users)}`;
            cards[cardId] = {
                id: cardId,
                deckId,
                title: `Card ${cardId}`,
                description: `Generated card ${cardId}`,
                authorId,
                assigneeIds,
                commentIds,
                tags: rng.next() > 0.7 ? ['urgent'] : [],
                createdAt: Date.now() - Math.floor(rng.next() * 1000000),
            };
        }

        decks[deckId] = {
            id: deckId,
            title: `Deck ${d}`,
            cardIds,
            ownerId: `u${Math.floor(rng.next() * opts.users)}`,
            createdAt: Date.now() - Math.floor(rng.next() * 1000000),
        };
    }

    return { users, decks, cards, comments };
}


