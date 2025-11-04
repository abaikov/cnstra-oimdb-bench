import fs from 'fs';
import path from 'path';

const dir = 'bench-results/2025-11-02';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

console.log('\n🔍 Quick Check - Execution Time Consistency:\n');

const scenario = 'bulk-update';
const adapters = ['cnstra--oimdb', 'redux-toolkit', 'zustand', 'mobx', 'effector'];

for (const adapter of adapters) {
    const file = path.join(dir, `${adapter}-${scenario}.json`);
    if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        const jsTime = data.js_time_ms;
        const rawAvg = data.raw?.average?.executionTime;
        const runs = data.raw?.runs || [];
        const runTimes = runs.map(r => r.executionTime);
        const min = Math.min(...runTimes);
        const max = Math.max(...runTimes);
        const median = runTimes.sort((a,b) => a-b)[Math.floor(runTimes.length/2)];
        
        console.log(`${adapter}:`);
        console.log(`  js_time_ms: ${jsTime.toFixed(1)}`);
        console.log(`  raw.avg:    ${rawAvg?.toFixed(1) || 'N/A'}`);
        console.log(`  runs:       min=${min.toFixed(1)}, max=${max.toFixed(1)}, median=${median.toFixed(1)}`);
        console.log(`  renders:    ${runs[0]?.renderCount || 0}`);
        console.log(`  fps:        ${data.raw?.average?.fps?.toFixed(1) || 'N/A'}`);
        
        // Check if js_time_ms matches raw average
        const diff = Math.abs(jsTime - (rawAvg || 0));
        if (diff > 0.1) {
            console.log(`  ⚠️  Mismatch: js_time_ms differs from raw.avg by ${diff.toFixed(2)}ms`);
        }
        console.log('');
    }
}
