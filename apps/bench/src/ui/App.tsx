import React, { useMemo, useState, useContext, createContext, useCallback, useEffect } from 'react';
import {
    generateDataset,
    createRenderCounter,
    testAllAdapters,
    type AdapterTestResult,
    type BenchmarkResult,
} from '@bench/core';
import type { StoreAdapter, RootState, ID, Card, Comment } from '@bench/core';
import { BenchmarkResults } from './BenchmarkResults';
import { DebugRenders } from './DebugRenders';
import * as styles from './App.styles';
import { cnstraOimdbAdapter } from '@bench/adapter-cnstra-oimdb';
import { reduxAdapter } from '@bench/adapter-redux';
import { effectorAdapter } from '@bench/adapter-effector';
import { zustandAdapter } from '@bench/adapter-zustand';
import { createBenchmarkRunner, calculateMedian } from './benchmarkRunner';

const AdapterContext = createContext<{ adapter: StoreAdapter; actions: any } | null>(null);

// Intersection Observer Context for tracking card visibility
type ObserverCallbacks = {
    observe: (element: HTMLElement, cardId: string) => void;
    unobserve: (element: HTMLElement) => void;
};
const IntersectionObserverContext = createContext<ObserverCallbacks | null>(null);

// All components use ids-based mode

// Create adapters - only ids-based versions
const adapters: StoreAdapter[] = [
    cnstraOimdbAdapter,
    effectorAdapter,
    reduxAdapter,
    zustandAdapter,
].filter(Boolean) as StoreAdapter[];

// Global render counter for non-benchmark renders (UI components)
const globalRenderCounter = createRenderCounter();
const isDev = import.meta.env.DEV;
const debugLog = isDev ? console.log.bind(console) : () => {};
const debugWarn = isDev ? console.warn.bind(console) : () => {};

// Context for benchmark-specific render counter
const RenderCounterContext = createContext<ReturnType<typeof createRenderCounter> | null>(null);

// Create benchmark runner instance with debug logging
const benchmarkRunner = createBenchmarkRunner({
    debugWarn,
    runs: 10,
    warmupRuns: 1,
});

/**
 * Convert benchmark result to standardized format for expert requirements
 */
function convertToStandardizedFormat(
    result: BenchmarkResult,
    manager: string,
    scenario: string,
): any {
    // Get environment info
    const chromeVersion = (navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] || 'unknown') + '.x';
    const os = navigator.platform || 'unknown';
    const cpu = (navigator as any).hardwareConcurrency
        ? `${(navigator as any).hardwareConcurrency} cores`
        : 'unknown';

    // Calculate render stats
    const allRenderCounts = result.runs.map((r) => r.renderCount);
    const affectedComponentsMedian = calculateMedian(allRenderCounts);

    // Get bundle size (would need to be calculated separately)
    // For now, placeholder - would need to analyze actual bundle
    const bundleKbGzip = 0; // TODO: Calculate from build artifacts

    return {
        manager: manager.toLowerCase().replace(/\s+/g, '-'),
        scenario: scenario,
        env: {
            chrome: chromeVersion,
            os: os,
            cpu: cpu,
        },
        latency_ms: {
            p50: result.average.latency.p50,
            p95: result.average.latency.p95,
            p99: result.average.latency.p99,
        },
        throughput_updates_per_s: 0, // TODO: Calculate from executionTime
        js_time_ms: result.average.executionTime,
        layout_paint_ms: 0, // TODO: Use PerformanceObserver
        renders: {
            total: result.average.renderCount,
            affectedComponentsMedian: affectedComponentsMedian,
        },
        heap_mb: {
            idle: 0, // TODO: Measure before test
            peak: result.average.memoryUsage,
            afterGC: 0, // TODO: Force GC and measure
        },
        gc: {
            minor: 0, // TODO: Track via PerformanceObserver
            major: 0, // TODO: Track via PerformanceObserver
            pause_ms_total: 0, // TODO: Track via PerformanceObserver
        },
        bundle_kb_gzip: bundleKbGzip,
        timestamp: result.timestamp,
        raw: result, // Include raw data for reference
    };
}

function useCounterKey(name: string) {
    // Check for benchmark-specific render counter (set during benchmark execution)
    // Search for the most recent benchmark counter key
    const windowAny = window as any;
    let benchmarkCounter: ReturnType<typeof createRenderCounter> | null = null;

    // Find the most recent benchmark counter (highest timestamp)
    const counterKeys = Object.keys(windowAny).filter((key) =>
        key.startsWith('__benchmarkRenderCounter_'),
    );
    if (counterKeys.length > 0) {
        // Sort by timestamp (extracted from key) to get the most recent
        counterKeys.sort((a, b) => {
            const timeA = parseInt(a.split('_')[2] || '0', 10);
            const timeB = parseInt(b.split('_')[2] || '0', 10);
            return timeB - timeA; // Most recent first
        });
        benchmarkCounter = windowAny[counterKeys[0]] || null;
    }

    // Also check React context as fallback
    let contextCounter: ReturnType<typeof createRenderCounter> | null = null;
    try {
        contextCounter = useContext(RenderCounterContext);
    } catch {
        // Context might not be available if called outside React component (shouldn't happen)
    }

    // Use benchmark counter if available (during benchmarks), otherwise global counter
    const counter = benchmarkCounter || contextCounter || globalRenderCounter;
    counter.increment(name);
}

// Define component implementations first
// CardItem for ids-based mode - receives cardId and uses selectors
const CardItemBase: React.FC<{ cardId: string }> = ({ cardId }) => {
    useCounterKey('CardItem');
    const ctx = useContext(AdapterContext);
    if (!ctx) throw new Error('Adapter context not found');
    const observerCtx = useContext(IntersectionObserverContext);

    const card = ctx.adapter.hooks.useCardById(cardId) as Card | undefined;
    const commentIds = ctx.adapter.hooks.useCommentIdsByCardId(cardId) as ID[];
    const isVisible = ctx.adapter.hooks.useCardVisibility(cardId);

    const cardRef = React.useRef<HTMLDivElement>(null);

    // Register/unregister with Intersection Observer
    React.useEffect(() => {
        if (!observerCtx || !cardRef.current) return;
        const element = cardRef.current;
        observerCtx.observe(element, cardId);
        return () => {
            observerCtx.unobserve(element);
        };
    }, [observerCtx, cardId]);

    if (!card) return <div>Loading card...</div>;
    // Read updatedAt to ensure UI depends on the field mutated in bulk updates
    const lastUpdatedAt = card.updatedAt;

    return (
        <div
            ref={cardRef}
            data-card-id={cardId}
            style={styles.cardItemStyles.container}
            onMouseEnter={styles.hoverHandlers.cardItem.onEnter}
            onMouseLeave={styles.hoverHandlers.cardItem.onLeave}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={styles.cardItemStyles.title}>{card.title}</div>
                {isVisible && (
                    <span
                        style={{
                            fontSize: '16px',
                            marginLeft: '8px',
                            opacity: 0.7,
                        }}
                        title="Card is visible on screen"
                    >
                        👁️
                    </span>
                )}
            </div>
            <div style={styles.cardItemStyles.description}>{card.description}</div>
            <div style={styles.cardItemStyles.commentsHeader}>
                <div style={styles.cardItemStyles.commentsTitle}>
                    Comments ({commentIds.length})
                </div>
                <CommentsList commentIds={commentIds} />
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: '#6b7280' }}>
                Updated: {lastUpdatedAt}
            </div>
        </div>
    );
};

// CommentsList for ids-based mode - receives IDs array
const CommentsListBase: React.FC<{ commentIds: ID[] }> = ({ commentIds }) => {
    const ctx = useContext(AdapterContext);
    if (!ctx) throw new Error('Adapter context not found');

    return (
        <div style={styles.commentsListStyles.container}>
            {commentIds.map((commentId) => (
                <CommentItem key={commentId} commentId={commentId} />
            ))}
        </div>
    );
};

const CommentItem: React.FC<{ commentId: string }> = ({ commentId }) => {
    useCounterKey('CommentItem');
    const ctx = useContext(AdapterContext);
    if (!ctx) throw new Error('Adapter context not found');

    const comment = ctx.adapter.hooks.useCommentById(commentId) as Comment | undefined;
    const user = ctx.adapter.hooks.useUserById(comment?.authorId || '');

    if (!comment) return null;

    const isEditing = comment.isEditing || false;

    const handleEditStart = useCallback(() => {
        ctx.actions.setCommentEditing(commentId, true);
    }, [ctx.actions, commentId]);

    const handleEditSave = useCallback(() => {
        ctx.actions.setCommentEditing(commentId, false);
    }, [ctx.actions, commentId]);

    const handleEditCancel = useCallback(() => {
        ctx.actions.setCommentEditing(commentId, false);
    }, [ctx.actions, commentId]);

    const handleTextChange = useCallback(
        (text: string) => {
            ctx.actions.updateCommentText(commentId, text);
        },
        [ctx.actions, commentId],
    );

    const handleTextareaChange = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            handleTextChange(e.target.value);
        },
        [handleTextChange],
    );

    return (
        <div
            style={styles.commentItemStyles.container}
            onMouseEnter={styles.hoverHandlers.commentItem.onEnter}
            onMouseLeave={styles.hoverHandlers.commentItem.onLeave}
        >
            <div style={styles.commentItemStyles.header}>
                <div style={styles.commentItemStyles.author}>👤 {user?.name || 'Unknown User'}</div>
                {!isEditing && (
                    <button
                        onClick={handleEditStart}
                        style={styles.commentItemStyles.editButton}
                        onMouseEnter={styles.hoverHandlers.editButton.onEnter}
                        onMouseLeave={styles.hoverHandlers.editButton.onLeave}
                    >
                        ✏️ Edit
                    </button>
                )}
            </div>

            {isEditing ? (
                <div>
                    <textarea
                        value={comment.text}
                        onChange={handleTextareaChange}
                        style={styles.commentItemStyles.textarea}
                    />
                    <div style={styles.commentItemStyles.buttonGroup}>
                        <button
                            onClick={handleEditSave}
                            style={styles.commentItemStyles.saveButton}
                        >
                            ✓ Save
                        </button>
                        <button
                            onClick={handleEditCancel}
                            style={styles.commentItemStyles.cancelButton}
                        >
                            ✕ Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <div style={styles.commentItemStyles.text}>{comment.text}</div>
            )}
        </div>
    );
};

// Wrapper components for ids-based mode
const CardItem: React.FC<{ cardId: string }> = React.memo(({ cardId }) => {
    const ctx = useContext(AdapterContext);
    if (!ctx) throw new Error('Adapter context not found');

    return <CardItemBase cardId={cardId} />;
});

function shallowEqualIds(a: ID[] | undefined, b: ID[] | undefined): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

const CommentsList: React.FC<{ commentIds: ID[] }> = React.memo(
    ({ commentIds }) => {
        return <CommentsListBase commentIds={commentIds} />;
    },
    (prev, next) => shallowEqualIds(prev.commentIds, next.commentIds),
);

// Info Banner Component
const InfoBanner: React.FC = () => {
    const [isCollapsed, setIsCollapsed] = useState(true);

    return (
        <div
            style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: styles.colors.white,
                padding: isCollapsed ? '12px 24px' : '20px 24px',
                borderBottom: `2px solid rgba(255,255,255,0.2)`,
                transition: 'all 0.3s ease',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                }}
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 20 }}>💡</span>
                    <h3
                        style={{
                            margin: 0,
                            fontSize: isCollapsed ? '16px' : '18px',
                            fontWeight: 700,
                            transition: 'font-size 0.3s ease',
                        }}
                    >
                        How to Use the Benchmark
                    </h3>
                </div>
                <span
                    style={{
                        fontSize: 20,
                        transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)',
                        transition: 'transform 0.3s ease',
                    }}
                >
                    ▲
                </span>
            </div>
            {!isCollapsed && (
                <div
                    style={{
                        marginTop: 16,
                        fontSize: 14,
                        lineHeight: 1.7,
                        opacity: 0.95,
                        maxHeight: isCollapsed ? 0 : '500px',
                        overflow: 'hidden',
                        transition: 'all 0.3s ease',
                    }}
                >
                    <div style={{ marginBottom: 16 }}>
                        <strong style={{ fontSize: 15, display: 'block', marginBottom: 8 }}>
                            🚀 What You Can Do:
                        </strong>
                        <ul style={{ margin: '8px 0', paddingLeft: 24, listStyle: 'disc' }}>
                            <li style={{ marginBottom: 6 }}>
                                Select a state manager from the list and run performance tests
                            </li>
                            <li style={{ marginBottom: 6 }}>
                                Click <strong>"🌍 All Adapters"</strong> to automatically test all
                                state managers
                            </li>
                            <li style={{ marginBottom: 6 }}>
                                Or run individual tests: <strong>"🔄 Updates"</strong>,{' '}
                                <strong>"✏️ Edit"</strong>, <strong>"📦 Bulk"</strong>
                            </li>
                            <li style={{ marginBottom: 6 }}>
                                View results in the <strong>"📊 Results"</strong> section
                            </li>
                        </ul>
                    </div>
                    <div
                        style={{
                            background: 'rgba(255,255,255,0.15)',
                            padding: '14px 18px',
                            borderRadius: '8px',
                            border: '1px solid rgba(255,255,255,0.25)',
                            marginTop: 16,
                        }}
                    >
                        <strong style={{ fontSize: 15, display: 'block', marginBottom: 8 }}>
                            ✏️ Try It Yourself:
                        </strong>
                        <div style={{ lineHeight: 1.8 }}>
                            Try scrolling through the cards - you'll see an eye icon (👁️) appear
                            when cards become visible on screen. Notice how quickly the icon updates
                            as you scroll: some state managers react instantly while others show
                            noticeable lag. While comment editing is generally smooth,{' '}
                            <strong>scrolling reveals the real reactivity differences</strong>{' '}
                            between state managers - switch between adapters and compare the
                            responsiveness!
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const TEST_COUNT = 10;

const HeatmapOverlay: React.FC = () => {
    useCounterKey('HeatmapOverlay');
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Get the appropriate counter (benchmark counter if test is running, otherwise global)
    const windowAny = window as any;
    const counterKeys = Object.keys(windowAny).filter((key) =>
        key.startsWith('__benchmarkRenderCounter_'),
    );
    let activeCounter = globalRenderCounter;
    if (counterKeys.length > 0) {
        // Use the most recent benchmark counter
        counterKeys.sort((a, b) => {
            const timeA = parseInt(a.split('_')[2] || '0', 10);
            const timeB = parseInt(b.split('_')[2] || '0', 10);
            return timeB - timeA;
        });
        const latestCounter = windowAny[counterKeys[0]];
        if (latestCounter) {
            activeCounter = latestCounter;
        }
    }

    const counts = activeCounter.get();
    const totalRenders = Object.values(counts).reduce((a, b) => a + b, 0);

    return (
        <div style={styles.heatmapOverlayStyles.container}>
            <div
                style={{
                    ...styles.heatmapOverlayStyles.title,
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <span>📊 Render Counter Monitor</span>
                <span style={{ fontSize: '12px', userSelect: 'none' }}>
                    {isCollapsed ? '▶' : '▼'}
                </span>
            </div>
            {!isCollapsed && (
                <>
                    <div style={styles.heatmapOverlayStyles.description}>
                        Tracks component re-renders for performance analysis
                    </div>
                    <div style={styles.heatmapOverlayStyles.totalBox}>
                        <strong style={styles.heatmapOverlayStyles.totalText}>
                            Total: {totalRenders}
                        </strong>
                    </div>
                    <div style={styles.heatmapOverlayStyles.list}>
                        {Object.entries(counts).map(([k, v]) => (
                            <div key={k} style={styles.heatmapOverlayStyles.listItem(v)}>
                                <span style={styles.heatmapOverlayStyles.listItemKey}>{k}:</span>
                                <span style={styles.heatmapOverlayStyles.listItemValue(v)}>
                                    {v}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div style={styles.heatmapOverlayStyles.legend}>
                        <span style={styles.heatmapOverlayStyles.legendRed}>🔴</span> {'>'}20 |
                        <span style={styles.heatmapOverlayStyles.legendOrange}> 🟡</span> {'>'}10 |
                        <span style={styles.heatmapOverlayStyles.legendBlue}> 🔵</span> ≤10
                        <br />
                        <strong>Lower = Better Performance</strong>
                    </div>
                </>
            )}
        </div>
    );
};

export const App: React.FC = () => {
    useCounterKey('App');

    // Generate test dataset - full dataset for fair comparison
    const dataset = useMemo(
        () =>
            generateDataset({
                decks: 50,
                cardsPerDeck: 30,
                minCommentsPerCard: 2,
                maxCommentsPerCard: 2,
                users: 2000,
                tags: 50,
                seed: 42,
            }),
        [],
    );

    // Read adapter from URL params
    const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
    const urlAdapter = urlParams.get('adapter');
    const initialAdapterIndex = useMemo(() => {
        if (urlAdapter) {
            // Try exact match first
            let idx = adapters.findIndex((a) => a.name === urlAdapter);
            if (idx >= 0) return idx;

            // Then try normalized match (removes spaces, dashes, etc.)
            const normalized = urlAdapter.toLowerCase().replace(/[_\s-()]/g, '');
            idx = adapters.findIndex(
                (a) => a.name.toLowerCase().replace(/[_\s-()]/g, '') === normalized,
            );
            if (idx >= 0) return idx;

            // Adapter not found - log error but use first adapter as fallback for development
            console.error(
                `❌ Adapter "${urlAdapter}" not found. Available adapters: ${adapters.map((a) => a.name).join(', ')}. Using first adapter as fallback.`,
            );
            return 0;
        }
        return 0;
    }, [urlAdapter]);

    // Adapter selection - must be before useEffect that uses it
    const [adapterIndex, setAdapterIndex] = useState(initialAdapterIndex);
    const adapter = adapters[adapterIndex];

    // Create store and actions for current adapter
    const store = useMemo(() => adapter.createStore(dataset), [adapter, dataset]);
    const actions = useMemo(() => adapter.bindActions(store), [adapter, store]);

    // Create Intersection Observer for tracking card visibility
    // Use a ref to track if benchmark is running - this prevents observer from interfering with benchmarks
    const isBenchmarkRunningRef = React.useRef(false);

    const observerCallbacks = useMemo(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                // Skip updates during benchmarks to prevent interference with measurements
                if (isBenchmarkRunningRef.current) {
                    return;
                }

                for (const entry of entries) {
                    const element = entry.target as HTMLElement;
                    const cardId = element.dataset.cardId;
                    if (cardId) {
                        const isVisible = entry.isIntersecting;
                        actions.setCardVisibility(cardId, isVisible);
                    }
                }
            },
            {
                root: null, // viewport
                rootMargin: '0px',
                threshold: 0.1, // Trigger when 10% of card is visible
            },
        );

        return {
            observe: (element: HTMLElement, cardId: string) => {
                element.dataset.cardId = cardId;
                observer.observe(element);
            },
            unobserve: (element: HTMLElement) => {
                observer.unobserve(element);
                delete element.dataset.cardId;
            },
        };
    }, [actions]);

    // Cleanup observer on unmount
    useEffect(() => {
        return () => {
            // Observer will be cleaned up automatically when component unmounts
        };
    }, []);

    // Expose window API for Puppeteer automation
    useEffect(() => {
        // Set ready flag when app is mounted
        (window as any).__ready = true;

        // Expose adapter and actions for tests
        (window as any).__currentAdapter = adapter;
        (window as any).__currentActions = actions;
        (window as any).__setAdapterIndex = setAdapterIndex;

        // Expose runAndReport function for automated benchmarking
        (window as any).__runAndReport = async (
            adapterName?: string,
            scenario?: string,
        ): Promise<any> => {
            // Normalize adapter name (handle different formats)
            let targetAdapter: StoreAdapter | undefined;

            if (adapterName) {
                const normalizedName = adapterName.toLowerCase().replace(/[_-]/g, '');
                const idx = adapters.findIndex(
                    (a) =>
                        a.name.toLowerCase().replace(/[_\s-]/g, '') === normalizedName ||
                        a.name.toLowerCase() === adapterName.toLowerCase(),
                );
                if (idx >= 0) {
                    targetAdapter = adapters[idx];
                    // Only switch if different from current adapter to avoid unnecessary overhead
                    if (idx !== adapterIndex) {
                        setAdapterIndex(idx);
                        // Wait for React to fully update - use multiple RAFs and microtask queue flush
                        // This ensures all state updates, re-renders, and effects are complete
                        await new Promise((resolve) => {
                            // Flush microtask queue first
                            Promise.resolve().then(() => {
                                // Then wait for multiple animation frames to ensure all renders complete
                                requestAnimationFrame(() => {
                                    requestAnimationFrame(() => {
                                        // One more microtask flush to catch any effects
                                        Promise.resolve().then(() => {
                                            requestAnimationFrame(() => {
                                                // Final wait to ensure everything is stable
                                                setTimeout(resolve, 200);
                                            });
                                        });
                                    });
                                });
                            });
                        });
                        // Update actions reference after switch
                        await new Promise((resolve) => setTimeout(resolve, 100));
                    }
                } else {
                    throw new Error(
                        `Adapter "${adapterName}" not found. Available: ${adapters.map((a) => a.name).join(', ')}`,
                    );
                }
            } else {
                targetAdapter = adapter;
            }

            if (!targetAdapter) {
                throw new Error(`Adapter not found`);
            }

            const targetScenario = scenario || 'background-churn';

            // Use existing actions from current adapter (they're already connected to UI)
            // Get fresh actions reference (they might have changed after adapter switch)
            let currentActions = actions;
            if ((window as any).__currentActions) {
                // Wait a bit for actions to update after adapter switch
                await new Promise((resolve) => setTimeout(resolve, 100));
                currentActions = (window as any).__currentActions;
            }

            // Get test data
            const decksArray = Object.values(dataset.entities.decks);
            const testDeckIds = dataset.decksOrder || decksArray.map((d) => d.id);
            const firstDeckId = testDeckIds[0];
            const cardsArray = Object.values(dataset.entities.cards || {});
            const firstDeckCards = cardsArray.filter((c) => c.deckId === firstDeckId);
            const firstCardId = firstDeckCards[0]?.id;
            const commentsArray = Object.values(dataset.entities.comments || {});
            const firstCardComments = commentsArray.filter((c) => c.cardId === firstCardId);
            const commentId = firstCardComments[0]?.id;
            const cardIds = firstDeckCards.slice(0, 10).map((c) => c.id);

            // Clean up any old benchmark render counter keys to prevent interference
            const windowAny = window as any;
            const oldCounterKeys = Object.keys(windowAny).filter((key) =>
                key.startsWith('__benchmarkRenderCounter_'),
            );
            for (const key of oldCounterKeys) {
                delete windowAny[key];
            }

            // Reset render counters AFTER adapter switch but BEFORE benchmark starts
            // This ensures we only measure the actual benchmark workload, not adapter switching
            globalRenderCounter.reset();

            // Wait for all React updates and effects to complete
            await new Promise((resolve) => {
                Promise.resolve().then(() => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            Promise.resolve().then(() => {
                                requestAnimationFrame(resolve);
                            });
                        });
                    });
                });
            });

            // Mark benchmark as running to prevent IntersectionObserver interference
            isBenchmarkRunningRef.current = true;

            // Now run benchmark - this will create its own runRenderCounter
            let result: BenchmarkResult;
            switch (targetScenario) {
                case 'background-churn':
                    result = await benchmarkRunner.runBenchmark(
                        'background-churn',
                        targetAdapter.name,
                        currentActions,
                        async (wrappedActions, runNum) => {
                            // Automatically measure latency for multiple background churn triggers
                            for (let i = 0; i < 5; i++) {
                                await wrappedActions.backgroundChurnStart();
                            }
                            // Stop background churn (latency is measured automatically)
                            wrappedActions.backgroundChurnStop();
                        },
                        TEST_COUNT,
                    );
                    break;
                case 'inline-editing':
                    if (!commentId) {
                        throw new Error('No comment available for inline-editing test');
                    }
                    const testComments = Object.values(dataset.entities.comments)
                        .filter((c) => c.cardId === firstCardId)
                        .slice(0, 5);
                    result = await benchmarkRunner.runBenchmark(
                        'inline-editing',
                        targetAdapter.name,
                        currentActions,
                        async (wrappedActions, runNum) => {
                            const testCommentId =
                                testComments[runNum % testComments.length]?.id || commentId;
                            const runPrefix = `Run${runNum}_`;
                            const baseTimestamp = Date.now();
                            for (let j = 0; j < 20; j++) {
                                // Latency is automatically measured for each action call
                                await wrappedActions.updateCommentText(
                                    testCommentId,
                                    `${runPrefix}Typing update ${j} at ${baseTimestamp + j}`,
                                );
                            }
                        },
                        TEST_COUNT,
                    );
                    break;
                case 'bulk-update':
                    if (cardIds.length === 0) {
                        throw new Error('No cards available for bulk-update test');
                    }
                    result = await benchmarkRunner.runBenchmark(
                        'bulk-update',
                        targetAdapter.name,
                        currentActions,
                        async (wrappedActions, runNum) => {
                            const startIdx = (runNum * 5) % cardIds.length;
                            const testCardIds = cardIds
                                .slice(startIdx, startIdx + 10)
                                .filter(Boolean);
                            if (testCardIds.length === 0) return;

                            for (let i = 0; i < 5; i++) {
                                const tagId = `tag_${(i * 2 + runNum * 3) % 50}`;
                                const startCardIdx = (i * 2) % Math.max(1, testCardIds.length - 3);
                                const subset = testCardIds.slice(
                                    startCardIdx,
                                    startCardIdx + Math.min(5, testCardIds.length - startCardIdx),
                                );
                                if (subset.length > 0) {
                                    // Latency is automatically measured for each action call
                                    await wrappedActions.bulkToggleTagOnCards(subset, tagId);
                                }
                            }
                            // Trigger background churn (latency is automatically measured)
                            await wrappedActions.backgroundChurnStart();
                        },
                        TEST_COUNT,
                    );
                    break;
                default:
                    throw new Error(`Unknown scenario: ${targetScenario}`);
            }

            // Mark benchmark as complete - allow IntersectionObserver to resume
            isBenchmarkRunningRef.current = false;

            // Convert to standardized format
            return convertToStandardizedFormat(result, targetAdapter.name, targetScenario);
        };

        return () => {
            // Cleanup
            delete (window as any).__ready;
            delete (window as any).__runAndReport;
            delete (window as any).__currentAdapter;
            delete (window as any).__currentActions;
            delete (window as any).__setAdapterIndex;
        };
    }, [adapter, dataset, actions, adapterIndex, setAdapterIndex]);

    // Benchmark results
    const [benchmarkResults, setBenchmarkResults] = useState<BenchmarkResult[]>([]);
    const [showResults, setShowResults] = useState(false);
    const [showDebug, setShowDebug] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [currentProgress, setCurrentProgress] = useState<string>('');
    const [adapterTestResults, setAdapterTestResults] = useState<AdapterTestResult[]>([]);

    const Provider = adapter.Provider;

    const handleBenchmarkComplete = useCallback((result: BenchmarkResult) => {
        setBenchmarkResults((prev) => [...prev, result]);
    }, []);

    const handleClearResults = useCallback(() => {
        setBenchmarkResults([]);
        benchmarkRunner.clearResults();
        globalRenderCounter.reset();
        setAdapterTestResults([]);
    }, []);

    const handleShowResults = useCallback(() => {
        setShowResults(true);
    }, []);

    const handleHideResults = useCallback(() => {
        setShowResults(false);
    }, []);

    const handleToggleDebug = useCallback(() => {
        setShowDebug((prev) => !prev);
    }, []);

    if (showResults) {
        return (
            <div style={styles.appStyles.resultsContainer}>
                <div style={styles.appStyles.resultsWrapper}>
                    <div style={styles.appStyles.resultsHeader}>
                        <div>
                            <h1 style={styles.appStyles.resultsTitle}>📊 Benchmark Results</h1>
                            <p style={styles.appStyles.resultsSubtitle}>
                                Performance comparison across state management libraries
                            </p>
                        </div>
                        <button
                            onClick={handleHideResults}
                            style={styles.appStyles.backButton}
                            onMouseEnter={styles.hoverHandlers.backButton.onEnter}
                            onMouseLeave={styles.hoverHandlers.backButton.onLeave}
                        >
                            ← Back to App
                        </button>
                    </div>
                    <BenchmarkResults results={benchmarkResults} onClear={handleClearResults} />
                </div>
            </div>
        );
    }

    return (
        <Provider store={store}>
            <AdapterContext.Provider value={{ adapter, actions }}>
                <IntersectionObserverContext.Provider value={observerCallbacks}>
                    <div style={styles.appStyles.container}>
                        {isRunning && (
                            <div style={styles.appStyles.overlay}>
                                <div style={styles.appStyles.overlayContent}>
                                    <div style={styles.appStyles.overlaySpinner}>⏳</div>
                                    <div style={styles.appStyles.overlayTitle}>
                                        Running Benchmarks...
                                    </div>
                                    {currentProgress && (
                                        <div style={styles.appStyles.overlayProgress}>
                                            {currentProgress}
                                        </div>
                                    )}
                                    {adapterTestResults.length > 0 && (
                                        <div
                                            style={{
                                                marginTop: 20,
                                                padding: '16px',
                                                background: '#f8f9fa',
                                                border: '1px solid #dee2e6',
                                                borderRadius: '8px',
                                                maxHeight: '300px',
                                                overflowY: 'auto',
                                                fontSize: '12px',
                                            }}
                                        >
                                            <div
                                                style={{ fontWeight: 'bold', marginBottom: '12px' }}
                                            >
                                                🧪 Adapter Test Results:
                                            </div>
                                            {adapterTestResults.map((result, idx) => (
                                                <div
                                                    key={idx}
                                                    style={{
                                                        marginBottom: '8px',
                                                        padding: '8px',
                                                        background: result.passed
                                                            ? '#d4edda'
                                                            : '#f8d7da',
                                                        border: `1px solid ${result.passed ? '#c3e6cb' : '#f5c6cb'}`,
                                                        borderRadius: '4px',
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            fontWeight: 'bold',
                                                            color: result.passed
                                                                ? '#155724'
                                                                : '#721c24',
                                                        }}
                                                    >
                                                        {result.passed ? '✅' : '❌'}{' '}
                                                        {result.adapterName}
                                                    </div>
                                                    {result.errors.length > 0 && (
                                                        <div
                                                            style={{
                                                                marginTop: '4px',
                                                                fontSize: '11px',
                                                                color: '#721c24',
                                                            }}
                                                        >
                                                            {result.errors
                                                                .slice(0, 2)
                                                                .map((error, i) => (
                                                                    <div key={i}>• {error}</div>
                                                                ))}
                                                            {result.errors.length > 2 && (
                                                                <div>
                                                                    ... and{' '}
                                                                    {result.errors.length - 2} more
                                                                    errors
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <div style={styles.appStyles.overlayText}>
                                        Please wait while we measure performance.
                                        <br />
                                        This may take a few moments.
                                    </div>
                                    <div
                                        style={{
                                            ...styles.appStyles.overlayText,
                                            marginTop: 20,
                                            padding: '12px 16px',
                                            background: '#FFF3CD',
                                            border: '2px solid #FFC107',
                                            borderRadius: '8px',
                                            color: '#856404',
                                            fontWeight: 600,
                                            fontSize: 13,
                                        }}
                                    >
                                        ⚠️ <strong>Important:</strong> Please do not minimize or
                                        switch browser tabs during testing. This may affect
                                        performance measurements and accuracy of results.
                                    </div>
                                </div>
                            </div>
                        )}
                        <div style={styles.appLayoutStyles.mainContent}>
                            {showDebug ? (
                                <DebugRenders
                                    adapters={adapters}
                                    adapterIndex={adapterIndex}
                                    setAdapterIndex={setAdapterIndex}
                                    dataset={dataset}
                                    onBack={handleToggleDebug}
                                />
                            ) : (
                                <>
                                    <InfoBanner />
                                    <Toolbar
                                        adapter={adapter}
                                        adapterIndex={adapterIndex}
                                        setAdapterIndex={setAdapterIndex}
                                        actions={actions}
                                        dataset={dataset}
                                        adapters={adapters}
                                        onBenchmarkComplete={handleBenchmarkComplete}
                                        onClearResults={handleClearResults}
                                        onShowResults={handleShowResults}
                                        onToggleDebug={handleToggleDebug}
                                        isRunning={isRunning}
                                        setIsRunning={setIsRunning}
                                        setCurrentProgress={setCurrentProgress}
                                        setAdapterTestResults={setAdapterTestResults}
                                        isBenchmarkRunningRef={isBenchmarkRunningRef}
                                    />
                                    <div style={styles.appLayoutStyles.contentArea}>
                                        <DeckList adapter={adapter} />
                                        <HeatmapOverlay />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </IntersectionObserverContext.Provider>
            </AdapterContext.Provider>
        </Provider>
    );
};

const DeckList: React.FC<{ adapter: StoreAdapter }> = ({ adapter }) => {
    useCounterKey('DeckList');
    const deckIds = adapter.hooks.useDeckIds();

    // Show more items now that we have proper scrollable list
    const displayedDecks = deckIds.slice(0, 100);

    return (
        <div style={styles.deckListStyles.container}>
            {displayedDecks.map((deckId) => (
                <DeckItem key={deckId} deckId={deckId} />
            ))}
        </div>
    );
};

// DeckItem for ids-based mode - uses useCardIdsByDeckId
const DeckItemBase: React.FC<{ deckId: string }> = ({ deckId }) => {
    useCounterKey('DeckItem');
    const ctx = useContext(AdapterContext);
    if (!ctx) throw new Error('Adapter context not found');

    const deck = ctx.adapter.hooks.useDeckById(deckId);
    const cardIds = (ctx.adapter.hooks as any).useCardIdsByDeckId(deckId) as ID[];

    if (!deck) {
        return (
            <div style={styles.deckItemStyles.loading}>
                <div style={styles.deckItemStyles.loadingText}>Loading deck...</div>
            </div>
        );
    }

    return (
        <div
            style={styles.deckItemStyles.container}
            onMouseEnter={styles.hoverHandlers.deckItem.onEnter}
            onMouseLeave={styles.hoverHandlers.deckItem.onLeave}
        >
            <div style={styles.deckItemStyles.header}>
                <strong style={styles.deckItemStyles.title}>{deck.title}</strong>
                <div style={styles.deckItemStyles.badge}>{cardIds.length} cards</div>
            </div>
            <div>
                <CardsList cardIds={cardIds} />
            </div>
        </div>
    );
};

// Wrapper for DeckItem
const DeckItem: React.FC<{ deckId: string }> = React.memo(({ deckId }) => {
    const ctx = useContext(AdapterContext);
    if (!ctx) throw new Error('Adapter context not found');

    return <DeckItemBase deckId={deckId} />;
});

// CardsList for ids-based mode - receives IDs array
const CardsListBase: React.FC<{ cardIds: ID[] }> = ({ cardIds }) => {
    useCounterKey('CardsList');
    const ctx = useContext(AdapterContext);
    if (!ctx) throw new Error('Adapter context not found');

    return (
        <div style={styles.cardsListStyles.container}>
            {cardIds.map((cardId) => (
                <CardItem key={cardId} cardId={cardId} />
            ))}
        </div>
    );
};

const CardsList: React.FC<{ cardIds: ID[] }> = React.memo(
    ({ cardIds }) => <CardsListBase cardIds={cardIds} />,
    (prev, next) => shallowEqualIds(prev.cardIds, next.cardIds),
);

// Toolbar for ids-based mode
const Toolbar: React.FC<{
    adapter: StoreAdapter;
    adapterIndex: number;
    setAdapterIndex: (i: number) => void;
    actions: any;
    dataset: RootState;
    adapters: StoreAdapter[];
    onBenchmarkComplete: (result: BenchmarkResult) => void;
    onClearResults: () => void;
    onShowResults: () => void;
    onToggleDebug: () => void;
    isRunning: boolean;
    setIsRunning: (running: boolean) => void;
    setCurrentProgress: (progress: string) => void;
    setAdapterTestResults?: (results: AdapterTestResult[]) => void;
    isBenchmarkRunningRef: React.MutableRefObject<boolean>;
}> = ({
    adapter,
    adapterIndex,
    setAdapterIndex,
    actions,
    dataset,
    adapters,
    onBenchmarkComplete,
    onClearResults,
    onShowResults,
    onToggleDebug,
    isRunning,
    setIsRunning,
    setCurrentProgress,
    setAdapterTestResults,
    isBenchmarkRunningRef,
}) => {
    useCounterKey('Toolbar');
    const names = adapters.map((a) => a.name);

    const handleAdapterChange = useCallback(
        (e: React.ChangeEvent<HTMLSelectElement>) => {
            setAdapterIndex(Number(e.target.value));
        },
        [setAdapterIndex],
    );

    // Get benchmark data using hooks for ids-based mode
    const deckIds = adapter.hooks.useDeckIds();
    const firstDeckId = deckIds.length > 0 ? deckIds[0] : '';
    const firstDeckCardIds = (adapter.hooks as any).useCardIdsByDeckId(firstDeckId || '') as ID[];
    const firstCardId = firstDeckCardIds.length > 0 ? firstDeckCardIds[0] || '' : '';
    const firstCardCommentIds = firstCardId
        ? ((adapter.hooks as any).useCommentIdsByCardId(firstCardId) as ID[])
        : [];

    // Collect cards from first deck for bulk operations
    const allCardsForBulk = useMemo(() => {
        return firstDeckCardIds.slice(0, 10).map((cardId) => ({ id: cardId }) as Card);
    }, [firstDeckCardIds]);

    // Toolbar callbacks for ids-based mode
    const runUpdateBenchmark = useCallback(async () => {
        debugLog(`🔄 Starting Update Benchmark for ${adapter.name}...`);
        // Mark benchmark as running to prevent IntersectionObserver interference
        isBenchmarkRunningRef.current = true;
        try {
            const result = await benchmarkRunner.runBenchmark(
                'background-churn',
                adapter.name,
                actions,
                async (wrappedActions) => {
                    // Automatically measure latency for multiple background churn triggers
                    for (let i = 0; i < 5; i++) {
                        await wrappedActions.backgroundChurnStart();
                    }
                    // Stop background churn (latency is measured automatically)
                    wrappedActions.backgroundChurnStop();
                },
                10,
            );
            debugLog(`✅ Update Benchmark Results - ${adapter.name}:`, result);
            onBenchmarkComplete(result);
        } finally {
            // Reset flag after benchmark completes
            isBenchmarkRunningRef.current = false;
        }
    }, [adapter.name, actions, onBenchmarkComplete, isBenchmarkRunningRef]);

    const runInlineEditBenchmark = useCallback(async () => {
        debugLog(`✏️ Starting Inline Edit Benchmark for ${adapter.name}...`);
        const availableCommentIds = firstCardCommentIds.slice(0, 5);
        if (availableCommentIds.length === 0) {
            debugWarn('No comments available for inline edit benchmark');
            return;
        }
        // Mark benchmark as running to prevent IntersectionObserver interference
        isBenchmarkRunningRef.current = true;
        try {
            const result = await benchmarkRunner.runBenchmark(
                'inline-editing',
                adapter.name,
                actions,
                async (wrappedActions, runNum) => {
                    const commentId = availableCommentIds[runNum % availableCommentIds.length];
                    if (!commentId) return;
                    const runPrefix = `Run${runNum}_`;
                    const baseTimestamp = Date.now();
                    for (let i = 0; i < 20; i++) {
                        const uniqueTimestamp = baseTimestamp + i;
                        // Latency is automatically measured for each action call
                        await wrappedActions.updateCommentText(
                            commentId,
                            `${runPrefix}Typing update ${i} at ${uniqueTimestamp}: testing reactivity to frequent state changes`,
                        );
                    }
                },
                10,
            );
            debugLog(`✅ Inline Edit Benchmark Results - ${adapter.name}:`, result);
            onBenchmarkComplete(result);
        } finally {
            // Reset flag after benchmark completes
            isBenchmarkRunningRef.current = false;
        }
    }, [adapter.name, actions, firstCardCommentIds, onBenchmarkComplete, isBenchmarkRunningRef]);

    const runBulkUpdateBenchmark = useCallback(async () => {
        debugLog(`📦 Starting Bulk Update Benchmark for ${adapter.name}...`);

        // Use more cards to ensure variety - take different subset for different operations
        const allAvailableCards = allCardsForBulk.slice(0, 15);

        if (allAvailableCards.length === 0) {
            debugWarn('No cards available for bulk update benchmark');
            return;
        }

        // Mark benchmark as running to prevent IntersectionObserver interference
        isBenchmarkRunningRef.current = true;
        try {
            const result = await benchmarkRunner.runBenchmark(
                'bulk-update',
                adapter.name,
                actions,
                async (wrappedActions, runNum) => {
                    // Use different cards for each run to ensure variety and fresh operations
                    const startIdx = (runNum * 5) % allAvailableCards.length;
                    const cardIds = allAvailableCards
                        .slice(startIdx, startIdx + 10)
                        .map((c) => c.id)
                        .filter(Boolean);

                    if (cardIds.length === 0) return;

                    // Multiple operations to ensure components actually re-render:
                    // 1. Toggle tags on different subsets of cards with different tags for each step
                    // 2. Use runNum and iteration index for variety both across and within runs
                    // 3. This ensures each step creates distinct state changes
                    for (let i = 0; i < 5; i++) {
                        // Use different tags for each iteration (varied pattern with runNum offset)
                        const tagId = `tag_${(i * 2 + runNum * 3) % 50}`; // 50 tags with rotation
                        // Use different subset of cards for each iteration to ensure variety
                        // Shift the subset by i to work with different cards each time
                        const startCardIdx = (i * 2) % Math.max(1, cardIds.length - 3);
                        const subsetSize = Math.min(5, cardIds.length - startCardIdx);
                        const cardSubset = cardIds.slice(startCardIdx, startCardIdx + subsetSize);

                        if (cardSubset.length > 0) {
                            // Latency is automatically measured for each action call
                            await wrappedActions.bulkToggleTagOnCards(cardSubset, tagId);
                        }
                    }
                    // Trigger card updates (latency is automatically measured)
                    await wrappedActions.backgroundChurnStart();
                },
                10,
            );

            debugLog(`✅ Bulk Update Benchmark Results - ${adapter.name}:`, result);
            onBenchmarkComplete(result);
        } finally {
            // Reset flag after benchmark completes
            isBenchmarkRunningRef.current = false;
        }
    }, [adapter.name, actions, allCardsForBulk, onBenchmarkComplete, isBenchmarkRunningRef]);

    const runAllBenchmarks = useCallback(async () => {
        debugLog(`🚀 Running all benchmarks for ${adapter.name}...`);

        await runUpdateBenchmark();
        await new Promise((resolve) => setTimeout(resolve, 500));

        await runInlineEditBenchmark();
        await new Promise((resolve) => setTimeout(resolve, 500));

        await runBulkUpdateBenchmark();

        debugLog(`🎉 All benchmarks completed for ${adapter.name}!`);
    }, [adapter.name, runUpdateBenchmark, runInlineEditBenchmark, runBulkUpdateBenchmark]);

    const runAllAdaptersAllTests = useCallback(async () => {
        debugLog(`🌍 Starting comprehensive benchmark across all adapters...`);

        try {
            // Clear existing results
            onClearResults();
            benchmarkRunner.clearResults();
            setCurrentProgress('Initializing...');

            // Validate dataset
            if (!dataset || !dataset.entities || !dataset.entities.decks) {
                throw new Error('Dataset is not initialized or invalid');
            }

            // Run adapter tests first to catch issues before benchmarks
            setCurrentProgress('🧪 Running adapter tests...');
            debugLog(`\n🧪 Running adapter tests before benchmarks...`);
            let testResults: AdapterTestResult[] = [];
            try {
                testResults = await testAllAdapters(adapters);
                if (setAdapterTestResults) {
                    setAdapterTestResults(testResults);
                }

                // Print all test results to console (both successes and failures)
                console.log('\n📊 Adapter Test Results:');
                console.log('═'.repeat(60));

                const passedTests = testResults.filter((r) => r.passed);
                const failedTests = testResults.filter((r) => !r.passed);

                // Print successful tests
                if (passedTests.length > 0) {
                    console.log(`\n✅ Passed (${passedTests.length}):`);
                    for (const result of passedTests) {
                        console.log(`  ✓ ${result.adapterName}`);
                    }
                }

                // Print failed tests
                if (failedTests.length > 0) {
                    console.log(`\n❌ Failed (${failedTests.length}):`);
                    for (const result of failedTests) {
                        console.error(`  ✗ ${result.adapterName}:`);
                        for (const error of result.errors) {
                            console.error(`    - ${error}`);
                        }
                    }
                }

                console.log('═'.repeat(60));

                if (failedTests.length > 0) {
                    const failedNames = failedTests.map((r) => r.adapterName).join(', ');
                    setCurrentProgress(
                        `⚠️ Tests failed for: ${failedNames}. Check console for details. Continuing with benchmarks...`,
                    );
                    await new Promise((resolve) => setTimeout(resolve, 2000)); // Show warning for 2 seconds
                } else {
                    debugLog(`✅ All adapters passed tests`);
                    setCurrentProgress('✅ All adapters passed tests. Starting benchmarks...');
                    await new Promise((resolve) => setTimeout(resolve, 1000)); // Show success briefly
                }
            } catch (testError) {
                console.error('⚠️ Adapter tests failed:', testError);
                setCurrentProgress(
                    `⚠️ Test execution error: ${testError instanceof Error ? testError.message : String(testError)}. Continuing...`,
                );
                await new Promise((resolve) => setTimeout(resolve, 2000));
                // Continue anyway - tests are informational
            }

            // Get test data from dataset (same for all adapters)
            // RootState has structure: { entities: { decks: Record<ID, Deck>, cards: Record<ID, Card>, ... }, decksOrder: ID[] }
            const decksArray = Object.values(dataset.entities.decks);
            const testDeckIds = dataset.decksOrder || decksArray.map((d) => d.id);
            const firstDeckId = testDeckIds[0];
            const cardsArray = Object.values(dataset.entities.cards || {});
            const firstDeckCards = cardsArray.filter((c) => c.deckId === firstDeckId);
            const firstCardId = firstDeckCards[0]?.id;
            const commentsArray = Object.values(dataset.entities.comments || {});
            const firstCardComments = commentsArray.filter((c) => c.cardId === firstCardId);
            const commentId = firstCardComments[0]?.id;
            const cardIds = firstDeckCards.slice(0, 10).map((c) => c.id);
            const tagId = 'tag_0';

            // Run all tests for all adapters
            for (let i = 0; i < adapters.length; i++) {
                const target = adapters[i];
                const adapterProgress = `${i + 1}/${adapters.length}`;
                debugLog(`\n📦 Testing ${target.name} (${adapterProgress})...`);

                setCurrentProgress(`📦 Testing ${target.name} (${adapterProgress})...`);

                // Switch the live UI to the target adapter so renders are measured correctly
                try {
                    setAdapterIndex(i);
                } catch {}
                // Wait for React to fully update - use multiple RAFs and microtask queue flush
                // This ensures all state updates, re-renders, and effects are complete
                await new Promise((resolve) => {
                    Promise.resolve().then(() => {
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                Promise.resolve().then(() => {
                                    requestAnimationFrame(() => {
                                        setTimeout(resolve, 200);
                                    });
                                });
                            });
                        });
                    });
                });
                // Use actions from the live context (UI tree)
                const uiActions = (window as any).__currentActions || actions;
                const uiAdapter = (window as any).__currentAdapter || target;

                // Clean up any old benchmark render counter keys
                const windowAny = window as any;
                const oldCounterKeys = Object.keys(windowAny).filter((key) =>
                    key.startsWith('__benchmarkRenderCounter_'),
                );
                for (const key of oldCounterKeys) {
                    delete windowAny[key];
                }

                // Reset render counter after switch and before measurements
                globalRenderCounter.reset();

                // Wait for all React updates to complete
                await new Promise((resolve) => {
                    Promise.resolve().then(() => {
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                Promise.resolve().then(() => {
                                    requestAnimationFrame(resolve);
                                });
                            });
                        });
                    });
                });

                // Mark benchmark as running to prevent IntersectionObserver interference
                isBenchmarkRunningRef.current = true;

                // Run Update Benchmark
                setCurrentProgress(
                    `📦 ${uiAdapter.name} (${adapterProgress}) | 🔄 Running Update Benchmark...`,
                );
                debugLog(`  🔄 Running Update Benchmark for ${uiAdapter.name}...`);
                const updateResult = await benchmarkRunner.runBenchmark(
                    'background-churn',
                    uiAdapter.name,
                    uiActions,
                    async (wrappedActions, runNum) => {
                        // Automatically measure latency for multiple background churn triggers
                        for (let i = 0; i < 5; i++) {
                            await wrappedActions.backgroundChurnStart();
                        }
                        // Stop background churn (latency is measured automatically)
                        wrappedActions.backgroundChurnStop();
                    },
                    10,
                );
                onBenchmarkComplete(updateResult);
                // Reset flag after benchmark completes
                isBenchmarkRunningRef.current = false;
                await new Promise((resolve) => setTimeout(resolve, 300));

                // Run Inline Edit Benchmark
                if (commentId) {
                    // Get multiple comments for variety across runs
                    const testComments = Object.values(dataset.entities.comments)
                        .filter((c) => c.cardId === firstCardId)
                        .slice(0, 5);
                    const testCommentIds =
                        testComments.length > 0
                            ? testComments.map((c) => c.id)
                            : commentId
                              ? [commentId]
                              : [];

                    setCurrentProgress(
                        `📦 ${uiAdapter.name} (${adapterProgress}) | ✏️ Running Inline Edit Benchmark...`,
                    );
                    debugLog(`  ✏️ Running Inline Edit Benchmark for ${uiAdapter.name}...`);
                    const editResult = await benchmarkRunner.runBenchmark(
                        'inline-editing',
                        uiAdapter.name,
                        uiActions,
                        async (wrappedActions, runNum) => {
                            // Use different comment for each run to ensure fresh data
                            const testCommentId =
                                testCommentIds[runNum % testCommentIds.length] || commentId;
                            // Pre-compute unique timestamps to ensure variety within run
                            const runPrefix = `Run${runNum}_`;
                            const baseTimestamp = Date.now();

                            // Latency is automatically measured for each action call
                            for (let j = 0; j < 20; j++) {
                                const uniqueTimestamp = baseTimestamp + j;
                                await wrappedActions.updateCommentText(
                                    testCommentId,
                                    `${runPrefix}Typing update ${j} at ${uniqueTimestamp}: testing reactivity to frequent state changes`,
                                );
                            }
                        },
                        10,
                    );
                    onBenchmarkComplete(editResult);
                    // Reset flag after benchmark completes
                    isBenchmarkRunningRef.current = false;
                    await new Promise((resolve) => setTimeout(resolve, 300));
                }

                // Run Bulk Update Benchmark
                if (cardIds.length > 0) {
                    // Use more cards for variety
                    const allTestCards = firstDeckCards.slice(0, 15);

                    setCurrentProgress(
                        `📦 ${uiAdapter.name} (${adapterProgress}) | 📦 Running Bulk Update Benchmark...`,
                    );
                    debugLog(`  📦 Running Bulk Update Benchmark for ${uiAdapter.name}...`);
                    const bulkResult = await benchmarkRunner.runBenchmark(
                        'bulk-update',
                        uiAdapter.name,
                        uiActions,
                        async (wrappedActions, runNum) => {
                            // Use different cards for each run to ensure variety
                            const startIdx = (runNum * 5) % allTestCards.length;
                            const testCardIds = allTestCards
                                .slice(startIdx, startIdx + 10)
                                .map((c) => c.id)
                                .filter(Boolean);

                            if (testCardIds.length === 0) return;

                            // Multiple operations to ensure components actually re-render:
                            // 1. Toggle tags on different subsets of cards with different tags for each step
                            // 2. Use runNum and iteration index for variety both across and within runs
                            // 3. This ensures each step creates distinct state changes
                            for (let tagI = 0; tagI < 5; tagI++) {
                                // Use different tags for each iteration (varied pattern with runNum offset)
                                const testTagId = `tag_${(tagI * 2 + runNum * 3) % 50}`; // 50 tags with rotation
                                // Use different subset of cards for each iteration to ensure variety
                                // Shift the subset by tagI to work with different cards each time
                                const startCardIdx =
                                    (tagI * 2) % Math.max(1, testCardIds.length - 3);
                                const subsetSize = Math.min(5, testCardIds.length - startCardIdx);
                                const cardSubset = testCardIds.slice(
                                    startCardIdx,
                                    startCardIdx + subsetSize,
                                );

                                if (cardSubset.length > 0) {
                                    // Latency is automatically measured for each action call
                                    await wrappedActions.bulkToggleTagOnCards(
                                        cardSubset,
                                        testTagId,
                                    );
                                }
                            }
                            // Trigger card updates (latency is automatically measured)
                            await wrappedActions.backgroundChurnStart();
                        },
                        10,
                    );
                    onBenchmarkComplete(bulkResult);
                    // Reset flag after benchmark completes
                    isBenchmarkRunningRef.current = false;
                    await new Promise((resolve) => setTimeout(resolve, 300));
                }

                // Ensure flag is reset after all benchmarks for this adapter
                isBenchmarkRunningRef.current = false;

                debugLog(`✅ Completed all tests for ${target.name}\n`);
            }

            setCurrentProgress('✅ All tests completed! Preparing results...');
            debugLog(`🎉 Comprehensive benchmark completed for all adapters!`);

            // Automatically show results
            setTimeout(() => {
                setCurrentProgress('');
                onShowResults();
            }, 500);
        } catch (error) {
            setCurrentProgress('');
            const errorMessage = error instanceof Error ? error.message : String(error);
            debugWarn('Error running comprehensive benchmark:', error);
            setCurrentProgress(`❌ Error: ${errorMessage}`);
            setTimeout(() => {
                setCurrentProgress('');
            }, 3000);
        }
    }, [
        dataset,
        adapters,
        onBenchmarkComplete,
        onClearResults,
        onShowResults,
        setCurrentProgress,
        setAdapterTestResults,
    ]);

    const handleRunWithLoading = useCallback(async (fn: () => Promise<void>) => {
        setIsRunning(true);
        try {
            await fn();
        } finally {
            setIsRunning(false);
        }
    }, []);

    const handleRunAllAdapters = useCallback(async () => {
        setIsRunning(true);
        try {
            await runAllAdaptersAllTests();
        } finally {
            setIsRunning(false);
            setCurrentProgress('');
        }
    }, [runAllAdaptersAllTests, setCurrentProgress]);

    const handleResetCounter = useCallback(() => {
        globalRenderCounter.reset();
    }, []);

    const handleRunTests = useCallback(async () => {
        setIsRunning(true);
        try {
            setCurrentProgress('🧪 Running adapter tests...');
            const testResults = await testAllAdapters(adapters);
            if (setAdapterTestResults) {
                setAdapterTestResults(testResults);
            }

            // Print all test results to console (both successes and failures)
            console.log('\n📊 Adapter Test Results:');
            console.log('═'.repeat(60));

            const passedTests = testResults.filter((r) => r.passed);
            const failedTests = testResults.filter((r) => !r.passed);

            // Print successful tests
            if (passedTests.length > 0) {
                console.log(`\n✅ Passed (${passedTests.length}):`);
                for (const result of passedTests) {
                    console.log(`  ✓ ${result.adapterName}`);
                }
            }

            // Print failed tests
            if (failedTests.length > 0) {
                console.log(`\n❌ Failed (${failedTests.length}):`);
                for (const result of failedTests) {
                    console.error(`  ✗ ${result.adapterName}:`);
                    for (const error of result.errors) {
                        console.error(`    - ${error}`);
                    }
                }
            }

            console.log('═'.repeat(60));

            if (failedTests.length > 0) {
                setCurrentProgress(
                    `⚠️ ${failedTests.length} adapter(s) failed tests. Check console for details.`,
                );
            } else {
                setCurrentProgress('✅ All adapters passed tests!');
            }
            setTimeout(() => {
                setCurrentProgress('');
            }, 3000);
        } catch (error) {
            console.error('⚠️ Adapter tests failed:', error);
            setCurrentProgress(
                `❌ Test execution error: ${error instanceof Error ? error.message : String(error)}`,
            );
            setTimeout(() => {
                setCurrentProgress('');
            }, 3000);
        } finally {
            setIsRunning(false);
        }
    }, [adapters, setIsRunning, setCurrentProgress, setAdapterTestResults]);

    const handleRunUpdate = useCallback(() => {
        handleRunWithLoading(runUpdateBenchmark);
    }, [handleRunWithLoading, runUpdateBenchmark]);

    const handleRunEdit = useCallback(() => {
        handleRunWithLoading(runInlineEditBenchmark);
    }, [handleRunWithLoading, runInlineEditBenchmark]);

    const handleRunBulk = useCallback(() => {
        handleRunWithLoading(runBulkUpdateBenchmark);
    }, [handleRunWithLoading, runBulkUpdateBenchmark]);

    const handleRunAll = useCallback(() => {
        handleRunWithLoading(runAllBenchmarks);
    }, [handleRunWithLoading, runAllBenchmarks]);

    return (
        <div style={styles.toolbarStyles.container}>
            <div style={styles.toolbarStyles.selectorGroup}>
                <span style={styles.toolbarStyles.selectorLabel}>State Manager:</span>
                <select
                    value={adapterIndex}
                    onChange={handleAdapterChange}
                    style={styles.toolbarStyles.select}
                >
                    {names.map((n, i) => (
                        <option key={`${n}-${i}`} value={i}>
                            {n}
                        </option>
                    ))}
                </select>
            </div>

            <div style={styles.toolbarStyles.buttonsGroup}>
                <button
                    onClick={handleRunUpdate}
                    disabled={isRunning}
                    title="Test: Mass update of 100 cards to measure batch update performance"
                    style={{
                        ...styles.toolbarStyles.button(styles.colors.button.blue, isRunning),
                        ...styles.toolbarStyles.buttonBlue,
                    }}
                >
                    🔄 Updates
                </button>
                <button
                    onClick={handleRunEdit}
                    disabled={isRunning}
                    title="Test: Rapid text editing (20 updates) to measure reactivity during typing"
                    style={{
                        ...styles.toolbarStyles.button(styles.colors.button.orange, isRunning),
                        ...styles.toolbarStyles.buttonOrange,
                    }}
                >
                    ✏️ Edit
                </button>
                <button
                    onClick={handleRunBulk}
                    disabled={isRunning}
                    title="Test: Bulk operation on 10 cards to measure batch processing efficiency"
                    style={{
                        ...styles.toolbarStyles.button(styles.colors.button.purple, isRunning),
                        ...styles.toolbarStyles.buttonPurple,
                    }}
                >
                    📦 Bulk
                </button>
                <button
                    onClick={handleRunAll}
                    disabled={isRunning}
                    title="Run all three tests sequentially: Updates, Edit, and Bulk operations"
                    style={{
                        ...styles.toolbarStyles.buttonLarge(
                            styles.colors.button.pink,
                            isRunning,
                            isRunning
                                ? undefined
                                : `linear-gradient(135deg, ${styles.colors.button.pink} 0%, ${styles.colors.button.pinkDark} 100%)`,
                        ),
                        ...styles.toolbarStyles.buttonPink,
                    }}
                >
                    {isRunning ? '⏳ Running...' : '🚀 All Tests'}
                </button>
                <button
                    onClick={handleRunAllAdapters}
                    disabled={isRunning}
                    title="Run all tests for all adapters automatically and show results"
                    style={{
                        ...styles.toolbarStyles.buttonLarge(
                            styles.colors.button.cyan,
                            isRunning,
                            isRunning
                                ? undefined
                                : `linear-gradient(135deg, ${styles.colors.button.cyan} 0%, ${styles.colors.button.cyanDark} 100%)`,
                        ),
                        ...styles.toolbarStyles.buttonCyan,
                    }}
                >
                    {isRunning ? '⏳ Running All...' : '🌍 All Adapters'}
                </button>
                <button
                    onClick={onShowResults}
                    title="View detailed performance results and comparisons"
                    style={{
                        ...styles.toolbarStyles.button(styles.colors.button.grayBlue, false),
                        ...styles.toolbarStyles.buttonGray,
                    }}
                >
                    📊 Results
                </button>
                <button
                    onClick={onToggleDebug}
                    title="Debug render counts - update 1 card and see what re-renders"
                    style={{
                        ...styles.toolbarStyles.button('#9c27b0', false),
                    }}
                >
                    🐛 Debug
                </button>
                <button
                    onClick={handleResetCounter}
                    title="Reset render counter (for debugging)"
                    style={{
                        ...styles.toolbarStyles.button(styles.colors.button.gray, false),
                        ...styles.toolbarStyles.buttonReset,
                    }}
                >
                    🔄 Reset
                </button>
                <button
                    onClick={handleRunTests}
                    disabled={isRunning}
                    title="Run adapter validation tests"
                    style={{
                        ...styles.toolbarStyles.button('#28a745', isRunning),
                    }}
                >
                    🧪 Test
                </button>
            </div>
        </div>
    );
};
