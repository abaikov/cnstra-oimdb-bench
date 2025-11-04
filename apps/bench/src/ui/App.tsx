import React, {
    useMemo,
    useRef,
    useState,
    useContext,
    createContext,
    useCallback,
    useEffect,
} from 'react';
import {
    generateDataset,
    createFpsMeter,
    createMarks,
    createRenderCounter,
    testAllAdapters,
    type AdapterTestResult,
} from '@bench/core';
import type { StoreAdapter, RootState, ID, Deck, Card, Comment } from '@bench/core';
import { createWorkloadDriver } from '@bench/core';
import { FpsGauge, KeystrokeLatency, MountProfiler } from './Overlays';
import { BenchmarkResults } from './BenchmarkResults';
import { DebugRenders } from './DebugRenders';
import * as styles from './App.styles';
import { cnstraOimdbAdapter } from '@bench/adapter-cnstra-oimdb';
import { reduxAdapter } from '@bench/adapter-redux';
import { effectorAdapter } from '@bench/adapter-effector';
import { zustandAdapter } from '@bench/adapter-zustand';
import adapterLocData from '@bench/core/src/adapter-loc.json';

const AdapterContext = createContext<{ adapter: StoreAdapter; actions: any } | null>(null);

// All components use ids-based mode

// Load adapter lines of code data
const adapterLocMap: Record<string, number> = {};
if (adapterLocData && adapterLocData.adapters) {
    Object.entries(adapterLocData.adapters).forEach(([name, data]: [string, any]) => {
        adapterLocMap[name] = data.linesOfCode;
    });
}

// Create adapters - only ids-based versions
const adapters: StoreAdapter[] = [
    effectorAdapter,
    cnstraOimdbAdapter,
    reduxAdapter,
    zustandAdapter,
].filter(Boolean) as StoreAdapter[];

// Global render counter for non-benchmark renders (UI components)
const globalRenderCounter = createRenderCounter();
const overlaysEnabled = new URLSearchParams(window.location.search).get('overlays') === '1';
const isDev = import.meta.env.DEV;
const debugLog = isDev ? console.log.bind(console) : () => {};
const debugWarn = isDev ? console.warn.bind(console) : () => {};

// Context for benchmark-specific render counter
const RenderCounterContext = createContext<ReturnType<typeof createRenderCounter> | null>(null);

// Local benchmark types and functions
type BenchmarkMetrics = {
    executionTime: number;
    renderCount: number;
    memoryUsage: number;
    fps: number;
    latency: number[];
    timestamp: number;
    adapter: string;
    scenario: string;
};

type BenchmarkResult = {
    scenario: string;
    adapter: string;
    runs: BenchmarkMetrics[];
    average: {
        executionTime: number;
        renderCount: number;
        memoryUsage: number;
        fps: number;
        latency: {
            p50: number;
            p95: number;
            p99: number;
        };
    };
    timestamp: number;
};

/**
 * Get memory usage in MB
 * Note: performance.memory is a non-standard Chrome API
 * Returns 0 if not available (e.g., Firefox, Safari)
 */
function getMemoryUsage(): number {
    if ('memory' in performance && (performance as any).memory) {
        const memory = (performance as any).memory;
        const used = memory.usedJSHeapSize;
        if (typeof used === 'number' && Number.isFinite(used) && used >= 0) {
            return used / 1024 / 1024; // MB
        }
    }
    return 0;
}

/**
 * Calculate percentile using linear interpolation for more accurate results
 * Handles edge cases: empty arrays, single values, out-of-range percentiles
 */
function calculatePercentile(values: number[], percentile: number): number {
    if (!values || values.length === 0) return 0;
    if (values.length === 1) return values[0];

    // Clamp percentile to valid range
    percentile = Math.max(0, Math.min(100, percentile));

    const sorted = [...values].sort((a, b) => a - b);
    const index = (percentile / 100) * (sorted.length - 1);
    const lowerIndex = Math.floor(index);
    const upperIndex = Math.ceil(index);
    const weight = index - lowerIndex;

    // Linear interpolation for more accurate percentile
    const lower = sorted[Math.max(0, Math.min(lowerIndex, sorted.length - 1))];
    const upper = sorted[Math.max(0, Math.min(upperIndex, sorted.length - 1))];

    const result = lower + (upper - lower) * weight;
    return Number.isFinite(result) ? result : 0;
}

function createBenchmarkRunner() {
    const results: BenchmarkResult[] = [];

    return {
        async runBenchmark(
            scenario: string,
            adapter: string,
            workloadFn: (
                measureLatency: (
                    fn: () => void | Promise<void>,
                    waitForPaint?: boolean,
                ) => Promise<number>,
                runNum: number,
                trackDelay?: (ms: number) => void,
            ) => Promise<void>,
            runs: number = 10,
        ): Promise<BenchmarkResult> {
            const scenarioResults: BenchmarkMetrics[] = [];

            // Warmup run(s) to allow JIT compilation and stabilize results
            // Note: Warmup runs may create side-effects (state changes), but this is acceptable
            // as it simulates real-world usage where adapters are "warmed up" before critical operations
            const warmupRuns = 1;
            for (let w = 0; w < warmupRuns; w++) {
                try {
                    // Test if workloadFn accepts measureLatency parameter
                    if (workloadFn.length > 0) {
                        // For warmup, pass a dummy measureLatency that does nothing
                        const dummyMeasureLatency = async () => 0;
                        const dummyTrackDelay = () => {}; // Don't track delays in warmup
                        try {
                            await (workloadFn as any)(dummyMeasureLatency, 0, dummyTrackDelay);
                        } catch {
                            try {
                                await (workloadFn as any)(dummyMeasureLatency);
                            } catch {
                                // If it fails, try without any parameters
                                await (workloadFn as () => Promise<void>)();
                            }
                        }
                    } else {
                        await (workloadFn as () => Promise<void>)();
                    }
                } catch (error) {
                    debugWarn('Warmup run failed:', error);
                }
                // Wait between warmup runs to allow state to stabilize
                await new Promise((resolve) => setTimeout(resolve, 100));
            }

            for (let i = 0; i < runs; i++) {
                // Create a NEW render counter for each run to ensure isolation
                // This prevents accumulation across runs and ensures accurate counts
                const runRenderCounter = createRenderCounter();
                const fpsMeter = createFpsMeter();
                const latencies: number[] = [];

                // Track artificial delays to subtract from executionTime
                let artificialDelayMs = 0;

                // Force garbage collection if available (Chrome DevTools only)
                // Wait longer and measure multiple times for stability
                if ('gc' in window && typeof (window as any).gc === 'function') {
                    (window as any).gc();
                    await new Promise((resolve) => setTimeout(resolve, 150));
                    // Take multiple memory samples and use median for stability
                    const memorySamples: number[] = [];
                    for (let s = 0; s < 3; s++) {
                        memorySamples.push(getMemoryUsage());
                        await new Promise((resolve) => setTimeout(resolve, 10));
                    }
                }

                // Start measurements
                // NOTE: FPS meter will be started AFTER workload begins to avoid counting cold frames
                // Measure memory multiple times and use median (excluded from executionTime)
                const startMemorySamples: number[] = [];
                for (let s = 0; s < 3; s++) {
                    startMemorySamples.push(getMemoryUsage());
                    await new Promise((resolve) => setTimeout(resolve, 5));
                }
                startMemorySamples.sort((a, b) => a - b);
                const startMemory = startMemorySamples[Math.floor(startMemorySamples.length / 2)]; // median
                const startTime = performance.now();

                // Helper to measure individual operation latency
                // Mode 1: With RAF wait (for visual latency measurement)
                // Mode 2: Without RAF wait (for state update speed measurement - reveals adapter differences)
                const measureLatency = async (
                    fn: () => void | Promise<void>,
                    waitForPaint: boolean = true,
                ): Promise<number> => {
                    const start = performance.now();

                    try {
                        // Call the state update
                        await fn();

                        if (waitForPaint) {
                            // Wait for:
                            // 1. React to flush all synchronous updates (microtask queue)
                            // 2. Browser to schedule and execute the paint (RAF)
                            // This gives us the actual latency from update to visual change
                            const waitStart = performance.now();
                            await new Promise<void>((resolve) => {
                                // Microtask ensures all React updates are flushed synchronously
                                Promise.resolve().then(() => {
                                    // Double RAF to ensure paint is complete
                                    requestAnimationFrame(() => {
                                        requestAnimationFrame(() => {
                                            resolve();
                                        });
                                    });
                                });
                            });
                            // Subtract only expected scheduling/paint overhead (cap to ~2 frames)
                            const schedWait = performance.now() - waitStart;
                            const capMs = 34; // ~2 frames at 60Hz
                            artificialDelayMs += Math.min(Math.max(0, schedWait), capMs);
                        } else {
                            // Wait for React to flush updates (at least one microtask + one RAF)
                            // This ensures state updates are processed even if we don't wait for paint
                            const waitStart = performance.now();
                            await new Promise<void>((resolve) => {
                                Promise.resolve().then(() => {
                                    requestAnimationFrame(() => {
                                        resolve();
                                    });
                                });
                            });
                            // Subtract only nominal scheduling wait (cap to ~1 frame)
                            const schedWait = performance.now() - waitStart;
                            const capMs = 17; // ~1 frame at 60Hz
                            artificialDelayMs += Math.min(Math.max(0, schedWait), capMs);
                        }
                    } catch (error) {
                        debugWarn('Error in measureLatency:', error);
                    }

                    const latency = performance.now() - start;
                    if (Number.isFinite(latency) && latency >= 0 && latency < 1_000_000) {
                        latencies.push(latency);
                    }
                    return latency;
                };

                // Wrap workload execution with render counter context
                // This ensures only renders during workload are counted
                const workloadWithContext = async () => {
                    // Start FPS meter AFTER counter is set up, just before real work begins
                    fpsMeter.start();

                    // Run workload - always pass measureLatency, runNum, and trackDelay
                    await workloadFn(measureLatency, i, (ms) => {
                        artificialDelayMs += ms;
                    });
                };

                // Execute workload - render counter is set via global variable so useCounterKey can access it
                // Use unique key per run to avoid race conditions
                const benchmarkCounterKey = `__benchmarkRenderCounter_${Date.now()}_${i}_${Math.random()}`;
                (window as any)[benchmarkCounterKey] = runRenderCounter;

                let workloadError: Error | null = null;
                let measuredFps = 0;
                let fpsStopped = false;
                try {
                    await workloadWithContext();
                } catch (error) {
                    workloadError = error instanceof Error ? error : new Error(String(error));
                    throw error;
                } finally {
                    // Always stop FPS meter if it wasn't stopped yet (handles errors too)
                    if (!fpsStopped) {
                        try {
                            measuredFps = fpsMeter.stop();
                            fpsStopped = true;
                        } catch (e) {
                            debugWarn('Error stopping FPS meter:', e);
                        }
                    }
                    // Clean up counter reference
                    delete (window as any)[benchmarkCounterKey];
                }

                // Wait for React to finish rendering all updates before measuring
                // This ensures all renders are counted
                await new Promise<void>((resolve) => {
                    Promise.resolve().then(() => {
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                resolve();
                            });
                        });
                    });
                });

                // Measure end memory BEFORE stopping measurements to avoid adding delay to executionTime
                // Measure multiple times and use median for stability
                const endMemorySamples: number[] = [];
                for (let s = 0; s < 3; s++) {
                    endMemorySamples.push(getMemoryUsage());
                    if (s < 2) {
                        // Small delay between samples, but this happens BEFORE endTime
                        await new Promise((resolve) => setTimeout(resolve, 2));
                    }
                }
                endMemorySamples.sort((a, b) => a - b);
                const endMemory = endMemorySamples[Math.floor(endMemorySamples.length / 2)]; // median

                // Now measure end time after all measurements are done
                const endTime = performance.now();
                if (!fpsStopped) {
                    measuredFps = fpsMeter.stop();
                    fpsStopped = true;
                }

                // Calculate actual execution time by subtracting artificial delays
                const rawExecutionTime = endTime - startTime;
                const actualExecutionTime = Math.max(0, rawExecutionTime - artificialDelayMs);

                // Important: executionTime includes ALL time including await delays and setTimeout
                // FPS measures frame rate during the entire execution period
                // High FPS means smooth rendering (many frames rendered), but executionTime
                // can still be higher if the workload includes intentional delays (like setTimeout(50))
                // This is CORRECT behavior:
                // - FPS = rendering smoothness/quality (higher is better)
                // - ExecutionTime = total operation duration including all waits (lower is better)
                // Example: A test with setTimeout(50) will have executionTime >= 50ms,
                // but can still have high FPS if rendering is smooth during that time

                // Memory measurement: We measure the CHANGE in memory during workload execution,
                // not the total memory footprint. This shows:
                // - Redux: Higher overhead from action objects, selector caches
                // - Zustand: Minimal overhead, direct state updates
                // Note: Store creation happens BEFORE measurements, so baseline memory is excluded
                const rawRenderCount = Object.values(runRenderCounter.get()).reduce(
                    (a, b) => a + b,
                    0,
                );
                // Use absolute values to avoid negative memory (due to GC)
                // Report peak memory usage, not delta
                const rawMemory = Math.max(0, endMemory - startMemory);
                const validatedLatencies = latencies.filter(
                    (l) => Number.isFinite(l) && l >= 0 && l < 1_000_000, // Sanity check: < 1 second
                );

                // Validate all metrics
                if (actualExecutionTime < 0 || !Number.isFinite(actualExecutionTime)) {
                    debugWarn(
                        `Invalid executionTime: ${actualExecutionTime}, using raw: ${rawExecutionTime}`,
                    );
                }

                const metrics: BenchmarkMetrics = {
                    executionTime:
                        Number.isFinite(actualExecutionTime) && actualExecutionTime >= 0
                            ? actualExecutionTime
                            : Math.max(0, rawExecutionTime - artificialDelayMs),
                    renderCount:
                        Number.isFinite(rawRenderCount) && rawRenderCount >= 0
                            ? Math.round(rawRenderCount)
                            : 0,
                    memoryUsage:
                        Number.isFinite(rawMemory) && rawMemory >= 0 && rawMemory < 10000
                            ? rawMemory
                            : endMemory > 0
                              ? endMemory
                              : 0, // Use endMemory if delta is invalid
                    fps:
                        Number.isFinite(measuredFps) && measuredFps >= 0 && measuredFps <= 1000
                            ? measuredFps
                            : 0,
                    latency: validatedLatencies,
                    timestamp: Date.now(),
                    adapter,
                    scenario,
                };

                scenarioResults.push(metrics);

                // Wait between runs
                await new Promise((resolve) => setTimeout(resolve, 100));
            }

            // Helper function to calculate median (more robust for small samples)
            function calculateMedian(values: number[]): number {
                if (values.length === 0) return 0;
                if (values.length === 1) return values[0];
                const sorted = [...values].sort((a, b) => a - b);
                const mid = Math.floor(sorted.length / 2);
                return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
            }

            // Helper function to remove outliers using IQR method
            // Only use for larger samples (>=7), otherwise use all values or median
            function removeOutliers(values: number[]): number[] {
                if (values.length < 7) {
                    // For small samples, don't remove outliers - use all values
                    // The median calculation will handle outliers naturally
                    return values;
                }
                const sorted = [...values].sort((a, b) => a - b);
                const q1Index = Math.floor(sorted.length * 0.25);
                const q3Index = Math.floor(sorted.length * 0.75);
                const q1 = sorted[q1Index];
                const q3 = sorted[q3Index];
                const iqr = q3 - q1;
                // Use a more conservative bound (2.0 * IQR instead of 1.5) to avoid removing too many values
                const lowerBound = q1 - 2.0 * iqr;
                const upperBound = q3 + 2.0 * iqr;
                return values.filter((v) => v >= lowerBound && v <= upperBound);
            }

            // Validate that we have enough valid results
            const validResults = scenarioResults.filter(
                (r) =>
                    Number.isFinite(r.executionTime) &&
                    Number.isFinite(r.renderCount) &&
                    Number.isFinite(r.fps),
            );

            if (validResults.length < 3) {
                debugWarn(
                    `Warning: Only ${validResults.length} valid results out of ${scenarioResults.length} runs for ${scenario}/${adapter}. Results may be unreliable.`,
                );
            }

            // For small samples, use median (more robust to outliers)
            // For larger samples, use mean after outlier removal
            const useMedian = validResults.length < 7;

            // Calculate averages with outlier removal for execution time and render count
            const executionTimesRaw = validResults.map((r) => r.executionTime);
            const renderCountsRaw = validResults.map((r) => r.renderCount);
            const executionTimes = useMedian
                ? executionTimesRaw
                : removeOutliers(executionTimesRaw);
            const renderCounts = useMedian ? renderCountsRaw : removeOutliers(renderCountsRaw);

            const memoryUsages = validResults
                .map((r) => r.memoryUsage)
                .filter((m) => Number.isFinite(m));
            const fpsValues = validResults
                .map((r) => r.fps)
                .filter((f) => Number.isFinite(f) && f >= 0 && f <= 1000);
            const allLatencies = validResults
                .flatMap((r) => r.latency)
                .filter((l) => Number.isFinite(l) && l >= 0);

            const average: BenchmarkResult['average'] = {
                executionTime:
                    executionTimes.length > 0
                        ? useMedian
                            ? calculateMedian(executionTimes)
                            : executionTimes.reduce((sum, r) => sum + r, 0) / executionTimes.length
                        : 0,
                renderCount:
                    renderCounts.length > 0
                        ? useMedian
                            ? calculateMedian(renderCounts)
                            : renderCounts.reduce((sum, r) => sum + r, 0) / renderCounts.length
                        : 0,
                memoryUsage:
                    memoryUsages.length > 0
                        ? memoryUsages.reduce((sum, r) => sum + r, 0) / memoryUsages.length
                        : 0,
                fps:
                    fpsValues.length > 0
                        ? fpsValues.reduce((sum, r) => sum + r, 0) / fpsValues.length
                        : 0,
                latency: {
                    p50: allLatencies.length >= 1 ? calculatePercentile(allLatencies, 50) : 0,
                    p95: allLatencies.length >= 2 ? calculatePercentile(allLatencies, 95) : 0,
                    p99: allLatencies.length >= 3 ? calculatePercentile(allLatencies, 99) : 0,
                },
            };

            const result: BenchmarkResult = {
                scenario,
                adapter,
                runs: scenarioResults,
                average,
                timestamp: Date.now(),
            };

            results.push(result);
            return result;
        },

        getResults(): BenchmarkResult[] {
            return [...results];
        },

        clearResults() {
            results.length = 0;
        },

        compareResults(scenario: string): BenchmarkResult[] {
            return results.filter((r) => r.scenario === scenario);
        },
    };
}

const benchmarkRunner = createBenchmarkRunner();

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

/**
 * Calculate median (helper function)
 */
function calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    if (values.length === 1) return values[0];
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
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

// Component for rendering card preview in ids-based mode
const CardPreviewById: React.FC<{ adapter: StoreAdapter; cardId: ID }> = ({ adapter, cardId }) => {
    const card = (adapter.hooks as any).useCardById(cardId);
    if (!card) return null;
    return <CardPreview adapter={adapter} card={card} />;
};

// DeckRowBase for ids-based mode
const DeckRowBase: React.FC<{
    adapter: StoreAdapter;
    deckId: string;
    style: React.CSSProperties;
}> = ({ adapter, deckId, style }) => {
    useCounterKey('DeckRow');
    const deck = adapter.hooks.useDeckById(deckId);
    const cardIds = (adapter.hooks as any).useCardIdsByDeckId(deckId) as ID[];

    if (!deck) {
        return <div style={style}>Loading...</div>;
    }

    return (
        <div style={styles.deckRowStyles.container(style)}>
            <div style={styles.deckRowStyles.header}>
                <strong>{deck.title}</strong>
                <small>{cardIds.length} cards</small>
            </div>
            <div style={styles.deckRowStyles.cardsContainer}>
                {cardIds.slice(0, 10).map((cardId) => (
                    <CardPreviewById key={cardId} adapter={adapter} cardId={cardId} />
                ))}
            </div>
        </div>
    );
};
const DeckRow = DeckRowBase;

// Component for rendering comment in ids-based mode
const CommentPreviewById: React.FC<{ adapter: StoreAdapter; commentId: ID }> = ({
    adapter,
    commentId,
}) => {
    const comment = (adapter.hooks as any).useCommentById(commentId);
    if (!comment) return null;
    return <div style={styles.cardPreviewStyles.comment}>{comment.text}</div>;
};

// CardPreviewBase for ids-based mode
const CardPreviewBase: React.FC<{ adapter: StoreAdapter; card: Card }> = ({ adapter, card }) => {
    useCounterKey('CardPreview');
    const commentIds = (adapter.hooks as any).useCommentIdsByCardId(card.id) as ID[];

    return (
        <div style={styles.cardPreviewStyles.container}>
            <div>
                <strong>{card.title}</strong>
            </div>
            <div style={styles.cardPreviewStyles.description}>{card.description}</div>
            <div style={styles.cardPreviewStyles.commentsContainer}>
                {commentIds.slice(0, 2).map((commentId) => (
                    <CommentPreviewById key={commentId} adapter={adapter} commentId={commentId} />
                ))}
            </div>
        </div>
    );
};
const CardPreview = CardPreviewBase;

// Define component implementations first
// CardItem for ids-based mode - receives cardId and uses selectors
const CardItemBase: React.FC<{ cardId: string }> = ({ cardId }) => {
    useCounterKey('CardItem');
    const ctx = useContext(AdapterContext);
    if (!ctx) throw new Error('Adapter context not found');

    const card = (ctx.adapter.hooks as any).useCardById(cardId) as Card | undefined;
    const commentIds = (ctx.adapter.hooks as any).useCommentIdsByCardId(cardId) as ID[];

    if (!card) return <div>Loading card...</div>;
    // Read updatedAt to ensure UI depends on the field mutated in bulk updates
    const lastUpdatedAt = card.updatedAt;

    return (
        <div
            style={styles.cardItemStyles.container}
            onMouseEnter={styles.hoverHandlers.cardItem.onEnter}
            onMouseLeave={styles.hoverHandlers.cardItem.onLeave}
        >
            <div style={styles.cardItemStyles.title}>{card.title}</div>
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
                <CommentItemBase key={commentId} commentId={commentId} />
            ))}
        </div>
    );
};

// CommentItem for ids-based mode - receives commentId and fetches via selector
const CommentItemBase: React.FC<{ commentId: string }> = ({ commentId }) => {
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

const CommentItem: React.FC<{ commentId: string }> = React.memo(({ commentId }) => {
    return <CommentItemBase commentId={commentId} />;
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

const SidePanel: React.FC<{ adapter: StoreAdapter }> = ({ adapter }) => {
    useCounterKey('SidePanel');
    const [text, setText] = useState('');

    const handleTextChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setText(e.target.value);
    }, []);

    const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
        e.currentTarget.style.borderColor = styles.colors.primary;
        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
    }, []);

    const handleBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
        e.currentTarget.style.borderColor = styles.colors.gray[500];
        e.currentTarget.style.boxShadow = 'none';
    }, []);

    return (
        <div style={styles.sidePanelStyles.container}>
            <div style={styles.sidePanelStyles.title}>💬 Inline Comment Composer</div>
            <input
                style={styles.sidePanelStyles.input}
                value={text}
                onChange={handleTextChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholder="Type here to stress updates..."
            />
        </div>
    );
};

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
                            Click the <strong>"✏️ Edit"</strong> button next to any comment in the
                            cards and try to quickly edit the text. You'll notice that some state
                            managers show noticeable lag during fast input, while others work
                            smoothly. <strong>This is a real reactivity test</strong> - switch
                            between different state managers and compare!
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

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
                cardsPerDeck: 10,
                minCommentsPerCard: 3,
                maxCommentsPerCard: 5,
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
                        // Wait for React to fully update - use RAF chain to ensure renders complete
                        await new Promise((resolve) => {
                            Promise.resolve().then(() => {
                                requestAnimationFrame(() => {
                                    requestAnimationFrame(() => {
                                        setTimeout(resolve, 150); // Longer wait for full stabilization
                                    });
                                });
                            });
                        });
                        // Update actions reference after switch
                        await new Promise((resolve) => setTimeout(resolve, 50));
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
                await new Promise((resolve) => setTimeout(resolve, 50));
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

            // Reset render counters AFTER adapter switch but BEFORE benchmark starts
            // This ensures we only measure the actual benchmark workload, not adapter switching
            globalRenderCounter.reset();

            // Wait one more frame to ensure all switch renders are complete
            await new Promise((resolve) => requestAnimationFrame(resolve));

            // Now run benchmark - this will create its own runRenderCounter
            let result: BenchmarkResult;
            switch (targetScenario) {
                case 'background-churn':
                    result = await benchmarkRunner.runBenchmark(
                        'background-churn',
                        targetAdapter.name,
                        async (measureLatency, runNum, trackDelay) => {
                            // Measure latency of backgroundChurnStart
                            const latency = await measureLatency(
                                async () => {
                                    currentActions.backgroundChurnStart();
                                },
                                false, // Don't wait for paint
                            );

                            // Track artificial delay
                            const delayStart = performance.now();
                            await new Promise((resolve) => setTimeout(resolve, 50));
                            currentActions.backgroundChurnStop();
                            const delayEnd = performance.now();
                            if (trackDelay) {
                                trackDelay(delayEnd - delayStart);
                            }
                        },
                        10,
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
                        async (measureLatency, runNum) => {
                            const testCommentId =
                                testComments[runNum % testComments.length]?.id || commentId;
                            const runPrefix = `Run${runNum}_`;
                            const baseTimestamp = Date.now();
                            for (let j = 0; j < 20; j++) {
                                await measureLatency(async () => {
                                    currentActions.updateCommentText(
                                        testCommentId,
                                        `${runPrefix}Typing update ${j} at ${baseTimestamp + j}`,
                                    );
                                }, false);
                            }
                        },
                        10,
                    );
                    break;
                case 'bulk-update':
                    if (cardIds.length === 0) {
                        throw new Error('No cards available for bulk-update test');
                    }
                    result = await benchmarkRunner.runBenchmark(
                        'bulk-update',
                        targetAdapter.name,
                        async (measureLatency, runNum, trackDelay) => {
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
                                    await measureLatency(async () => {
                                        currentActions.bulkToggleTagOnCards(subset, tagId);
                                    }, false);
                                    if (i < 4 && trackDelay) {
                                        const delayStart = performance.now();
                                        await new Promise((resolve) => setTimeout(resolve, 3));
                                        trackDelay(performance.now() - delayStart);
                                    }
                                }
                            }
                            currentActions.backgroundChurnStart();
                            if (trackDelay) {
                                const delayStart = performance.now();
                                await new Promise((resolve) => setTimeout(resolve, 40));
                                trackDelay(performance.now() - delayStart);
                            }
                        },
                        10,
                    );
                    break;
                default:
                    throw new Error(`Unknown scenario: ${targetScenario}`);
            }

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
                                        <div style={{ fontWeight: 'bold', marginBottom: '12px' }}>
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
                                                                ... and {result.errors.length - 2}{' '}
                                                                more errors
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
                                    ⚠️ <strong>Important:</strong> Please do not minimize or switch
                                    browser tabs during testing. This may affect performance
                                    measurements and accuracy of results.
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
                                />
                                <div style={styles.appLayoutStyles.contentArea}>
                                    <DeckList adapter={adapter} />
                                    <HeatmapOverlay />
                                </div>
                            </>
                        )}
                    </div>
                </div>
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
        const result = await benchmarkRunner.runBenchmark(
            'background-churn',
            adapter.name,
            async (measureLatency, runNum, trackDelay) => {
                // Measure latency of background churn trigger (no paint wait, to capture adapter speed)
                await measureLatency(async () => {
                    actions.backgroundChurnStart();
                }, false);

                // Keep the same artificial delay so executionTime aligns with automation
                const delayStart = performance.now();
                await new Promise((resolve) => setTimeout(resolve, 50));
                actions.backgroundChurnStop();
                const delayEnd = performance.now();
                if (trackDelay) trackDelay(delayEnd - delayStart);
            },
            10,
        );
        debugLog(`✅ Update Benchmark Results - ${adapter.name}:`, result);
        onBenchmarkComplete(result);
    }, [adapter.name, actions, onBenchmarkComplete]);

    const runInlineEditBenchmark = useCallback(async () => {
        debugLog(`✏️ Starting Inline Edit Benchmark for ${adapter.name}...`);
        const availableCommentIds = firstCardCommentIds.slice(0, 5);
        if (availableCommentIds.length === 0) {
            debugWarn('No comments available for inline edit benchmark');
            return;
        }
        const result = await benchmarkRunner.runBenchmark(
            'inline-editing',
            adapter.name,
            async (measureLatency, runNum) => {
                const commentId = availableCommentIds[runNum % availableCommentIds.length];
                if (!commentId) return;
                const runPrefix = `Run${runNum}_`;
                const baseTimestamp = Date.now();
                for (let i = 0; i < 20; i++) {
                    const uniqueTimestamp = baseTimestamp + i;
                    await measureLatency(async () => {
                        actions.updateCommentText(
                            commentId,
                            `${runPrefix}Typing update ${i} at ${uniqueTimestamp}: testing reactivity to frequent state changes`,
                        );
                    }, false);
                }
            },
            10,
        );
        debugLog(`✅ Inline Edit Benchmark Results - ${adapter.name}:`, result);
        onBenchmarkComplete(result);
    }, [adapter.name, actions, firstCardCommentIds, onBenchmarkComplete]);

    const runBulkUpdateBenchmark = useCallback(async () => {
        debugLog(`📦 Starting Bulk Update Benchmark for ${adapter.name}...`);

        // Use more cards to ensure variety - take different subset for different operations
        const allAvailableCards = allCardsForBulk.slice(0, 15);

        if (allAvailableCards.length === 0) {
            debugWarn('No cards available for bulk update benchmark');
            return;
        }

        const result = await benchmarkRunner.runBenchmark(
            'bulk-update',
            adapter.name,
            async (measureLatency, runNum, trackDelay) => {
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
                        // Measure latency of bulk toggle (no paint wait)
                        await measureLatency(async () => {
                            actions.bulkToggleTagOnCards(cardSubset, tagId);
                        }, false);
                        // Small delay between operations to allow renders
                        // Note: This delay is tracked as artificial and subtracted from executionTime
                        if (i < 4) {
                            const delayStart = performance.now();
                            await new Promise((resolve) => setTimeout(resolve, 3));
                            const delayEnd = performance.now();
                            if (trackDelay) {
                                trackDelay(delayEnd - delayStart);
                            }
                        }
                    }
                }
                // Trigger card updates (and measure)
                await measureLatency(async () => {
                    actions.backgroundChurnStart();
                }, false);
                const delayStart = performance.now();
                await new Promise((resolve) => setTimeout(resolve, 40));
                const delayEnd = performance.now();
                if (trackDelay) {
                    trackDelay(delayEnd - delayStart);
                }
            },
            10,
        );

        debugLog(`✅ Bulk Update Benchmark Results - ${adapter.name}:`, result);
        onBenchmarkComplete(result);
    }, [adapter.name, actions, allCardsForBulk, onBenchmarkComplete]);

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
                // Give React time to remount Provider and hooks
                await new Promise((resolve) => requestAnimationFrame(resolve));
                await new Promise((resolve) => requestAnimationFrame(resolve));
                // Use actions from the live context (UI tree)
                const uiActions = (window as any).__currentActions || actions;
                const uiAdapter = (window as any).__currentAdapter || target;
                // Reset render counter after switch and before measurements
                globalRenderCounter.reset();
                await new Promise((resolve) => requestAnimationFrame(resolve));

                // Run Update Benchmark
                setCurrentProgress(
                    `📦 ${uiAdapter.name} (${adapterProgress}) | 🔄 Running Update Benchmark...`,
                );
                debugLog(`  🔄 Running Update Benchmark for ${uiAdapter.name}...`);
                const updateResult = await benchmarkRunner.runBenchmark(
                    'background-churn',
                    uiAdapter.name,
                    async (measureLatency, runNum, trackDelay) => {
                        const delayStart = performance.now();
                        uiActions.backgroundChurnStart();
                        await new Promise((resolve) => setTimeout(resolve, 50));
                        uiActions.backgroundChurnStop();
                        const delayEnd = performance.now();
                        const artificialDelay = delayEnd - delayStart;
                        if (trackDelay && artificialDelay > 0) {
                            trackDelay(artificialDelay);
                        }
                    },
                    10,
                );
                onBenchmarkComplete(updateResult);
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
                        async (measureLatency, runNum) => {
                            // Use different comment for each run to ensure fresh data
                            const testCommentId =
                                testCommentIds[runNum % testCommentIds.length] || commentId;
                            // Pre-compute unique timestamps to ensure variety within run
                            const runPrefix = `Run${runNum}_`;
                            const baseTimestamp = Date.now();

                            // Real performance test: rapid updates WITHOUT artificial delays or RAF synchronization
                            // Previous version synchronized all adapters to ~60fps, hiding differences
                            for (let j = 0; j < 20; j++) {
                                const uniqueTimestamp = baseTimestamp + j;
                                // Measure state update speed WITHOUT waiting for paint
                                // This reveals which adapters actually update faster
                                await measureLatency(
                                    async () => {
                                        uiActions.updateCommentText(
                                            testCommentId,
                                            `${runPrefix}Typing update ${j} at ${uniqueTimestamp}: testing reactivity to frequent state changes`,
                                        );
                                    },
                                    false, // DON'T wait for paint - measure state update speed
                                );
                                // NO artificial delay - previous 16ms delay hid all differences
                            }
                        },
                        10,
                    );
                    onBenchmarkComplete(editResult);
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
                        async (measureLatency, runNum, trackDelay) => {
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
                                    uiActions.bulkToggleTagOnCards(cardSubset, testTagId);
                                    // Small delay between operations to allow renders
                                    // Note: This delay is tracked as artificial and subtracted from executionTime
                                    if (tagI < 4) {
                                        const delayStart = performance.now();
                                        await new Promise((resolve) => setTimeout(resolve, 3));
                                        const delayEnd = performance.now();
                                        if (trackDelay) {
                                            trackDelay(delayEnd - delayStart);
                                        }
                                    }
                                }
                            }
                            // Trigger card updates to ensure CardItem components re-render
                            // backgroundChurnStart updates updatedAt with Date.now() which is always different
                            uiActions.backgroundChurnStart();
                            const delayStart = performance.now();
                            await new Promise((resolve) => setTimeout(resolve, 40));
                            const delayEnd = performance.now();
                            if (trackDelay) {
                                trackDelay(delayEnd - delayStart);
                            }
                        },
                        10,
                    );
                    onBenchmarkComplete(bulkResult);
                    await new Promise((resolve) => setTimeout(resolve, 300));
                }

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
