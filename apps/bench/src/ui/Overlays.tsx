import React, { useEffect, useRef, useState } from 'react';

export const FpsGauge: React.FC = () => {
    const [fps, setFps] = useState(0);
    useEffect(() => {
        let raf: number;
        let frames = 0;
        let last = performance.now();
        const loop = () => {
            frames++;
            const now = performance.now();
            if (now - last >= 1000) {
                setFps(frames);
                frames = 0;
                last = now;
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, []);
    return (
        <div style={{ position: 'fixed', left: 10, bottom: 10, background: 'rgba(0,0,0,0.6)', color: '#fff', padding: 8, borderRadius: 6, fontSize: 12 }}>
            FPS: {fps}
        </div>
    );
};

export const KeystrokeLatency: React.FC<{ value: string }> = ({ value }) => {
    const [latency, setLatency] = useState<number | null>(null);
    const pending = useRef<number | null>(null);
    useEffect(() => {
        const start = performance.now();
        pending.current = start;
        const handle = requestAnimationFrame(() => {
            if (pending.current === start) {
                setLatency(performance.now() - start);
                pending.current = null;
            }
        });
        return () => cancelAnimationFrame(handle);
    }, [value]);
    return (
        <div style={{ position: 'fixed', left: 10, bottom: 40, background: 'rgba(0,0,0,0.6)', color: '#fff', padding: 8, borderRadius: 6, fontSize: 12 }}>
            Latency: {latency ? Math.round(latency) : '-'} ms
        </div>
    );
};

export const MountProfiler: React.FC<{ onTTI: (ms: number) => void; children?: React.ReactNode }> = ({ onTTI, children }) => {
    const start = useRef(performance.now());
    useEffect(() => {
        const tti = performance.now() - start.current;
        onTTI(tti);
    }, [onTTI]);
    return <>{children}</>;
};
