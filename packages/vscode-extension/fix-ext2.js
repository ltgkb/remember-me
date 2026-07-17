const fs = require('fs');
const path = require('path');

const filePath = path.join('E:', '文件', 'remember-me', 'packages', 'vscode-extension', 'src', 'extension.ts');
let lines = fs.readFileSync(filePath, 'utf-8').split('\n');

// The first 808 lines should be correct (registerCommands ends at line 808 with })
// But we need to verify line 808 is indeed the closing brace
console.log('Line 808:', JSON.stringify(lines[807]));
console.log('Line 809:', JSON.stringify(lines[808]));

// Find where registerCommands actually ends
// registerCommands starts at "function registerCommands("
// It should end with a standalone "}" after all the push calls

// Let's find all standalone "}" lines after line 700
const standaloneBraces = [];
for (let i = 700; i < lines.length; i++) {
    if (lines[i].trim() === '}') {
        standaloneBraces.push(i);
    }
}
console.log('Standalone } after line 700:', standaloneBraces.map(i => i + 1));

// The correct structure: after the last command (importTemplate), we need:
//   context.subscriptions.push(importTemplateCmd);
// }
// 
// Then checkFirstRun

// Find the last "context.subscriptions.push(" inside registerCommands
let lastPush = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('context.subscriptions.push(')) {
        lastPush = i;
    }
}
console.log('Last push at line:', lastPush + 1, JSON.stringify(lines[lastPush]));

// The file should end registerCommands right after the last push
// Everything from lastPush+1 to the real checkFirstRun is garbage

// Find the real checkFirstRun
let checkIdx = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('async function checkFirstRun(')) {
        checkIdx = i;
    }
}
console.log('Last checkFirstRun at line:', checkIdx + 1);

// Find the comment block before checkFirstRun
let commentStart = -1;
for (let i = checkIdx; i >= 0; i--) {
    if (lines[i].trim() === '/**') {
        commentStart = i;
        break;
    }
}
console.log('Comment starts at:', commentStart + 1);

// Build fixed file: lines[0..lastPush] + '}' + '' + lines[commentStart..end]
const fixed = [];
for (let i = 0; i <= lastPush; i++) {
    fixed.push(lines[i]);
}
fixed.push('}');
fixed.push('');
for (let i = commentStart; i < lines.length; i++) {
    fixed.push(lines[i]);
}

fs.writeFileSync(filePath, fixed.join('\n'), 'utf-8');
console.log('Written', fixed.length, 'lines');
