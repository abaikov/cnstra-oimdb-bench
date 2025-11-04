import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { StoreAdapter, ID, RootState } from '@bench/core';
import { createRenderCounter } from '@bench/core';
import * as styles from './App.styles';

// PROOF: React DOES re-render children when parent re-renders, even if props don't change
let childRenderCount = 0;
let memoChildRenderCount = 0;
let grandchildRenderCount = 0;
let memoGrandchildRenderCount = 0;

const TestGrandchild = ({ value }: { value: string }) => {
    grandchildRenderCount++;
    console.log(`  [TestGrandchild] Rendered ${grandchildRenderCount} times with value="${value}"`);
    return (
        <div style={{ color: '#ff6b6b', marginLeft: 20 }}>
            → Grandchild (no memo): renders={grandchildRenderCount}
        </div>
    );
};

const TestGrandchildMemo = React.memo(({ value }: { value: string }) => {
    memoGrandchildRenderCount++;
    console.log(
        `  [TestGrandchildMemo] Rendered ${memoGrandchildRenderCount} times with value="${value}"`,
    );
    return (
        <div style={{ color: '#51cf66', marginLeft: 20 }}>
            → Grandchild (memo): renders={memoGrandchildRenderCount}
        </div>
    );
});

const TestChild = ({ value }: { value: string }) => {
    childRenderCount++;
    console.log(`[TestChild] Rendered ${childRenderCount} times with value="${value}"`);
    return (
        <div style={{ color: 'red', border: '1px solid red', padding: 5, marginTop: 5 }}>
            TestChild (no memo): renders={childRenderCount}
            <TestGrandchild value="unchanged" />
        </div>
    );
};

const TestChildMemo = React.memo(({ value }: { value: string }) => {
    memoChildRenderCount++;
    console.log(`[TestChildMemo] Rendered ${memoChildRenderCount} times with value="${value}"`);
    return (
        <div style={{ color: 'green', border: '1px solid green', padding: 5, marginTop: 5 }}>
            TestChildMemo (with memo): renders={memoChildRenderCount}
            <TestGrandchildMemo value="unchanged" />
        </div>
    );
});

const TestParent = () => {
    const [count, setCount] = useState(0);

    return (
        <div style={{ border: '2px solid blue', padding: 10, margin: 10 }}>
            <h3>🔥 PROOF: React cascading re-renders (check console!)</h3>
            <button
                onClick={() => setCount((c) => c + 1)}
                style={{ padding: 10, fontSize: 16, cursor: 'pointer' }}
            >
                Parent State: {count} (click to increment)
            </button>
            <div style={{ marginTop: 10 }}>
                <TestChild value="unchanged" />
                <TestChildMemo value="unchanged" />
                <div
                    style={{
                        marginTop: 10,
                        fontSize: 12,
                        color: '#666',
                        backgroundColor: '#fff3cd',
                        padding: 10,
                    }}
                >
                    ☝️ <strong>Click button above and watch console!</strong>
                    <br />
                    <br />
                    <strong style={{ color: 'red' }}>RED (no memo):</strong> Child AND Grandchild
                    re-render every time
                    <br />
                    <strong style={{ color: 'green' }}>GREEN (with memo):</strong> Child AND
                    Grandchild skip re-render (props unchanged)
                    <br />
                    <br />
                    <strong>Proof:</strong> When parent re-renders, ALL descendants re-render UNLESS
                    wrapped in memo!
                </div>
            </div>
        </div>
    );
};

const renderLog: Array<{
    component: string;
    timestamp: number;
    props?: any;
    hookValues?: any;
    reason?: string;
}> = [];

const globalDebugCounter = createRenderCounter();

// Hook to track why component re-rendered
function useWhyDidYouUpdate(name: string, props: any) {
    const previousProps = useRef<any>();
    const changes: string[] = [];

    // Compare synchronously during render, not in useEffect
    if (previousProps.current) {
        const allKeys = new Set([...Object.keys(previousProps.current), ...Object.keys(props)]);
        allKeys.forEach((key) => {
            const prev = previousProps.current[key];
            const current = props[key];
            if (prev !== current) {
                // For objects/arrays, show if reference changed
                const prevStr =
                    typeof prev === 'object' && prev !== null
                        ? `{...}[ref:${String(prev).slice(0, 20)}]`
                        : JSON.stringify(prev);
                const currentStr =
                    typeof current === 'object' && current !== null
                        ? `{...}[ref:${String(current).slice(0, 20)}]`
                        : JSON.stringify(current);
                changes.push(`${key}: ${prevStr} → ${currentStr}`);
            }
        });
    }

    // Update ref after comparing (in effect to avoid issues with strict mode)
    useEffect(() => {
        previousProps.current = props;
    });

    return changes;
}

// Enhanced useCounterKey for debugging
function useDebugCounterKey(name: string, props?: any, hookValues?: any): number {
    const renderCount = globalDebugCounter.increment(name);
    const timestamp = Date.now();
    const changes = useWhyDidYouUpdate(name, { ...props, ...hookValues });

    useEffect(() => {
        const reason =
            changes.length > 0
                ? `Changed: ${changes.join(', ')}`
                : renderCount === 1
                  ? 'Initial render'
                  : 'Unknown (possibly parent re-render)';

        renderLog.push({
            component: name,
            timestamp,
            props,
            hookValues,
            reason,
        });

        // Keep only last 100 renders
        if (renderLog.length > 100) {
            renderLog.shift();
        }
    });

    return renderCount || 0;
}

// Simple CardItem for debug (base component, will be wrapped by adapter if needed)
const DebugCardItemBase: React.FC<{
    cardId: ID;
    adapter: StoreAdapter;
}> = ({ cardId, adapter }) => {
    // TRACK PROPS CHANGES
    const prevPropsRef = useRef({ cardId, adapter });
    const cardIdChanged = prevPropsRef.current.cardId !== cardId;
    const adapterChanged = prevPropsRef.current.adapter !== adapter;

    const card = adapter.hooks.useCardById(cardId);

    // Track if card object reference changes
    const prevCardRef = useRef(card);
    const cardRefChanged = prevCardRef.current !== card;
    const cardDataChanged = card?.updatedAt !== prevCardRef.current?.updatedAt;
    prevCardRef.current = card;
    prevPropsRef.current = { cardId, adapter };

    const renderCount = useDebugCounterKey(
        'CardItem',
        { cardId, cardIdChanged, adapterChanged },
        {
            card,
            cardRefChanged,
            cardDataChanged,
            updatedAt: card?.updatedAt,
        },
    );

    return (
        <div
            style={{
                padding: 8,
                margin: 4,
                border: '1px solid #ccc',
                backgroundColor: renderCount > 1 ? '#ffebee' : '#fff',
            }}
        >
            <strong>Card {cardId}</strong>
            <div>Renders: {renderCount}</div>
            <div>Title: {card?.title}</div>
            <div>UpdatedAt: {card?.updatedAt}</div>

            {/* Show if props changed */}
            {renderCount > 1 && !cardIdChanged && !adapterChanged && !cardRefChanged && (
                <div style={{ color: '#ff9800', fontSize: '10px', fontWeight: 'bold' }}>
                    🔥 PARENT RE-RENDER (props unchanged!)
                </div>
            )}

            {cardRefChanged && !cardDataChanged && (
                <div style={{ color: 'red', fontSize: '10px' }}>
                    ⚠️ Card ref changed but data same!
                </div>
            )}

            {cardRefChanged && cardDataChanged && (
                <div style={{ color: 'green', fontSize: '10px' }}>
                    ✅ Card data actually changed
                </div>
            )}
        </div>
    );
};

const DebugCardItem: React.FC<{
    cardId: ID;
    adapter: StoreAdapter;
}> = ({ cardId, adapter }) => {
    return <DebugCardItemBase cardId={cardId} adapter={adapter} />;
};

// Simple CardsList for debug (base component)
const DebugCardsListBase: React.FC<{
    cardIds: ID[];
    adapter: StoreAdapter;
}> = ({ cardIds, adapter }) => {
    const renderCount = useDebugCounterKey('CardsList', { cardIds }, {});

    return (
        <div
            style={{
                padding: 8,
                margin: 4,
                border: '1px solid #ccc',
                backgroundColor: renderCount > 1 ? '#ffebee' : '#fff',
            }}
        >
            <strong>CardsList</strong>
            <div>Renders: {renderCount}</div>
            <div>CardIds: {cardIds.join(', ')}</div>
            {cardIds.slice(0, 5).map((cardId) => (
                <DebugCardItem key={cardId} cardId={cardId} adapter={adapter} />
            ))}
        </div>
    );
};

const DebugCardsList: React.FC<{
    cardIds: ID[];
    adapter: StoreAdapter;
}> = ({ cardIds, adapter }) => {
    return <DebugCardsListBase cardIds={cardIds} adapter={adapter} />;
};

// Simple DeckItem for debug (base component)
const DebugDeckItemBase: React.FC<{
    deckId: ID;
    adapter: StoreAdapter;
}> = ({ deckId, adapter }) => {
    const deck = adapter.hooks.useDeckById(deckId);

    // Get card IDs using ids-based hooks
    const cardIdsArray = adapter.hooks.useCardIdsByDeckId(deckId);

    // Memoize cardIds by content - use refs to track previous arrays
    // Compare by content, not reference, to prevent rerenders when adapter returns new array with same content
    const prevCardIdsArrayRef = React.useRef<ID[]>(cardIdsArray);
    const prevCardIdsRef = React.useRef<ID[]>([]);

    // Check if arrays actually changed by content
    const cardIdsArrayChanged =
        prevCardIdsArrayRef.current.length !== cardIdsArray.length ||
        !prevCardIdsArrayRef.current.every((id, i) => id === cardIdsArray[i]);

    const cardIds = useMemo(() => {
        const result = cardIdsArray;

        // Compare by content: if arrays have same IDs, reuse previous reference
        const prevIds = prevCardIdsRef.current;
        if (
            !cardIdsArrayChanged &&
            prevIds.length === result.length &&
            prevIds.every((id, i) => id === result[i])
        ) {
            return prevIds; // Return stable reference
        }

        // Update refs
        prevCardIdsArrayRef.current = cardIdsArray;
        prevCardIdsRef.current = result;
        return result;
    }, [cardIdsArray, cardIdsArrayChanged]);

    const renderCount: number = useDebugCounterKey('DeckItem', { deckId }, { deck, cardIds }) || 0;

    return (
        <div
            style={{
                padding: 8,
                margin: 4,
                border: '1px solid #ccc',
                backgroundColor: renderCount > 1 ? '#ffebee' : '#fff',
            }}
        >
            <strong>Deck {deckId}</strong>
            <div>Renders: {renderCount}</div>
            <div>Title: {deck?.title}</div>
            <div>CardIds: {cardIds.join(', ')}</div>
            <DebugCardsList cardIds={cardIds} adapter={adapter} />
        </div>
    );
};

const DebugDeckItem: React.FC<{
    deckId: ID;
    adapter: StoreAdapter;
}> = ({ deckId, adapter }) => {
    return <DebugDeckItemBase deckId={deckId} adapter={adapter} />;
};

// Simple DeckList for debug (base component)
const DebugDeckListBase: React.FC<{ adapter: StoreAdapter }> = ({ adapter }) => {
    const deckIdsRaw = adapter.hooks.useDeckIds();
    // Memoize deckIds to prevent rerenders when array reference changes but content doesn't
    const deckIds = useMemo(() => deckIdsRaw, [deckIdsRaw]);
    const renderCount = useDebugCounterKey('DeckList', {}, { deckIds });

    // Memoize the slice to prevent rerendering children
    const firstThreeDeckIds = useMemo(() => deckIds.slice(0, 3), [deckIds]);

    return (
        <div style={{ padding: 8, margin: 4, border: '1px solid #ccc' }}>
            <strong>DeckList</strong>
            <div>Renders: {renderCount}</div>
            {firstThreeDeckIds.map((deckId) => (
                <DebugDeckItem key={deckId} deckId={deckId} adapter={adapter} />
            ))}
        </div>
    );
};

const DebugDeckList: React.FC<{ adapter: StoreAdapter }> = ({ adapter }) => {
    return <DebugDeckListBase adapter={adapter} />;
};

// Inner component that has access to hooks
const DebugRendersInner: React.FC<{
    adapter: StoreAdapter;
    actions: any;
    adapters: StoreAdapter[];
    adapterIndex: number;
    setAdapterIndex: (index: number) => void;
    storeHandle: unknown;
    onBack: () => void;
}> = ({ adapter, actions, adapters, adapterIndex, setAdapterIndex, storeHandle, onBack }) => {
    const [stats, setStats] = useState<Record<string, number>>({});
    const [log, setLog] = useState<any[]>([]);

    // Get first card ID using hooks (must be inside Provider)
    const deckIds = adapter.hooks.useDeckIds();
    const firstDeckId = deckIds.length > 0 ? deckIds[0] : '';

    // Get card IDs using ids-based hooks
    const cardIds = adapter.hooks.useCardIdsByDeckId?.(firstDeckId) || [];

    const firstCardId = cardIds.length > 0 ? cardIds[0] : '';

    // Function to update stats (called manually, not automatically)
    const updateStats = useCallback(() => {
        const counts = globalDebugCounter.get();
        setStats(counts);
        setLog([...renderLog].slice(-20)); // Last 20 renders
    }, []);

    // Function to update a single card by ID
    const updateOneCard = useCallback(
        (cardId: ID) => {
            if (!cardId) {
                console.warn('[DebugRenders] updateOneCard: no cardId');
                return;
            }
            if (!actions) {
                console.error('[DebugRenders] updateOneCard: actions is undefined', { actions });
                return;
            }
            if (typeof actions.updateCard !== 'function') {
                console.error(
                    '[DebugRenders] updateOneCard: actions.updateCard is not a function',
                    {
                        actions,
                        updateCard: actions.updateCard,
                        availableMethods: Object.keys(actions || {}),
                    },
                );
                return;
            }
            console.log('[DebugRenders] Calling actions.updateCard', {
                cardId,
                adapter: adapter.name,
                actionsKeys: Object.keys(actions),
            });
            actions.updateCard(cardId, { updatedAt: Date.now() });
        },
        [actions, adapter],
    );

    const handleUpdateOneCard = useCallback(() => {
        // Reset counters
        globalDebugCounter.reset();
        renderLog.length = 0;
        setStats({});
        setLog([]);

        if (!firstCardId) return;

        // Update only one specific card
        updateOneCard(firstCardId);

        // Update stats after a short delay to let renders complete
        setTimeout(() => {
            updateStats();
        }, 50);
    }, [firstCardId, updateOneCard, updateStats]);

    const handleAdapterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setAdapterIndex(Number(e.target.value));
        // Reset counters when adapter changes
        globalDebugCounter.reset();
        renderLog.length = 0;
        setStats({});
        setLog([]);
    };

    return (
        <div style={{ padding: 20, fontFamily: 'monospace', fontSize: '12px' }}>
            {/* PROOF TEST */}
            <TestParent />

            <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ margin: 0 }}>Debug Renders</h2>
                <select
                    value={adapterIndex}
                    onChange={handleAdapterChange}
                    style={{
                        padding: '8px 12px',
                        fontSize: '14px',
                        border: '1px solid #ccc',
                        borderRadius: 4,
                        backgroundColor: 'white',
                        cursor: 'pointer',
                    }}
                >
                    {adapters.map((a, idx) => (
                        <option key={idx} value={idx}>
                            {a.name}
                        </option>
                    ))}
                </select>
                <button
                    onClick={onBack}
                    style={{
                        padding: '10px 16px',
                        fontSize: '14px',
                        border: '1px solid #ccc',
                        borderRadius: 4,
                        cursor: 'pointer',
                        backgroundColor: '#f8f9fa',
                        marginLeft: 'auto',
                        fontWeight: 600,
                    }}
                    onMouseEnter={styles.hoverHandlers.backButton.onEnter}
                    onMouseLeave={styles.hoverHandlers.backButton.onLeave}
                >
                    ← Back to App
                </button>
            </div>

            <div style={{ marginBottom: 20, display: 'flex', gap: 10 }}>
                <button
                    onClick={handleUpdateOneCard}
                    style={{
                        padding: '10px 20px',
                        fontSize: '16px',
                        backgroundColor: '#4CAF50',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                    }}
                >
                    Update 1 Card (updatedAt)
                </button>
                <button
                    onClick={updateStats}
                    style={{
                        padding: '10px 20px',
                        fontSize: '16px',
                        backgroundColor: '#2196F3',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                    }}
                >
                    Refresh Stats
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div>
                    <h3>Render Counts</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={{ border: '1px solid #ccc', padding: 8 }}>Component</th>
                                <th style={{ border: '1px solid #ccc', padding: 8 }}>Renders</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(stats).map(([name, count]) => (
                                <tr key={name}>
                                    <td style={{ border: '1px solid #ccc', padding: 8 }}>{name}</td>
                                    <td
                                        style={{
                                            border: '1px solid #ccc',
                                            padding: 8,
                                            backgroundColor: count > 1 ? '#ffebee' : '#fff',
                                        }}
                                    >
                                        {count}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div>
                    <h3>Last 20 Renders</h3>
                    <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid #ccc' }}>
                        {log.map((entry, idx) => (
                            <div
                                key={idx}
                                style={{
                                    padding: 4,
                                    borderBottom: '1px solid #eee',
                                    fontSize: '10px',
                                }}
                            >
                                <strong>{entry.component}</strong> @{' '}
                                {new Date(entry.timestamp).toLocaleTimeString()}
                                {entry.reason && (
                                    <div
                                        style={{
                                            marginLeft: 10,
                                            color:
                                                entry.reason.includes('Changed') ||
                                                entry.reason.includes('Unknown')
                                                    ? '#d32f2f'
                                                    : '#666',
                                            fontWeight:
                                                entry.reason.includes('Changed') ||
                                                entry.reason.includes('Unknown')
                                                    ? 'bold'
                                                    : 'normal',
                                        }}
                                    >
                                        {entry.reason}
                                    </div>
                                )}
                                {entry.props && (
                                    <div style={{ marginLeft: 10, color: '#999', fontSize: '9px' }}>
                                        Props: {JSON.stringify(entry.props)}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div style={{ marginTop: 20, border: '1px solid #ccc', padding: 10 }}>
                <h3>UI Preview</h3>
                <DebugDeckList adapter={adapter} />
            </div>
        </div>
    );
};

// Outer component with Provider
export const DebugRenders: React.FC<{
    adapters: StoreAdapter[];
    adapterIndex: number;
    setAdapterIndex: (index: number) => void;
    dataset: RootState;
    onBack: () => void;
}> = ({ adapters, adapterIndex, setAdapterIndex, dataset, onBack }) => {
    const adapter = adapters[adapterIndex];
    const storeHandle = useMemo(() => adapter.createStore(dataset), [adapter, dataset]);
    const Provider = adapter.Provider;
    const actions = useMemo(() => adapter.bindActions(storeHandle), [adapter, storeHandle]);

    return (
        <Provider store={storeHandle}>
            <DebugRendersInner
                adapter={adapter}
                actions={actions}
                adapters={adapters}
                adapterIndex={adapterIndex}
                setAdapterIndex={setAdapterIndex}
                storeHandle={storeHandle}
                onBack={onBack}
            />
        </Provider>
    );
};
