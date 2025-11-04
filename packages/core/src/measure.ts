/**
 * Measure dispatch to paint latency using Performance API
 * As recommended by performance engineering expert
 */

/**
 * Measure latency from dispatch (state update) to paint completion
 * Uses Performance API marks for accurate measurement
 */
export async function measureDispatchToPaint(name: string, dispatch: () => void): Promise<number> {
    const startMark = `${name}-start`;
    const endMark = `${name}-end`;
    const measureName = name;

    performance.mark(startMark);
    dispatch();

    // Wait for React to flush updates
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    await Promise.resolve();
    // Wait for paint to complete
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    performance.mark(endMark);
    performance.measure(measureName, startMark, endMark);

    const entry = performance.getEntriesByName(measureName, 'measure')[0];
    const duration = entry?.duration ?? 0;

    // Cleanup
    performance.clearMarks(startMark);
    performance.clearMarks(endMark);
    performance.clearMeasures(measureName);

    return duration;
}
