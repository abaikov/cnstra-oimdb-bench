import type React from 'react';
import type { RootState, ID, Deck, Card, Comment, User, NormalizedEntities, CardAssignment, CardTag } from './types';

export type StoreHandle = unknown;

export type ViewModelHooks = {
  useDeckIds(): ID[];
  useDeckById(id: ID): Deck | undefined;
  useCardsByDeckId(deckId: ID): Card[];
  useCommentsByCardId(cardId: ID): Comment[];
  useUserById(id: ID): User | undefined;
  useAssigneesByCardId(cardId: ID): User[];
  useTagsByCardId(cardId: ID): string[];
  useActiveDeckId(): ID | null;
  useSearchQuery(): string;
};

export type Actions = {
  setActiveDeck(id: ID): void;
  setSearchQuery(q: string): void;
  updateCommentText(commentId: ID, text: string): void;
  renameUser(userId: ID, name: string): void;
  bulkToggleTagOnCards(cardIds: ID[], tagId: ID): void;
  backgroundChurnStart(): void;
  backgroundChurnStop(): void;
};

export type StoreAdapter = {
    name: string;
    createStore(initial: RootState): StoreHandle;
    Provider: (props: { store: StoreHandle; children?: any }) => any;
    hooks: ViewModelHooks;
    bindActions(store: StoreHandle): Actions;
    wrapComponent?: (Component: React.ComponentType<any>) => React.ComponentType<any>;
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

export type { RootState, ID, Deck, Card, Comment, User, NormalizedEntities, CardAssignment, CardTag };
