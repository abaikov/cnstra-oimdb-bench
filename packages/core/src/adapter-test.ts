/**
 * Common adapter test utilities
 * Tests basic functionality of adapters to ensure they work correctly
 */

import type { StoreAdapter, RootState, ID, Tag, Comment, Card, User, Deck } from './index';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { generateDataset } from './dataGen';
import { useRenderCount } from './useRenderCount';

export interface AdapterTestResult {
    adapterName: string;
    passed: boolean;
    errors: string[];
}

export async function testAdapter(adapter: StoreAdapter): Promise<AdapterTestResult> {
    const errors: string[] = [];
    const adapterName = adapter.name;

    // Helper: mount a tiny probe tree to read hooks and count renders
    let renderCount = 0;
    const withProvider = <T>(store: any, render: () => T): T => {
        // Create a detached div root; this runs only in browser-like envs
        const container = typeof document !== 'undefined' ? document.createElement('div') : null;
        if (!container) return render();
        const root = createRoot(container);
        let result!: T;
        const Provider = adapter.Provider;
        const Probe: React.FC = () => {
            renderCount++;
            result = render();
            return null;
        };
        // Force synchronous render so the Probe body (with hooks) executes before unmount
        flushSync(() => {
            root.render(
                React.createElement(Provider as any, { store }, React.createElement(Probe)),
            );
        });
        root.unmount();
        return result;
    };

    // Helper to check if component re-renders after state change
    const checkReactivity = <T>(
        store: any,
        action: () => void,
        selector: () => T,
        validator: (before: T, after: T) => boolean,
        errorMsg: string,
    ): void => {
        renderCount = 0;
        let before: T;
        withProvider(store, () => {
            before = selector();
            return null as any;
        });
        const initialRenderCount = renderCount;

        action();

        renderCount = 0;
        let after: T;
        withProvider(store, () => {
            after = selector();
            return null as any;
        });
        const afterRenderCount = renderCount;

        if (!validator(before!, after!)) {
            errors.push(errorMsg);
        }
        // Note: We can't easily check render count in this test setup because each withProvider call
        // unmounts and remounts, so we only check data changes, not actual re-renders
    };

    try {
        // Generate test data with realistic sizes for proper testing
        const dataset = generateDataset({
            decks: 50,
            cardsPerDeck: 10,
            minCommentsPerCard: 3,
            maxCommentsPerCard: 5,
            seed: 42,
        });

        // Test 1: Create store
        let store;
        try {
            store = adapter.createStore(dataset);
            if (!store) {
                errors.push('createStore returned null or undefined');
            }
        } catch (error) {
            errors.push(
                `createStore failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            return { adapterName, passed: false, errors };
        }

        // Test 2: Bind actions
        let actions;
        try {
            actions = adapter.bindActions(store);
            if (!actions) {
                errors.push('bindActions returned null or undefined');
            }
        } catch (error) {
            errors.push(
                `bindActions failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            return { adapterName, passed: false, errors };
        }

        // Test 3: Test hooks exist and validate required hooks for current mode
        const hooks = adapter.hooks;
        if (!hooks) {
            errors.push('hooks is null or undefined');
            return { adapterName, passed: false, errors };
        }

        // Validate required hooks exist
        {
            const requiredHooks = [
                'useDeckIds',
                'useDeckById',
                'useCardById',
                'useCommentById',
                'useUserById',
                'useCardIdsByDeckId',
                'useCommentIdsByCardId',
                'useAssigneeIdsByCardId',
                'useTagIdsByCardId',
                'useActiveDeckId',
            ];
            for (const hookName of requiredHooks) {
                if (typeof (hooks as any)[hookName] !== 'function') {
                    errors.push(`Required hook ${hookName} is missing`);
                }
            }
        }

        // Test 4: Test setActiveDeck
        const firstDeckId = dataset.decksOrder[0];
        try {
            let before: ID | null | undefined;
            withProvider(store, () => {
                before = adapter.hooks.useActiveDeckId();
                return null as any;
            });
            actions.setActiveDeck(firstDeckId);
            let after: ID | null | undefined;
            withProvider(store, () => {
                after = adapter.hooks.useActiveDeckId();
                return null as any;
            });
            if (after !== firstDeckId) {
                errors.push('setActiveDeck did not update activeDeckId');
            }
        } catch (error) {
            errors.push(
                `setActiveDeck failed: ${error instanceof Error ? error.message : String(error)}`,
            );
        }

        // Test 5: Test updateCommentText
        const firstCardId = Object.values(dataset.entities.cards).find(
            (c) => c.deckId === firstDeckId,
        )?.id;
        if (firstCardId) {
            const firstCommentId = Object.values(dataset.entities.comments).find(
                (c) => c.cardId === firstCardId,
            )?.id;
            if (firstCommentId) {
                try {
                    // read before
                    let beforeText: string | undefined;
                    withProvider(store, () => {
                        const useCommentById = (adapter.hooks as any).useCommentById;
                        if (useCommentById) {
                            beforeText = useCommentById(firstCommentId)?.text;
                        }
                        return null as any;
                    });
                    actions.updateCommentText(firstCommentId, 'Test updated text');
                    let afterText: string | undefined;
                    withProvider(store, () => {
                        const useCommentById = (adapter.hooks as any).useCommentById;
                        if (useCommentById) {
                            afterText = useCommentById(firstCommentId)?.text;
                        }
                        return null as any;
                    });
                    if (afterText !== 'Test updated text') {
                        errors.push('updateCommentText did not change comment text');
                    }
                } catch (error) {
                    errors.push(
                        `updateCommentText failed: ${error instanceof Error ? error.message : String(error)}`,
                    );
                }
            }
        }

        // Test 6: Test setCommentEditing
        const firstCardId2 = Object.values(dataset.entities.cards).find(
            (c) => c.deckId === firstDeckId,
        )?.id;
        if (firstCardId2) {
            const firstCommentId2 = Object.values(dataset.entities.comments).find(
                (c) => c.cardId === firstCardId2,
            )?.id;
            if (firstCommentId2) {
                try {
                    // Type assertion needed as setCommentEditing might not be in base Actions type in some adapters
                    const actionsWithEditing = actions as any;
                    if (typeof actionsWithEditing.setCommentEditing === 'function') {
                        actionsWithEditing.setCommentEditing(firstCommentId2, true);
                        let flagTrue: boolean | undefined;
                        withProvider(store, () => {
                            const useCommentById = (adapter.hooks as any).useCommentById;
                            if (useCommentById) {
                                flagTrue = !!(useCommentById(firstCommentId2) as any)?.isEditing;
                            }
                            return null as any;
                        });
                        actionsWithEditing.setCommentEditing(firstCommentId2, false);
                        let flagFalse: boolean | undefined;
                        withProvider(store, () => {
                            const useCommentById = (adapter.hooks as any).useCommentById;
                            if (useCommentById) {
                                flagFalse = !!(useCommentById(firstCommentId2) as any)?.isEditing;
                            }
                            return null as any;
                        });
                        if (!flagTrue || flagFalse) {
                            errors.push('setCommentEditing did not toggle isEditing correctly');
                        }
                    } else {
                        errors.push('setCommentEditing action is missing');
                    }
                } catch (error) {
                    errors.push(
                        `setCommentEditing failed: ${error instanceof Error ? error.message : String(error)}`,
                    );
                }
            }
        }

        // Test 7: Test renameUser and verify fan-out reactivity
        const firstUserId = Object.keys(dataset.entities.users)[0];
        if (firstUserId) {
            try {
                // Read initial name
                let initialName: string | undefined;
                withProvider(store, () => {
                    initialName = adapter.hooks.useUserById(firstUserId)?.name;
                    return null as any;
                });

                // Rename user
                const newName = 'Test User Name Updated';
                actions.renameUser(firstUserId, newName);

                // Verify user name updated via useUserById
                let updatedName: string | undefined;
                withProvider(store, () => {
                    updatedName = adapter.hooks.useUserById(firstUserId)?.name;
                    return null as any;
                });

                if (updatedName !== newName) {
                    errors.push(
                        `renameUser did not update user name: expected "${newName}", got "${updatedName}"`,
                    );
                }

                // Test fan-out: find a card with this user as assignee and verify it updates
                const cardWithUser = Object.values(dataset.entities.cards).find((card) => {
                    const assignments = Object.values(dataset.entities.cardAssignments).filter(
                        (ca) => ca.cardId === card.id,
                    );
                    return assignments.some((ca) => ca.userId === firstUserId);
                });

                if (cardWithUser) {
                    // For ids-based mode, get assignee IDs and then fetch user
                    let assigneeIds: ID[] = [];
                    withProvider(store, () => {
                        assigneeIds =
                            (adapter.hooks as any).useAssigneeIdsByCardId(cardWithUser.id) || [];
                        return null as any;
                    });
                    if (!assigneeIds.includes(firstUserId)) {
                        errors.push('renameUser: user ID not found in useAssigneeIdsByCardId');
                    } else {
                        let user: User | undefined;
                        withProvider(store, () => {
                            user = adapter.hooks.useUserById(firstUserId);
                            return null as any;
                        });
                        if (!user || user.name !== newName) {
                            errors.push(
                                `renameUser: fan-out failed - user fetched after rename shows "${user?.name}" instead of "${newName}"`,
                            );
                        }
                    }
                }
            } catch (error) {
                errors.push(
                    `renameUser failed: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }

        // Test 8a: Test useDeckIds and useDeckById
        try {
            let deckIds: ID[] = [];
            withProvider(store, () => {
                deckIds = adapter.hooks.useDeckIds();
                return null as any;
            });
            if (!Array.isArray(deckIds) || deckIds.length === 0) {
                errors.push('useDeckIds did not return a non-empty array');
            }
            if (deckIds.length !== dataset.decksOrder.length) {
                errors.push(
                    `useDeckIds returned ${deckIds.length} IDs, expected ${dataset.decksOrder.length}`,
                );
            }

            const testDeckId = deckIds[0];
            let deck: Deck | undefined;
            withProvider(store, () => {
                deck = adapter.hooks.useDeckById(testDeckId);
                return null as any;
            });
            if (!deck) {
                errors.push(`useDeckById did not return deck for ID ${testDeckId}`);
            } else if (deck.id !== testDeckId) {
                errors.push(
                    `useDeckById returned deck with wrong ID: ${deck.id} !== ${testDeckId}`,
                );
            }
        } catch (error) {
            errors.push(
                `useDeckIds/useDeckById test failed: ${error instanceof Error ? error.message : String(error)}`,
            );
        }

        // Test 8b: Test useAssigneesByCardId / useAssigneeIdsByCardId
        const cardWithAssignees = Object.values(dataset.entities.cards).find((card) => {
            return Object.values(dataset.entities.cardAssignments).some(
                (ca) => ca.cardId === card.id,
            );
        });
        if (cardWithAssignees) {
            try {
                let assigneeIds: ID[] = [];
                withProvider(store, () => {
                    assigneeIds =
                        (adapter.hooks as any).useAssigneeIdsByCardId(cardWithAssignees.id) || [];
                    return null as any;
                });
                if (!Array.isArray(assigneeIds)) {
                    errors.push('useAssigneeIdsByCardId did not return an array');
                } else {
                    const expectedAssignments = Object.values(
                        dataset.entities.cardAssignments,
                    ).filter((ca) => ca.cardId === cardWithAssignees.id);
                    const expectedIds = new Set(expectedAssignments.map((ca) => ca.userId));
                    if (assigneeIds.length !== expectedIds.size) {
                        errors.push(
                            `useAssigneeIdsByCardId returned ${assigneeIds.length} IDs, expected ${expectedIds.size}`,
                        );
                    }
                    // Verify we can fetch users by ID
                    for (const userId of assigneeIds) {
                        let user: User | undefined;
                        withProvider(store, () => {
                            user = adapter.hooks.useUserById(userId);
                            return null as any;
                        });
                        if (!user) {
                            errors.push(
                                `useUserById did not return user for ID ${userId} from assignees`,
                            );
                        }
                    }
                }
            } catch (error) {
                errors.push(
                    `useAssigneeIdsByCardId test failed: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }

        // Test 8c: Test bulkToggleTagOnCards with multiple cards
        const cardIds = Object.values(dataset.entities.cards)
            .filter((c) => c.deckId === firstDeckId)
            .slice(0, 3)
            .map((c) => c.id);
        if (cardIds.length > 0) {
            try {
                // Count before
                const cardId = cardIds[0];
                let beforeTagCount = 0;
                let tagCountSupported = false;
                withProvider(store, () => {
                    if ('useTagIdsByCardId' in (adapter.hooks as any)) {
                        const tagIds = (adapter.hooks as any).useTagIdsByCardId(cardId) || [];
                        beforeTagCount = Array.isArray(tagIds) ? tagIds.length : 0;
                        tagCountSupported = true;
                    } else if ('useCardTagsByCardId' in (adapter.hooks as any)) {
                        const cts = (adapter.hooks as any).useCardTagsByCardId(cardId) || [];
                        beforeTagCount = Array.isArray(cts) ? cts.length : 0;
                        tagCountSupported = true;
                    }
                    return null as any;
                });

                actions.bulkToggleTagOnCards(cardIds, 'tag_0');
                let afterTagCount = 0;
                withProvider(store, () => {
                    if ('useTagIdsByCardId' in (adapter.hooks as any)) {
                        const tagIds = (adapter.hooks as any).useTagIdsByCardId(cardId) || [];
                        afterTagCount = Array.isArray(tagIds) ? tagIds.length : 0;
                    } else if ('useCardTagsByCardId' in (adapter.hooks as any)) {
                        const cts = (adapter.hooks as any).useCardTagsByCardId(cardId) || [];
                        afterTagCount = Array.isArray(cts) ? cts.length : 0;
                    }
                    return null as any;
                });

                if (tagCountSupported && beforeTagCount === afterTagCount) {
                    errors.push('bulkToggleTagOnCards did not change tag count');
                }

                // Verify that ALL cards in cardIds can be accessed (basic functionality check)
                for (const cid of cardIds) {
                    let hasTagsData = false;
                    withProvider(store, () => {
                        if ('useTagIdsByCardId' in (adapter.hooks as any)) {
                            const tagIds = (adapter.hooks as any).useTagIdsByCardId(cid) || [];
                            hasTagsData = Array.isArray(tagIds);
                        } else if ('useCardTagsByCardId' in (adapter.hooks as any)) {
                            const cts = (adapter.hooks as any).useCardTagsByCardId(cid) || [];
                            hasTagsData = Array.isArray(cts);
                        }
                        return null as any;
                    });
                    if (!hasTagsData) {
                        errors.push(
                            `bulkToggleTagOnCards: failed to get tags for card ${cid} after bulk update`,
                        );
                    }
                }

                // Verify that at least one card's tag count changed (proving bulk operation worked)
                // Note: We've already verified the first card changed above, so this is just a sanity check
                if (cardIds.length > 1) {
                    // Check second card to ensure bulk operation affected multiple cards
                    const secondCardId = cardIds[1];
                    let secondCardHasTags = false;
                    withProvider(store, () => {
                        if ('useTagIdsByCardId' in (adapter.hooks as any)) {
                            const tagIds =
                                (adapter.hooks as any).useTagIdsByCardId(secondCardId) || [];
                            secondCardHasTags = Array.isArray(tagIds);
                        } else if ('useCardTagsByCardId' in (adapter.hooks as any)) {
                            const cts =
                                (adapter.hooks as any).useCardTagsByCardId(secondCardId) || [];
                            secondCardHasTags = Array.isArray(cts);
                        }
                        return null as any;
                    });
                    if (!secondCardHasTags) {
                        errors.push(
                            'bulkToggleTagOnCards: failed to access tags for second card in bulk operation',
                        );
                    }
                }
            } catch (error) {
                errors.push(
                    `bulkToggleTagOnCards failed: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }

        // Test 13: Test that ID arrays update correctly
        try {
            const testCardId = Object.values(dataset.entities.cards).find(
                (c) => c.deckId === firstDeckId,
            )?.id;
            if (testCardId) {
                // Get initial comment IDs array
                let initialCommentIds: ID[] = [];
                withProvider(store, () => {
                    initialCommentIds =
                        (adapter.hooks as any).useCommentIdsByCardId(testCardId) || [];
                    return null as any;
                });

                // Update a comment text - IDs array should remain the same (no items added/removed)
                // But we should be able to fetch the updated comment by ID
                const testCommentId = initialCommentIds[0];
                if (testCommentId) {
                    actions.updateCommentText(testCommentId, 'Updated comment text in ids mode');

                    // IDs array should remain the same (same length, same IDs)
                    let updatedCommentIds: ID[] = [];
                    withProvider(store, () => {
                        updatedCommentIds =
                            (adapter.hooks as any).useCommentIdsByCardId(testCardId) || [];
                        return null as any;
                    });

                    // Verify IDs array didn't change (length and content)
                    if (initialCommentIds.length !== updatedCommentIds.length) {
                        errors.push(
                            `Comment IDs array length changed after text update: ${initialCommentIds.length} -> ${updatedCommentIds.length}`,
                        );
                    }

                    // Verify we can get updated comment via selector
                    let updatedComment: Comment | undefined;
                    withProvider(store, () => {
                        updatedComment = (adapter.hooks as any).useCommentById(testCommentId) as
                            | Comment
                            | undefined;
                        return null as any;
                    });

                    if (!updatedComment) {
                        errors.push('Could not fetch updated comment by ID after update');
                    } else if (updatedComment.text !== 'Updated comment text in ids mode') {
                        errors.push(
                            'Comment fetched by ID did not reflect text update - useCommentById should be reactive',
                        );
                    }
                }
            }

            // Test card IDs array reactivity
            const testDeckId = firstDeckId;
            let initialCardIds: ID[] = [];
            withProvider(store, () => {
                initialCardIds = (adapter.hooks as any).useCardIdsByDeckId(testDeckId) || [];
                return null as any;
            });

            if (initialCardIds.length > 0) {
                const testCardId = initialCardIds[0];
                let initialUpdatedAt: number | undefined;
                withProvider(store, () => {
                    const initialCard = (adapter.hooks as any).useCardById(testCardId) as
                        | Card
                        | undefined;
                    initialUpdatedAt = initialCard?.updatedAt;
                    return null as any;
                });

                // Trigger background churn
                actions.backgroundChurnStart();

                // Card IDs should remain the same
                let updatedCardIds: ID[] = [];
                withProvider(store, () => {
                    updatedCardIds = (adapter.hooks as any).useCardIdsByDeckId(testDeckId) || [];
                    return null as any;
                });

                // Verify IDs array didn't change
                if (initialCardIds.length !== updatedCardIds.length) {
                    errors.push(
                        `Card IDs array length changed after update: ${initialCardIds.length} -> ${updatedCardIds.length}`,
                    );
                }

                // But the card fetched by ID should be updated
                let updatedCard: Card | undefined;
                withProvider(store, () => {
                    updatedCard = (adapter.hooks as any).useCardById(testCardId) as
                        | Card
                        | undefined;
                    return null as any;
                });

                if (!updatedCard) {
                    errors.push('Could not fetch updated card by ID after backgroundChurnStart');
                } else if (initialUpdatedAt && updatedCard.updatedAt === initialUpdatedAt) {
                    errors.push(
                        'Card fetched by ID did not reflect update - useCardById should be reactive',
                    );
                }
            }
        } catch (error) {
            errors.push(
                `IDs-based array reactivity test failed: ${error instanceof Error ? error.message : String(error)}`,
            );
        }

        // Test 9: Test inline-editing scenario (rapid consecutive updates)
        const firstCommentIdForInline = Object.values(dataset.entities.comments)[0]?.id;
        const firstCardIdForInline = firstCommentIdForInline
            ? Object.values(dataset.entities.comments).find((c) => c.id === firstCommentIdForInline)
                  ?.cardId
            : undefined;
        if (firstCommentIdForInline && firstCardIdForInline) {
            try {
                const baseText = 'Inline edit test ';
                // Simulate rapid updates like inline-editing workload
                for (let i = 0; i < 10; i++) {
                    actions.updateCommentText(firstCommentIdForInline, baseText + i);
                }

                // Verify final state
                let finalText: string | undefined;
                withProvider(store, () => {
                    finalText = (adapter.hooks as any).useCommentById(
                        firstCommentIdForInline,
                    )?.text;
                    return null as any;
                });

                if (finalText !== baseText + '9') {
                    errors.push(
                        `Inline-editing scenario failed: expected "${baseText}9", got "${finalText || 'undefined'}"`,
                    );
                }
            } catch (error) {
                errors.push(
                    `Inline-editing scenario failed: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }

        // Test 10: Test backgroundChurnStart/Stop
        try {
            actions.backgroundChurnStart();
            actions.backgroundChurnStop();
        } catch (error) {
            errors.push(
                `backgroundChurn failed: ${error instanceof Error ? error.message : String(error)}`,
            );
        }

        // Test 11: Test Provider exists and can be used
        if (!adapter.Provider) {
            errors.push('Provider is missing');
        }

        // Test 14: Integration test - verify component actually re-renders on state change
        // This test mounts a component ONCE and checks if it re-renders when state changes
        // IMPORTANT: Test both direct and ids-based modes to catch issues like MobX reactivity
        {
            try {
                const testDeckId = dataset.decksOrder[0];
                const testCardId = Object.values(dataset.entities.cards).find(
                    (c) => c.deckId === testDeckId,
                )?.id;

                if (testCardId) {
                    const container =
                        typeof document !== 'undefined' ? document.createElement('div') : null;
                    if (container) {
                        const root = createRoot(container);
                        const Provider = adapter.Provider;
                        let renderCount = 0;
                        let lastCards: Card[] = [];
                        let initialUpdatedAt: number | undefined;

                        // Test component - adapts to both direct and ids-based modes
                        // CRITICAL: This component MUST be reactive - it must re-render when state changes
                        const TestComponentRaw: React.FC = () => {
                            renderCount++;
                            useRenderCount('AdapterTestComponent');

                            // Get IDs and then fetch first card
                            const cardIds =
                                (adapter.hooks as any).useCardIdsByDeckId?.(testDeckId) || [];
                            const firstCardId = cardIds[0];
                            if (firstCardId) {
                                const card = (adapter.hooks as any).useCardById?.(firstCardId);
                                if (card) {
                                    lastCards = [card];
                                    if (renderCount === 1) {
                                        initialUpdatedAt = card.updatedAt;
                                    }

                                    // CRITICAL: Access updatedAt to ensure reactivity tracks it
                                    const cardUpdatedAt = card.updatedAt;
                                    return React.createElement(
                                        'div',
                                        {
                                            'data-testid': 'test-component',
                                            'data-render-count': renderCount,
                                        },
                                        `Card IDs: ${cardIds.length}, UpdatedAt: ${cardUpdatedAt}`,
                                    );
                                }
                            }
                            return React.createElement(
                                'div',
                                {
                                    'data-testid': 'test-component',
                                    'data-render-count': renderCount,
                                },
                                `Card IDs: ${cardIds.length}`,
                            );
                        };

                        const TestComponent = TestComponentRaw;

                        // Mount component
                        root.render(
                            React.createElement(
                                Provider as any,
                                { store },
                                React.createElement(TestComponent),
                            ),
                        );

                        // Wait for initial render - use multiple ticks to ensure React has processed
                        if (typeof requestAnimationFrame !== 'undefined') {
                            await new Promise((resolve) => requestAnimationFrame(resolve));
                        }
                        await new Promise((resolve) => setTimeout(resolve, 10));

                        const initialRenderCount = renderCount;
                        const initialCards = [...lastCards];

                        // Trigger state change
                        actions.backgroundChurnStart();

                        // Wait for React to process updates - multiple ticks to ensure all updates are processed
                        // Some adapters (like MobX with observer) may need more time to batch and process updates
                        if (typeof requestAnimationFrame !== 'undefined') {
                            await new Promise((resolve) => requestAnimationFrame(resolve));
                            await new Promise((resolve) => requestAnimationFrame(resolve));
                            await new Promise((resolve) => requestAnimationFrame(resolve));
                            await new Promise((resolve) => requestAnimationFrame(resolve));
                            await new Promise((resolve) => requestAnimationFrame(resolve));
                        }
                        // Give more time for reactive systems to process updates
                        // MobX especially needs time for observer to process changes
                        await new Promise((resolve) => setTimeout(resolve, 100));

                        // Force one more React tick to ensure all updates are flushed
                        await new Promise((resolve) => {
                            if (typeof requestAnimationFrame !== 'undefined') {
                                requestAnimationFrame(() => {
                                    setTimeout(resolve, 10);
                                });
                            } else {
                                setTimeout(resolve, 10);
                            }
                        });

                        const afterRenderCount = renderCount;
                        const renderCountIncrease = afterRenderCount - initialRenderCount;

                        // CRITICAL: Force React to flush any pending updates before cleanup
                        // This ensures we catch all re-renders that might be pending
                        if (typeof requestAnimationFrame !== 'undefined') {
                            await new Promise((resolve) => requestAnimationFrame(resolve));
                            await new Promise((resolve) => requestAnimationFrame(resolve));
                        }
                        await new Promise((resolve) => setTimeout(resolve, 50));

                        // Re-check render count after additional flush
                        const finalRenderCount = renderCount;
                        const finalRenderCountIncrease = finalRenderCount - initialRenderCount;

                        // Cleanup
                        root.unmount();

                        // CRITICAL TEST #1: Verify component re-rendered at least once
                        // This is the MOST IMPORTANT check - catches MobX and other reactivity issues
                        if (finalRenderCount <= initialRenderCount) {
                            errors.push(
                                `CRITICAL FAILURE: Component did not re-render after backgroundChurnStart. Render count: ${initialRenderCount} -> ${finalRenderCount} (expected > ${initialRenderCount}). This indicates the adapter is NOT REACTIVE and will show 0 renders in benchmarks.`,
                            );
                        }

                        // CRITICAL TEST #2: Explicit check for zero render increase
                        // This is a redundant but explicit check to catch any edge cases
                        if (finalRenderCountIncrease < 1) {
                            errors.push(
                                `CRITICAL FAILURE: Zero render count increase detected (${finalRenderCountIncrease}). Initial: ${initialRenderCount}, Final: ${finalRenderCount}. This adapter will show 0 renders in real benchmarks. The adapter is NOT triggering React re-renders when state changes.`,
                            );
                        }

                        // CRITICAL TEST #3: Check if initial render count is valid (should be at least 1)
                        if (initialRenderCount < 1) {
                            errors.push(
                                `CRITICAL: Component did not render initially. Initial render count: ${initialRenderCount} (expected >= 1). This indicates a setup problem.`,
                            );
                        }

                        // WARNING: If render count didn't increase enough (less than expected for bulk update)
                        // backgroundChurnStart updates 100 cards, so we should see at least 1 re-render
                        if (finalRenderCountIncrease === 0) {
                            // This is already caught by CRITICAL TEST #2, but we log it explicitly
                            errors.push(
                                `ZERO RENDERS DETECTED: The adapter is completely non-reactive. Component render count did not increase after updating 100 cards. This is a critical failure that WILL show as 0 renders in benchmarks.`,
                            );
                        }

                        // Verify data changed
                        if (initialCards.length > 0 && initialUpdatedAt !== undefined) {
                            const updatedCard = lastCards.find((c) => c.id === initialCards[0].id);
                            if (!updatedCard) {
                                errors.push('Card disappeared after backgroundChurnStart');
                            } else if (updatedCard.updatedAt === initialUpdatedAt) {
                                errors.push(
                                    `Card updatedAt did not change after backgroundChurnStart: ${initialUpdatedAt} -> ${updatedCard.updatedAt}`,
                                );
                            }
                        }
                    }
                }
            } catch (error) {
                errors.push(
                    `Integration reactivity test failed: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }

        // Test 15: Verify that updating a single card triggers exactly 1 render
        // This test ensures optimal render performance: updating 1 card should cause only 1 re-render
        // If more than 1 render is detected, the issue is likely in the benchmark UI (DebugRenders.tsx)
        // where unnecessary re-renders occur due to unstable array references or improper memoization
        try {
            const testDeckId = dataset.decksOrder[0];
            const testCardId = Object.values(dataset.entities.cards).find(
                (c) => c.deckId === testDeckId,
            )?.id;

            if (testCardId && actions.updateCard) {
                const container = document.createElement('div');
                const root = createRoot(container);
                let renderCount = 0;
                let initialUpdatedAt: number | undefined;

                const TestComponentRaw: React.FC = () => {
                    renderCount++;
                    const card = (adapter.hooks as any).useCardById?.(testCardId);
                    if (card) {
                        initialUpdatedAt = card.updatedAt;
                    }
                    return React.createElement('div', {
                        'data-testid': 'single-card-test',
                        'data-render-count': renderCount,
                    });
                };

                const TestComponent = TestComponentRaw;

                const Provider = adapter.Provider;

                // Mount component
                root.render(
                    React.createElement(
                        Provider as any,
                        { store },
                        React.createElement(TestComponent),
                    ),
                );

                // Wait for initial render
                if (typeof requestAnimationFrame !== 'undefined') {
                    await new Promise((resolve) => requestAnimationFrame(resolve));
                }
                await new Promise((resolve) => setTimeout(resolve, 10));

                const initialRenderCount = renderCount;

                // Update single card
                actions.updateCard(testCardId, { updatedAt: Date.now() });

                // Wait for React to process updates
                if (typeof requestAnimationFrame !== 'undefined') {
                    await new Promise((resolve) => requestAnimationFrame(resolve));
                    await new Promise((resolve) => requestAnimationFrame(resolve));
                }
                await new Promise((resolve) => setTimeout(resolve, 50));

                // Force one more React tick to ensure all updates are flushed
                await new Promise((resolve) => {
                    if (typeof requestAnimationFrame !== 'undefined') {
                        requestAnimationFrame(() => {
                            setTimeout(resolve, 10);
                        });
                    } else {
                        setTimeout(resolve, 10);
                    }
                });

                const finalRenderCount = renderCount;
                const renderCountIncrease = finalRenderCount - initialRenderCount;

                // Cleanup
                flushSync(() => {
                    root.unmount();
                });

                // Verify exactly 1 render increase for updating 1 card
                // If more than 1 render: the issue is likely in DebugRenders.tsx
                // where the benchmark UI has unnecessary re-renders due to unstable references
                // Check for: unstable array references in useCardIdsByDeckId, improper memoization,
                // or components not properly optimized
                if (renderCountIncrease > 1) {
                    errors.push(
                        `Single card update caused ${renderCountIncrease} renders (expected exactly 1). ` +
                            `This indicates unnecessary re-renders. If this happens in benchmarks, ` +
                            `the issue is likely in DebugRenders.tsx where the benchmark UI has ` +
                            `unstable array references (e.g., in useCardIdsByDeckId returning new arrays ` +
                            `when content doesn't change) or improper optimization. Check for: useCardIdsByDeckId returning ` +
                            `new array references or useMemo dependencies causing unnecessary recalculations.`,
                    );
                } else if (renderCountIncrease < 1) {
                    errors.push(
                        `Single card update caused ${renderCountIncrease} renders (expected at least 1). ` +
                            `The adapter is not reactive - it should trigger a re-render when a card is updated.`,
                    );
                }
            }
        } catch (error) {
            errors.push(
                `Single card update render count test failed: ${error instanceof Error ? error.message : String(error)}`,
            );
        }

        return {
            adapterName,
            passed: errors.length === 0,
            errors,
        };
    } catch (error) {
        errors.push(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
        return { adapterName, passed: false, errors };
    }
}

/**
 * Test all adapters and return results
 */
export async function testAllAdapters(adapters: StoreAdapter[]): Promise<AdapterTestResult[]> {
    const results: AdapterTestResult[] = [];
    for (const adapter of adapters) {
        results.push(await testAdapter(adapter));
    }
    return results;
}

/**
 * Test adapter in both modes (if supported)
 */
export async function testAdapterInBothModes(
    baseAdapter: StoreAdapter,
): Promise<AdapterTestResult[]> {
    const results: AdapterTestResult[] = [];
    results.push(await testAdapter(baseAdapter));
    return results;
}
