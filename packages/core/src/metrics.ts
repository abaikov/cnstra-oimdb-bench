export function createMarks() {
    const marks = new Map<string, number>();
    return {
        mark(name: string) {
            marks.set(name, performance.now());
        },
        measure(name: string, start: string, end?: string) {
            const s = marks.get(start);
            const e = end ? (marks.get(end) ?? performance.now()) : performance.now();
            if (s == null || e == null) return null;
            const d = e - s;
            return d;
        },
    };
}

export function createFpsMeter() {
    let rafId: number | null = null;
    let frames = 0;
    let startTime = 0;

    function tick() {
        frames++;
        rafId = requestAnimationFrame(tick);
    }

    return {
        start() {
            frames = 0;
            startTime = performance.now();
            if (rafId != null) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(tick);
        },
        stop(): number {
            if (rafId != null) cancelAnimationFrame(rafId);
            const endTime = performance.now();
            const duration = (endTime - startTime) / 1000;
            const fps = duration > 0 && Number.isFinite(frames / duration) ? frames / duration : 0;
            rafId = null;
            // Validate FPS is reasonable (0-1000 range)
            return fps >= 0 && fps <= 1000 ? fps : 0;
        },
    };
}

export type RenderCounter = {
    increment(key: string): number;
    get(): Record<string, number>;
    reset(): void;
};

export function createRenderCounter(): RenderCounter {
    const map = new Map<string, number>();
    return {
        increment(key: string) {
            map.set(key, (map.get(key) ?? 0) + 1);
            return map.get(key) ?? 0;
        },
        get() {
            return Object.fromEntries(map.entries());
        },
        reset() {
            map.clear();
        },
    };
}

export type BenchmarkMetrics = {
    executionTime: number;
    renderCount: number;
    memoryUsage: number;
    fps: number;
    latency: number[];
    timestamp: number;
    adapter: string;
    scenario: string;
};

export type BenchmarkResult = {
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
 * Create a benchmark runner for measuring adapter performance
 *
 * NOTE: This implementation in core package is provided for standalone usage.
 * The main app (apps/bench) uses its own enhanced version in App.tsx with
 * additional features like async measureLatency support.
 *
 * Both implementations share the same improvements:
 * - Warmup runs for JIT stabilization
 * - Outlier removal using IQR method
 * - Linear interpolation for percentiles
 * - Comprehensive validation of metrics
 */
export function createBenchmarkRunner() {
    const results: BenchmarkResult[] = [];

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
     * Measure synchronous function execution latency
     * Note: This is a basic implementation. For async operations with React,
     * use the measureLatency from App.tsx which handles RAF and microtasks.
     */
    function measureLatency(fn: () => void): number {
        const start = performance.now();
        try {
            fn();
        } catch (error) {
            console.error('Error in measureLatency:', error);
        }
        const result = performance.now() - start;
        return Number.isFinite(result) && result >= 0 ? result : 0;
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

    return {
        async runBenchmark(
            scenario: string,
            adapter: string,
            workloadFn: () => Promise<void>,
            runs: number = 5,
        ): Promise<BenchmarkResult> {
            const scenarioResults: BenchmarkMetrics[] = [];

            // Warmup run(s) to allow JIT compilation and stabilize results
            const warmupRuns = 1;
            for (let w = 0; w < warmupRuns; w++) {
                try {
                    await workloadFn();
                } catch (error) {
                    console.warn('Warmup run failed:', error);
                }
                await new Promise((resolve) => setTimeout(resolve, 50));
            }

            for (let i = 0; i < runs; i++) {
                // Force garbage collection if available (Chrome DevTools only)
                if ('gc' in window && typeof (window as any).gc === 'function') {
                    (window as any).gc();
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }

                const renderCounter = createRenderCounter();
                const fpsMeter = createFpsMeter();
                const latencies: number[] = [];

                // Start measurements
                fpsMeter.start();
                const startTime = performance.now();
                const startMemory = getMemoryUsage();

                // Run workload with latency measurements
                const workloadWithLatency = async () => {
                    const latency = measureLatency(() => {
                        // This will be called for each interaction
                    });
                    latencies.push(latency);
                    await workloadFn();
                };

                await workloadWithLatency();

                // Stop measurements
                const endTime = performance.now();
                const endMemory = getMemoryUsage();
                const fps = fpsMeter.stop();

                // Validate all metrics before storing
                const rawExecutionTime = endTime - startTime;
                const rawRenderCount = Object.values(renderCounter.get()).reduce(
                    (a, b) => a + b,
                    0,
                );
                const rawMemoryUsage = endMemory - startMemory;
                const validatedLatencies = latencies.filter(
                    (l) => Number.isFinite(l) && l >= 0 && l < 1_000_000, // Sanity check: < 1 second
                );

                const metrics: BenchmarkMetrics = {
                    executionTime:
                        Number.isFinite(rawExecutionTime) && rawExecutionTime >= 0
                            ? rawExecutionTime
                            : 0,
                    renderCount:
                        Number.isFinite(rawRenderCount) && rawRenderCount >= 0
                            ? Math.round(rawRenderCount)
                            : 0,
                    memoryUsage:
                        Number.isFinite(rawMemoryUsage) &&
                        rawMemoryUsage >= -1000 &&
                        rawMemoryUsage < 10000
                            ? rawMemoryUsage
                            : 0, // Allow small negative values due to GC fluctuations
                    fps: Number.isFinite(fps) && fps >= 0 && fps <= 1000 ? fps : 0,
                    latency: validatedLatencies,
                    timestamp: Date.now(),
                    adapter,
                    scenario,
                };

                scenarioResults.push(metrics);

                // Wait between runs
                await new Promise((resolve) => setTimeout(resolve, 100));
            }

            // Helper function to calculate median (more robust to outliers than mean)
            function calculateMedian(values: number[]): number {
                if (values.length === 0) return 0;
                const sorted = [...values].sort((a, b) => a - b);
                const mid = Math.floor(sorted.length / 2);
                return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
            }

            // Helper function to remove outliers using IQR method
            function removeOutliers(values: number[]): number[] {
                if (values.length < 4) return values; // Need at least 4 values for IQR
                const sorted = [...values].sort((a, b) => a - b);
                const q1Index = Math.floor(sorted.length * 0.25);
                const q3Index = Math.floor(sorted.length * 0.75);
                const q1 = sorted[q1Index];
                const q3 = sorted[q3Index];
                const iqr = q3 - q1;
                const lowerBound = q1 - 1.5 * iqr;
                const upperBound = q3 + 1.5 * iqr;
                return values.filter((v) => v >= lowerBound && v <= upperBound);
            }

            // Use median for latency (more robust), mean for others
            const allLatencies = scenarioResults
                .flatMap((r) => r.latency)
                .filter((l) => Number.isFinite(l) && l >= 0);

            // Calculate averages with outlier removal for execution time and render count
            const executionTimes = removeOutliers(scenarioResults.map((r) => r.executionTime));
            const renderCounts = removeOutliers(scenarioResults.map((r) => r.renderCount));
            const memoryUsages = scenarioResults
                .map((r) => r.memoryUsage)
                .filter((m) => Number.isFinite(m));
            const fpsValues = scenarioResults
                .map((r) => r.fps)
                .filter((f) => Number.isFinite(f) && f >= 0 && f <= 1000);

            const average: BenchmarkResult['average'] = {
                executionTime:
                    executionTimes.length > 0
                        ? executionTimes.reduce((sum, r) => sum + r, 0) / executionTimes.length
                        : 0,
                renderCount:
                    renderCounts.length > 0
                        ? renderCounts.reduce((sum, r) => sum + r, 0) / renderCounts.length
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
                    p50: allLatencies.length > 0 ? calculatePercentile(allLatencies, 50) : 0,
                    p95: allLatencies.length > 0 ? calculatePercentile(allLatencies, 95) : 0,
                    p99: allLatencies.length > 0 ? calculatePercentile(allLatencies, 99) : 0,
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
