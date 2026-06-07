#!/usr/bin/env node
/**
 * Throughput benchmark — the "real work" test, NOT gated by the animation frame.
 *
 * The latency scenarios (npm run bench) measure action->paint, which floors at
 * ~one frame (~33ms), so every adapter ties. This drives window.__throughput(),
 * which does `flushSync(updateCard)` in a tight loop (synchronous render+commit,
 * no rAF wait) over the mounted cards, and reports the real per-update cost +
 * how many components actually re-render. That surfaces the per-key vs coarse
 * difference the frame floor hides.
 *
 * Manages its own dev server. On recent macOS pass system Chrome:
 *   PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *     npm run bench:throughput
 */
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const PORT = 5173;
const BASE = `http://localhost:${PORT}`;
const N = Number(process.env.TP_N || 3000);
const PASSES = Number(process.env.TP_PASSES || 3);
const ADAPTERS = [
    'Cnstra + Oimdb (ids-based)',
    'Cnstra + Oimdb (in-place)',
    'Oimdb (no cnstra)',
    'MobX (ids-based)',
    'MobX (deep/in-place)',
    'Effector (atomic stores)',
    'Effector (ids-based)',
    'Zustand (ids-based)',
    'Redux Toolkit (ids-based)',
];

async function isUp() {
    try {
        return (await fetch(BASE, { signal: AbortSignal.timeout(1500) })).ok;
    } catch {
        return false;
    }
}
async function startServer() {
    if (await isUp()) return null;
    const server = spawn('npm', ['run', 'dev'], { cwd: rootDir, stdio: 'ignore', shell: true });
    for (let i = 0; i < 120; i++) {
        if (await isUp()) return server;
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('dev server did not start');
}

const server = await startServer();
const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    protocolTimeout: 600000,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const rows = [];
try {
    for (const a of ADAPTERS) {
        const best = { t: Infinity, react: Infinity, glue: Infinity, renders: NaN, mounted: NaN, err: '' };
        for (let p = 0; p < PASSES; p++) {
            const page = await browser.newPage();
            const errs = [];
            page.on('pageerror', (e) => errs.push(String(e)));
            try {
                await page.goto(`${BASE}/?adapter=${encodeURIComponent(a)}&overlays=0`, {
                    waitUntil: 'networkidle0',
                    timeout: 60000,
                });
                await page.waitForFunction(() => window.__ready === true, { timeout: 60000 });
                await page.evaluate((n) => window.__throughput({ n }), N); // warm
                const r = await page.evaluate((n) => window.__throughput({ n }), N);
                if (r.usPerUpdate < best.t) {
                    best.t = r.usPerUpdate;
                    best.react = r.reactUsPerUpdate;
                    best.glue = r.glueUsPerUpdate;
                }
                best.renders = r.rendersPerUpdate;
                best.mounted = r.mountedCards;
                if (errs.length) best.err = errs[0].slice(0, 60);
            } catch (e) {
                best.err = String(e.message).slice(0, 60);
            } finally {
                await page.close();
            }
        }
        rows.push({ a, ...best });
        console.log(
            a.padEnd(28),
            'µs/upd=' + (Number.isFinite(best.t) ? best.t.toFixed(1) : 'FAIL').padStart(8),
            'upd/s=' + (Number.isFinite(best.t) ? Math.round(1e6 / best.t) : 0).toString().padStart(8),
            'renders/upd=' + String(best.renders).padStart(5),
            'React=' + String(best.react).padStart(6),
            'glue=' + String(best.glue).padStart(6),
            best.err ? 'ERR ' + best.err : '',
        );
    }
} finally {
    await browser.close();
    if (server) server.kill('SIGTERM');
}

// Markdown report
const sorted = [...rows].filter((r) => Number.isFinite(r.t)).sort((x, y) => x.t - y.t);
const md = [
    `# Throughput (flushSync, no frame floor)`,
    ``,
    `${N} synchronous updates/pass, best of ${PASSES} passes, ${sorted[0]?.mounted ?? '?'} mounted cards.`,
    `Measures real per-update work; **not** the ~33ms frame floor the latency bench hits.`,
    ``,
    `| Adapter | µs/update | updates/sec | renders/update | React µs | glue µs |`,
    `|---------|-----------|-------------|----------------|----------|---------|`,
    ...sorted.map(
        (r) =>
            `| ${r.a} | ${r.t.toFixed(1)} | ${Math.round(1e6 / r.t)} | ${r.renders} | ${r.react} | ${r.glue} |`,
    ),
    ``,
].join('\n');
const outDir = path.join(rootDir, 'bench-results');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'throughput.md');
fs.writeFileSync(outFile, md);
console.log(`\n${md}\nSaved to ${path.relative(rootDir, outFile)}`);
