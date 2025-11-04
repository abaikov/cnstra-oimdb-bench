import type { StoreAdapter, WorkloadDriver, WorkloadScenario, ID } from './adapter';

export function createWorkloadDriver(adapter: StoreAdapter, storeHandle: unknown): WorkloadDriver {
    let stopped = false;
    let churnInterval: number | null = null;
    const actions = adapter.bindActions(storeHandle as any);

    async function wait(ms: number) {
        return new Promise<void>((r) => setTimeout(r, ms));
    }

    return {
        async run(scenario: WorkloadScenario, opts?: Record<string, unknown>) {
            stopped = false;
            switch (scenario) {
                case 'cold-start': {
                    // noop here; measured in app mount
                    break;
                }
                case 'scroll': {
                    // scrolling is handled in the UI; driver may trigger programmatic scroll via custom event
                    const times = (opts?.times as number) ?? 3;
                    for (let i = 0; i < times && !stopped; i++) {
                        window.dispatchEvent(
                            new CustomEvent('bench:scroll', { detail: { pass: i } }),
                        );
                        await wait(800);
                    }
                    break;
                }
                case 'filter-typing': {
                    // Search removed - no-op
                    break;
                }
                case 'inline-editing': {
                    // Simulate typing into a comment composer bound to state
                    const targetId = (opts?.commentId as ID) ?? 'comment_0';
                    const base = 'Typing latency test ';
                    for (let i = 0; i < 30 && !stopped; i++) {
                        actions.updateCommentText(targetId, base + i);
                        await wait(16);
                    }
                    break;
                }
                case 'background-churn': {
                    if (churnInterval != null) window.clearInterval(churnInterval);
                    churnInterval = window.setInterval(() => {
                        actions.backgroundChurnStart();
                    }, 1000);
                    await wait((opts?.durationMs as number) ?? 5000);
                    if (churnInterval != null) window.clearInterval(churnInterval);
                    actions.backgroundChurnStop();
                    break;
                }
                case 'fan-out-update': {
                    const userId = (opts?.userId as ID) ?? 'user_0';
                    actions.renameUser(userId, 'Renamed User');
                    break;
                }
                case 'bulk-update': {
                    const ids = (opts?.cardIds as ID[]) ?? [];
                    actions.bulkToggleTagOnCards(ids, (opts?.tagId as ID) ?? 'tag_0');
                    break;
                }
            }
        },
        stop() {
            stopped = true;
            if (churnInterval != null) window.clearInterval(churnInterval);
            churnInterval = null;
        },
    };
}
