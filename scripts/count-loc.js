#!/usr/bin/env node

/**
 * Script to count lines of code for each adapter
 * Run: node scripts/count-loc.js
 */

const fs = require('fs');
const path = require('path');

const adaptersDir = path.join(__dirname, '../packages/adapters');
const outputFile = path.join(__dirname, '../packages/core/src/adapter-loc.json');

function countLines(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        
        // Count non-empty lines (excluding comments and blank lines)
        const codeLines = lines.filter(line => {
            const trimmed = line.trim();
            return trimmed.length > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*');
        }).length;
        
        return {
            total: lines.length,
            code: codeLines,
            blank: lines.filter(l => l.trim().length === 0).length,
            comments: lines.filter(l => {
                const trimmed = l.trim();
                return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
            }).length
        };
    } catch (err) {
        return null;
    }
}

function findAdapterFiles(adapterDir) {
    const srcDir = path.join(adapterDir, 'src');
    if (!fs.existsSync(srcDir)) {
        return [];
    }
    
    const files = [];
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    
    for (const entry of entries) {
        const fullPath = path.join(srcDir, entry.name);
        if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
            files.push(fullPath);
        } else if (entry.isDirectory()) {
            // Recursively search subdirectories
            const subFiles = fs.readdirSync(fullPath, { recursive: true });
            subFiles.forEach(file => {
                if (file.endsWith('.ts') || file.endsWith('.tsx')) {
                    files.push(path.join(fullPath, file));
                }
            });
        }
    }
    
    return files;
}

function getAdapterName(adapterDir) {
    // Use directory name as key for mapping
    return path.basename(adapterDir);
}

function main() {
    const adapters = {};
    
    if (!fs.existsSync(adaptersDir)) {
        console.error(`Adapters directory not found: ${adaptersDir}`);
        process.exit(1);
    }
    
    const adapterDirs = fs.readdirSync(adaptersDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => ({
            name: entry.name,
            path: path.join(adaptersDir, entry.name)
        }));
    
    for (const { name, path: adapterPath } of adapterDirs) {
        // Skip placeholder and dist folders
        if (name === 'placeholder' || name === 'dist' || name.startsWith('.')) {
            continue;
        }
        
        const files = findAdapterFiles(adapterPath);
        if (files.length === 0) {
            continue;
        }
        
        let totalLines = 0;
        let totalCodeLines = 0;
        let totalBlankLines = 0;
        let totalComments = 0;
        
        for (const file of files) {
            const stats = countLines(file);
            if (stats) {
                totalLines += stats.total;
                totalCodeLines += stats.code;
                totalBlankLines += stats.blank;
                totalComments += stats.comments;
            }
        }
        
        const adapterName = getAdapterName(adapterPath);
        
        // Map adapter names to their display names (must match names in App.tsx)
        const nameMap = {
            'cnstra-oimdb': 'Cnstra + Oimdb',
            'redux': 'Redux Toolkit',
            'effector': 'Effector',
            'mobx': 'MobX',
            'zustand': 'Zustand',
        };
        
        const displayName = nameMap[adapterName] || adapterName
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        
        adapters[displayName] = {
            linesOfCode: totalCodeLines,
            totalLines: totalLines,
            blankLines: totalBlankLines,
            commentLines: totalComments,
            files: files.length,
            lastUpdated: new Date().toISOString()
        };
    }
    
    // Write to JSON file
    const output = {
        _comment: '⚠️ AUTO-GENERATED FILE - Do not edit manually! Run \'npm run count-loc\' to update after modifying adapter code.',
        generated: new Date().toISOString(),
        adapters
    };
    
    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
    console.log(`✅ Lines of code counted and saved to ${outputFile}`);
    console.log('\nResults:');
    Object.entries(adapters).forEach(([name, stats]) => {
        console.log(`  ${name}: ${stats.linesOfCode} LOC (${stats.files} files)`);
    });
}

main();

