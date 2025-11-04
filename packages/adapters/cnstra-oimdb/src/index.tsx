import * as React from 'react';
import { createContext } from 'react';
import { CNSProvider } from '@cnstra/react';
import { CNS, neuron, collateral } from '@cnstra/core';
import { OIMEventQueue, OIMRICollection, OIMReactiveIndexManual } from '@oimdb/core';
import {
    OIMRICollectionsProvider,
    useOIMCollectionsContext,
    useSelectEntityByPk,
    useSelectPksByIndexKey,
} from '@oimdb/react';
import type { StoreAdapter, StoreHandle, ViewModelHooksIdsBased } from '@bench/core';
import type {
    RootState,
    ID,
    Deck,
    Card,
    Comment,
    User,
    Tag,
    CardAssignment,
    CardTag,
} from '@bench/core';

type AppState = {
    id: 'app';
    activeDeckId: string | null;
};

function createCnstraOimdbStore(initialData: RootState) {
    const queue = new OIMEventQueue({});
    const cardsByDeckIndex = new OIMReactiveIndexManual<string, string>(queue);
    const allCardsIndex = new OIMReactiveIndexManual<string, string>(queue);
    const commentsByCardIndex = new OIMReactiveIndexManual<string, string>(queue);
    const assignmentsByCardIndex = new OIMReactiveIndexManual<string, string>(queue);
    const tagsByCardIndex = new OIMReactiveIndexManual<string, string>(queue);
    // Users by card assignments (userIds grouped by cardId)
    const usersByAssignedCardIndex = new OIMReactiveIndexManual<string, string>(queue);

    const collections = {
        decks: new OIMRICollection(queue, {
            collectionOpts: { selectPk: (deck: Deck) => deck.id },
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
            indexes: { assignedCardId: usersByAssignedCardIndex },
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
            indexes: {
                byCard: tagsByCardIndex,
            },
        }),
        appState: new OIMRICollection(queue, {
            collectionOpts: { selectPk: (state: AppState) => state.id },
            indexes: {},
        }),
    };

    collections.decks.upsertMany(Object.values(initialData.entities.decks));
    collections.cards.upsertMany(Object.values(initialData.entities.cards));
    collections.comments.upsertMany(Object.values(initialData.entities.comments));
    collections.users.upsertMany(Object.values(initialData.entities.users));
    collections.tags.upsertMany(Object.values(initialData.entities.tags));
    collections.cardAssignments.upsertMany(Object.values(initialData.entities.cardAssignments));
    collections.cardTags.upsertMany(Object.values(initialData.entities.cardTags));
    collections.appState.upsertOne({ id: 'app', activeDeckId: initialData.activeDeckId });

    const groupByKey = <T,>(
        entities: T[],
        getKey: (e: T) => string,
        getId: (e: T) => ID,
    ): Map<string, ID[]> => {
        const map = new Map<string, ID[]>();
        for (const e of entities) {
            const k = getKey(e);
            if (!map.has(k)) map.set(k, []);
            map.get(k)!.push(getId(e));
        }
        return map;
    };
    collections.decks.indexes.all.addPks(
        'all',
        Object.values(initialData.entities.decks).map((d) => d.id),
    );
    const cardsArray = Object.values(initialData.entities.cards);
    allCardsIndex.addPks(
        'all',
        cardsArray.map((c) => c.id),
    );
    groupByKey(
        cardsArray,
        (c) => c.deckId,
        (c) => c.id,
    ).forEach((ids, k) => cardsByDeckIndex.addPks(k, ids));
    groupByKey(
        Object.values(initialData.entities.comments),
        (c) => c.cardId,
        (c) => c.id,
    ).forEach((ids, k) => commentsByCardIndex.addPks(k, ids));
    const assignmentsArray = Object.values(initialData.entities.cardAssignments);
    groupByKey(
        assignmentsArray,
        (a) => a.cardId,
        (a) => a.id,
    ).forEach((ids, k) => assignmentsByCardIndex.addPks(k, ids));
    // Precompute users by assigned card for fast lookup in hooks
    groupByKey(
        assignmentsArray,
        (a) => a.cardId,
        (a) => a.userId,
    ).forEach((ids, k) => usersByAssignedCardIndex.addPks(k, ids));
    groupByKey(
        Object.values(initialData.entities.cardTags),
        (ct) => ct.cardId,
        (ct) => ct.id,
    ).forEach((ids, k) => tagsByCardIndex.addPks(k, ids));
    queue.flush();

    const collaterals = {
        activeDeck: collateral<string>('setActiveDeck'),
        updateCard: collateral<{ id: ID; changes: Partial<Card> }>('updateCard'),
        updateComment: collateral<{ id: ID; text: string }>('updateComment'),
        editComment: collateral<{ id: ID; editing: boolean }>('editComment'),
        renameUser: collateral<{ id: ID; name: string }>('renameUser'),
        bulkTag: collateral<{ cardIds: ID[]; tagId: ID }>('bulkToggleTag'),
        churn: collateral<boolean>('backgroundChurn'),
    };

    const cns = new CNS([
        neuron('app', {}).dendrite({
            collateral: collaterals.activeDeck,
            response: (payload: string) => {
                const state = collections.appState.getOneByPk('app');
                if (state?.activeDeckId === payload) return;
                collections.appState.upsertOne({ id: 'app', activeDeckId: payload });
                queue.flush();
            },
        }),
        neuron('comments', {})
            .dendrite({
                collateral: collaterals.updateComment,
                response: (payload: { id: ID; text: string }) => {
                    const existing = collections.comments.getOneByPk(payload.id) as
                        | Comment
                        | undefined;
                    if (existing?.text === payload.text) return;
                    collections.comments.upsertOne({
                        id: payload.id,
                        text: payload.text,
                    } as Comment);
                    queue.flush();
                },
            })
            .dendrite({
                collateral: collaterals.editComment,
                response: (payload: { id: ID; editing: boolean }) => {
                    const existing = collections.comments.getOneByPk(payload.id) as
                        | Comment
                        | undefined;
                    if (!!existing?.isEditing === payload.editing) return;
                    collections.comments.upsertOne({
                        id: payload.id,
                        isEditing: payload.editing,
                    } as Comment);
                    queue.flush();
                },
            }),
        neuron('users', {}).dendrite({
            collateral: collaterals.renameUser,
            response: (payload: { id: ID; name: string }) => {
                const existing = collections.users.getOneByPk(payload.id) as User | undefined;
                if (existing?.name === payload.name) return;
                collections.users.upsertOne({ id: payload.id, name: payload.name } as User);
                queue.flush();
            },
        }),
        neuron('cardTags', {}).dendrite({
            collateral: collaterals.bulkTag,
            response: (payload: { cardIds: ID[]; tagId: ID }) => {
                // Get current count from PKs (more efficient than getAll())
                const allPks = collections.cardTags.collection.getAllPks();
                let counter = allPks.length;
                for (const cardId of payload.cardIds) {
                    const pks = Array.from(collections.cardTags.indexes.byCard.getPksByKey(cardId));
                    let existingId: string | undefined;
                    // Optimize: check tagId directly from PKs using index instead of fetching entities
                    for (const pk of pks) {
                        const ct = collections.cardTags.getOneByPk(pk as string) as
                            | CardTag
                            | undefined;
                        if (ct?.tagId === payload.tagId) {
                            existingId = ct.id;
                            break;
                        }
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
                }
                queue.flush();
            },
        }),
        neuron('cards', {})
            .dendrite({
                collateral: collaterals.updateCard,
                response: (payload: { id: ID; changes: Partial<Card> }) => {
                    const existing = collections.cards.getOneByPk(payload.id) as Card | undefined;
                    if (!existing) return;
                    collections.cards.upsertOne({
                        id: payload.id,
                        ...payload.changes,
                    } as Card);
                    queue.flush();
                },
            })
            .dendrite({
                collateral: collaterals.churn,
                response: (payload: boolean) => {
                    if (payload) {
                        const pkSet = allCardsIndex.getPksByKey('all');
                        let count = 0;
                        for (const pk of pkSet) {
                            if (count >= 100) break;
                            count++;
                            const card = collections.cards.getOneByPk(pk as string) as Card;
                            collections.cards.upsertOne({
                                id: card.id,
                                updatedAt: Date.now(),
                            } as Card);
                        }
                        queue.flush();
                    }
                },
            }),
    ]);

    return { cns, collections, decksOrder: initialData.decksOrder, queue, collaterals };
}

type CnstraOimdbStore = ReturnType<typeof createCnstraOimdbStore>;

const CnstraStoreContext = createContext<CnstraOimdbStore | null>(null);

type CnstraOimdbProviderProps = { store: StoreHandle; children?: React.ReactNode };
const CnstraOimdbProvider: React.FC<CnstraOimdbProviderProps> = ({
    store,
    children,
}: CnstraOimdbProviderProps) => {
    const s = store as CnstraOimdbStore;
    return (
        <CnstraStoreContext.Provider value={s}>
            <CNSProvider cns={s.cns}>
                <OIMRICollectionsProvider collections={s.collections as any}>
                    {children}
                </OIMRICollectionsProvider>
            </CNSProvider>
        </CnstraStoreContext.Provider>
    );
};
const EMPTY_ARRAY: any[] = [];

function createHooks(): ViewModelHooksIdsBased {
    return {
        useDeckIds(): ID[] {
            const { decks } = useOIMCollectionsContext();
            return useSelectPksByIndexKey(decks.indexes.all, 'all') as ID[];
        },
        useDeckById(id: ID): Deck | undefined {
            const { decks } = useOIMCollectionsContext();
            return useSelectEntityByPk(decks, id) as Deck | undefined;
        },
        useCardById(id: ID): Card | undefined {
            const { cards } = useOIMCollectionsContext();
            return useSelectEntityByPk(cards, id) as Card | undefined;
        },
        useCommentById(id: ID): Comment | undefined {
            const { comments } = useOIMCollectionsContext();
            return useSelectEntityByPk(comments, id) as Comment | undefined;
        },
        useUserById(id: ID): User | undefined {
            const { users } = useOIMCollectionsContext();
            return useSelectEntityByPk(users, id) as User | undefined;
        },
        useActiveDeckId(): ID | null {
            const { appState } = useOIMCollectionsContext();
            const state = useSelectEntityByPk(appState, 'app') as AppState | undefined;
            return state?.activeDeckId ?? null;
        },
        useCardIdsByDeckId(deckId: ID): ID[] {
            const { cards } = useOIMCollectionsContext();
            return useSelectPksByIndexKey(cards.indexes.byDeck, deckId) as ID[];
        },
        useCommentIdsByCardId(cardId: ID): ID[] {
            const { comments } = useOIMCollectionsContext();
            return useSelectPksByIndexKey(comments.indexes.byCard, cardId) as ID[];
        },
        useAssigneeIdsByCardId(cardId: ID): ID[] {
            const { users } = useOIMCollectionsContext();
            return useSelectPksByIndexKey(users.indexes.assignedCardId, cardId) as ID[];
        },
        useTagIdsByCardId(cardId: ID): ID[] {
            const { cardTags } = useOIMCollectionsContext();
            return useSelectPksByIndexKey(cardTags.indexes.byCard, cardId) as ID[];
        },
    };
}

const actions = (store: CnstraOimdbStore) => ({
    setActiveDeck(id: ID) {
        store.cns.stimulate(store.collaterals.activeDeck.createSignal(id));
    },
    updateCard(cardId: ID, changes: Partial<Card>) {
        store.cns.stimulate(store.collaterals.updateCard.createSignal({ id: cardId, changes }));
    },
    updateCommentText(commentId: ID, text: string) {
        store.cns.stimulate(store.collaterals.updateComment.createSignal({ id: commentId, text }));
    },
    setCommentEditing(commentId: ID, isEditing: boolean) {
        store.cns.stimulate(
            store.collaterals.editComment.createSignal({ id: commentId, editing: isEditing }),
        );
    },
    renameUser(userId: ID, name: string) {
        store.cns.stimulate(store.collaterals.renameUser.createSignal({ id: userId, name }));
    },
    bulkToggleTagOnCards(cardIds: ID[], tagId: ID) {
        store.cns.stimulate(store.collaterals.bulkTag.createSignal({ cardIds, tagId }));
    },
    backgroundChurnStart() {
        store.cns.stimulate(store.collaterals.churn.createSignal(true));
    },
    backgroundChurnStop() {
        store.cns.stimulate(store.collaterals.churn.createSignal(false));
    },
});

function createCnstraOimdbAdapter(): StoreAdapter {
    return {
        name: 'Cnstra + Oimdb (ids-based)',
        createStore: createCnstraOimdbStore,
        Provider: CnstraOimdbProvider,
        get hooks() {
            return createHooks();
        },
        bindActions(storeHandle: StoreHandle) {
            return actions(storeHandle as CnstraOimdbStore);
        },
    };
}

export const cnstraOimdbAdapter = createCnstraOimdbAdapter();

export default cnstraOimdbAdapter;
