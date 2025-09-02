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
