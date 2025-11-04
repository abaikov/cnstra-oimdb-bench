import React, { useState, useEffect } from 'react';
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

    // Always select the first scenario by default, or keep current selection if it exists
    const [selectedScenario, setSelectedScenario] = useState<string>(
        scenarios.length > 0 ? scenarios[0] : '',
    );
    const [comparisonMode] = useState(false);

    // Update selected scenario when results change (e.g., first scenario appears)
    useEffect(() => {
        if (scenarios.length > 0 && (!selectedScenario || !scenarios.includes(selectedScenario))) {
            setSelectedScenario(scenarios[0]);
        }
    }, [results, scenarios, selectedScenario]);

    // Load adapter lines of code data
    const adapterLocMap: Record<string, number> = {};
    if (adapterLocData && adapterLocData.adapters) {
        Object.entries(adapterLocData.adapters).forEach(([name, data]: [string, any]) => {
            adapterLocMap[name] = data.linesOfCode;
        });
    }

    // Always show results for selected scenario only
    const filteredResults = selectedScenario
        ? results.filter((r) => r.scenario === selectedScenario)
        : [];

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
                        'Reactive collections with CNS (Compositional Neural State) - combines Cnstra core with OIMDB reactive indexing',
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

    if (filteredResults.length === 0) {
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
                    No results for selected scenario
                </h3>
                <p style={{ fontSize: 16, color: '#888' }}>Please select a scenario with results</p>
            </div>
        );
    }

    // Prepare chart data for comparison mode
    const chartData =
        comparisonMode && filteredResults.length > 1
            ? {
                  executionTime: filteredResults.map((r) => ({
                      label: r.adapter,
                      value: r.average.executionTime,
                      color: getAdapterColor(r.adapter),
                  })),
                  memoryUsage: filteredResults.map((r) => ({
                      label: r.adapter,
                      value: r.average.memoryUsage,
                      color: getAdapterColor(r.adapter),
                  })),
                  fps: filteredResults.map((r) => ({
                      label: r.adapter,
                      value: r.average.fps,
                      color: getAdapterColor(r.adapter),
                  })),
              }
            : null;

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

            {/* Test Information */}
            {selectedScenario && filteredResults.length > 0 && (
                <div
                    style={{
                        marginBottom: 32,
                        padding: 24,
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
                        📋 Test Information:{' '}
                        {selectedScenario
                            .replace(/-/g, ' ')
                            .replace(/\b\w/g, (l) => l.toUpperCase())}
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
                            <strong style={{ display: 'block', marginBottom: 8, fontSize: '15px' }}>
                                🧪 What We Tested:
                            </strong>
                            {selectedScenario === 'inline-editing' && (
                                <div style={{ opacity: 0.95 }}>
                                    Rapid text editing simulation: 20 consecutive comment text
                                    updates with 16ms delays between each keystroke. Measures
                                    reactivity and input responsiveness during frequent state
                                    changes.
                                </div>
                            )}
                            {selectedScenario === 'bulk-update' && (
                                <div style={{ opacity: 0.95 }}>
                                    Batch operations: 5 cycles of bulk tag toggles on 10 cards,
                                    followed by background churn operations. Measures efficiency of
                                    bulk state updates and batch processing.
                                </div>
                            )}
                            {selectedScenario === 'background-churn' && (
                                <div style={{ opacity: 0.95 }}>
                                    Continuous background updates: Multiple concurrent updates to
                                    different entities (decks, cards, comments). Measures
                                    performance under sustained load and update amplification.
                                </div>
                            )}
                        </div>
                        <div>
                            <strong style={{ display: 'block', marginBottom: 8, fontSize: '15px' }}>
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
                            <strong style={{ display: 'block', marginBottom: 8, fontSize: '15px' }}>
                                🔬 Measurement Methodology:
                            </strong>
                            <div style={{ opacity: 0.95 }}>
                                • <strong>Runs:</strong> 5 iterations per adapter (100ms pause
                                between runs) for statistical accuracy
                                <br />• <strong>Execution Time:</strong> Total time from start to
                                end (includes all delays/timeouts, measured via performance.now())
                                <br />• <strong>Memory:</strong> Change in memory during test
                                execution only (baseline before test excluded). GC is forced before
                                each run if available (Chrome DevTools).
                                <br />• <strong>FPS:</strong> Frame rate measured during test
                                execution using requestAnimationFrame counter
                                <br />• <strong>Renders:</strong> Total React component re-renders
                                tracked via render counter (reset before each run)
                                <br />• <strong>Latency:</strong> Time from state update to visual
                                change (update → React flush → paint via RAF). P50/P95/P99
                                percentiles across all operations.
                                <br />• <strong>Fairness:</strong> Same dataset (seed:42) and
                                workload for all adapters. Store creation happens before
                                measurements.
                                <br />• Results show averages across all 5 runs for better
                                statistical significance
                            </div>
                        </div>
                        {filteredResults.length > 1 && (
                            <div>
                                <strong
                                    style={{
                                        display: 'block',
                                        marginBottom: 8,
                                        fontSize: '15px',
                                    }}
                                >
                                    🏆 Winners by Metric:
                                </strong>
                                <div style={{ opacity: 0.95 }}>
                                    {(() => {
                                        const execTimes = filteredResults.map(
                                            (r) => r.average.executionTime,
                                        );
                                        const bestExec = Math.min(...execTimes);
                                        const bestExecAdapter = filteredResults.find(
                                            (r) => r.average.executionTime === bestExec,
                                        )?.adapter;

                                        const memoryUsages = filteredResults.map(
                                            (r) => r.average.memoryUsage,
                                        );
                                        const bestMemory = Math.min(...memoryUsages);
                                        const bestMemoryAdapter = filteredResults.find(
                                            (r) => r.average.memoryUsage === bestMemory,
                                        )?.adapter;

                                        const fpsValues = filteredResults.map((r) => r.average.fps);
                                        const bestFps = Math.max(...fpsValues);
                                        const bestFpsAdapter = filteredResults.find(
                                            (r) => r.average.fps === bestFps,
                                        )?.adapter;

                                        return (
                                            <>
                                                <strong>⏱️ Fastest:</strong> {bestExecAdapter}
                                                <br />
                                                <strong>💾 Least Memory:</strong>{' '}
                                                {bestMemoryAdapter}
                                                <br />
                                                <strong>🎮 Best FPS:</strong> {bestFpsAdapter}
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Filters */}
            <div
                style={{
                    display: 'flex',
                    gap: 20,
                    marginBottom: 32,
                    alignItems: 'center',
                    padding: '20px',
                    background: '#f8f9fa',
                    borderRadius: '12px',
                    border: '1px solid #e9ecef',
                }}
            >
                <label
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        fontWeight: 600,
                        color: '#333',
                    }}
                >
                    <span>Scenario:</span>
                    <select
                        value={selectedScenario}
                        onChange={(e) => setSelectedScenario(e.target.value)}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: '2px solid #ddd',
                            fontSize: '14px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            background: 'white',
                            minWidth: 200,
                        }}
                    >
                        {scenarios.map((scenario) => (
                            <option key={scenario} value={scenario}>
                                {scenario
                                    .replace(/-/g, ' ')
                                    .replace(/\b\w/g, (l) => l.toUpperCase())}
                            </option>
                        ))}
                    </select>
                </label>

                {/* Charts toggle removed */}
            </div>

            {/* Charts removed */}

            {/* Results Table */}
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
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
                                    textAlign: 'left',
                                    fontWeight: 700,
                                    fontSize: '14px',
                                }}
                            >
                                🎯 Scenario
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
                        {filteredResults
                            .sort((a, b) => getPerformanceScore(b) - getPerformanceScore(a))
                            .map((result, index) => {
                                const score = getPerformanceScore(result);

                                // Calculate best/worst for each metric within filtered results
                                const executionTimes = filteredResults.map(
                                    (r) => r.average.executionTime,
                                );
                                const renderCounts = filteredResults.map(
                                    (r) => r.average.renderCount,
                                );
                                const memoryUsages = filteredResults.map(
                                    (r) => r.average.memoryUsage,
                                );
                                const fpsValues = filteredResults.map((r) => r.average.fps);

                                const isBestExecution =
                                    result.average.executionTime === Math.min(...executionTimes);
                                const isBestRenders =
                                    result.average.renderCount === Math.min(...renderCounts);
                                const isBestMemory =
                                    result.average.memoryUsage === Math.min(...memoryUsages);
                                const isBestFps = result.average.fps === Math.max(...fpsValues);

                                const isWorstExecution =
                                    result.average.executionTime === Math.max(...executionTimes);
                                const isWorstRenders =
                                    result.average.renderCount === Math.max(...renderCounts);
                                const isWorstMemory =
                                    result.average.memoryUsage === Math.max(...memoryUsages);
                                const isWorstFps = result.average.fps === Math.min(...fpsValues);

                                return (
                                    <tr
                                        key={`${result.adapter}-${result.scenario}-${index}`}
                                        style={{
                                            backgroundColor: index % 2 === 0 ? '#fafafa' : 'white',
                                            borderBottom: '1px solid #eee',
                                            transition: 'background 0.2s ease',
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = '#f0f4ff';
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
                                                    color: getAdapterColor(result.adapter),
                                                    display: 'inline-block',
                                                    padding: '4px 12px',
                                                    background: `${getAdapterColor(result.adapter)}15`,
                                                    borderRadius: '6px',
                                                }}
                                            >
                                                {result.adapter}
                                            </span>
                                        </td>
                                        <td
                                            style={{ padding: 16, fontSize: '14px', color: '#666' }}
                                        >
                                            {result.scenario
                                                .replace(/-/g, ' ')
                                                .replace(/\b\w/g, (l) => l.toUpperCase())}
                                        </td>
                                        <td style={{ padding: 16, textAlign: 'right' }}>
                                            {(() => {
                                                // Strip "(ids-based)" suffix to match LOC map keys
                                                const baseAdapterName = result.adapter.replace(
                                                    / \(ids-based\)$/,
                                                    '',
                                                );
                                                const loc = adapterLocMap[baseAdapterName];
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
                                                        style={{ color: '#999', fontSize: '12px' }}
                                                    >
                                                        —
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                        <td style={{ padding: 16, textAlign: 'right' }}>
                                            <span
                                                style={{
                                                    backgroundColor: getScoreColor(score),
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
                                                {isBestExecution && filteredResults.length > 1 && (
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
                                                {isWorstExecution && filteredResults.length > 1 && (
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
                                                            isBestExecution || isWorstExecution
                                                                ? 700
                                                                : 400,
                                                    }}
                                                >
                                                    {formatNumber(result.average.executionTime, 1)}
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
                                                {isBestRenders && filteredResults.length > 1 && (
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
                                                {isWorstRenders && filteredResults.length > 1 && (
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
                                                            isBestRenders || isWorstRenders
                                                                ? 700
                                                                : 400,
                                                    }}
                                                >
                                                    {formatNumber(result.average.renderCount, 0)}
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
                                                {isBestMemory && filteredResults.length > 1 && (
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
                                                {isWorstMemory && filteredResults.length > 1 && (
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
                                                            isBestMemory || isWorstMemory
                                                                ? 700
                                                                : 400,
                                                    }}
                                                >
                                                    {formatBytes(
                                                        result.average.memoryUsage * 1024 * 1024,
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
                                                {isBestFps && filteredResults.length > 1 && (
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
                                                {isWorstFps && filteredResults.length > 1 && (
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
                                                            isBestFps || isWorstFps ? 700 : 400,
                                                    }}
                                                >
                                                    {formatNumber(result.average.fps, 1)}
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
                                            {formatNumber(result.average.latency.p50, 2)}
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
                                            {formatNumber(result.average.latency.p95, 2)}
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
                                            {formatNumber(result.average.latency.p99, 2)}
                                        </td>
                                    </tr>
                                );
                            })}
                    </tbody>
                </table>
            </div>

            {/* Summary removed */}
        </div>
    );
};
