import {
    createRenderCounter,
    createFpsMeter,
    type BenchmarkMetrics,
    type BenchmarkResult,
} from '@bench/core';

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

/**
 * Calculate median (more robust for small samples)
 */
export function calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    if (values.length === 1) return values[0];
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Remove outliers using IQR method
 * Only use for larger samples (>=7), otherwise use all values or median
 */
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

/**
 * Helper to measure memory multiple times and get median for stability
 */
async function measureMemoryMedian(samples: number = 3, delayMs: number = 5): Promise<number> {
    const samplesArray: number[] = [];
    for (let s = 0; s < samples; s++) {
        samplesArray.push(getMemoryUsage());
        if (s < samples - 1) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }
    samplesArray.sort((a, b) => a - b);
    return samplesArray[Math.floor(samplesArray.length / 2)]; // median
}

/**
 * Wait for React to flush updates and paint to complete
 */
async function waitForPaintCompletion(doubleRaf: boolean = true): Promise<number> {
    const waitStart = performance.now();
    await new Promise<void>((resolve) => {
        // Microtask ensures all React updates are flushed synchronously
        Promise.resolve().then(() => {
            if (doubleRaf) {
                // Double RAF to ensure paint is complete
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        resolve();
                    });
                });
            } else {
                requestAnimationFrame(() => {
                    resolve();
                });
            }
        });
    });
    return performance.now() - waitStart;
}

export interface BenchmarkRunnerOptions {
    debugWarn?: (message: string, ...args: any[]) => void;
    runs?: number;
    warmupRuns?: number;
    warmupDelayMs?: number; // delay between warmup runs
    interRunDelayMs?: number; // delay between measured runs
    enableGC?: boolean; // attempt GC between runs if available
    gcDelayMs?: number; // delay after GC
    memorySamples?: number; // number of samples for memory median
    memorySampleDelayMs?: number; // delay between memory samples
    paintWaitCapMs?: number; // cap for subtracting paint scheduling when waiting for paint
    paintWaitNoPaintCapMs?: number; // cap for non-paint wait
}

/**
 * Create an enhanced benchmark runner with async latency measurement and action wrapping
 */
export function createBenchmarkRunner<A extends object = any>(
    options: BenchmarkRunnerOptions = {},
) {
    const results: BenchmarkResult[] = [];
    const debugWarn = options.debugWarn || console.warn.bind(console);
    const defaultRuns = options.runs ?? 10;
    const warmupRuns = options.warmupRuns ?? 1;
    const warmupDelayMs = options.warmupDelayMs ?? 100;
    const interRunDelayMs = options.interRunDelayMs ?? 100;
    const enableGC = options.enableGC ?? true;
    const gcDelayMs = options.gcDelayMs ?? 150;
    const memorySamples = options.memorySamples ?? 3;
    const memorySampleDelayMs = options.memorySampleDelayMs ?? 10;
    const paintWaitCapMs = options.paintWaitCapMs ?? 34; // ~2 frames at 60Hz
    const paintWaitNoPaintCapMs = options.paintWaitNoPaintCapMs ?? 17; // ~1 frame at 60Hz

    return {
        async runBenchmark(
            scenario: string,
            adapter: string,
            actions: A, // Actions to wrap with automatic latency measurement
            workloadFn: (actions: A, runNum: number) => Promise<void>,
            runs: number = defaultRuns,
        ): Promise<BenchmarkResult> {
            const scenarioResults: BenchmarkMetrics[] = [];

            // Warmup run(s) to allow JIT compilation and stabilize results
            // Note: Warmup runs may create side-effects (state changes), but this is acceptable
            // as it simulates real-world usage where adapters are "warmed up" before critical operations
            for (let w = 0; w < warmupRuns; w++) {
                try {
                    // For warmup, create actions that don't measure latency (just execute)
                    const warmupActions = new Proxy(actions as A, {
                        get: (target, prop) => {
                            const original = (target as any)[prop];
                            if (typeof original === 'function') {
                                return async (...args: any[]) => {
                                    await original.apply(target, args);
                                };
                            }
                            return original;
                        },
                    });
                    await workloadFn(warmupActions, 0);
                } catch (error) {
                    debugWarn('Warmup run failed:', error);
                }
                // Wait between warmup runs to allow state to stabilize
                await new Promise((resolve) => setTimeout(resolve, warmupDelayMs));
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
                if (enableGC && 'gc' in window && typeof (window as any).gc === 'function') {
                    (window as any).gc();
                    await new Promise((resolve) => setTimeout(resolve, gcDelayMs));
                    // Take multiple memory samples and use median for stability
                    await measureMemoryMedian(memorySamples, memorySampleDelayMs);
                }

                // Start measurements
                // NOTE: FPS meter will be started AFTER workload begins to avoid counting cold frames
                // Measure memory multiple times and use median (excluded from executionTime)
                const startMemory = await measureMemoryMedian(memorySamples, 5);
                const startTime = performance.now();

                // Helper to measure individual operation latency
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
                            const schedWait = await waitForPaintCompletion(true);
                            // Subtract only expected scheduling/paint overhead
                            artificialDelayMs += Math.min(Math.max(0, schedWait), paintWaitCapMs);
                        } else {
                            // Wait for React to flush updates (at least one microtask + one RAF)
                            // This ensures state updates are processed even if we don't wait for paint
                            const schedWait = await waitForPaintCompletion(false);
                            // Subtract only nominal scheduling wait
                            artificialDelayMs += Math.min(
                                Math.max(0, schedWait),
                                paintWaitNoPaintCapMs,
                            );
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

                // Automatically wrap actions to measure latency for all operations
                const wrappedActions = new Proxy(actions as A, {
                    get: (target, prop) => {
                        const original = (target as any)[prop];
                        if (typeof original === 'function') {
                            return async (...args: any[]) => {
                                // Measure latency for this action call and return original result
                                let out: any;
                                await measureLatency(async () => {
                                    const result = original.apply(target, args);
                                    out = result;
                                    // Handle both sync and async functions
                                    if (result && typeof result.then === 'function') {
                                        await result;
                                    }
                                }, true); // Always wait for paint to measure full latency
                                return out;
                            };
                        }
                        return original;
                    },
                });

                // Wrap workload execution with render counter context
                // This ensures only renders during workload are counted
                const workloadWithContext = async () => {
                    // Start FPS meter AFTER counter is set up, just before real work begins
                    fpsMeter.start();

                    // Run workload with automatically wrapped actions
                    await workloadFn(wrappedActions, i);
                };

                // Execute workload - render counter is set via global variable so useCounterKey can access it
                // Use unique key per run to avoid race conditions
                const benchmarkCounterKey = `__benchmarkRenderCounter_${Date.now()}_${i}_${Math.random()}`;
                (window as any)[benchmarkCounterKey] = runRenderCounter;

                let measuredFps = 0;
                let fpsStopped = false;
                try {
                    await workloadWithContext();
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
                await waitForPaintCompletion(true);

                // Measure end memory BEFORE stopping measurements to avoid adding delay to executionTime
                // Measure multiple times and use median for stability
                const endMemory = await measureMemoryMedian(3, 2);

                // Now measure end time after all measurements are done
                const endTime = performance.now();

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
                await new Promise((resolve) => setTimeout(resolve, interRunDelayMs));
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
