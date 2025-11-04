#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const scenario = 'bulk-update';
const resultsDir = path.join(rootDir, 'bench-results', '2025-11-02');

console.log(`\n📊 Comparing Puppeteer results for scenario: ${scenario}\n`);

const adapters = [
    'cnstra--oimdb',
    'redux-toolkit',
    'zustand',
    'mobx',
    'effector',
];

const results = {};

for (const adapter of adapters) {
    const filename = path.join(resultsDir, `${adapter}-${scenario}.json`);
    if (fs.existsSync(filename)) {
        const data = JSON.parse(fs.readFileSync(filename, 'utf-8'));
        results[adapter] = {
            js_time: data.js_time_ms,
            latency_p50: data.latency_ms.p50,
            latency_p95: data.latency_ms.p95,
            latency_p99: data.latency_ms.p99,
            renders: data.renders.total,
            memory: data.heap_mb.peak,
            raw_avg: data.raw?.average?.executionTime,
        };
    }
}

// Sort by js_time
const sorted = Object.entries(results)
    .sort((a, b) => a[1].js_time - b[1].js_time);

console.log('Execution Time (js_time_ms) - Puppeteer results:');
console.log('='.repeat(80));
sorted.forEach(([adapter, data], idx) => {
    const best = sorted[0][1].js_time;
    const ratio = ((data.js_time / best) * 100).toFixed(0);
    console.log(`${idx + 1}. ${adapter.padEnd(20)} ${data.js_time.toFixed(2).padStart(8)} ms  (${ratio}% of best)`);
});

console.log('\n📊 Browser UI shows (from screenshot):');
console.log('='.repeat(80));
console.log('1. Cnstra + Oimdb:  38.1 ms  (best)');
console.log('2. Zustand:         39.4 ms');
console.log('3. Effector:        42.5 ms');
console.log('4. MobX:            47.5 ms');
console.log('5. Redux Toolkit:   61.7 ms');

console.log('\n⚠️  DISCREPANCY ANALYSIS:');
console.log('='.repeat(80));
sorted.forEach(([adapter, data]) => {
    const browserMap = {
        'cnstra--oimdb': 38.1,
        'zustand': 39.4,
        'effector': 42.5,
        'mobx': 47.5,
        'redux-toolkit': 61.7,
    };
    const browserTime = browserMap[adapter];
    if (browserTime) {
        const diff = data.js_time - browserTime;
        const diffPct = ((diff / browserTime) * 100).toFixed(0);
        const marker = Math.abs(diff) > 50 ? '⚠️ ' : '  ';
        console.log(`${marker}${adapter.padEnd(20)} Browser: ${browserTime.toFixed(1).padStart(6)} ms  Puppeteer: ${data.js_time.toFixed(1).padStart(6)} ms  Diff: ${diff > 0 ? '+' : ''}${diff.toFixed(1)} ms (${diffPct > 0 ? '+' : ''}${diffPct}%)`);
    }
});

console.log('\n💡 Possible causes:');
console.log('- Browser results may be from cached/previous run');
console.log('- Puppeteer runs in headless mode (different performance)');
console.log('- Different measurement methodology');
console.log('- Component rendering may differ between manual and automated runs');

