import fs from 'fs';
import path from 'path';

const dir = 'bench-results/2025-11-02';
const cnstra = 'cnstra--oimdb';

function getResult(adapter, scenario) {
    const file = path.join(dir, `${adapter}-${scenario}.json`);
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return {
        js_time: data.js_time_ms,
        latency_p50: data.latency_ms.p50,
        renders: data.renders.total,
        memory: data.heap_mb.peak,
    };
}

const scenarios = [
    { key: 'background-churn', name: 'Background Churn' },
    { key: 'bulk-update', name: 'Bulk Update' },
    { key: 'inline-editing', name: 'Inline Editing' },
];

const adapters = [
    { key: 'zustand', name: 'Zustand' },
    { key: 'effector', name: 'Effector' },
    { key: 'redux-toolkit', name: 'Redux Toolkit' },
    { key: 'mobx', name: 'MobX' },
];

console.log('\n🚀 ВЫИГРЫШИ CNSTRA + OIMDB:\n');
console.log('='.repeat(100));

for (const scenario of scenarios) {
    const cnstraResult = getResult(cnstra, scenario.key);
    if (!cnstraResult) continue;
    
    console.log(`\n📊 ${scenario.name.toUpperCase()}:`);
    console.log(`   Cnstra: ${cnstraResult.js_time.toFixed(1)}ms, P50: ${cnstraResult.latency_p50.toFixed(1)}ms, Renders: ${cnstraResult.renders}, Memory: ${cnstraResult.memory.toFixed(2)}MB\n`);
    
    const comparisons = [];
    
    for (const adapter of adapters) {
        const adapterResult = getResult(adapter.key, scenario.key);
        if (!adapterResult) continue;
        
        const jsTimeWin = ((adapterResult.js_time / cnstraResult.js_time) - 1) * 100;
        const latencyWin = ((adapterResult.latency_p50 / cnstraResult.latency_p50) - 1) * 100;
        const rendersWin = ((adapterResult.renders / cnstraResult.renders) - 1) * 100;
        const memoryWin = ((adapterResult.memory / cnstraResult.memory) - 1) * 100;
        
        comparisons.push({
            adapter: adapter.name,
            jsTime: adapterResult.js_time,
            jsTimeWin,
            latency: adapterResult.latency_p50,
            latencyWin,
            renders: adapterResult.renders,
            rendersWin,
            memory: adapterResult.memory,
            memoryWin,
        });
    }
    
    // Sort by JS time advantage
    comparisons.sort((a, b) => b.jsTimeWin - a.jsTimeWin);
    
    for (const comp of comparisons) {
        console.log(`   vs ${comp.adapter.padEnd(18)}:`);
        console.log(`      ⚡ JS Time:  ${comp.jsTime.toFixed(1)}ms  →  Cnstra быстрее на ${comp.jsTimeWin.toFixed(1)}%`);
        console.log(`      ⏱️  Latency:  ${comp.latency.toFixed(1)}ms  →  Cnstra быстрее на ${comp.latencyWin.toFixed(1)}%`);
        console.log(`      🎨 Renders:  ${comp.renders}  →  Cnstra делает на ${comp.rendersWin.toFixed(1)}% меньше`);
        console.log(`      💾 Memory:   ${comp.memory.toFixed(2)}MB  →  Cnstra использует на ${comp.memoryWin.toFixed(1)}% меньше`);
        console.log('');
    }
}

// Overall summary
console.log('\n' + '='.repeat(100));
console.log('\n📈 СВОДКА ПО СРЕДНЕМУ ПРЕИМУЩЕСТВУ:\n');

const avgWins = {};
for (const adapter of adapters) {
    avgWins[adapter.name] = {
        jsTime: [],
        latency: [],
        renders: [],
        memory: [],
    };
}

for (const scenario of scenarios) {
    const cnstraResult = getResult(cnstra, scenario.key);
    if (!cnstraResult) continue;
    
    for (const adapter of adapters) {
        const adapterResult = getResult(adapter.key, scenario.key);
        if (!adapterResult) continue;
        
        avgWins[adapter.name].jsTime.push(((adapterResult.js_time / cnstraResult.js_time) - 1) * 100);
        avgWins[adapter.name].latency.push(((adapterResult.latency_p50 / cnstraResult.latency_p50) - 1) * 100);
        avgWins[adapter.name].renders.push(((adapterResult.renders / cnstraResult.renders) - 1) * 100);
        avgWins[adapter.name].memory.push(((adapterResult.memory / cnstraResult.memory) - 1) * 100);
    }
}

const summary = Object.entries(avgWins).map(([name, wins]) => ({
    name,
    jsTime: wins.jsTime.reduce((a, b) => a + b, 0) / wins.jsTime.length,
    latency: wins.latency.reduce((a, b) => a + b, 0) / wins.latency.length,
    renders: wins.renders.reduce((a, b) => a + b, 0) / wins.renders.length,
    memory: wins.memory.reduce((a, b) => a + b, 0) / wins.memory.length,
}));

summary.sort((a, b) => b.jsTime - a.jsTime);

console.log('По JS Time (средний выигрыш):');
for (const s of summary) {
    console.log(`   ${s.name.padEnd(18)}: Cnstra быстрее в среднем на ${s.jsTime.toFixed(1)}%`);
}

console.log('\nПо Latency P50 (средний выигрыш):');
summary.sort((a, b) => b.latency - a.latency);
for (const s of summary) {
    console.log(`   ${s.name.padEnd(18)}: Cnstra быстрее в среднем на ${s.latency.toFixed(1)}%`);
}

console.log('\nПо Renders (средний выигрыш):');
summary.sort((a, b) => b.renders - a.renders);
for (const s of summary) {
    console.log(`   ${s.name.padEnd(18)}: Cnstra делает на ${s.renders.toFixed(1)}% меньше рендеров`);
}

console.log('\nПо Memory (средний выигрыш):');
summary.sort((a, b) => b.memory - a.memory);
for (const s of summary) {
    console.log(`   ${s.name.padEnd(18)}: Cnstra использует на ${s.memory.toFixed(1)}% меньше памяти`);
}

