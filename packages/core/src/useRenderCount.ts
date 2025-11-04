import { useRef, useEffect } from 'react';

/**
 * Hook to track render count for a component
 * As recommended by performance engineering expert
 */
export function useRenderCount(tag: string): number {
    const count = useRef(0);
    count.current++;

    useEffect(() => {
        (window as any).__renders ??= {};
        (window as any).__renders[tag] = ((window as any).__renders[tag] ?? 0) + 1;
    });

    return count.current;
}
