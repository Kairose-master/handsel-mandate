#!/usr/bin/env node
// Records the 30-second demo video: page → tool card → click → five steps → result → "sell yours".
// Usage: node scripts/record-demo.js [url] [outDir]
//   Needs: npm i -D playwright && npx playwright install chromium
// Writes <outDir>/demo.webm, demo.mp4 (when ffmpeg is found) and demo.srt with the storyboard captions.
import { mkdir, readdir, rename, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const url = process.argv[2] ?? 'https://handsel-mandate-demo.vercel.app/';
const outDir = path.resolve(process.argv[3] ?? 'demo-video');
const size = { width: 1280, height: 800 };
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('playwright is not installed. Run: npm i -D playwright && npx playwright install chromium'); process.exit(2); }

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: size, deviceScaleFactor: 2, recordVideo: { dir: outDir, size }, locale: 'ko-KR' });
const page = await context.newPage();
const t0 = Date.now();
const marks = [];
const mark = label => marks.push({ at: (Date.now() - t0) / 1000, label });
const pause = ms => page.waitForTimeout(ms);
const scrollTo = async (selector, offset = 90) => { await page.evaluate(([s, o]) => { const el = document.querySelector(s); window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - o, behavior: 'smooth' }); }, [selector, offset]); await pause(900); };

await page.goto(url, { waitUntil: 'networkidle' });
mark('바이브 코딩으로 만든 도구 하나');
await pause(3500);
await scrollTo('#product-name', 120); mark('가격을 정하고');
await pause(3200);
await scrollTo('#run', 260); mark('에이전트가 산다');
await page.waitForFunction(() => !document.getElementById('run').disabled, null, { timeout: 15000 });
await pause(800);
await page.hover('#run'); await pause(400);
await page.click('#run'); mark('발견 → 예산 확인 → 테스트넷 결제 → 결과 수령');
await page.waitForFunction(() => document.querySelector('li[data-step="result"] .dot').classList.contains('ok') || document.querySelector('li[data-step="result"] .dot').classList.contains('failed') || document.querySelector('li[data-step="budget"] .dot').classList.contains('blocked'), null, { timeout: 90000 });
await pause(1500);
await scrollTo('#result', 140); mark('결과와 정산 기록');
await pause(4000);
await scrollTo('#sell', 80); mark('엔드포인트 하나만. 개발자 프리뷰');
await pause(4200);
const total = (Date.now() - t0) / 1000;
await context.close(); await browser.close();

const webm = (await readdir(outDir)).filter(f => f.endsWith('.webm')).map(f => path.join(outDir, f)).sort()[0];
const finalWebm = path.join(outDir, 'demo.webm');
await rename(webm, finalWebm);
const srt = marks.map((m, i) => { const end = marks[i + 1]?.at ?? total; const ts = s => new Date(s * 1000).toISOString().slice(11, 23).replace('.', ','); return `${i + 1}\n${ts(m.at)} --> ${ts(end)}\n${m.label}\n`; }).join('\n');
await writeFile(path.join(outDir, 'demo.srt'), srt);

// Playwright's bundled ffmpeg only writes WebM, so MP4 (what X/YouTube want) needs a system ffmpeg:
// macOS `brew install ffmpeg`, Windows `winget install ffmpeg`, Ubuntu `sudo apt install ffmpeg`.
function findFfmpeg() { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return 'ffmpeg'; } catch { return null; } }
const ffmpeg = findFfmpeg();
let mp4 = null;
if (ffmpeg) { mp4 = path.join(outDir, 'demo.mp4'); execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', finalWebm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-r', '30', mp4]); }
console.log(`recorded ${total.toFixed(1)}s\n  ${finalWebm}\n  ${mp4 ?? '(no system ffmpeg: install it and run  ffmpeg -i demo.webm -c:v libx264 -pix_fmt yuv420p -movflags +faststart demo.mp4)'}\n  ${path.join(outDir, 'demo.srt')}`);
