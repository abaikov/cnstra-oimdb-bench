#!/usr/bin/env node

/**
 * Puppeteer automation script for benchmarking
 * Runs all adapters × scenarios and saves results to bench-results/
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const ADAPTERS = [
    'Effector (ids-based)',
    'Cnstra + Oimdb (ids-based)',
    'Redux Toolkit (ids-based)',
    'Zustand (ids-based)',
];
const SCENARIOS = ['background-churn', 'inline-editing', 'bulk-update'];

const PORT = process.env.PORT || 4173; // Vite preview uses 4173 by default
const BASE_URL = `http://localhost:${PORT}`;

async function runBenchmarks() {
    console.log('🚀 Starting Puppeteer benchmarks...\n');

    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--disable-renderer-backgrounding',
            '--disable-background-timer-throttling',
            '--disable-features=CalculateNativeWinOcclusion',
            '--no-sandbox',
            '--disable-setuid-sandbox',
        ],
    });

    const dateDir = path.join(rootDir, 'bench-results', new Date().toISOString().split('T')[0]);
    fs.mkdirSync(dateDir, { recursive: true });

    const results = [];

    for (const adapter of ADAPTERS) {
        for (const scenario of SCENARIOS) {
            const page = await browser.newPage();

            // Forward browser console messages to terminal
            page.on('console', (msg) => {
                const type = msg.type();
                const text = msg.text();
                if (type === 'error') {
                    console.error(`[Browser ${type}] ${text}`);
                } else if (type === 'warn') {
                    console.warn(`[Browser ${type}] ${text}`);
                } else {
                    console.log(`[Browser] ${text}`);
                }
            });

            try {
                console.log(`📊 Running ${adapter}/${scenario}...`);

                // Try to navigate - will retry if server not ready
                let retries = 5;
                while (retries > 0) {
                    try {
                        await page.goto(
                            `${BASE_URL}/?scenario=${scenario}&adapter=${adapter}&overlays=0`,
                            { waitUntil: 'networkidle0', timeout: 30000 },
                        );
                        break;
                    } catch (e) {
                        retries--;
                        if (retries === 0) throw e;
                        console.log(`   ⏳ Server not ready, retrying in 2s... (${retries} left)`);
                        await new Promise((resolve) => setTimeout(resolve, 2000));
                    }
                }

                // Wait for app to be ready
                await page.waitForFunction(
                    () => window.__ready === true,
                    { timeout: 120000 },
                );

                // Run benchmark and get results
                const result = await page.evaluate(
                    (adapterName, scenarioName) => {
                        if (typeof window.__runAndReport !== 'function') {
                            throw new Error('window.__runAndReport is not available');
                        }
                        return window.__runAndReport(adapterName, scenarioName);
                    },
                    adapter,
                    scenario,
                );

                // Save result
                const filename = path.join(dateDir, `${adapter}-${scenario}.json`);
                fs.writeFileSync(filename, JSON.stringify(result, null, 2));

                results.push({ adapter, scenario, result, filename });
                console.log(`   ✅ Saved to ${path.relative(rootDir, filename)}\n`);
            } catch (error) {
                console.error(`   ❌ Error: ${error.message}\n`);
                results.push({
                    adapter,
                    scenario,
                    error: error.message,
                });
            } finally {
                await page.close();
            }
        }
    }

    await browser.close();

    // Summary
    console.log('\n📈 Summary:');
    console.log(`   Total runs: ${results.length}`);
    console.log(`   Successful: ${results.filter((r) => !r.error).length}`);
    console.log(`   Failed: ${results.filter((r) => r.error).length}`);
    console.log(`   Results saved to: ${path.relative(rootDir, dateDir)}`);

    return results;
}

// Run if called directly
runBenchmarks()
    .then(() => {
        console.log('\n✅ Benchmarks completed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Benchmarks failed:', error);
        process.exit(1);
    });

export { runBenchmarks };

