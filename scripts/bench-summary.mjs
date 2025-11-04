#!/usr/bin/env node

/**
 * Summary script for benchmark results
 * Reads all JSON files from bench-results/ and generates markdown tables with deltas
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const locJsonPath = path.join(rootDir, 'packages/core/src/adapter-loc.json');

function loadLocMap() {
    try {
        const raw = fs.readFileSync(locJsonPath, 'utf-8');
        const parsed = JSON.parse(raw);
        return parsed?.adapters || {};
    } catch (_e) {
        return {};
    }
}

function normalizeAdapterDisplayName(adapterKey) {
    const n = String(adapterKey || '').toLowerCase();
    if (n.includes('redux')) return 'Redux Toolkit';
    if (n.includes('effector')) return 'Effector';
    if (n.includes('zustand')) return 'Zustand';
    if (n.includes('cnstra')) return 'Cnstra + Oimdb';
    return null;
}

function getAdapterLoc(locMap, adapterKey) {
    const display = normalizeAdapterDisplayName(adapterKey);
    if (!display) return null;
    const item = locMap[display];
    return item?.linesOfCode ?? null;
}

function calculateMedian(values) {
    if (values.length === 0) return 0;
    if (values.length === 1) return values[0];
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
}

function calculateIQR(values) {
    if (values.length < 4) return { q1: median(values), q3: median(values) };
    const sorted = [...values].sort((a, b) => a - b);
    const q1Index = Math.floor(sorted.length * 0.25);
    const q3Index = Math.floor(sorted.length * 0.75);
    return {
        q1: sorted[q1Index],
        q3: sorted[q3Index],
        iqr: sorted[q3Index] - sorted[q1Index],
    };
}

function readResults(dir) {
    const results = [];
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

    for (const file of files) {
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        try {
            const data = JSON.parse(content);
            const match = file.match(/^(.+)-(.+)\.json$/);
            if (match) {
                results.push({
                    adapter: match[1],
                    scenario: match[2],
                    data: data,
                });
            }
        } catch (e) {
            console.warn(`Failed to parse ${file}:`, e.message);
        }
    }

    return results;
}

function generateSummary(results) {
    const locMap = loadLocMap();
    const byScenario = {};
    for (const r of results) {
        if (!byScenario[r.scenario]) {
            byScenario[r.scenario] = [];
        }
        byScenario[r.scenario].push(r);
    }

    const output = ['# Benchmark Summary\n'];

    for (const [scenario, scenarioResults] of Object.entries(byScenario)) {
        output.push(`## Scenario: ${scenario}\n`);
        output.push('| Manager | P50 (ms) | P95 (ms) | P99 (ms) | JS Time (ms) | Renders | Memory (MB) | LOC |');
        output.push('|---------|----------|----------|----------|--------------|---------|-------------|-----|');

        // Sort by P50 latency
        scenarioResults.sort((a, b) => {
            const aP50 = a.data?.latency_ms?.p50 || 0;
            const bP50 = b.data?.latency_ms?.p50 || 0;
            return aP50 - bP50;
        });

        for (const r of scenarioResults) {
            const d = r.data;
            const p50 = d?.latency_ms?.p50?.toFixed(2) || 'N/A';
            const p95 = d?.latency_ms?.p95?.toFixed(2) || 'N/A';
            const p99 = d?.latency_ms?.p99?.toFixed(2) || 'N/A';
            const jsTime = d?.js_time_ms?.toFixed(2) || 'N/A';
            const renders = d?.renders?.total?.toFixed(0) || 'N/A';
            const memory = d?.heap_mb?.peak?.toFixed(2) || 'N/A';

            const loc = getAdapterLoc(locMap, r.adapter);
            const locCell = loc != null ? String(loc) : '—';

            output.push(`| ${r.adapter} | ${p50} | ${p95} | ${p99} | ${jsTime} | ${renders} | ${memory} | ${locCell} |`);
        }

        output.push('');

        // Calculate deltas if we have baseline (first adapter)
        if (scenarioResults.length > 1) {
            const baseline = scenarioResults[0];
            output.push('### Deltas vs Best\n');
            output.push(
                '| Manager | P50 Δ | P95 Δ | P99 Δ | JS Time Δ | Renders Δ | Memory Δ |',
            );
            output.push(
                '|---------|-------|-------|-------|------------|-----------|-----------|',
            );

            for (const r of scenarioResults.slice(1)) {
                const baseP50 = baseline.data?.latency_ms?.p50 || 0;
                const rP50 = r.data?.latency_ms?.p50 || 0;
                const p50Delta = baseP50 > 0 ? ((rP50 / baseP50 - 1) * 100).toFixed(1) : 'N/A';

                const baseP95 = baseline.data?.latency_ms?.p95 || 0;
                const rP95 = r.data?.latency_ms?.p95 || 0;
                const p95Delta = baseP95 > 0 ? ((rP95 / baseP95 - 1) * 100).toFixed(1) : 'N/A';

                const baseP99 = baseline.data?.latency_ms?.p99 || 0;
                const rP99 = r.data?.latency_ms?.p99 || 0;
                const p99Delta = baseP99 > 0 ? ((rP99 / baseP99 - 1) * 100).toFixed(1) : 'N/A';

                const baseJs = baseline.data?.js_time_ms || 0;
                const rJs = r.data?.js_time_ms || 0;
                const jsDelta = baseJs > 0 ? ((rJs / baseJs - 1) * 100).toFixed(1) : 'N/A';

                const baseRenders = baseline.data?.renders?.total || 0;
                const rRenders = r.data?.renders?.total || 0;
                const rendersDelta =
                    baseRenders > 0 ? ((rRenders / baseRenders - 1) * 100).toFixed(1) : 'N/A';

                const baseMem = baseline.data?.heap_mb?.peak || 0;
                const rMem = r.data?.heap_mb?.peak || 0;
                const memDelta = baseMem > 0 ? ((rMem / baseMem - 1) * 100).toFixed(1) : 'N/A';

                output.push(
                    `| ${r.adapter} | ${p50Delta}% | ${p95Delta}% | ${p99Delta}% | ${jsDelta}% | ${rendersDelta}% | ${memDelta}% |`,
                );
            }
            output.push('');
        }
    }

    return output.join('\n');
}

async function main() {
    // Find most recent results directory
    const benchResultsDir = path.join(rootDir, 'bench-results');
    if (!fs.existsSync(benchResultsDir)) {
        console.error('❌ bench-results/ directory not found. Run npm run bench first.');
        process.exit(1);
    }

    const dirs = fs
        .readdirSync(benchResultsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
        .reverse(); // Most recent first

    if (dirs.length === 0) {
        console.error('❌ No results found in bench-results/. Run npm run bench first.');
        process.exit(1);
    }

    const latestDir = path.join(benchResultsDir, dirs[0]);
    console.log(`📊 Analyzing results from: ${path.relative(rootDir, latestDir)}\n`);

    const results = readResults(latestDir);
    const summary = generateSummary(results);

    // Save summary
    const summaryPath = path.join(latestDir, 'SUMMARY.md');
    fs.writeFileSync(summaryPath, summary);

    // Print to console
    console.log(summary);
    console.log(`\n✅ Summary saved to: ${path.relative(rootDir, summaryPath)}`);
}

main().catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
});

