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

    const getFpsColor = () => {
        if (fps >= 55) return '#4CAF50';
        if (fps >= 30) return '#FF9800';
        return '#F44336';
    };

    return (
        <div
            style={{
                position: 'fixed',
                left: 20,
                bottom: 20,
                background: 'rgba(255,255,255,0.95)',
                color: '#333',
                padding: '12px 16px',
                borderRadius: '10px',
                fontSize: 14,
                fontWeight: 600,
                boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                border: `2px solid ${getFpsColor()}`,
                backdropFilter: 'blur(10px)',
                minWidth: 100,
                textAlign: 'center',
            }}
        >
            <div style={{ fontSize: 11, color: '#666', marginBottom: 4, fontWeight: 500 }}>
                🎮 FPS
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: getFpsColor() }}>{fps}</div>
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

    const getLatencyColor = () => {
        if (!latency) return '#999';
        if (latency < 16) return '#4CAF50';
        if (latency < 50) return '#FF9800';
        return '#F44336';
    };

    return (
        <div
            style={{
                position: 'fixed',
                left: 20,
                bottom: 90,
                background: 'rgba(255,255,255,0.95)',
                color: '#333',
                padding: '12px 16px',
                borderRadius: '10px',
                fontSize: 14,
                fontWeight: 600,
                boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                border: `2px solid ${getLatencyColor()}`,
                backdropFilter: 'blur(10px)',
                minWidth: 140,
                textAlign: 'center',
            }}
        >
            <div style={{ fontSize: 11, color: '#666', marginBottom: 4, fontWeight: 500 }}>
                ⌨️ Latency
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: getLatencyColor() }}>
                {latency ? `${Math.round(latency)} ms` : '-'}
            </div>
        </div>
    );
};

export const MountProfiler: React.FC<{
    onTTI: (ms: number) => void;
    children?: React.ReactNode;
}> = ({ onTTI, children }) => {
    const start = useRef(performance.now());
    useEffect(() => {
        const tti = performance.now() - start.current;
        onTTI(tti);
    }, [onTTI]);
    return <>{children}</>;
};
