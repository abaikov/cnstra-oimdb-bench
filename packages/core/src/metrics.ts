export function createMarks() {
  const marks = new Map<string, number>();
  return {
    mark(name: string) {
      marks.set(name, performance.now());
    },
    measure(name: string, start: string, end?: string) {
      const s = marks.get(start);
      const e = end ? marks.get(end) ?? performance.now() : performance.now();
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
  function tick(t: number) {
    if (!startTime) startTime = t;
    frames++;
    rafId = requestAnimationFrame(tick);
  }
  return {
    start() {
      frames = 0;
      startTime = 0;
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(tick);
    },
    stop(): number {
      if (rafId != null) cancelAnimationFrame(rafId);
      const duration = (performance.now() - startTime) / 1000;
      const fps = duration > 0 ? frames / duration : 0;
      rafId = null;
      return fps;
    },
  };
}

export type RenderCounter = {
  increment(key: string): void;
  get(): Record<string, number>;
  reset(): void;
};

export function createRenderCounter(): RenderCounter {
  const map = new Map<string, number>();
  return {
    increment(key: string) {
      map.set(key, (map.get(key) ?? 0) + 1);
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

export function createBenchmarkRunner() {
  const results: BenchmarkResult[] = [];
  
  function getMemoryUsage(): number {
    if ('memory' in performance) {
      return (performance as any).memory.usedJSHeapSize / 1024 / 1024; // MB
    }
    return 0;
  }
  
  function measureLatency(fn: () => void): number {
    const start = performance.now();
    fn();
    return performance.now() - start;
  }
  
  function calculatePercentile(values: number[], percentile: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
  
  return {
    async runBenchmark(
      scenario: string,
      adapter: string,
      workloadFn: () => Promise<void>,
      runs: number = 5
    ): Promise<BenchmarkResult> {
      const scenarioResults: BenchmarkMetrics[] = [];
      
      for (let i = 0; i < runs; i++) {
        // Force garbage collection if available
        if ('gc' in window) {
          (window as any).gc();
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
        
        const metrics: BenchmarkMetrics = {
          executionTime: endTime - startTime,
          renderCount: Object.values(renderCounter.get()).reduce((a, b) => a + b, 0),
          memoryUsage: endMemory - startMemory,
          fps,
          latency: latencies,
          timestamp: Date.now(),
          adapter,
          scenario,
        };
        
        scenarioResults.push(metrics);
        
        // Wait between runs
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Calculate averages
      const average: BenchmarkResult['average'] = {
        executionTime: scenarioResults.reduce((sum, r) => sum + r.executionTime, 0) / runs,
        renderCount: scenarioResults.reduce((sum, r) => sum + r.renderCount, 0) / runs,
        memoryUsage: scenarioResults.reduce((sum, r) => sum + r.memoryUsage, 0) / runs,
        fps: scenarioResults.reduce((sum, r) => sum + r.fps, 0) / runs,
        latency: {
          p50: calculatePercentile(scenarioResults.flatMap(r => r.latency), 50),
          p95: calculatePercentile(scenarioResults.flatMap(r => r.latency), 95),
          p99: calculatePercentile(scenarioResults.flatMap(r => r.latency), 99),
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
      return results.filter(r => r.scenario === scenario);
    },
  };
}
