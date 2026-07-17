const fs = require('fs');
const path = require('path');

const filePath = path.join('E:', '文件', 'remember-me', 'packages', 'vscode-extension', 'src', 'extension.ts');
let src = fs.readFileSync(filePath, 'utf-8');
const lines = src.split('\n');

// Find all lines containing "importTemplateCmd"
const importIdx = [];
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('context.subscriptions.push(importTemplateCmd);')) {
        importIdx.push(i);
    }
}
console.log('importTemplateCmd occurrences:', importIdx.map(i => i + 1));

// Find checkFirstRun
let checkIdx = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('async function checkFirstRun(')) {
        checkIdx = i;
        break;
    }
}
console.log('checkFirstRun at line:', checkIdx + 1);

if (importIdx.length === 0 || checkIdx === -1) {
    console.error('Could not find required markers');
    process.exit(1);
}

// Use the LAST occurrence of importTemplateCmd as the real one inside registerCommands
const lastImport = importIdx[importIdx.length - 1];

// Build corrected file:
// - Keep everything up to and including the line with importTemplateCmd
// - Add "}" to close registerCommands
// - Add blank line
// - Find the REAL checkFirstRun and keep from its comment block onward

const fixed = [];
// Add all lines up to and including importTemplateCmd line
for (let i = 0; i <= lastImport; i++) {
    fixed.push(lines[i]);
}

// Add closing brace for registerCommands
fixed.push('}');
fixed.push('');

// Find the real checkFirstRun comment block
// Look for the pattern: blank line, /**,  * 检查是否为首次使用...,  */
let realCheckStart = -1;
for (let i = checkIdx; i >= 0; i--) {
    if (lines[i].trim() === '/**') {
        realCheckStart = i;
        break;
    }
}

if (realCheckStart === -1) {
    // Fallback: just use checkIdx and go back to find the comment
    for (let i = checkIdx; i >= 0; i--) {
        if (lines[i].includes('检查是否为首次使用')) {
            // Go back to find /**
            for (let j = i; j >= 0; j--) {
                if (lines[j].trim() === '/**') {
                    realCheckStart = j;
                    break;
                }
            }
            break;
        }
    }
}

console.log('Real checkFirstRun comment starts at line:', realCheckStart + 1);

if (realCheckStart === -1) {
    console.error('Could not find checkFirstRun comment block');
    process.exit(1);
}

// Add everything from realCheckStart to end
for (let i = realCheckStart; i < lines.length; i++) {
    fixed.push(lines[i]);
}

fs.writeFileSync(filePath, fixed.join('\n'), 'utf-8');
console.log('Fixed! Total lines:', fixed.length);
