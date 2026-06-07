import * as React from 'react';
import { createContext, useContext } from 'react';
import { CNSProvider } from '@cnstra/react';
import { CNS, neuron, collateral } from '@cnstra/core';
import {
    OIMEventQueue,
    OIMReactiveCollection,
    OIMReactiveCollectionIndexManualArrayBased,
    createInPlaceEntityUpdater,
} from '@oimdb/core';
import {
    OIMCollectionsProvider,
    useSelectEntityByPk,
    useSelectPksByIndexKeyArrayBased,
    useSelectEntityByPkSignal,
    useSelectPksByIndexKeyArrayBasedSignal,
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

function createCnstraOimdbStore(initialData: RootState, inPlace = false) {
    const queue = new OIMEventQueue({});

    // In-place mode mutates the stored entity object instead of producing a new
    // one on each upsert (no allocation). Consumed via the *Signal hooks, which
    // re-render on key subscription rather than reference change.
    const upd = <T extends object>() =>
        inPlace ? createInPlaceEntityUpdater<T>() : undefined;

    // Collections (entities only — indexes live next to them in oimdb v2)
    const collections = {
        decks: new OIMReactiveCollection<Deck, string>(queue, {
            selectPk: (deck) => deck.id,
            updateEntity: upd<Deck>(),
        }),
        cards: new OIMReactiveCollection<Card, string>(queue, {
            selectPk: (card) => card.id,
            updateEntity: upd<Card>(),
        }),
        comments: new OIMReactiveCollection<Comment, string>(queue, {
            selectPk: (comment) => comment.id,
            updateEntity: upd<Comment>(),
        }),
        users: new OIMReactiveCollection<User, string>(queue, {
            selectPk: (user) => user.id,
            updateEntity: upd<User>(),
        }),
        tags: new OIMReactiveCollection<Tag, string>(queue, {
            selectPk: (tag) => tag.id,
            updateEntity: upd<Tag>(),
        }),
        cardAssignments: new OIMReactiveCollection<CardAssignment, string>(queue, {
            selectPk: (assignment) => assignment.id,
            updateEntity: upd<CardAssignment>(),
        }),
        cardTags: new OIMReactiveCollection<CardTag, string>(queue, {
            selectPk: (cardTag) => cardTag.id,
            updateEntity: upd<CardTag>(),
        }),
        appState: new OIMReactiveCollection<AppState, string>(queue, {
            selectPk: (state) => state.id,
            updateEntity: upd<AppState>(),
        }),
    };

    // Collection-bound reactive indexes (array-based, manual). Each index resolves
    // its PKs through the collection it indexes.
    const indexes = {
        decksAll: new OIMReactiveCollectionIndexManualArrayBased<string, string, Deck>(queue, {
            collection: collections.decks,
        }),
        cardsByDeck: new OIMReactiveCollectionIndexManualArrayBased<string, string, Card>(queue, {
            collection: collections.cards,
        }),
        allCards: new OIMReactiveCollectionIndexManualArrayBased<string, string, Card>(queue, {
            collection: collections.cards,
        }),
        commentsByCard: new OIMReactiveCollectionIndexManualArrayBased<string, string, Comment>(
            queue,
            { collection: collections.comments },
        ),
        assignmentsByCard: new OIMReactiveCollectionIndexManualArrayBased<
            string,
            string,
            CardAssignment
        >(queue, { collection: collections.cardAssignments }),
        // userIds grouped by cardId — resolves through the users collection
        usersByAssignedCard: new OIMReactiveCollectionIndexManualArrayBased<string, string, User>(
            queue,
            { collection: collections.users },
        ),
        // cardTag ids grouped by cardId — resolves through the cardTags collection
        tagsByCard: new OIMReactiveCollectionIndexManualArrayBased<string, string, CardTag>(queue, {
            collection: collections.cardTags,
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

    indexes.decksAll.addPks(
        'all',
        Object.values(initialData.entities.decks).map((d) => d.id),
    );
    const cardsArray = Object.values(initialData.entities.cards);
    indexes.allCards.addPks(
        'all',
        cardsArray.map((c) => c.id),
    );
    groupByKey(
        cardsArray,
        (c) => c.deckId,
        (c) => c.id,
    ).forEach((ids, k) => indexes.cardsByDeck.addPks(k, ids));
    groupByKey(
        Object.values(initialData.entities.comments),
        (c) => c.cardId,
        (c) => c.id,
    ).forEach((ids, k) => indexes.commentsByCard.addPks(k, ids));
    const assignmentsArray = Object.values(initialData.entities.cardAssignments);
    groupByKey(
        assignmentsArray,
        (a) => a.cardId,
        (a) => a.id,
    ).forEach((ids, k) => indexes.assignmentsByCard.addPks(k, ids));
    // Precompute users by assigned card for fast lookup in hooks
    groupByKey(
        assignmentsArray,
        (a) => a.cardId,
        (a) => a.userId,
    ).forEach((ids, k) => indexes.usersByAssignedCard.addPks(k, ids));
    groupByKey(
        Object.values(initialData.entities.cardTags),
        (ct) => ct.cardId,
        (ct) => ct.id,
    ).forEach((ids, k) => indexes.tagsByCard.addPks(k, ids));
    queue.flush();

    const collaterals = {
        activeDeck: collateral<string>(),
        updateCard: collateral<{ id: ID; changes: Partial<Card> }>(),
        updateComment: collateral<{ id: ID; text: string }>(),
        editComment: collateral<{ id: ID; editing: boolean }>(),
        renameUser: collateral<{ id: ID; name: string }>(),
        bulkTag: collateral<{ cardIds: ID[]; tagId: ID }>(),
        churn: collateral<boolean>(),
        setCardVisibility: collateral<{ cardId: ID; isVisible: boolean }>(),
    };

    const cns = new CNS([
        neuron({}).dendrite({
            collateral: collaterals.activeDeck,
            response: (payload: string) => {
                const state = collections.appState.getOneByPk('app');
                if (state?.activeDeckId === payload) return;
                collections.appState.upsertOne({ id: 'app', activeDeckId: payload });
                queue.flush();
            },
        }),
        neuron({})
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
        neuron({}).dendrite({
            collateral: collaterals.renameUser,
            response: (payload: { id: ID; name: string }) => {
                const existing = collections.users.getOneByPk(payload.id) as User | undefined;
                if (existing?.name === payload.name) return;
                collections.users.upsertOne({ id: payload.id, name: payload.name } as User);
                queue.flush();
            },
        }),
        neuron({}).dendrite({
            collateral: collaterals.bulkTag,
            response: (payload: { cardIds: ID[]; tagId: ID }) => {
                // Get current count from PKs (more efficient than getAll())
                const allPks = collections.cardTags.getAllPks();
                let counter = allPks.length;
                for (let i = 0; i < payload.cardIds.length; i++) {
                    const cardId = payload.cardIds[i];
                    const pks = Array.from(indexes.tagsByCard.getPksByKey(cardId) ?? []);
                    let existingId: string | undefined;
                    // Optimize: check tagId directly from PKs using index instead of fetching entities
                    for (let j = 0; j < pks.length; j++) {
                        const pk = pks[j];
                        const ct = collections.cardTags.getOneByPk(pk as string) as
                            | CardTag
                            | undefined;
                        if (ct?.tagId === payload.tagId) {
                            existingId = ct.id;
                            break;
                        }
                    }
                    if (existingId) {
                        indexes.tagsByCard.removePks(cardId, [existingId]);
                        collections.cardTags.removeOneByPk(existingId);
                    } else {
                        const newCardTag: CardTag = {
                            id: `cardtag_${counter++}`,
                            cardId,
                            tagId: payload.tagId,
                            createdAt: Date.now(),
                        };
                        collections.cardTags.upsertOne(newCardTag);
                        indexes.tagsByCard.addPks(cardId, [newCardTag.id]);
                    }
                }
                queue.flush();
            },
        }),
        neuron({})
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
                        const pkArray = indexes.allCards.getPksByKey('all');
                        let count = 0;
                        for (let i = 0; i < pkArray.length; i++) {
                            if (count >= 100) break;
                            count++;
                            const id = pkArray[i];
                            collections.cards.upsertOne({
                                id,
                                updatedAt: Date.now(),
                            } as Card);
                        }
                        queue.flush();
                    }
                },
            })
            .dendrite({
                collateral: collaterals.setCardVisibility,
                response: (payload: { cardId: ID; isVisible: boolean }) => {
                    const existing = collections.cards.getOneByPk(payload.cardId) as
                        | Card
                        | undefined;
                    if (!existing) return;
                    if (existing.isVisible === payload.isVisible) return;
                    collections.cards.upsertOne({
                        id: existing.id,
                        isVisible: payload.isVisible,
                    } as Card);
                    queue.flush();
                },
            }),
    ]);

    return {
        cns,
        collections,
        indexes,
        decksOrder: initialData.decksOrder,
        queue,
        collaterals,
    };
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
                <OIMCollectionsProvider collections={s.collections}>
                    {children}
                </OIMCollectionsProvider>
            </CNSProvider>
        </CnstraStoreContext.Provider>
    );
};

function useStore(): CnstraOimdbStore {
    return useContext(CnstraStoreContext)!;
}

function createHooks(): ViewModelHooksIdsBased {
    return {
        useDeckIds(): ID[] {
            const { indexes } = useStore();
            return useSelectPksByIndexKeyArrayBased(indexes.decksAll, 'all') as ID[];
        },
        useDeckById(id: ID): Deck | undefined {
            const { collections } = useStore();
            return useSelectEntityByPk(collections.decks, id) as Deck | undefined;
        },
        useCardById(id: ID): Card | undefined {
            const { collections } = useStore();
            return useSelectEntityByPk(collections.cards, id) as Card | undefined;
        },
        useCommentById(id: ID): Comment | undefined {
            const { collections } = useStore();
            return useSelectEntityByPk(collections.comments, id) as Comment | undefined;
        },
        useUserById(id: ID): User | undefined {
            const { collections } = useStore();
            return useSelectEntityByPk(collections.users, id) as User | undefined;
        },
        useActiveDeckId(): ID | null {
            const { collections } = useStore();
            const state = useSelectEntityByPk(collections.appState, 'app') as AppState | undefined;
            return state?.activeDeckId ?? null;
        },
        useCardIdsByDeckId(deckId: ID): ID[] {
            const { indexes } = useStore();
            return useSelectPksByIndexKeyArrayBased(indexes.cardsByDeck, deckId) as ID[];
        },
        useCommentIdsByCardId(cardId: ID): ID[] {
            const { indexes } = useStore();
            return useSelectPksByIndexKeyArrayBased(indexes.commentsByCard, cardId) as ID[];
        },
        useAssigneeIdsByCardId(cardId: ID): ID[] {
            const { indexes } = useStore();
            return useSelectPksByIndexKeyArrayBased(indexes.usersByAssignedCard, cardId) as ID[];
        },
        useTagIdsByCardId(cardId: ID): ID[] {
            const { indexes } = useStore();
            return useSelectPksByIndexKeyArrayBased(indexes.tagsByCard, cardId) as ID[];
        },
    };
}

// "Signal" hooks: identical reads, but via @oimdb/react's *Signal hooks, which
// re-render on key subscription (not on reference change) and read the current
// value. This is what pairs with the in-place entity updater (mutated entities
// keep the same reference, so a ref-based hook wouldn't re-render).
function createSignalHooks(): ViewModelHooksIdsBased {
    return {
        useDeckIds(): ID[] {
            const { indexes } = useStore();
            return useSelectPksByIndexKeyArrayBasedSignal(indexes.decksAll, 'all') as ID[];
        },
        useDeckById(id: ID): Deck | undefined {
            const { collections } = useStore();
            return useSelectEntityByPkSignal(collections.decks, id) as Deck | undefined;
        },
        useCardById(id: ID): Card | undefined {
            const { collections } = useStore();
            return useSelectEntityByPkSignal(collections.cards, id) as Card | undefined;
        },
        useCommentById(id: ID): Comment | undefined {
            const { collections } = useStore();
            return useSelectEntityByPkSignal(collections.comments, id) as Comment | undefined;
        },
        useUserById(id: ID): User | undefined {
            const { collections } = useStore();
            return useSelectEntityByPkSignal(collections.users, id) as User | undefined;
        },
        useActiveDeckId(): ID | null {
            const { collections } = useStore();
            const state = useSelectEntityByPkSignal(collections.appState, 'app') as
                | AppState
                | undefined;
            return state?.activeDeckId ?? null;
        },
        useCardIdsByDeckId(deckId: ID): ID[] {
            const { indexes } = useStore();
            return useSelectPksByIndexKeyArrayBasedSignal(indexes.cardsByDeck, deckId) as ID[];
        },
        useCommentIdsByCardId(cardId: ID): ID[] {
            const { indexes } = useStore();
            return useSelectPksByIndexKeyArrayBasedSignal(indexes.commentsByCard, cardId) as ID[];
        },
        useAssigneeIdsByCardId(cardId: ID): ID[] {
            const { indexes } = useStore();
            return useSelectPksByIndexKeyArrayBasedSignal(
                indexes.usersByAssignedCard,
                cardId,
            ) as ID[];
        },
        useTagIdsByCardId(cardId: ID): ID[] {
            const { indexes } = useStore();
            return useSelectPksByIndexKeyArrayBasedSignal(indexes.tagsByCard, cardId) as ID[];
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
    setCardVisibility(cardId: ID, isVisible: boolean) {
        store.cns.stimulate(
            store.collaterals.setCardVisibility.createSignal({ cardId, isVisible }),
        );
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

// In-place variant: collections use the in-place entity updater (mutate the
// stored object, no allocation per upsert) consumed via the *Signal hooks.
// For A/B-ing the in-place path against the default merge path.
function createCnstraOimdbInPlaceAdapter(): StoreAdapter {
    return {
        name: 'Cnstra + Oimdb (in-place)',
        createStore: (initial) => createCnstraOimdbStore(initial, true),
        Provider: CnstraOimdbProvider,
        get hooks() {
            return createSignalHooks();
        },
        bindActions(storeHandle: StoreHandle) {
            return actions(storeHandle as CnstraOimdbStore);
        },
    };
}

export const cnstraOimdbInPlaceAdapter = createCnstraOimdbInPlaceAdapter();

// Pure OIMDB, NO cnstra: actions write straight to collections (no cns.stimulate
// orchestration). Same store + same useSyncExternalStore hooks. Used to isolate
// the cnstra-orchestration cost from the React-binding cost.
const pureActions = (store: CnstraOimdbStore) => {
    const { collections, indexes, queue } = store;
    return {
        setActiveDeck(id: ID) {
            collections.appState.upsertOne({ id: 'app', activeDeckId: id });
            queue.flush();
        },
        updateCard(cardId: ID, changes: Partial<Card>) {
            if (!collections.cards.getOneByPk(cardId)) return;
            collections.cards.upsertOne({ id: cardId, ...changes } as Card);
            queue.flush();
        },
        updateCommentText(commentId: ID, text: string) {
            const e = collections.comments.getOneByPk(commentId) as Comment | undefined;
            if (e?.text === text) return;
            collections.comments.upsertOne({ id: commentId, text } as Comment);
            queue.flush();
        },
        setCommentEditing(commentId: ID, isEditing: boolean) {
            const e = collections.comments.getOneByPk(commentId) as Comment | undefined;
            if (!!e?.isEditing === isEditing) return;
            collections.comments.upsertOne({ id: commentId, isEditing } as Comment);
            queue.flush();
        },
        renameUser(userId: ID, name: string) {
            const e = collections.users.getOneByPk(userId) as User | undefined;
            if (e?.name === name) return;
            collections.users.upsertOne({ id: userId, name } as User);
            queue.flush();
        },
        bulkToggleTagOnCards(cardIds: ID[], tagId: ID) {
            let counter = collections.cardTags.getAllPks().length;
            for (const cardId of cardIds) {
                const pks = Array.from(indexes.tagsByCard.getPksByKey(cardId) ?? []);
                let existingId: string | undefined;
                for (const pk of pks) {
                    const ct = collections.cardTags.getOneByPk(pk as string) as CardTag | undefined;
                    if (ct?.tagId === tagId) {
                        existingId = ct.id;
                        break;
                    }
                }
                if (existingId) {
                    indexes.tagsByCard.removePks(cardId, [existingId]);
                    collections.cardTags.removeOneByPk(existingId);
                } else {
                    const nt: CardTag = { id: `cardtag_${counter++}`, cardId, tagId, createdAt: Date.now() };
                    collections.cardTags.upsertOne(nt);
                    indexes.tagsByCard.addPks(cardId, [nt.id]);
                }
            }
            queue.flush();
        },
        backgroundChurnStart() {
            const pkArray = indexes.allCards.getPksByKey('all');
            for (let i = 0; i < pkArray.length && i < 100; i++) {
                collections.cards.upsertOne({ id: pkArray[i], updatedAt: Date.now() } as Card);
            }
            queue.flush();
        },
        backgroundChurnStop() {},
        setCardVisibility(cardId: ID, isVisible: boolean) {
            const e = collections.cards.getOneByPk(cardId) as Card | undefined;
            if (!e || e.isVisible === isVisible) return;
            collections.cards.upsertOne({ id: cardId, isVisible } as Card);
            queue.flush();
        },
    };
};

function createOimdbPureAdapter(): StoreAdapter {
    return {
        name: 'Oimdb (no cnstra)',
        createStore: createCnstraOimdbStore,
        Provider: CnstraOimdbProvider,
        get hooks() {
            return createHooks();
        },
        bindActions(storeHandle: StoreHandle) {
            return pureActions(storeHandle as CnstraOimdbStore);
        },
    };
}

export const oimdbPureAdapter = createOimdbPureAdapter();

export default cnstraOimdbAdapter;
