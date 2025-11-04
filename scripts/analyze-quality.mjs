import fs from 'fs';
import path from 'path';

const dir = 'bench-results/2025-11-02';

function analyze(adapter, scenario) {
    const file = path.join(dir, `${adapter}-${scenario}.json`);
    if (!fs.existsSync(file)) return null;
    
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const runs = data.raw?.runs || [];
    if (runs.length === 0) return null;
    
    const execTimes = runs.map(r => r.executionTime);
    const min = Math.min(...execTimes);
    const max = Math.max(...execTimes);
    const avg = execTimes.reduce((a, b) => a + b, 0) / execTimes.length;
    const median = execTimes.sort((a,b) => a-b)[Math.floor(execTimes.length/2)];
    const variance = execTimes.reduce((sum, x) => sum + Math.pow(x - avg, 2), 0) / execTimes.length;
    const stdDev = Math.sqrt(variance);
    const cv = (stdDev / avg) * 100; // Coefficient of variation
    
    return {
        adapter,
        scenario,
        js_time: data.js_time_ms,
        runs: execTimes.length,
        min, max, avg, median,
        stdDev, cv,
        renders: runs[0]?.renderCount || 0,
        latency_p50: data.latency_ms?.p50 || 0,
        issues: [],
    };
}

console.log('\n📊 Quality Analysis:\n');

const scenarios = ['background-churn', 'bulk-update', 'inline-editing'];
const adapters = ['cnstra--oimdb', 'redux-toolkit', 'zustand', 'mobx', 'effector'];

for (const scenario of scenarios) {
    console.log(`\n=== ${scenario} ===\n`);
    const results = adapters.map(a => analyze(a, scenario)).filter(Boolean);
    
    for (const r of results) {
        // Check for issues
        if (r.cv > 30) r.issues.push(`High variance (CV=${r.cv.toFixed(1)}%)`);
        if (r.max / r.min > 3) r.issues.push(`Large spread (${(r.max/r.min).toFixed(1)}x)`);
        if (r.runs < 5) r.issues.push(`Few runs (${r.runs})`);
        if (r.renders === 0) r.issues.push('No renders counted');
        if (r.latency_p50 === 0 && scenario !== 'background-churn') r.issues.push('No latency data');
        
        const status = r.issues.length === 0 ? '✅' : r.issues.length === 1 ? '⚠️' : '❌';
        console.log(`${status} ${r.adapter.padEnd(20)} ${r.js_time.toFixed(1).padStart(7)}ms  CV:${r.cv.toFixed(1)}%  renders:${r.renders}`);
        if (r.issues.length > 0) {
            r.issues.forEach(issue => console.log(`   ${issue}`));
        }
    }
}

console.log('\n💡 Notes:');
console.log('- CV (Coefficient of Variation) < 20% = very stable');
console.log('- CV 20-30% = acceptable');
console.log('- CV > 30% = high variance (unreliable)');
console.log('- Large spread (max/min > 3x) suggests outliers or measurement issues');

