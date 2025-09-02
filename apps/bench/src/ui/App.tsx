import React, { useMemo, useRef, useState, useContext, createContext } from 'react';
import { generateDataset, createFpsMeter, createMarks, createRenderCounter } from '@bench/core';
import type { StoreAdapter, RootState, ID, Deck, Card, Comment } from '@bench/core';
import { createWorkloadDriver } from '@bench/core';
import { FpsGauge, KeystrokeLatency, MountProfiler } from './Overlays';
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
].filter(Boolean) as any;

const renderCounter = createRenderCounter();
const overlaysEnabled = new URLSearchParams(window.location.search).get('overlays') === '1';

function useCounterKey(name: string) {
  renderCounter.increment(name);
}

const DeckRowBase: React.FC<{ adapter: StoreAdapter; deckId: string; style: React.CSSProperties; }> = ({ adapter, deckId, style }) => {
  useCounterKey('DeckRow');
  const deck = adapter.hooks.useDeckById(deckId);
  const cards = adapter.hooks.useCardsByDeckId(deckId, 3);
  
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
  
  // Generate test dataset
  const dataset = useMemo(() => generateDataset({ decks: 100, cardsPerDeck: 5, seed: 42 }), []);
  
  // Adapter selection
  const [adapterIndex, setAdapterIndex] = useState(0);
  const adapter = adapters[adapterIndex];
  
  // Create store and actions for current adapter
  const store = useMemo(() => adapter.createStore(dataset), [adapter, dataset]);
  const actions = useMemo(() => adapter.bindActions(store), [adapter, store]);
  
  // Search state
  const [searchText, setSearchText] = useState('');
  
  const Provider = adapter.Provider;

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
            />
            <div style={{flex:1, position:'relative', overflow:'hidden'}}>
              <DeckList adapter={adapter} />
              <HeatmapOverlay />
            </div>
          </div>
          <SidePanel adapter={adapter} />
        </div>
      </AdapterContext.Provider>
    </Provider>
  );
};

const DeckList: React.FC<{ adapter: StoreAdapter }> = ({ adapter }) => {
  useCounterKey('DeckList');
  const deckIds = adapter.hooks.useDeckIds();
  
  // Show more items now that we have proper scrollable list
  const displayedDecks = deckIds.slice(0, 100);
  
  return (
    <div style={{ 
      height: '100%', 
      overflow: 'auto', 
      padding: '16px'
    }}>
      {displayedDecks.map((deckId) => (
        <DeckItem key={deckId} deckId={deckId} />
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
  const cards = ctx.adapter.hooks.useCardsByDeckId(deckId, 3);
  
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
  
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
      {cards.map(card => (
        <CardItem key={card.id} cardId={card.id} />
      ))}
    </div>
  );
};

const CardItem: React.FC<{ cardId: string }> = ({ cardId }) => {
  useCounterKey('CardItem');
  const ctx = useContext(AdapterContext);
  if (!ctx) throw new Error('Adapter context not found');
  
  const card = ctx.adapter.hooks.useCardById(cardId);
  const comments = ctx.adapter.hooks.useCommentsByCardId(cardId, 3);
  
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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {comments.map(comment => (
        <CommentItem key={comment.id} commentId={comment.id} />
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
}> = ({ adapter, adapterIndex, setAdapterIndex, actions, searchText, setSearchText }) => {
  useCounterKey('Toolbar');
  const names = adapters.map((a) => a.name);
  
  // Benchmark scenarios
  const runSearchBenchmark = () => {
    console.log(`🔍 Starting Search Benchmark for ${adapter.name}...`);
    renderCounter.reset();
    const startTime = performance.now();
    setSearchText('Deck 1');
    setTimeout(() => {
      const endTime = performance.now();
      const counts = renderCounter.get();
      const totalRenders = Object.values(counts).reduce((a, b) => a + b, 0);
      console.log(`✅ Search Benchmark Results - ${adapter.name}:`, {
        executionTime: `${(endTime - startTime).toFixed(2)}ms`,
        totalRenders: totalRenders,
        efficiency: `${(totalRenders / (endTime - startTime) * 1000).toFixed(1)} renders/second`,
        renderBreakdown: counts
      });
      setSearchText('');
    }, 100);
  };

  const runUpdateBenchmark = () => {
    console.log(`🔄 Starting Update Benchmark for ${adapter.name}...`);
    renderCounter.reset();
    const startTime = performance.now();
    actions.backgroundChurnStart();
    setTimeout(() => {
      actions.backgroundChurnStop();
      const endTime = performance.now();
      const counts = renderCounter.get();
      const totalRenders = Object.values(counts).reduce((a, b) => a + b, 0);
      console.log(`✅ Update Benchmark Results - ${adapter.name}:`, {
        executionTime: `${(endTime - startTime).toFixed(2)}ms`,
        totalRenders: totalRenders,
        efficiency: `${(totalRenders / (endTime - startTime) * 1000).toFixed(1)} renders/second`,
        renderBreakdown: counts
      });
    }, 1000);
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
      <button onClick={runSearchBenchmark} style={{backgroundColor: '#007bff', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 4}}>
        Benchmark Search
      </button>
      <button onClick={runUpdateBenchmark} style={{backgroundColor: '#28a745', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 4}}>
        Benchmark Updates
      </button>
      <button onClick={() => renderCounter.reset()} style={{backgroundColor: '#6c757d', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 4}}>
        Reset Counters
      </button>
    </div>
  );
};
