import fs from 'fs';
import path from 'path';

const dir = 'bench-results/2025-11-02';

function getResults() {
    const scenarios = ['background-churn', 'bulk-update', 'inline-editing'];
    const adapters = ['cnstra--oimdb', 'redux-toolkit', 'zustand', 'mobx', 'effector'];
    const adapterNames = {
        'cnstra--oimdb': 'Cnstra + Oimdb',
        'redux-toolkit': 'Redux Toolkit',
        'zustand': 'Zustand',
        'mobx': 'MobX',
        'effector': 'Effector',
    };
    
    const results = [];
    
    for (const scenario of scenarios) {
        for (const adapter of adapters) {
            const file = path.join(dir, `${adapter}-${scenario}.json`);
            if (fs.existsSync(file)) {
                const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
                results.push({
                    adapter: adapterNames[adapter] || adapter,
                    scenario,
                    js_time: data.js_time_ms,
                    latency_p50: data.latency_ms.p50,
                    renders: data.renders.total,
                    memory: data.heap_mb.peak,
                });
            }
        }
    }
    
    return results;
}

const results = getResults();

console.log('\n🏆 ПОБЕДИТЕЛИ ПО СЦЕНАРИЯМ:\n');
console.log('='.repeat(80));

// Find winners per scenario
const scenarios = ['background-churn', 'bulk-update', 'inline-editing'];
const scenarioNames = {
    'background-churn': 'Background Churn',
    'bulk-update': 'Bulk Update',
    'inline-editing': 'Inline Editing',
};

for (const scenario of scenarios) {
    const scenarioResults = results.filter(r => r.scenario === scenario);
    const best = scenarioResults.reduce((best, curr) => 
        curr.js_time < best.js_time ? curr : best
    );
    
    console.log(`\n${scenarioNames[scenario]}:`);
    console.log(`  🥇 ${best.adapter}: ${best.js_time.toFixed(1)}ms`);
    console.log(`     P50 latency: ${best.latency_p50.toFixed(1)}ms`);
    console.log(`     Renders: ${best.renders}`);
    console.log(`     Memory: ${best.memory.toFixed(2)} MB`);
    
    // Show top 3
    const sorted = [...scenarioResults].sort((a, b) => a.js_time - b.js_time);
    if (sorted.length > 1) {
        console.log(`  🥈 ${sorted[1].adapter}: ${sorted[1].js_time.toFixed(1)}ms`);
        if (sorted.length > 2) {
            console.log(`  🥉 ${sorted[2].adapter}: ${sorted[2].js_time.toFixed(1)}ms`);
        }
    }
}

// Overall winner (best average across all scenarios)
console.log('\n' + '='.repeat(80));
console.log('\n🏆 ОБЩИЙ ПОБЕДИТЕЛЬ (средний результат):\n');

const adapterScores = {};
for (const scenario of scenarios) {
    const scenarioResults = results.filter(r => r.scenario === scenario);
    const best = Math.min(...scenarioResults.map(r => r.js_time));
    
    for (const r of scenarioResults) {
        if (!adapterScores[r.adapter]) {
            adapterScores[r.adapter] = [];
        }
        // Normalize to best (lower is better)
        adapterScores[r.adapter].push((r.js_time / best) * 100);
    }
}

const averages = Object.entries(adapterScores).map(([adapter, scores]) => ({
    adapter,
    avg: scores.reduce((a, b) => a + b, 0) / scores.length,
}));

averages.sort((a, b) => a.avg - b.avg);

for (let i = 0; i < Math.min(3, averages.length); i++) {
    const medal = ['🥇', '🥈', '🥉'][i];
    console.log(`${medal} ${averages[i].adapter.padEnd(20)} Score: ${averages[i].avg.toFixed(1)} (lower is better)`);
}

console.log('\n' + '='.repeat(80));
console.log('\n📊 Детальная таблица:\n');

const adaptersList = Array.from(new Set(results.map(r => r.adapter))).sort();
console.log('Scenario'.padEnd(20) + adaptersList.map(a => a.padEnd(15)).join(''));
console.log('-'.repeat(80));

for (const scenario of scenarios) {
    const line = [scenarioNames[scenario].padEnd(20)];
    for (const adapter of adaptersList) {
        const r = results.find(res => res.scenario === scenario && res.adapter === adapter);
        if (r) {
            line.push(r.js_time.toFixed(1).padEnd(15));
        } else {
            line.push('N/A'.padEnd(15));
        }
    }
    console.log(line.join(''));
}

