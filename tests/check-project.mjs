import assert from 'node:assert/strict';
import { readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { makeSessionToken, verifySessionToken, passwordMatches } from '../functions/_lib/common.js';

const root = resolve(new URL('..', import.meta.url).pathname);
const functionDir = join(root, 'functions');
const jsFiles = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.name.endsWith('.js')) jsFiles.push(path);
  }
}
await walk(functionDir);
for (const file of jsFiles) execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });

const html = await readFile(join(root, 'public', 'index.html'), 'utf8');
assert.match(html, /id="products"/);
assert.match(html, /id="backendWarning"/);
assert.match(html, /initializeBackend\(\)/);
assert.match(html, /Share bill PDF \/ WhatsApp/);
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(scriptMatch, 'inline website script should exist');
const tempScript = join(tmpdir(), `kk-inline-${process.pid}.mjs`);
await writeFile(tempScript, scriptMatch[1]);
execFileSync(process.execPath, ['--check', tempScript], { stdio: 'pipe' });
await rm(tempScript, { force: true });

const key = 'test-session-secret-that-is-at-least-32-chars';
const now = Date.now();
const token = await makeSessionToken(key, now);
assert.equal(await verifySessionToken(token, key, now + 1000), true);
assert.equal(await verifySessionToken(token, 'different-secret-that-is-also-long-enough', now + 1000), false);
assert.equal(await verifySessionToken(token, key, now + 13 * 60 * 60 * 1000), false);
assert.equal(passwordMatches('correct-horse', 'correct-horse'), true);
assert.equal(passwordMatches('wrong-horse', 'correct-horse'), false);
assert.equal(passwordMatches('anything', ''), false);

const helpers = html.match(/function pdfSafe\([\s\S]*?function printBill\(\)/);
assert.ok(helpers, 'PDF generation helpers should exist');
const pdfTestFile = join(tmpdir(), `kk-pdf-test-${process.pid}.mjs`);
await writeFile(pdfTestFile, helpers[0].replace(/function printBill\(\)/, '') + `\nconst testOrder={id:7,status:'New',name:'Test Customer',phone:'9876543210',address:'12 Test Road',city:'Lucknow',pin:'226001',subtotal:650,deliveryFee:40,total:690,items:[{name:'Chocolate Cake',qty:1,price:650}]};\nconst blob=buildBillPdf(testOrder); const text=await blob.text(); if(!text.startsWith('%PDF-1.4\\n')) throw new Error('PDF header missing'); const x=Number(text.match(/startxref\\n(\\d+)/)?.[1]); if(!Number.isFinite(x)||text.slice(x,x+4)!=='xref') throw new Error('PDF cross-reference table invalid'); if(!text.includes('Chocolate Cake')) throw new Error('PDF item not present');\n`);
execFileSync(process.execPath, [pdfTestFile], { stdio: 'pipe' });
await rm(pdfTestFile, { force: true });

console.log(`OK: ${jsFiles.length} backend JavaScript files checked; inline website script checked; session and PDF helper tests passed.`);
