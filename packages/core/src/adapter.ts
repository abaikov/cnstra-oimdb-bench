import type React from 'react';
import type {
    RootState,
    ID,
    Deck,
    Card,
    Comment,
    User,
    Tag,
    NormalizedEntities,
    CardAssignment,
    CardTag,
} from './types';

export type StoreHandle = unknown;

export type ViewModelHooksIdsBased = {
    useDeckIds(): ID[];
    useDeckById(id: ID): Deck | undefined;
    useCardById(id: ID): Card | undefined;
    useCommentById(id: ID): Comment | undefined;
    useUserById(id: ID): User | undefined;
    // Methods returning ID arrays
    useCardIdsByDeckId(deckId: ID): ID[];
    useCommentIdsByCardId(cardId: ID): ID[];
    useAssigneeIdsByCardId(cardId: ID): ID[];
    useTagIdsByCardId(cardId: ID): ID[];
    useActiveDeckId(): ID | null;
};

export type ViewModelHooks = ViewModelHooksIdsBased;

export type Actions = {
    setActiveDeck(id: ID): void;
    updateCard(cardId: ID, changes: Partial<Card>): void;
    updateCommentText(commentId: ID, text: string): void;
    setCommentEditing(commentId: ID, isEditing: boolean): void;
    renameUser(userId: ID, name: string): void;
    bulkToggleTagOnCards(cardIds: ID[], tagId: ID): void;
    backgroundChurnStart(): void;
    backgroundChurnStop(): void;
    setCardVisibility(cardId: ID, isVisible: boolean): void;
};

export type StoreAdapter = {
    name: string;
    createStore(initial: RootState): StoreHandle;
    Provider: (props: { store: StoreHandle; children?: any }) => any;
    hooks: ViewModelHooks;
    bindActions(store: StoreHandle): Actions;
    /**
     * Optional component HOC applied to the entity-reading leaf components
     * (CardItem / CommentItem / DeckItem). Lets a library use its idiomatic
     * component-level reactivity instead of the uniform hooks — e.g. MobX wraps
     * them in `observer()` so the component reads observables directly in JSX
     * (no snapshot). When omitted the harness uses plain React.memo (no-op for
     * the adapter). Must be a stable function reference.
     */
    observer?: <P extends object>(c: React.ComponentType<P>) => React.ComponentType<P>;
};

export type Dataset = RootState;

export type WorkloadScenario =
    | 'cold-start'
    | 'scroll'
    | 'filter-typing'
    | 'inline-editing'
    | 'background-churn'
    | 'fan-out-update'
    | 'bulk-update';

export type WorkloadDriver = {
    run(scenario: WorkloadScenario, opts?: Record<string, unknown>): Promise<void>;
    stop(): void;
};

export type MetricsSample = {
    ttiMs?: number;
    fps?: number;
    renderCounts?: Record<string, number>;
    latencyP50?: number;
    latencyP95?: number;
    memoryMB?: number;
    updateAmplification?: number;
};

export type MetricsSink = {
    record(sample: Partial<MetricsSample> & { label?: string }): void;
};

export type MetricsHarness = {
    marks: {
        mark(name: string): void;
        measure(name: string, start: string, end?: string): number | null;
    };
    fps: {
        start(): void;
        stop(): number; // returns avg fps
    };
};

export type {
    RootState,
    ID,
    Deck,
    Card,
    Comment,
    User,
    Tag,
    NormalizedEntities,
    CardAssignment,
    CardTag,
};
