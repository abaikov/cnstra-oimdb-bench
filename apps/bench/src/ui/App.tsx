import React, { useMemo, useRef, useState, useContext, createContext } from 'react';
import { generateDataset, createFpsMeter, createMarks, createRenderCounter } from '@bench/core';
import type { StoreAdapter, RootState, ID, Deck, Card, Comment } from '@bench/core';
import { createWorkloadDriver } from '@bench/core';
import { FpsGauge, KeystrokeLatency, MountProfiler } from './Overlays';
import { BenchmarkResults } from './BenchmarkResults';
import placeholder from '@bench/adapter-placeholder';
import cnstraOimdb from '@bench/adapter-cnstra-oimdb';
import redux from '@bench/adapter-redux';
import effector from '@bench/adapter-effector';
import mobx from '@bench/adapter-mobx';
import zustand from '@bench/adapter-zustand';
import recoil from '@bench/adapter-recoil';
import jotai from '@bench/adapter-jotai';
import valtio from '@bench/adapter-valtio';

const AdapterContext = createContext<{ adapter: StoreAdapter; actions: any } | null>(null);

const adapters: StoreAdapter[] = [
  cnstraOimdb,
  redux,
  mobx,
  zustand,
].filter(Boolean) as any;

const renderCounter = createRenderCounter();
const overlaysEnabled = new URLSearchParams(window.location.search).get('overlays') === '1';

// Local benchmark types and functions
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

function getMemoryUsage(): number {
  if ('memory' in performance) {
    const memory = (performance as any).memory;
    if (memory && typeof memory.usedJSHeapSize === 'number' && !isNaN(memory.usedJSHeapSize)) {
      return memory.usedJSHeapSize / 1024 / 1024; // MB
    }
  }
  return 0;
}

function calculatePercentile(values: number[], percentile: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function createBenchmarkRunner() {
  const results: BenchmarkResult[] = [];
  
  return {
    async runBenchmark(
      scenario: string,
      adapter: string,
      workloadFn: () => Promise<void>,
      runs: number = 3
    ): Promise<BenchmarkResult> {
      const scenarioResults: BenchmarkMetrics[] = [];
      
      for (let i = 0; i < runs; i++) {
        // Reset render counters per run to avoid accumulation across runs/scenarios
        renderCounter.reset();
        const fpsMeter = createFpsMeter();
        const latencies: number[] = [];
        
        // Start measurements
        fpsMeter.start();
        const startTime = performance.now();
        const startMemory = getMemoryUsage();
        
        // Run workload with latency measurement
        const workloadWithLatency = async () => {
          const latencyStart = performance.now();
          await workloadFn();
          const latencyEnd = performance.now();
          latencies.push(latencyEnd - latencyStart);
        };
        
        await workloadWithLatency();
        
        // Stop measurements
        const endTime = performance.now();
        const endMemory = getMemoryUsage();
        const fps = fpsMeter.stop();
        
        // Calculate timeout time to subtract
        let timeoutTime = 0;
        if (scenario === 'search-typing') {
          timeoutTime = 5 * 50 + 100; // 5 queries * 50ms + 100ms clear
        } else if (scenario === 'background-churn') {
          timeoutTime = 1000; // 1 second
        } else if (scenario === 'inline-editing') {
          timeoutTime = 20 * 16; // 20 edits * 16ms
        } else if (scenario === 'bulk-update') {
          timeoutTime = 100; // 100ms
        }
        
        const rawMemory = endMemory - startMemory;
        const safeMemory = Number.isFinite(rawMemory) && rawMemory >= 0 ? rawMemory : 0;
        const safeFps = Number.isFinite(fps) && fps >= 0 ? fps : 0;
        const metrics: BenchmarkMetrics = {
          executionTime: (endTime - startTime) - timeoutTime,
          renderCount: Object.values(renderCounter.get()).reduce((a, b) => a + b, 0),
          memoryUsage: safeMemory,
          fps: safeFps,
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
        memoryUsage: scenarioResults.reduce((sum, r) => sum + (Number.isFinite(r.memoryUsage) ? r.memoryUsage : 0), 0) / runs,
        fps: scenarioResults.reduce((sum, r) => sum + (Number.isFinite(r.fps) ? r.fps : 0), 0) / runs,
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

const benchmarkRunner = createBenchmarkRunner();

function useCounterKey(name: string) {
  renderCounter.increment(name);
}

const DeckRowBase: React.FC<{ adapter: StoreAdapter; deckId: string; style: React.CSSProperties; }> = ({ adapter, deckId, style }) => {
  useCounterKey('DeckRow');
  const deck = adapter.hooks.useDeckById(deckId);
  const cards = adapter.hooks.useCardsByDeckId(deckId);
  
  if (!deck) {
    return <div style={style}>Loading...</div>;
  }
  
  return (
    <div style={{...style, display: 'flex', flexDirection: 'column', padding: 8, borderBottom: '1px solid #eee'}}>
      <div style={{display:'flex', justifyContent:'space-between'}}>
        <strong>{deck.title}</strong>
        <small>{cards.length} cards</small>
      </div>
      <div style={{display:'flex', gap: 8}}>
        {cards.map((c) => (
          <CardPreview key={c.id} adapter={adapter} card={c} />
        ))}
      </div>
    </div>
  );
};
const DeckRow = DeckRowBase;

const CardPreviewBase: React.FC<{ adapter: StoreAdapter; card: Card }> = ({ adapter, card }) => {
  useCounterKey('CardPreview');
  const comments = adapter.hooks.useCommentsByCardId(card.id, 2);
  return (
    <div style={{flex:'0 0 300px', border:'1px solid #ddd', borderRadius:6, padding:8}}>
      <div><strong>{card.title}</strong></div>
      <div style={{color:'#555', fontSize:12}}>{card.description}</div>
      <div style={{marginTop:6}}>
        {comments.map((cm) => (
          <div key={cm.id} style={{fontSize:12}}>{cm.text}</div>
        ))}
      </div>
    </div>
  );
};
const CardPreview = React.memo(CardPreviewBase);

const SidePanel: React.FC<{ adapter: StoreAdapter }> = ({ adapter }) => {
  useCounterKey('SidePanel');
  const activeId = adapter.hooks.useActiveDeckId();
  const deck = activeId ? adapter.hooks.useDeckById(activeId) : undefined;
  const [text, setText] = useState('');
  return (
    <div style={{width:320, borderLeft:'1px solid #eee', padding:8}}>
      <div style={{fontWeight:600}}>Active Deck</div>
      <div style={{marginBottom:8}}>{deck ? deck.title : 'None'}</div>
      <div style={{fontSize:12, color:'#666'}}>Inline comment composer</div>
      <input
        style={{width:'100%', padding:6, border:'1px solid #ccc', borderRadius:4}}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
        placeholder="Type here to stress updates"
      />
    </div>
  );
};

const HeatmapOverlay: React.FC = () => {
  useCounterKey('HeatmapOverlay');
  const counts = renderCounter.get();
  const totalRenders = Object.values(counts).reduce((a, b) => a + b, 0);
  
  return (
    <div style={{position:'fixed', right:10, bottom:10, background:'rgba(0,0,0,0.9)', color:'#fff', padding:12, borderRadius:8, fontSize:12, minWidth: 250}}>
      <div style={{fontWeight:600, marginBottom:8, borderBottom: '1px solid #fff', paddingBottom: 4}}>
        Render Counter Monitor
      </div>
      <div style={{marginBottom: 8, fontSize: 11, color: '#ccc'}}>
        Tracks component re-renders for performance analysis
      </div>
      <div style={{marginBottom: 8}}>
        <strong>Total Renders: {totalRenders}</strong>
      </div>
      {Object.entries(counts).map(([k, v]) => (
        <div key={k} style={{display: 'flex', justifyContent: 'space-between', marginBottom: 2}}>
          <span>{k}:</span>
          <span style={{fontWeight: 'bold', color: v > 20 ? '#ff6b6b' : v > 10 ? '#feca57' : '#48cae4'}}>{v}</span>
        </div>
      ))}
      <div style={{fontSize: 10, color: '#ccc', marginTop: 8}}>
        Red: {'>'}20, Yellow: {'>'}10, Blue: ≤10
        <br />
        Lower numbers = better performance
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  useCounterKey('App');
  
  // Generate test dataset - full dataset for fair comparison
  const dataset = useMemo(() => generateDataset({ 
    decks: 50, 
    cardsPerDeck: 10, 
    minCommentsPerCard: 3,
    maxCommentsPerCard: 5,
    users: 2000,
    tags: 50,
    seed: 42 
  }), []);
  
  // Adapter selection
  const [adapterIndex, setAdapterIndex] = useState(0);
  const adapter = adapters[adapterIndex];
  
  // Create store and actions for current adapter
  const store = useMemo(() => adapter.createStore(dataset), [adapter, dataset]);
  const actions = useMemo(() => adapter.bindActions(store), [adapter, store]);
  
  // Search state
  const [searchText, setSearchText] = useState('');
  
  // Benchmark results
  const [benchmarkResults, setBenchmarkResults] = useState<BenchmarkResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  
  const Provider = adapter.Provider;
  const wrap = adapter.wrapComponent ? adapter.wrapComponent : ((C: any) => C);

  // Wrap components with adapter-provided observer (e.g., MobX)
  const DeckListWrapped = useMemo(() => wrap(DeckList), [adapter]);
  const DeckItemWrapped = useMemo(() => wrap(DeckItem), [adapter]);
  const CardItemWrapped = useMemo(() => wrap(CardItem), [adapter]);
  const CommentsListWrapped = useMemo(() => wrap(CommentsList), [adapter]);
  const CommentItemWrapped = useMemo(() => wrap(CommentItem), [adapter]);
  const SidePanelWrapped = useMemo(() => wrap(SidePanel), [adapter]);

  const handleBenchmarkComplete = (result: BenchmarkResult) => {
    setBenchmarkResults(prev => [...prev, result]);
  };

  const handleClearResults = () => {
    setBenchmarkResults([]);
    benchmarkRunner.clearResults();
    renderCounter.reset();
  };

  if (showResults) {
    return (
      <div style={{ height: '100vh', overflow: 'auto' }}>
        <div style={{ 
          padding: 20, 
          borderBottom: '1px solid #eee',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h1>Benchmark Results</h1>
          <button 
            onClick={() => setShowResults(false)}
            style={{
              padding: '8px 16px',
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer'
            }}
          >
            Back to App
          </button>
        </div>
        <BenchmarkResults 
          results={benchmarkResults} 
          onClear={handleClearResults}
        />
      </div>
    );
  }

  return (
    <Provider store={store}>
      <AdapterContext.Provider value={{ adapter, actions }}>
        <div style={{display:'flex', height:'100vh'}}>
          <div style={{flex:1, display:'flex', flexDirection:'column'}}>
            <Toolbar
              adapter={adapter}
              adapterIndex={adapterIndex}
              setAdapterIndex={setAdapterIndex}
              actions={actions}
              searchText={searchText}
              setSearchText={(v) => { setSearchText(v); actions.setSearchQuery(v); }}
              onBenchmarkComplete={handleBenchmarkComplete}
              onShowResults={() => setShowResults(true)}
            />
            <div style={{flex:1, position:'relative', overflow:'hidden'}}>
              <DeckListWrapped adapter={adapter} />
              <HeatmapOverlay />
            </div>
          </div>
          <SidePanelWrapped adapter={adapter} />
        </div>
      </AdapterContext.Provider>
    </Provider>
  );
};

const DeckList: React.FC<{ adapter: StoreAdapter }> = ({ adapter }) => {
  useCounterKey('DeckList');
  const deckIds = adapter.hooks.useDeckIds();
  const DeckItemC = adapter.wrapComponent ? adapter.wrapComponent(DeckItem) : DeckItem;
  
  // Show more items now that we have proper scrollable list
  const displayedDecks = deckIds.slice(0, 100);
  
  return (
    <div style={{ 
      height: '100%', 
      overflow: 'auto', 
      padding: '16px'
    }}>
      {displayedDecks.map((deckId) => (
        <DeckItemC key={deckId} deckId={deckId} />
      ))}
    </div>
  );
};

const DeckItem: React.FC<{ deckId: string }> = ({ deckId }) => {
  useCounterKey('DeckItem');
  // Get deck data by ID using the current context adapter
  const ctx = useContext(AdapterContext);
  if (!ctx) throw new Error('Adapter context not found');
  
  const deck = ctx.adapter.hooks.useDeckById(deckId);
  const cards = ctx.adapter.hooks.useCardsByDeckId(deckId);
  
  if (!deck) {
    return (
      <div style={{ padding: 16, borderBottom: '1px solid #eee' }}>
        Loading deck...
      </div>
    );
  }
  
  return (
    <div style={{ 
      padding: 16, 
      borderBottom: '1px solid #eee',
      boxSizing: 'border-box'
    }}>
      <strong style={{ fontSize: 16, display: 'block', marginBottom: 8 }}>{deck.title}</strong>
      <div style={{ marginBottom: 8, fontSize: 12, color: '#666' }}>
        {cards.length} cards
      </div>
      <div>
        <CardsList cards={cards} />
      </div>
    </div>
  );
};

const CardsList: React.FC<{ cards: any[] }> = ({ cards }) => {
  useCounterKey('CardsList');
  const ctx = useContext(AdapterContext);
  if (!ctx) throw new Error('Adapter context not found');
  const CardItemC = ctx.adapter.wrapComponent ? ctx.adapter.wrapComponent(CardItem) : CardItem;
  
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
      {cards.map(card => (
        <CardItemC key={card.id} cardId={card.id} />
      ))}
    </div>
  );
};

const CardItem: React.FC<{ cardId: string }> = ({ cardId }) => {
  useCounterKey('CardItem');
  const ctx = useContext(AdapterContext);
  if (!ctx) throw new Error('Adapter context not found');
  
  const card = ctx.adapter.hooks.useCardById(cardId);
  const comments = ctx.adapter.hooks.useCommentsByCardId(cardId);
  
  if (!card) return <div>Loading card...</div>;
  
  return (
    <div style={{ 
      border: '1px solid #ddd', 
      borderRadius: 6, 
      padding: 12, 
      backgroundColor: '#fafafa',
    }}>
      <div style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 4 }}>
        {card.title}
      </div>
      <div style={{ color: '#666', fontSize: 12, marginBottom: 8 }}>
        {card.description}
      </div>
      <div style={{ borderTop: '1px solid #eee', paddingTop: 8 }}>
        <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 6 }}>
          Comments ({comments.length}):
        </div>
        <CommentsList comments={comments} />
      </div>
    </div>
  );
};

const CommentsList: React.FC<{ comments: any[] }> = ({ comments }) => {
  const ctx = useContext(AdapterContext);
  if (!ctx) throw new Error('Adapter context not found');
  const CommentItemC = ctx.adapter.wrapComponent ? ctx.adapter.wrapComponent(CommentItem) : CommentItem;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {comments.map(comment => (
        <CommentItemC key={comment.id} commentId={comment.id} />
      ))}
    </div>
  );
};

const CommentItem: React.FC<{ commentId: string }> = ({ commentId }) => {
  useCounterKey('CommentItem');
  const ctx = useContext(AdapterContext);
  if (!ctx) throw new Error('Adapter context not found');
  
  const comment = ctx.adapter.hooks.useCommentById(commentId);
  const user = ctx.adapter.hooks.useUserById(comment?.authorId || '');
  
  if (!comment) return null;
  
  const isEditing = comment.isEditing || false;
  
  const handleEditStart = () => {
    ctx.actions.setCommentEditing(commentId, true);
  };
  
  const handleEditSave = () => {
    ctx.actions.setCommentEditing(commentId, false);
  };
  
  const handleEditCancel = () => {
    ctx.actions.setCommentEditing(commentId, false);
  };
  
  const handleTextChange = (text: string) => {
    ctx.actions.updateCommentText(commentId, text);
  };
  
  return (
    <div style={{ 
      padding: 8, 
      backgroundColor: '#ffffff',
      border: '1px solid #e0e0e0',
      borderRadius: 4,
      fontSize: 12
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div style={{ fontWeight: 'bold', color: '#333' }}>
          {user?.name || 'Unknown User'}
        </div>
        {!isEditing && (
          <button 
            onClick={handleEditStart}
            style={{ 
              fontSize: 10, 
              padding: '2px 6px', 
              border: '1px solid #ccc', 
              borderRadius: 3, 
              backgroundColor: '#f8f8f8',
              cursor: 'pointer'
            }}
          >
            Edit
          </button>
        )}
      </div>
      
      {isEditing ? (
        <div>
          <textarea
            value={comment.text}
            onChange={(e) => handleTextChange(e.target.value)}
            style={{
              width: '100%',
              minHeight: 60,
              padding: 4,
              fontSize: 11,
              border: '1px solid #ccc',
              borderRadius: 3,
              resize: 'vertical',
              fontFamily: 'inherit'
            }}
          />
          <div style={{ marginTop: 4, display: 'flex', gap: 4 }}>
            <button
              onClick={handleEditSave}
              style={{
                fontSize: 10,
                padding: '4px 8px',
                border: 'none',
                borderRadius: 3,
                backgroundColor: '#007bff',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              Save
            </button>
            <button
              onClick={handleEditCancel}
              style={{
                fontSize: 10,
                padding: '4px 8px',
                border: '1px solid #ccc',
                borderRadius: 3,
                backgroundColor: '#f8f8f8',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ color: '#555', lineHeight: 1.4 }}>
          {comment.text}
        </div>
      )}
    </div>
  );
};

const Toolbar: React.FC<{ 
  adapter: StoreAdapter; 
  adapterIndex: number; 
  setAdapterIndex: (i: number) => void; 
  actions: any; 
  searchText: string; 
  setSearchText: (v: string) => void;
  onBenchmarkComplete: (result: BenchmarkResult) => void;
  onShowResults: () => void;
}> = ({ adapter, adapterIndex, setAdapterIndex, actions, searchText, setSearchText, onBenchmarkComplete, onShowResults }) => {
  useCounterKey('Toolbar');
  const names = adapters.map((a) => a.name);
  
  // Benchmark scenarios (search removed)

  const runUpdateBenchmark = async () => {
    console.log(`🔄 Starting Update Benchmark for ${adapter.name}...`);
    
    const result = await benchmarkRunner.runBenchmark(
      'background-churn',
      adapter.name,
      async () => {
        actions.backgroundChurnStart();
        await new Promise(resolve => setTimeout(resolve, 1000));
        actions.backgroundChurnStop();
      },
      3
    );
    
    console.log(`✅ Update Benchmark Results - ${adapter.name}:`, result);
    onBenchmarkComplete(result);
  };

  const runInlineEditBenchmark = async () => {
    console.log(`✏️ Starting Inline Edit Benchmark for ${adapter.name}...`);
    
    const result = await benchmarkRunner.runBenchmark(
      'inline-editing',
      adapter.name,
      async () => {
        // Simulate editing a comment
        const commentId = 'comment_0';
        for (let i = 0; i < 20; i++) {
          actions.updateCommentText(commentId, `Editing comment ${i}`);
          await new Promise(resolve => setTimeout(resolve, 16));
        }
      },
      3
    );
    
    console.log(`✅ Inline Edit Benchmark Results - ${adapter.name}:`, result);
    onBenchmarkComplete(result);
  };

  const runBulkUpdateBenchmark = async () => {
    console.log(`📦 Starting Bulk Update Benchmark for ${adapter.name}...`);
    
    const result = await benchmarkRunner.runBenchmark(
      'bulk-update',
      adapter.name,
      async () => {
        // Get some card IDs for bulk update
        const cardIds = ['card_0', 'card_1', 'card_2', 'card_3', 'card_4'];
        actions.bulkToggleTagOnCards(cardIds, 'tag_0');
        await new Promise(resolve => setTimeout(resolve, 100));
      },
      3
    );
    
    console.log(`✅ Bulk Update Benchmark Results - ${adapter.name}:`, result);
    onBenchmarkComplete(result);
  };

  const runAllBenchmarks = async () => {
    console.log(`🚀 Running all benchmarks for ${adapter.name}...`);
    
    await runUpdateBenchmark();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await runInlineEditBenchmark();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await runBulkUpdateBenchmark();
    
    console.log(`🎉 All benchmarks completed for ${adapter.name}!`);
  };
  
  return (
    <div style={{display:'flex', alignItems:'center', gap:8, padding:8, borderBottom:'1px solid #eee', flexWrap: 'wrap'}}>
      <select value={adapterIndex} onChange={(e) => setAdapterIndex(Number(e.target.value))}>
        {names.map((n, i) => (
          <option key={`${n}-${i}`} value={i}>{n}</option>
        ))}
      </select>
      <input 
        placeholder="Search decks..." 
        value={searchText} 
        onChange={(e) => setSearchText(e.target.value)} 
        style={{minWidth: 150}}
      />
      {/* Search benchmark removed */}
      <button onClick={runUpdateBenchmark} style={{backgroundColor: '#2196F3', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 4, fontSize: '12px'}}>
        🔄 Updates
      </button>
      <button onClick={runInlineEditBenchmark} style={{backgroundColor: '#FF9800', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 4, fontSize: '12px'}}>
        ✏️ Edit
      </button>
      <button onClick={runBulkUpdateBenchmark} style={{backgroundColor: '#9C27B0', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 4, fontSize: '12px'}}>
        📦 Bulk
      </button>
      <button onClick={runAllBenchmarks} style={{backgroundColor: '#E91E63', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 4, fontSize: '12px', fontWeight: 'bold'}}>
        🚀 All Tests
      </button>
      <button onClick={onShowResults} style={{backgroundColor: '#607D8B', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 4, fontSize: '12px'}}>
        📊 Results
      </button>
      <button onClick={() => renderCounter.reset()} style={{backgroundColor: '#6c757d', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 4, fontSize: '12px'}}>
        Reset
      </button>
    </div>
  );
};
