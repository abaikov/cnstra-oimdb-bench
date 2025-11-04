import React from 'react';
import adapterLocData from '@bench/core/src/adapter-loc.json';

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

interface BenchmarkResultsProps {
    results: BenchmarkResult[];
    onClear: () => void;
}

// Helper function to convert hex to rgba
const hexToRgba = (hex: string, alpha: number): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return hex;
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Helper function to darken a hex color
const darkenHex = (hex: string, percent: number): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return hex;
    const r = Math.max(0, parseInt(result[1], 16) - Math.round(255 * percent));
    const g = Math.max(0, parseInt(result[2], 16) - Math.round(255 * percent));
    const b = Math.max(0, parseInt(result[3], 16) - Math.round(255 * percent));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

const BarChart: React.FC<{
    data: { label: string; value: number; color: string }[];
    height?: number;
    higherIsBetter?: boolean; // For metrics like FPS where higher values are better
}> = ({ data, height = 200, higherIsBetter = false }) => {
    if (data.length === 0) return null;

    const maxValue = Math.max(...data.map((d) => d.value), 1);
    const minValue = Math.min(...data.map((d) => d.value), Infinity);
    // For "higher is better" metrics (like FPS), best = max, worst = min
    // For "lower is better" metrics (like executionTime), best = min, worst = max
    const bestIndex = data.findIndex((d) => d.value === (higherIsBetter ? maxValue : minValue));
    const worstIndex = data.findIndex((d) => d.value === (higherIsBetter ? minValue : maxValue));

    // Calculate range and scale for better visualization
    const range = maxValue - minValue;
    const availableHeight = height - 40;
    const minBarHeight = 20; // Minimum visible bar height in pixels
    const maxBarHeight = availableHeight;

    // Use square root scaling for better visualization when range is very large
    // This makes small values more visible while still showing the difference
    const useSqrtScale = range > 0 && maxValue / minValue > 10;

    const calculateBarHeight = (value: number): number => {
        if (value <= 0) return 0;

        if (useSqrtScale && range > 0) {
            // Square root scaling: smaller values get proportionally more height
            const normalized = (value - minValue) / range;
            const sqrtNormalized = Math.sqrt(normalized);
            return Math.max(
                minBarHeight,
                minBarHeight + (maxBarHeight - minBarHeight) * sqrtNormalized,
            );
        } else {
            // Linear scaling for normal ranges
            const linearHeight = (value / maxValue) * maxBarHeight;
            return Math.max(minBarHeight, linearHeight);
        }
    };

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 12,
                height,
                padding: '10px 0',
                width: '100%',
                overflowX: 'auto',
            }}
        >
            {data.map((item, index) => {
                const isBest = index === bestIndex && bestIndex !== worstIndex;
                const isWorst = index === worstIndex && bestIndex !== worstIndex;
                const percentage = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
                const barHeight = calculateBarHeight(item.value);

                return (
                    <div
                        key={index}
                        style={{
                            flex: '0 0 auto',
                            minWidth: 80,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            position: 'relative',
                        }}
                    >
                        <div
                            style={{
                                width: '100%',
                                background: isBest
                                    ? `linear-gradient(135deg, #4CAF50 0%, #66BB6A 50%, #81C784 100%)`
                                    : isWorst
                                      ? `linear-gradient(135deg, #F44336 0%, #EF5350 50%, #E57373 100%)`
                                      : `linear-gradient(135deg, ${item.color} 0%, ${hexToRgba(item.color, 0.85)} 50%, ${darkenHex(item.color, 0.15)} 100%)`,
                                height: `${barHeight}px`,
                                borderRadius: '8px 8px 0 0',
                                minHeight: item.value > 0 ? `${minBarHeight}px` : '0',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxShadow: isBest
                                    ? '0 6px 20px rgba(76, 175, 80, 0.4), inset 0 1px 0 rgba(255,255,255,0.3)'
                                    : isWorst
                                      ? '0 6px 20px rgba(244, 67, 54, 0.4), inset 0 1px 0 rgba(255,255,255,0.3)'
                                      : `0 4px 12px ${hexToRgba(item.color, 0.25)}, inset 0 1px 0 rgba(255,255,255,0.2)`,
                                border:
                                    isBest || isWorst
                                        ? '2px solid rgba(255,255,255,0.9)'
                                        : `1px solid ${hexToRgba(item.color, 0.4)}`,
                                position: 'relative',
                                overflow: 'hidden',
                            }}
                        >
                            {/* Shine effect */}
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    height: '40%',
                                    background:
                                        'linear-gradient(to bottom, rgba(255,255,255,0.3), transparent)',
                                    pointerEvents: 'none',
                                }}
                            />
                            {isBest && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: -24,
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        fontSize: '16px',
                                    }}
                                >
                                    🏆
                                </div>
                            )}
                            {isWorst && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: -24,
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        fontSize: '16px',
                                    }}
                                >
                                    ⚠️
                                </div>
                            )}
                        </div>
                        <div
                            style={{
                                marginTop: isBest || isWorst ? 24 : 8,
                                fontSize: 11,
                                fontWeight: 600,
                                color: '#666',
                                textAlign: 'center',
                                whiteSpace: 'nowrap',
                                width: '100%',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}
                            title={item.label}
                        >
                            {item.label}
                        </div>
                        <div
                            style={{
                                marginTop: 4,
                                fontSize: 12,
                                fontWeight: 700,
                                color: isBest ? '#4CAF50' : isWorst ? '#F44336' : '#333',
                            }}
                        >
                            {item.value.toFixed(1)}
                        </div>
                        {data.length > 1 && (
                            <div
                                style={{
                                    marginTop: 2,
                                    fontSize: 10,
                                    color: '#999',
                                    fontWeight: 500,
                                }}
                            >
                                {percentage.toFixed(0)}%
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export const BenchmarkResults: React.FC<BenchmarkResultsProps> = ({ results, onClear }) => {
    const scenarios = [...new Set(results.map((r) => r.scenario))];
    const adapters = [...new Set(results.map((r) => r.adapter))];

    // Load adapter lines of code data
    const adapterLocMap: Record<string, number> = {};
    if (adapterLocData && adapterLocData.adapters) {
        Object.entries(adapterLocData.adapters).forEach(([name, data]: [string, any]) => {
            adapterLocMap[name] = data.linesOfCode;
        });
    }

    // Group results by scenario
    const resultsByScenario: Record<string, BenchmarkResult[]> = {};
    scenarios.forEach((scenario) => {
        resultsByScenario[scenario] = results.filter((r) => r.scenario === scenario);
    });

    const getPerformanceScore = (result: BenchmarkResult): number => {
        const safeAvg = {
            executionTime: Number.isFinite(result.average.executionTime)
                ? result.average.executionTime
                : 0,
            renderCount: Number.isFinite(result.average.renderCount)
                ? result.average.renderCount
                : 0,
            memoryUsage: Number.isFinite(result.average.memoryUsage)
                ? result.average.memoryUsage
                : 0,
            fps: Number.isFinite(result.average.fps) ? result.average.fps : 0,
        };
        const executionScore = Math.max(0, 100 - safeAvg.executionTime / 10);
        const renderScore = Math.max(0, 100 - safeAvg.renderCount / 10);
        const memoryScore = Math.max(0, 100 - safeAvg.memoryUsage * 10);
        const fpsScore = Math.min(100, safeAvg.fps * 2);
        return (executionScore + renderScore + memoryScore + fpsScore) / 4;
    };

    const getScoreColor = (score: number): string => {
        if (score >= 80) return '#4CAF50';
        if (score >= 60) return '#FF9800';
        return '#F44336';
    };

    const formatNumber = (num: number, decimals: number = 2): string => {
        if (!Number.isFinite(num)) return '0';
        return num.toFixed(decimals);
    };

    const formatBytes = (bytes: number): string => {
        if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const adapterColors: { [key: string]: string } = {
        'Cnstra + Oimdb (ids-based)': '#7c8ef0',
        'Redux Toolkit (ids-based)': '#8a5fb8',
        'Zustand (ids-based)': '#6bb8ff',
        'Effector (ids-based)': '#4dd9da',
        'React State (ids-based)': '#65d88a',
    };

    const getAdapterColor = (adapter: string): string => {
        // First try exact match
        if (adapterColors[adapter]) {
            return adapterColors[adapter];
        }
        // Fallback: try to match base name by removing "(ids-based)"
        const baseName = adapter.replace(/\s*\(ids-based\)\s*$/, '');
        if (adapterColors[baseName]) {
            // Return a slightly different shade for ids-based
            const baseColor = adapterColors[baseName];
            // Lighten the color slightly for ids-based variants
            return baseColor;
        }
        return '#999';
    };

    const exportToJSON = () => {
        // Prepare comprehensive export data with interpretation guide
        const exportData = {
            metadata: {
                exportedAt: new Date().toISOString(),
                version: '1.0.0',
                totalResults: results.length,
                adapters: adapters,
                scenarios: scenarios,
                adapterDescriptions: {
                    'Cnstra + Oimdb (ids-based)':
                        'Reactive collections with CNS (Central Nervous System) - combines Cnstra core with OIMDB reactive indexing',
                    'Redux Toolkit (ids-based)':
                        'Official Redux toolkit with RTK Query - uses createSlice, createEntityAdapter, and optimized selectors',
                    'Effector (ids-based)':
                        'Reactive state management library with fine-grained reactivity using stores and events',
                    'Zustand (ids-based)':
                        'Lightweight state management with minimal boilerplate and simple API',
                    'React State (ids-based)':
                        'Pure React implementation using useState and useContext without external libraries',
                },
            },
            interpretationGuide: {
                purpose:
                    'This JSON contains performance benchmark results for React state management libraries. Use this data to analyze and compare the performance characteristics of different state management solutions.',
                metrics: {
                    executionTime: {
                        name: 'Execution Time',
                        unit: 'milliseconds (ms)',
                        description: 'Total time to complete a benchmark operation',
                        interpretation:
                            'Lower is better. Faster execution means better performance.',
                        typicalRange: '10-1000ms depending on operation complexity',
                        context: 'Measures raw speed of state updates and processing',
                    },
                    renderCount: {
                        name: 'Render Count',
                        unit: 'number of renders',
                        description:
                            'Number of React component re-renders triggered during the test',
                        interpretation:
                            'Lower is better. Fewer re-renders indicate better optimization and less unnecessary work.',
                        typicalRange: '10-500 renders depending on component tree size',
                        context:
                            'Critical for large applications - excessive renders cause UI jank',
                    },
                    memoryUsage: {
                        name: 'Memory Usage',
                        unit: 'megabytes (MB)',
                        description: 'Memory consumed by state management operations',
                        interpretation:
                            'Lower is better. Less memory means better scalability and efficiency.',
                        typicalRange: '0-100 MB for typical operations',
                        context: 'Important for memory-constrained environments and large datasets',
                    },
                    fps: {
                        name: 'Frames Per Second',
                        unit: 'FPS',
                        description: 'Animation smoothness and UI responsiveness during operations',
                        interpretation:
                            'Higher is better. 60 FPS is ideal, below 30 FPS indicates noticeable lag.',
                        typicalRange: '30-60 FPS',
                        context: 'Directly affects user experience - lower FPS means janky UI',
                    },
                    latency: {
                        name: 'Latency Percentiles',
                        unit: 'milliseconds (ms)',
                        description: 'Response time distribution for operations',
                        interpretation:
                            'Lower is better. Indicates consistent, predictable performance.',
                        percentiles: {
                            p50: 'Median - 50% of operations completed faster than this value',
                            p95: '95% of operations completed faster than this value - reveals worst-case scenarios',
                            p99: '99% of operations completed faster than this value - critical for user experience',
                        },
                        context:
                            'P95 and P99 reveal worst-case scenarios - critical for user experience',
                    },
                    score: {
                        name: 'Overall Performance Score',
                        unit: '0-100',
                        description: 'Composite score combining all metrics',
                        interpretation:
                            'Higher is better. Weighted average of all performance metrics.',
                        formula: '(executionScore + renderScore + memoryScore + fpsScore) / 4',
                        context:
                            'Quick indicator of overall performance, but individual metrics should be analyzed separately',
                    },
                    linesOfCode: {
                        name: 'Lines of Code',
                        unit: 'LOC',
                        description: 'Implementation complexity measured in lines of code',
                        interpretation:
                            'Lower indicates simpler implementation, often means easier maintenance.',
                        context:
                            'Useful for understanding development effort and code maintainability',
                    },
                },
                scenarios: {
                    'background-churn':
                        'Tests batch update performance - measures how well a library handles frequent bulk updates',
                    'inline-editing':
                        'Tests reactivity during rapid user input - measures responsiveness during typing',
                    'bulk-update':
                        'Tests batch operations on multiple entities - measures efficiency of bulk operations',
                },
                analysisInstructions: {
                    step1: 'Compare by scenario - each scenario tests different usage patterns and may reveal different strengths/weaknesses',
                    step2: 'Look for consistent winners - libraries that perform well across multiple scenarios are generally more reliable',
                    step3: 'Analyze variance - high variance in runs suggests unstable or unpredictable performance',
                    step4: 'Consider trade-offs - some libraries prioritize speed, others prioritize developer experience or simplicity',
                    step5: 'Focus on relevant metrics - choose metrics most important for your specific use case',
                    step6: 'Check LOC - simpler implementations (lower LOC) are often easier to maintain and understand',
                },
                llmPromptSuggestion:
                    'Analyze these benchmark results and provide: 1) Overall winner identification, 2) Performance comparison by metric, 3) Best use case recommendations for each library, 4) Notable patterns or anomalies, 5) Trade-offs between performance and implementation complexity.',
            },
            results: results.map((result) => {
                // Strip "(ids-based)" suffix to match LOC map keys
                const baseAdapterName = result.adapter.replace(/ \(ids-based\)$/, '');
                return {
                    ...result,
                    score: getPerformanceScore(result),
                    linesOfCode: adapterLocMap[baseAdapterName] || null,
                };
            }),
            adapterLocData: adapterLocData.adapters || {},
        };

        // Create JSON string with pretty formatting
        const jsonString = JSON.stringify(exportData, null, 2);

        // Create blob and download
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `benchmark-results-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    if (results.length === 0) {
        return (
            <div
                style={{
                    padding: 60,
                    textAlign: 'center',
                    color: '#666',
                }}
            >
                <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
                <h3 style={{ fontSize: 24, marginBottom: 12, color: '#333' }}>
                    No benchmark results yet
                </h3>
                <p style={{ fontSize: 16, color: '#888' }}>
                    Run some benchmarks to see performance comparisons
                </p>
            </div>
        );
    }

    return (
        <div style={{ padding: '32px' }}>
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 32,
                }}
            >
                <div>
                    <h2
                        style={{
                            margin: 0,
                            fontSize: '24px',
                            fontWeight: 700,
                            color: '#333',
                            marginBottom: 8,
                        }}
                    >
                        📊 Performance Results
                    </h2>
                    <p
                        style={{
                            margin: 0,
                            color: '#666',
                            fontSize: '14px',
                            marginBottom: 4,
                        }}
                    >
                        {results.length} result{results.length !== 1 ? 's' : ''} across{' '}
                        {adapters.length} state manager{adapters.length !== 1 ? 's' : ''}
                    </p>
                    <p
                        style={{
                            margin: 0,
                            color: '#888',
                            fontSize: '12px',
                            fontStyle: 'italic',
                        }}
                    >
                        Results are sorted by overall score. 🏆 marks best performance, ⚠️ marks
                        worst performance for each metric.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <button
                        onClick={exportToJSON}
                        title="Export all results as JSON with interpretation guide for LLM analysis"
                        style={{
                            padding: '10px 20px',
                            backgroundColor: '#2196F3',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '14px',
                            boxShadow: '0 2px 8px rgba(33, 150, 243, 0.3)',
                            transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(33, 150, 243, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(33, 150, 243, 0.3)';
                        }}
                    >
                        📥 Export JSON
                    </button>
                    <button
                        onClick={onClear}
                        style={{
                            padding: '10px 20px',
                            backgroundColor: '#f44336',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '14px',
                            boxShadow: '0 2px 8px rgba(244, 67, 54, 0.3)',
                            transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(244, 67, 54, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(244, 67, 54, 0.3)';
                        }}
                    >
                        🗑️ Clear All
                    </button>
                </div>
            </div>

            {/* All Results Tables - Show all scenarios */}
            {scenarios.map((scenario) => {
                const scenarioResults = resultsByScenario[scenario] || [];
                if (scenarioResults.length === 0) return null;

                const scenarioName = scenario
                    .replace(/-/g, ' ')
                    .replace(/\b\w/g, (l) => l.toUpperCase());

                return (
                    <div key={scenario} style={{ marginBottom: 48 }}>
                        <h3
                            style={{
                                margin: '0 0 20px 0',
                                fontSize: '22px',
                                fontWeight: 700,
                                color: '#333',
                                paddingBottom: '12px',
                                borderBottom: '3px solid #667eea',
                            }}
                        >
                            {scenarioName}
                        </h3>
                        <div
                            style={{
                                overflowX: 'auto',
                                borderRadius: '12px',
                                boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                                border: '1px solid #e9ecef',
                            }}
                        >
                            <table
                                style={{
                                    width: '100%',
                                    borderCollapse: 'collapse',
                                    backgroundColor: 'white',
                                }}
                            >
                                <thead>
                                    <tr
                                        style={{
                                            background:
                                                'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                            color: 'white',
                                        }}
                                    >
                                        <th
                                            style={{
                                                padding: 16,
                                                textAlign: 'left',
                                                fontWeight: 700,
                                                fontSize: '14px',
                                            }}
                                        >
                                            📦 Adapter
                                        </th>
                                        <th
                                            style={{
                                                padding: 16,
                                                textAlign: 'right',
                                                fontWeight: 700,
                                                fontSize: '14px',
                                            }}
                                            title="Lines of code required to implement this adapter. Lower indicates simpler implementation."
                                        >
                                            📝 LOC
                                        </th>
                                        <th
                                            style={{
                                                padding: 16,
                                                textAlign: 'right',
                                                fontWeight: 700,
                                                fontSize: '14px',
                                            }}
                                            title="Overall performance score (0-100) combining all metrics. Higher is better."
                                        >
                                            ⭐ Score
                                        </th>
                                        <th
                                            style={{
                                                padding: 16,
                                                textAlign: 'right',
                                                fontWeight: 700,
                                                fontSize: '14px',
                                            }}
                                            title="JavaScript execution time per run (average). Lower is better."
                                        >
                                            ⚙️ JS Time (ms)
                                        </th>
                                        <th
                                            style={{
                                                padding: 16,
                                                textAlign: 'right',
                                                fontWeight: 700,
                                                fontSize: '14px',
                                            }}
                                            title="Number of React components that re-rendered. Lower is better."
                                        >
                                            🎨 Renders
                                        </th>
                                        <th
                                            style={{
                                                padding: 16,
                                                textAlign: 'right',
                                                fontWeight: 700,
                                                fontSize: '14px',
                                            }}
                                            title="Memory consumed during the operation. Lower is better."
                                        >
                                            💾 Memory
                                        </th>
                                        <th
                                            style={{
                                                padding: 16,
                                                textAlign: 'right',
                                                fontWeight: 700,
                                                fontSize: '14px',
                                            }}
                                            title="Frames per second - animation smoothness. 60 FPS is ideal. Higher is better."
                                        >
                                            🎮 FPS
                                        </th>
                                        <th
                                            style={{
                                                padding: 16,
                                                textAlign: 'right',
                                                fontWeight: 700,
                                                fontSize: '14px',
                                            }}
                                            title="Median latency (p50). Lower is better."
                                        >
                                            📈 P50 (ms)
                                        </th>
                                        <th
                                            style={{
                                                padding: 16,
                                                textAlign: 'right',
                                                fontWeight: 700,
                                                fontSize: '14px',
                                            }}
                                            title="95th percentile latency (p95). Lower is better."
                                        >
                                            📈 P95 (ms)
                                        </th>
                                        <th
                                            style={{
                                                padding: 16,
                                                textAlign: 'right',
                                                fontWeight: 700,
                                                fontSize: '14px',
                                            }}
                                            title="99th percentile latency (p99). Lower is better."
                                        >
                                            📈 P99 (ms)
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {scenarioResults
                                        .sort(
                                            (a, b) =>
                                                getPerformanceScore(b) - getPerformanceScore(a),
                                        )
                                        .map((result, index) => {
                                            const score = getPerformanceScore(result);

                                            // Calculate best/worst for each metric within scenario results
                                            const executionTimes = scenarioResults.map(
                                                (r) => r.average.executionTime,
                                            );
                                            const renderCounts = scenarioResults.map(
                                                (r) => r.average.renderCount,
                                            );
                                            const memoryUsages = scenarioResults.map(
                                                (r) => r.average.memoryUsage,
                                            );
                                            const fpsValues = scenarioResults.map(
                                                (r) => r.average.fps,
                                            );

                                            const isBestExecution =
                                                result.average.executionTime ===
                                                Math.min(...executionTimes);
                                            const isBestRenders =
                                                result.average.renderCount ===
                                                Math.min(...renderCounts);
                                            const isBestMemory =
                                                result.average.memoryUsage ===
                                                Math.min(...memoryUsages);
                                            const isBestFps =
                                                result.average.fps === Math.max(...fpsValues);

                                            const isWorstExecution =
                                                result.average.executionTime ===
                                                Math.max(...executionTimes);
                                            const isWorstRenders =
                                                result.average.renderCount ===
                                                Math.max(...renderCounts);
                                            const isWorstMemory =
                                                result.average.memoryUsage ===
                                                Math.max(...memoryUsages);
                                            const isWorstFps =
                                                result.average.fps === Math.min(...fpsValues);

                                            return (
                                                <tr
                                                    key={`${result.adapter}-${result.scenario}-${index}`}
                                                    style={{
                                                        backgroundColor:
                                                            index % 2 === 0 ? '#fafafa' : 'white',
                                                        borderBottom: '1px solid #eee',
                                                        transition: 'background 0.2s ease',
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.backgroundColor =
                                                            '#f0f4ff';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.backgroundColor =
                                                            index % 2 === 0 ? '#fafafa' : 'white';
                                                    }}
                                                >
                                                    <td
                                                        style={{
                                                            padding: 16,
                                                            fontWeight: 700,
                                                            fontSize: '14px',
                                                        }}
                                                    >
                                                        <span
                                                            style={{
                                                                color: getAdapterColor(
                                                                    result.adapter,
                                                                ),
                                                                display: 'inline-block',
                                                                padding: '4px 12px',
                                                                background: `${getAdapterColor(result.adapter)}15`,
                                                                borderRadius: '6px',
                                                            }}
                                                        >
                                                            {result.adapter}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: 16, textAlign: 'right' }}>
                                                        {(() => {
                                                            // Strip "(ids-based)" suffix to match LOC map keys
                                                            const baseAdapterName =
                                                                result.adapter.replace(
                                                                    / \(ids-based\)$/,
                                                                    '',
                                                                );
                                                            const loc =
                                                                adapterLocMap[baseAdapterName];
                                                            return loc ? (
                                                                <span
                                                                    style={{
                                                                        fontFamily: 'monospace',
                                                                        fontSize: '14px',
                                                                        fontWeight: 600,
                                                                        color: '#607D8B',
                                                                        padding: '4px 8px',
                                                                        background: '#f0f4ff',
                                                                        borderRadius: '6px',
                                                                    }}
                                                                    title={`Lines of code: ${loc}`}
                                                                >
                                                                    {loc}
                                                                </span>
                                                            ) : (
                                                                <span
                                                                    style={{
                                                                        color: '#999',
                                                                        fontSize: '12px',
                                                                    }}
                                                                >
                                                                    —
                                                                </span>
                                                            );
                                                        })()}
                                                    </td>
                                                    <td style={{ padding: 16, textAlign: 'right' }}>
                                                        <span
                                                            style={{
                                                                backgroundColor:
                                                                    getScoreColor(score),
                                                                color: 'white',
                                                                padding: '6px 12px',
                                                                borderRadius: '20px',
                                                                fontSize: '13px',
                                                                fontWeight: 700,
                                                                display: 'inline-block',
                                                                minWidth: 50,
                                                                textAlign: 'center',
                                                            }}
                                                        >
                                                            {formatNumber(score, 0)}
                                                        </span>
                                                    </td>
                                                    <td
                                                        style={{
                                                            padding: 16,
                                                            textAlign: 'right',
                                                            fontFamily: 'monospace',
                                                            fontSize: '14px',
                                                            position: 'relative',
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'flex-end',
                                                                gap: 8,
                                                            }}
                                                        >
                                                            {isBestExecution &&
                                                                scenarioResults.length > 1 && (
                                                                    <span
                                                                        style={{
                                                                            color: '#4CAF50',
                                                                            fontSize: '18px',
                                                                        }}
                                                                        title="Best"
                                                                    >
                                                                        🏆
                                                                    </span>
                                                                )}
                                                            {isWorstExecution &&
                                                                scenarioResults.length > 1 && (
                                                                    <span
                                                                        style={{
                                                                            color: '#F44336',
                                                                            fontSize: '18px',
                                                                        }}
                                                                        title="Worst"
                                                                    >
                                                                        ⚠️
                                                                    </span>
                                                                )}
                                                            <span
                                                                style={{
                                                                    color: isBestExecution
                                                                        ? '#4CAF50'
                                                                        : isWorstExecution
                                                                          ? '#F44336'
                                                                          : '#333',
                                                                    fontWeight:
                                                                        isBestExecution ||
                                                                        isWorstExecution
                                                                            ? 700
                                                                            : 400,
                                                                }}
                                                            >
                                                                {formatNumber(
                                                                    result.average.executionTime,
                                                                    1,
                                                                )}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td
                                                        style={{
                                                            padding: 16,
                                                            textAlign: 'right',
                                                            fontFamily: 'monospace',
                                                            fontSize: '14px',
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'flex-end',
                                                                gap: 8,
                                                            }}
                                                        >
                                                            {isBestRenders &&
                                                                scenarioResults.length > 1 && (
                                                                    <span
                                                                        style={{
                                                                            color: '#4CAF50',
                                                                            fontSize: '18px',
                                                                        }}
                                                                        title="Best"
                                                                    >
                                                                        🏆
                                                                    </span>
                                                                )}
                                                            {isWorstRenders &&
                                                                scenarioResults.length > 1 && (
                                                                    <span
                                                                        style={{
                                                                            color: '#F44336',
                                                                            fontSize: '18px',
                                                                        }}
                                                                        title="Worst"
                                                                    >
                                                                        ⚠️
                                                                    </span>
                                                                )}
                                                            <span
                                                                style={{
                                                                    color: isBestRenders
                                                                        ? '#4CAF50'
                                                                        : isWorstRenders
                                                                          ? '#F44336'
                                                                          : '#333',
                                                                    fontWeight:
                                                                        isBestRenders ||
                                                                        isWorstRenders
                                                                            ? 700
                                                                            : 400,
                                                                }}
                                                            >
                                                                {formatNumber(
                                                                    result.average.renderCount,
                                                                    0,
                                                                )}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td
                                                        style={{
                                                            padding: 16,
                                                            textAlign: 'right',
                                                            fontFamily: 'monospace',
                                                            fontSize: '14px',
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'flex-end',
                                                                gap: 8,
                                                            }}
                                                        >
                                                            {isBestMemory &&
                                                                scenarioResults.length > 1 && (
                                                                    <span
                                                                        style={{
                                                                            color: '#4CAF50',
                                                                            fontSize: '18px',
                                                                        }}
                                                                        title="Best"
                                                                    >
                                                                        🏆
                                                                    </span>
                                                                )}
                                                            {isWorstMemory &&
                                                                scenarioResults.length > 1 && (
                                                                    <span
                                                                        style={{
                                                                            color: '#F44336',
                                                                            fontSize: '18px',
                                                                        }}
                                                                        title="Worst"
                                                                    >
                                                                        ⚠️
                                                                    </span>
                                                                )}
                                                            <span
                                                                style={{
                                                                    color: isBestMemory
                                                                        ? '#4CAF50'
                                                                        : isWorstMemory
                                                                          ? '#F44336'
                                                                          : '#333',
                                                                    fontWeight:
                                                                        isBestMemory ||
                                                                        isWorstMemory
                                                                            ? 700
                                                                            : 400,
                                                                }}
                                                            >
                                                                {formatBytes(
                                                                    result.average.memoryUsage *
                                                                        1024 *
                                                                        1024,
                                                                )}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td
                                                        style={{
                                                            padding: 16,
                                                            textAlign: 'right',
                                                            fontFamily: 'monospace',
                                                            fontSize: '14px',
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'flex-end',
                                                                gap: 8,
                                                            }}
                                                        >
                                                            {isBestFps &&
                                                                scenarioResults.length > 1 && (
                                                                    <span
                                                                        style={{
                                                                            color: '#4CAF50',
                                                                            fontSize: '18px',
                                                                        }}
                                                                        title="Best"
                                                                    >
                                                                        🏆
                                                                    </span>
                                                                )}
                                                            {isWorstFps &&
                                                                scenarioResults.length > 1 && (
                                                                    <span
                                                                        style={{
                                                                            color: '#F44336',
                                                                            fontSize: '18px',
                                                                        }}
                                                                        title="Worst"
                                                                    >
                                                                        ⚠️
                                                                    </span>
                                                                )}
                                                            <span
                                                                style={{
                                                                    color: isBestFps
                                                                        ? '#4CAF50'
                                                                        : isWorstFps
                                                                          ? '#F44336'
                                                                          : '#333',
                                                                    fontWeight:
                                                                        isBestFps || isWorstFps
                                                                            ? 700
                                                                            : 400,
                                                                }}
                                                            >
                                                                {formatNumber(
                                                                    result.average.fps,
                                                                    1,
                                                                )}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td
                                                        style={{
                                                            padding: 16,
                                                            textAlign: 'right',
                                                            fontFamily: 'monospace',
                                                            fontSize: '14px',
                                                            color: '#333',
                                                        }}
                                                    >
                                                        {formatNumber(
                                                            result.average.latency.p50,
                                                            2,
                                                        )}
                                                    </td>
                                                    <td
                                                        style={{
                                                            padding: 16,
                                                            textAlign: 'right',
                                                            fontFamily: 'monospace',
                                                            fontSize: '14px',
                                                            color: '#333',
                                                        }}
                                                    >
                                                        {formatNumber(
                                                            result.average.latency.p95,
                                                            2,
                                                        )}
                                                    </td>
                                                    <td
                                                        style={{
                                                            padding: 16,
                                                            textAlign: 'right',
                                                            fontFamily: 'monospace',
                                                            fontSize: '14px',
                                                            color: '#333',
                                                        }}
                                                    >
                                                        {formatNumber(
                                                            result.average.latency.p99,
                                                            2,
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })}

            {/* Test Descriptions - Show all scenarios */}
            <div style={{ marginTop: 64 }}>
                <h2
                    style={{
                        margin: '0 0 32px 0',
                        fontSize: '28px',
                        fontWeight: 700,
                        color: '#333',
                        paddingBottom: '16px',
                        borderBottom: '3px solid #667eea',
                    }}
                >
                    📋 Test Descriptions
                </h2>
                {scenarios.map((scenario) => {
                    const scenarioName = scenario
                        .replace(/-/g, ' ')
                        .replace(/\b\w/g, (l) => l.toUpperCase());

                    return (
                        <div
                            key={scenario}
                            style={{
                                marginBottom: 40,
                                padding: 24,
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                borderRadius: '12px',
                                border: '1px solid #e9ecef',
                                color: 'white',
                            }}
                        >
                            <h3
                                style={{
                                    margin: '0 0 20px 0',
                                    fontSize: '20px',
                                    fontWeight: 700,
                                    color: 'white',
                                }}
                            >
                                {scenarioName}
                            </h3>
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                                    gap: 20,
                                    fontSize: '14px',
                                    lineHeight: 1.8,
                                }}
                            >
                                <div>
                                    <strong
                                        style={{
                                            display: 'block',
                                            marginBottom: 8,
                                            fontSize: '15px',
                                        }}
                                    >
                                        🧪 What We Tested:
                                    </strong>
                                    {scenario === 'inline-editing' && (
                                        <div style={{ opacity: 0.95 }}>
                                            Simulates rapid text editing by performing 20
                                            consecutive comment text updates with 16ms delays
                                            between each keystroke. This test measures how well each
                                            state management library handles frequent, rapid state
                                            changes during user input. It evaluates reactivity,
                                            input responsiveness, and whether the UI remains smooth
                                            during fast typing scenarios.
                                        </div>
                                    )}
                                    {scenario === 'bulk-update' && (
                                        <div style={{ opacity: 0.95 }}>
                                            Tests batch operations by performing 5 cycles of bulk
                                            tag toggles on 10 cards, followed by background churn
                                            operations. This test measures how efficiently each
                                            library handles bulk state updates and batch processing
                                            of multiple entities simultaneously. It evaluates the
                                            library's ability to optimize batch operations and
                                            minimize overhead when updating many items at once.
                                        </div>
                                    )}
                                    {scenario === 'background-churn' && (
                                        <div style={{ opacity: 0.95 }}>
                                            Simulates continuous background updates with multiple
                                            concurrent updates to different entities (decks, cards,
                                            comments) happening simultaneously. This test measures
                                            performance under sustained load and evaluates how well
                                            each library handles update amplification - when a
                                            single operation triggers multiple cascading updates
                                            across the application state.
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <strong
                                        style={{
                                            display: 'block',
                                            marginBottom: 8,
                                            fontSize: '15px',
                                        }}
                                    >
                                        📊 Test Data:
                                    </strong>
                                    <div style={{ opacity: 0.95 }}>
                                        • 50 decks with 10 cards each (500 cards total)
                                        <br />
                                        • 2000 users
                                        <br />
                                        • 50 tags
                                        <br />
                                        • 3-5 comments per card (~1,500-2,500 comments)
                                        <br />• Same dataset for all adapters (seed: 42)
                                    </div>
                                </div>
                                <div>
                                    <strong
                                        style={{
                                            display: 'block',
                                            marginBottom: 8,
                                            fontSize: '15px',
                                        }}
                                    >
                                        🔬 Measurement Methodology:
                                    </strong>
                                    <div style={{ opacity: 0.95 }}>
                                        • <strong>Runs:</strong> 10 iterations per adapter (100ms
                                        pause between runs) for statistical accuracy. Warmup runs
                                        are performed before measurements to stabilize JIT
                                        compilation.
                                        <br />• <strong>Execution Time:</strong> Total JavaScript
                                        execution time measured via performance.now(), with
                                        artificial delays (setTimeout, RAF overhead) subtracted.
                                        Represents actual adapter processing time, not including
                                        intentional test delays.
                                        <br />• <strong>Memory:</strong> Peak memory usage during
                                        test execution (baseline before test excluded). Memory is
                                        measured multiple times per run using median for stability.
                                        GC is forced before each run if available (Chrome DevTools).
                                        <br />• <strong>FPS:</strong> Frame rate measured during
                                        test execution using requestAnimationFrame counter. Higher
                                        FPS indicates smoother rendering and better UI
                                        responsiveness.
                                        <br />• <strong>Renders:</strong> Total React component
                                        re-renders tracked via render counter (reset before each
                                        run). Lower render counts indicate better optimization and
                                        fewer unnecessary updates.
                                        <br />• <strong>Latency:</strong> Time from state update to
                                        complete visual change, measured from update → React flush →
                                        paint completion (double RAF). P50/P95/P99 percentiles
                                        calculated across all measured operations using linear
                                        interpolation.
                                        <br />• <strong>Lines of Code (LOC):</strong> Total lines of
                                        code required to implement each adapter, including all
                                        boilerplate, selectors, and state management logic. Lower
                                        LOC indicates simpler implementation and easier maintenance.
                                        <br />• <strong>Fairness:</strong> Same dataset (seed: 42)
                                        and identical workload for all adapters. Store creation and
                                        initialization happen before measurements. Outlier removal
                                        (IQR method) applied for samples with 7+ runs.
                                        <br />• <strong>Statistics:</strong> Results show averages
                                        (or medians for small samples) across all valid runs. Median
                                        used for samples with less than 7 runs to handle outliers
                                        better.
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Adapter Implementation Details */}
            <div style={{ marginTop: 64 }}>
                <h2
                    style={{
                        margin: '0 0 32px 0',
                        fontSize: '28px',
                        fontWeight: 700,
                        color: '#333',
                        paddingBottom: '16px',
                        borderBottom: '3px solid #667eea',
                    }}
                >
                    🔧 Adapter Implementation Details
                </h2>
                <p
                    style={{
                        marginBottom: 32,
                        fontSize: '16px',
                        color: '#666',
                        lineHeight: 1.6,
                    }}
                >
                    Understanding how each adapter is implemented helps explain the performance
                    characteristics you see in the results above. Each library has different
                    architectural approaches, optimization strategies, and trade-offs that affect
                    execution time, memory usage, and render counts.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                    {/* Redux Toolkit */}
                    <div
                        style={{
                            padding: 24,
                            background: 'linear-gradient(135deg, #8a5fb8 0%, #a57bc8 100%)',
                            borderRadius: '12px',
                            border: '1px solid #e9ecef',
                            color: 'white',
                        }}
                    >
                        <h3
                            style={{
                                margin: '0 0 16px 0',
                                fontSize: '20px',
                                fontWeight: 700,
                                color: 'white',
                            }}
                        >
                            Redux Toolkit (ids-based)
                        </h3>
                        <div style={{ fontSize: '14px', lineHeight: 1.8, opacity: 0.95 }}>
                            <strong>Implementation Approach:</strong>
                            <ul style={{ margin: '8px 0', paddingLeft: 24, listStyle: 'disc' }}>
                                <li>
                                    Uses <code>createEntityAdapter</code> for normalized entity
                                    management, which provides optimized CRUD operations
                                </li>
                                <li>
                                    Built on top of <strong>Immer</strong> - all state updates go
                                    through Immer's produce function, creating immutable updates
                                    automatically
                                </li>
                                <li>
                                    Uses <code>createSelector</code> with memoization for derived
                                    data (selectors are memoized based on input dependencies)
                                </li>
                                <li>
                                    Entity adapters handle indexing automatically - relationships
                                    (cardIds per deck, commentIds per card) are maintained via
                                    extraReducers and manual updates
                                </li>
                                <li>
                                    React Redux uses <code>batch()</code> for batching multiple
                                    updates in a single render cycle
                                </li>
                            </ul>
                            <strong>Performance Characteristics:</strong>
                            <ul style={{ margin: '8px 0', paddingLeft: 24, listStyle: 'disc' }}>
                                <li>
                                    <strong>Immer overhead:</strong> Every state update creates a
                                    draft proxy and produces a new immutable state tree, which adds
                                    overhead but ensures immutability
                                </li>
                                <li>
                                    <strong>Selector memoization:</strong> Memoized selectors
                                    prevent unnecessary recalculations, but selector setup and
                                    dependency tracking has its own cost
                                </li>
                                <li>
                                    <strong>Entity adapter operations:</strong> Optimized for bulk
                                    operations (setAll, updateMany), but individual updates still
                                    traverse the normalized structure
                                </li>
                                <li>
                                    <strong>Relationship maintenance:</strong> Manual updates to
                                    deck.cardIds and card.commentIds require additional reducer
                                    logic and can cause cascading updates
                                </li>
                            </ul>
                        </div>
                    </div>

                    {/* Zustand */}
                    <div
                        style={{
                            padding: 24,
                            background: 'linear-gradient(135deg, #6bb8ff 0%, #8cc5ff 100%)',
                            borderRadius: '12px',
                            border: '1px solid #e9ecef',
                            color: 'white',
                        }}
                    >
                        <h3
                            style={{
                                margin: '0 0 16px 0',
                                fontSize: '20px',
                                fontWeight: 700,
                                color: 'white',
                            }}
                        >
                            Zustand (ids-based)
                        </h3>
                        <div style={{ fontSize: '14px', lineHeight: 1.8, opacity: 0.95 }}>
                            <strong>Implementation Approach:</strong>
                            <ul style={{ margin: '8px 0', paddingLeft: 24, listStyle: 'disc' }}>
                                <li>
                                    <strong>No built-in list management:</strong> Zustand has no
                                    entity adapter or collection utilities - all operations work
                                    directly with plain JavaScript objects
                                </li>
                                <li>
                                    Stores entities as simple <code>Record&lt;ID, Entity&gt;</code>{' '}
                                    structures - each entity type is a flat object map
                                </li>
                                <li>
                                    <strong>Manual relationship management:</strong> All indexes
                                    (cardIds per deck, commentIds per card, etc.) must be manually
                                    maintained and merged into entity objects
                                </li>
                                <li>
                                    Updates require manual object spreading and merging - no
                                    immutable update library, just plain JavaScript object
                                    operations
                                </li>
                                <li>
                                    Uses shallow equality checks for subscriptions to minimize
                                    unnecessary re-renders
                                </li>
                            </ul>
                            <strong>Performance Characteristics:</strong>
                            <ul style={{ margin: '8px 0', paddingLeft: 24, listStyle: 'disc' }}>
                                <li>
                                    <strong>Manual merging overhead:</strong> Every update requires
                                    creating new objects with spread operators, which can be
                                    expensive for nested structures
                                </li>
                                <li>
                                    <strong>Index maintenance:</strong> Relationship indexes
                                    (cardIds, commentIds) are stored directly on entities, so
                                    updating a card requires updating its parent deck's cardIds
                                    array - this creates cascading update operations
                                </li>
                                <li>
                                    <strong>No automatic optimization:</strong> Without entity
                                    adapters, there's no built-in optimization for bulk operations -
                                    each update is processed individually
                                </li>
                                <li>
                                    <strong>Shallow equality checks:</strong> Reduces unnecessary
                                    re-renders but requires careful selector design to avoid deep
                                    equality checks
                                </li>
                                <li>
                                    <strong>Lower abstraction overhead:</strong> Less abstraction
                                    means less overhead, but more manual work and potential for
                                    performance issues if not carefully optimized
                                </li>
                            </ul>
                        </div>
                    </div>

                    {/* Effector */}
                    <div
                        style={{
                            padding: 24,
                            background: 'linear-gradient(135deg, #4dd9da 0%, #6ee3e4 100%)',
                            borderRadius: '12px',
                            border: '1px solid #e9ecef',
                            color: 'white',
                        }}
                    >
                        <h3
                            style={{
                                margin: '0 0 16px 0',
                                fontSize: '20px',
                                fontWeight: 700,
                                color: 'white',
                            }}
                        >
                            Effector (ids-based)
                        </h3>
                        <div style={{ fontSize: '14px', lineHeight: 1.8, opacity: 0.95 }}>
                            <strong>Implementation Approach:</strong>
                            <ul style={{ margin: '8px 0', paddingLeft: 24, listStyle: 'disc' }}>
                                <li>
                                    Uses <strong>fine-grained reactivity</strong> with stores and
                                    events - each entity type has its own store
                                </li>
                                <li>
                                    Stores are combined using <code>combine()</code> for derived
                                    state - creates new stores that reactively update when source
                                    stores change
                                </li>
                                <li>
                                    <strong>Manual index management:</strong> Similar to Zustand,
                                    relationships (cardIds, commentIds) are manually maintained and
                                    stored directly on entities
                                </li>
                                <li>
                                    Updates are handled via events - each update operation creates
                                    an event that modifies stores
                                </li>
                                <li>
                                    Uses <code>useStoreMap</code> for efficient component
                                    subscriptions - only subscribes to specific store values
                                </li>
                            </ul>
                            <strong>Performance Characteristics:</strong>
                            <ul style={{ margin: '8px 0', paddingLeft: 24, listStyle: 'disc' }}>
                                <li>
                                    <strong>Reactive graph overhead:</strong> The dependency graph
                                    between stores must be maintained and evaluated, which adds
                                    overhead for complex relationships
                                </li>
                                <li>
                                    <strong>Event system:</strong> Every update goes through the
                                    event system, which provides observability but adds a layer of
                                    indirection
                                </li>
                                <li>
                                    <strong>Store combination:</strong> Combined stores create new
                                    derived stores, which can lead to multiple store updates for a
                                    single operation
                                </li>
                                <li>
                                    <strong>Fine-grained subscriptions:</strong> useStoreMap allows
                                    precise subscriptions, but setting up these subscriptions has a
                                    cost
                                </li>
                                <li>
                                    <strong>Manual index updates:</strong> Like Zustand, requires
                                    manual object merging for relationship maintenance, with
                                    additional overhead from the reactive system
                                </li>
                            </ul>
                        </div>
                    </div>

                    {/* Cnstra + OIMDB */}
                    <div
                        style={{
                            padding: 24,
                            background: 'linear-gradient(135deg, #7c8ef0 0%, #9aa5f5 100%)',
                            borderRadius: '12px',
                            border: '1px solid #e9ecef',
                            color: 'white',
                        }}
                    >
                        <h3
                            style={{
                                margin: '0 0 16px 0',
                                fontSize: '20px',
                                fontWeight: 700,
                                color: 'white',
                            }}
                        >
                            Cnstra + OIMDB (ids-based)
                        </h3>
                        <div style={{ fontSize: '14px', lineHeight: 1.8, opacity: 0.95 }}>
                            <strong>Implementation Approach:</strong>
                            <ul style={{ margin: '8px 0', paddingLeft: 24, listStyle: 'disc' }}>
                                <li>
                                    Uses <strong>OIMDB reactive collections</strong> - specialized
                                    data structures designed for normalized entity management
                                </li>
                                <li>
                                    <strong>Automatic index management:</strong> Reactive indexes
                                    (cardsByDeck, commentsByCard, etc.) are automatically maintained
                                    by the collection system - no manual relationship updates needed
                                </li>
                                <li>
                                    Built on <strong>CNS (Central Nervous System)</strong> core -
                                    provides reactive state management with fine-grained dependency
                                    tracking
                                </li>
                                <li>
                                    Uses <code>OIMReactiveIndexManual</code> for indexing - indexes
                                    are updated automatically when entities change, without manual
                                    merge operations
                                </li>
                                <li>
                                    Collections provide optimized bulk operations (
                                    <code>upsertMany</code>, <code>updateMany</code>) that are
                                    designed for performance
                                </li>
                                <li>
                                    React hooks (<code>useSelectEntityByPk</code>,{' '}
                                    <code>useSelectPksByIndexKey</code>) provide direct access to
                                    entities and indexes without intermediate selectors
                                </li>
                            </ul>
                            <strong>Performance Characteristics:</strong>
                            <ul style={{ margin: '8px 0', paddingLeft: 24, listStyle: 'disc' }}>
                                <li>
                                    <strong>Automatic index updates:</strong> Indexes are maintained
                                    automatically by the collection system, eliminating manual merge
                                    operations and reducing cascading update overhead
                                </li>
                                <li>
                                    <strong>Optimized data structures:</strong> Collections are
                                    designed specifically for entity management, with internal
                                    optimizations for common operations
                                </li>
                                <li>
                                    <strong>Direct entity access:</strong> No selector layer needed
                                    - hooks provide direct access to entities and indexes, reducing
                                    abstraction overhead
                                </li>
                                <li>
                                    <strong>Bulk operation optimization:</strong> Bulk operations
                                    are handled internally by collections, with optimizations for
                                    batch updates
                                </li>
                                <li>
                                    <strong>Event queue system:</strong> Updates go through an event
                                    queue, allowing for batching and optimization of multiple
                                    operations
                                </li>
                                <li>
                                    <strong>Reduced manual work:</strong> Less boilerplate and
                                    manual relationship management means fewer opportunities for
                                    performance issues from suboptimal update patterns
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div
                    style={{
                        marginTop: 32,
                        padding: 20,
                        background: '#f8f9fa',
                        borderRadius: '12px',
                        border: '1px solid #e9ecef',
                    }}
                >
                    <strong style={{ display: 'block', marginBottom: 12, fontSize: '16px' }}>
                        💡 Key Insights:
                    </strong>
                    <div style={{ fontSize: '14px', lineHeight: 1.8, color: '#666' }}>
                        <p style={{ marginBottom: 12 }}>
                            The performance differences you see in the results are primarily due to:
                        </p>
                        <ul style={{ margin: '8px 0', paddingLeft: 24, listStyle: 'disc' }}>
                            <li>
                                <strong>Abstraction vs. Performance:</strong> Libraries with more
                                abstraction (Redux Toolkit, Effector) may have more overhead but
                                provide more features. Libraries with less abstraction (Zustand)
                                require more manual work but can be faster if optimized correctly.
                            </li>
                            <li>
                                <strong>Index Maintenance:</strong> Manual relationship management
                                (Zustand, Effector) requires more operations and can cause cascading
                                updates. Automatic index maintenance (Cnstra + OIMDB) reduces
                                overhead.
                            </li>
                            <li>
                                <strong>Update Patterns:</strong> Immer (Redux Toolkit) creates
                                immutable updates automatically but has overhead. Manual merging
                                (Zustand) is faster but error-prone. Reactive collections (Cnstra +
                                OIMDB) optimize updates automatically.
                            </li>
                            <li>
                                <strong>Bulk Operations:</strong> Some libraries (Redux Toolkit,
                                Cnstra + OIMDB) have built-in optimizations for bulk operations,
                                while others require manual optimization.
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};
