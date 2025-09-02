import React, { useState, useEffect } from 'react';

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

export const BenchmarkResults: React.FC<BenchmarkResultsProps> = ({ results, onClear }) => {
  const [selectedScenario, setSelectedScenario] = useState<string>('');
  const [comparisonMode, setComparisonMode] = useState(false);

  const scenarios = [...new Set(results.map(r => r.scenario))];
  const adapters = [...new Set(results.map(r => r.adapter))];

  const filteredResults = selectedScenario 
    ? results.filter(r => r.scenario === selectedScenario)
    : results;

  const getPerformanceScore = (result: BenchmarkResult): number => {
    const safeAvg = {
      executionTime: Number.isFinite(result.average.executionTime) ? result.average.executionTime : 0,
      renderCount: Number.isFinite(result.average.renderCount) ? result.average.renderCount : 0,
      memoryUsage: Number.isFinite(result.average.memoryUsage) ? result.average.memoryUsage : 0,
      fps: Number.isFinite(result.average.fps) ? result.average.fps : 0,
    };
    // Calculate a composite performance score
    // Lower execution time, render count, and memory usage = better score
    // Higher FPS = better score
    const executionScore = Math.max(0, 100 - (safeAvg.executionTime / 10));
    const renderScore = Math.max(0, 100 - (safeAvg.renderCount / 10));
    const memoryScore = Math.max(0, 100 - (safeAvg.memoryUsage * 10));
    const fpsScore = Math.min(100, safeAvg.fps * 2);
    
    return (executionScore + renderScore + memoryScore + fpsScore) / 4;
  };

  const getScoreColor = (score: number): string => {
    if (score >= 80) return '#4CAF50'; // Green
    if (score >= 60) return '#FF9800'; // Orange
    return '#F44336'; // Red
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

  if (results.length === 0) {
    return (
      <div style={{ 
        padding: 20, 
        textAlign: 'center', 
        color: '#666',
        border: '2px dashed #ddd',
        borderRadius: 8,
        margin: 20
      }}>
        <h3>No benchmark results yet</h3>
        <p>Run some benchmarks to see performance comparisons</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 20,
        borderBottom: '1px solid #eee',
        paddingBottom: 15
      }}>
        <h2>Benchmark Results</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button 
            onClick={onClear}
            style={{
              padding: '8px 16px',
              backgroundColor: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer'
            }}
          >
            Clear Results
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ 
        display: 'flex', 
        gap: 15, 
        marginBottom: 20,
        alignItems: 'center'
      }}>
        <label>
          Scenario:
          <select 
            value={selectedScenario} 
            onChange={(e) => setSelectedScenario(e.target.value)}
            style={{ marginLeft: 8, padding: '4px 8px' }}
          >
            <option value="">All Scenarios</option>
            {scenarios.map(scenario => (
              <option key={scenario} value={scenario}>
                {scenario.replace('-', ' ').toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input 
            type="checkbox" 
            checked={comparisonMode}
            onChange={(e) => setComparisonMode(e.target.checked)}
          />
          Comparison Mode
        </label>
      </div>

      {/* Results Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ 
          width: '100%', 
          borderCollapse: 'collapse',
          backgroundColor: 'white',
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              <th style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                Adapter
              </th>
              <th style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                Scenario
              </th>
              <th style={{ padding: 12, textAlign: 'right', borderBottom: '1px solid #ddd' }}>
                Score
              </th>
              <th style={{ padding: 12, textAlign: 'right', borderBottom: '1px solid #ddd' }}>
                Time (ms)
              </th>
              <th style={{ padding: 12, textAlign: 'right', borderBottom: '1px solid #ddd' }}>
                Renders
              </th>
              <th style={{ padding: 12, textAlign: 'right', borderBottom: '1px solid #ddd' }}>
                Memory
              </th>
              <th style={{ padding: 12, textAlign: 'right', borderBottom: '1px solid #ddd' }}>
                FPS
              </th>
              <th style={{ padding: 12, textAlign: 'right', borderBottom: '1px solid #ddd' }}>
                Latency P95
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredResults
              .sort((a, b) => getPerformanceScore(b) - getPerformanceScore(a))
              .map((result, index) => {
                const score = getPerformanceScore(result);
                return (
                  <tr 
                    key={`${result.adapter}-${result.scenario}-${index}`}
                    style={{ 
                      backgroundColor: index % 2 === 0 ? '#fafafa' : 'white',
                      borderBottom: '1px solid #eee'
                    }}
                  >
                    <td style={{ padding: 12, fontWeight: 'bold' }}>
                      {result.adapter}
                    </td>
                    <td style={{ padding: 12 }}>
                      {result.scenario.replace('-', ' ').toUpperCase()}
                    </td>
                    <td style={{ padding: 12, textAlign: 'right' }}>
                      <span style={{
                        backgroundColor: getScoreColor(score),
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}>
                        {formatNumber(score, 0)}
                      </span>
                    </td>
                    <td style={{ padding: 12, textAlign: 'right', fontFamily: 'monospace' }}>
                      {formatNumber(result.average.executionTime, 1)}
                    </td>
                    <td style={{ padding: 12, textAlign: 'right', fontFamily: 'monospace' }}>
                      {formatNumber(result.average.renderCount, 0)}
                    </td>
                    <td style={{ padding: 12, textAlign: 'right', fontFamily: 'monospace' }}>
                      {formatBytes(result.average.memoryUsage * 1024 * 1024)}
                    </td>
                    <td style={{ padding: 12, textAlign: 'right', fontFamily: 'monospace' }}>
                      {formatNumber(result.average.fps, 1)}
                    </td>
                    <td style={{ padding: 12, textAlign: 'right', fontFamily: 'monospace' }}>
                      {formatNumber(result.average.latency.p95, 2)}ms
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Summary Statistics */}
      {comparisonMode && filteredResults.length > 1 && (
        <div style={{ 
          marginTop: 30, 
          padding: 20, 
          backgroundColor: '#f8f9fa',
          borderRadius: 8,
          border: '1px solid #e9ecef'
        }}>
          <h3>Performance Comparison</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
            {['executionTime', 'renderCount', 'memoryUsage', 'fps'].map(metric => {
              const values = filteredResults.map(r => r.average[metric as keyof typeof r.average] as number);
              const best = Math.min(...values);
              const worst = Math.max(...values);
              const bestResult = filteredResults.find(r => r.average[metric as keyof typeof r.average] === best);
              const worstResult = filteredResults.find(r => r.average[metric as keyof typeof r.average] === worst);
              
              return (
                <div key={metric} style={{ 
                  padding: 15, 
                  backgroundColor: 'white',
                  borderRadius: 6,
                  border: '1px solid #ddd'
                }}>
                  <h4 style={{ margin: '0 0 10px 0', textTransform: 'capitalize' }}>
                    {metric.replace(/([A-Z])/g, ' $1').toLowerCase()}
                  </h4>
                  <div style={{ fontSize: '14px', color: '#666' }}>
                    <div>🏆 Best: {bestResult?.adapter} ({formatNumber(best, metric === 'fps' ? 1 : 2)})</div>
                    <div>⚠️ Worst: {worstResult?.adapter} ({formatNumber(worst, metric === 'fps' ? 1 : 2)})</div>
                    <div>📊 Range: {formatNumber(worst - best, 2)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
