#!/usr/bin/env node

/**
 * Puppeteer automation script with dev server management
 * Manages Vite dev server lifecycle and runs benchmarks
 * Outputs real-time test duration for each test
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const ALL_ADAPTERS = [
    'Effector (ids-based)',
    'Cnstra + Oimdb (ids-based)',
    'Redux Toolkit (ids-based)',
    'Zustand (ids-based)',
];

const SCENARIOS = ['background-churn', 'inline-editing', 'bulk-update'];

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const config = {
        adapters: ALL_ADAPTERS,
        scenarios: SCENARIOS,
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const nextArg = args[i + 1];

        if ((arg === '--adapter' || arg === '-a') && nextArg) {
            const adapterName = nextArg;
            if (adapterName.toLowerCase() === 'all') {
                config.adapters = ALL_ADAPTERS;
            } else if (ALL_ADAPTERS.includes(adapterName)) {
                config.adapters = [adapterName];
            } else {
                console.error(`❌ Unknown adapter: ${adapterName}`);
                console.error(`   Available: ${ALL_ADAPTERS.join(', ')}`);
                process.exit(1);
            }
            i++; // Skip next argument as it's been consumed
        } else if ((arg === '--scenario' || arg === '-s') && nextArg) {
            const scenario = nextArg;
            if (scenario.toLowerCase() === 'all') {
                config.scenarios = SCENARIOS;
            } else if (SCENARIOS.includes(scenario)) {
                config.scenarios = [scenario];
            } else {
                console.error(`❌ Unknown scenario: ${scenario}`);
                console.error(`   Available: ${SCENARIOS.join(', ')}`);
                process.exit(1);
            }
            i++; // Skip next argument as it's been consumed
        } else if (arg === '--help' || arg === '-h') {
            console.log('\n📊 Benchmark Runner');
            console.log('\nUsage:');
            console.log('  npm run bench [options]');
            console.log('\nOptions:');
            console.log('  -a, --adapter <name>    Run benchmark for specific adapter');
            console.log('                           Use "all" to run all adapters (default)');
            console.log('  -s, --scenario <name>   Run specific scenario');
            console.log('                           Use "all" to run all scenarios (default)');
            console.log('  -h, --help              Show this help message');
            console.log('\nExamples:');
            console.log('  npm run bench                           # Run all adapters, all scenarios');
            console.log('  npm run bench --adapter "Redux Toolkit"  # Run Redux Toolkit only');
            console.log('  npm run bench -a "Zustand" -s "inline-editing"  # Run Zustand with inline-editing only');
            console.log('\nAvailable adapters:');
            console.log(`  ${ALL_ADAPTERS.map((a) => `"${a}"`).join(', ')}`);
            console.log('\nAvailable scenarios:');
            console.log(`  ${SCENARIOS.join(', ')}`);
            console.log('');
            process.exit(0);
        }
    }

    return config;
}

const config = parseArgs();
const ADAPTERS = config.adapters;
const SELECTED_SCENARIOS = config.scenarios;

const PORT = 5173; // Vite dev server default
const BASE_URL = `http://localhost:${PORT}`;

// Normalize adapter name for filename
function normalizeAdapterName(name) {
    return name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/\+/g, '--')
        .replace(/\(ids-based\)/g, 'ids-based')  // Convert "(ids-based)" to "ids-based"
        .replace(/[^a-z0-9-]/g, '');
}

async function waitForServer(maxWaitMs = 60000) {
    const startTime = Date.now();
    const intervalMs = 500;

    while (Date.now() - startTime < maxWaitMs) {
        try {
            const response = await fetch(BASE_URL, { signal: AbortSignal.timeout(2000) });
            if (response.ok) {
                return true;
            }
        } catch (e) {
            // Server not ready, continue waiting
        }
        process.stdout.write('   Server starting...\r');
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    return false;
}

function isServerRunning() {
    return new Promise((resolve) => {
        fetch(BASE_URL, { signal: AbortSignal.timeout(1000) })
            .then(() => resolve(true))
            .catch(() => resolve(false));
    });
}

async function startDevServer() {
    const serverRunning = await isServerRunning();
    if (serverRunning) {
        console.log('✅ Dev server already running');
        return null;
    }

    console.log('🔧 Starting dev server...');
    const server = spawn('npm', ['run', 'dev'], {
        cwd: rootDir,
        stdio: 'pipe',
        shell: true,
    });

    server.stdout.on('data', (data) => {
        // Vite outputs server URL on startup
        const output = data.toString();
        if (output.includes('Local:') || output.includes('localhost')) {
            process.stdout.write(`   ${output}`);
        }
    });

    server.stderr.on('data', (data) => {
        const output = data.toString();
        if (!output.includes('DeprecationWarning')) {
            process.stderr.write(`   ${output}`);
        }
    });

    return server;
}

async function stopDevServer(server) {
    if (!server) return;

    console.log('\n🛑 Stopping dev server...');
    try {
        server.kill('SIGTERM');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        // Force kill if still running
        try {
            process.kill(server.pid, 'SIGKILL');
        } catch (e) {
            // Process already dead
        }
    } catch (e) {
        // Ignore errors
    }
}

async function runBenchmarks() {
    let server = null;

    try {
        // Start dev server if needed
        server = await startDevServer();

        if (server) {
            console.log('\n⏳ Waiting for server to start...');
            const serverReady = await waitForServer(60000);
            if (!serverReady) {
                throw new Error(`Server at ${BASE_URL} is not ready after 60 seconds`);
            }
            console.log(` ✅ Server ready at ${BASE_URL} (waited ${((Date.now() - (Date.now() % 1000)) % 60000) / 1000}s)\n`);
        } else {
            console.log('🚀 Starting Puppeteer benchmarks...\n');
        }

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
        let totalStartTime = Date.now();

        // Log configuration
        console.log(`\n📋 Configuration:`);
        console.log(`   Adapters: ${ADAPTERS.length === ALL_ADAPTERS.length ? 'all' : ADAPTERS.join(', ')}`);
        console.log(`   Scenarios: ${SELECTED_SCENARIOS.length === SCENARIOS.length ? 'all' : SELECTED_SCENARIOS.join(', ')}`);
        console.log(`   Total runs: ${ADAPTERS.length * SELECTED_SCENARIOS.length}\n`);

        for (const adapter of ADAPTERS) {
            for (const scenario of SELECTED_SCENARIOS) {
                const page = await browser.newPage();

                try {
                    const adapterParam = normalizeAdapterName(adapter);
                    const url = `${BASE_URL}/?scenario=${scenario}&adapter=${encodeURIComponent(adapter)}&overlays=0`;

                    // Show full adapter name with mode in logs
                    console.log(`📊 Running ${adapter}/${scenario}...`);

                    // Navigate with retries (this time is NOT included in benchmark duration)
                    let retries = 5;
                    while (retries > 0) {
                        try {
                            await page.goto(url, {
                                waitUntil: 'networkidle0',
                                timeout: 30000,
                            });
                            break;
                        } catch (e) {
                            retries--;
                            if (retries === 0) throw e;
                            process.stdout.write(`   ⏳ Retrying... (${retries} left)\r`);
                            await new Promise((resolve) => setTimeout(resolve, 2000));
                        }
                    }

                    // Wait for app to be ready (this time is NOT included in benchmark duration)
                    await page.waitForFunction(
                        () => window.__ready === true,
                        { timeout: 120000 },
                    );

                    // NOW start timing - only measure actual benchmark execution time
                    // This excludes page load, navigation, and adapter switching overhead
                    const benchmarkStartTime = Date.now();

                    // Verify adapter was found (check browser console for errors)
                    const adapterCheck = await page.evaluate(() => {
                        const currentAdapter = window.__currentAdapter;
                        const urlParams = new URLSearchParams(window.location.search);
                        const urlAdapter = urlParams.get('adapter');
                        return {
                            urlAdapter,
                            currentAdapterName: currentAdapter?.name,
                            match: currentAdapter?.name === urlAdapter,
                        };
                    });
                    
                    if (!adapterCheck.match && adapterCheck.urlAdapter) {
                        throw new Error(
                            `Adapter "${adapterCheck.urlAdapter}" not found! ` +
                            `Current adapter is "${adapterCheck.currentAdapterName}". ` +
                            `Available: ${ALL_ADAPTERS.join(', ')}`
                        );
                    }

                    // Run benchmark (don't pass adapterName, rely on URL param)
                    // This ensures adapter is already selected via URL, avoiding switch overhead
                    const result = await page.evaluate(() => {
                        if (typeof window.__runAndReport !== 'function') {
                            throw new Error('window.__runAndReport is not available');
                        }
                        return window.__runAndReport();
                    });

                    const benchmarkDuration = ((Date.now() - benchmarkStartTime) / 1000).toFixed(1);

                    // Save result
                    const filename = path.join(dateDir, `${adapterParam}-${scenario}.json`);
                    fs.writeFileSync(filename, JSON.stringify(result, null, 2));

                    // Log benchmark duration (NOT total time including page load)
                    console.log(`   ✅ Saved to bench-results/${path.basename(dateDir)}/${path.basename(filename)} (${benchmarkDuration}s)`);

                    results.push({ adapter, scenario, result, filename });
                } catch (error) {
                    console.error(`   ❌ Error: ${error.message}`);
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

        const totalDuration = ((Date.now() - totalStartTime) / 1000).toFixed(1);

        // Summary
        console.log('\n📈 Summary:');
        console.log(`   Total runs: ${results.length}`);
        console.log(`   Successful: ${results.filter((r) => !r.error).length}`);
        console.log(`   Failed: ${results.filter((r) => r.error).length}`);
        console.log(`   Total time: ${totalDuration}s`);
        console.log(`   Results saved to: bench-results/${path.basename(dateDir)}`);

        return results;
    } finally {
        await stopDevServer(server);
        console.log('\n✅ All benchmarks completed!');
    }
}

// Run if called directly
runBenchmarks()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Benchmarks failed:', error);
        process.exit(1);
    });

export { runBenchmarks };

