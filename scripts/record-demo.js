#!/usr/bin/env node
// Records the 30-second demo video: page → tool card → click → five steps → result → "sell yours".
// Usage: node scripts/record-demo.js [url] [outDir] [--captions] [--outro "line1\nline2"]
//   FFMPEG_PATH=/path/to/ffmpeg to use a specific binary for the MP4.
//   Needs: npm i -D playwright && npx playwright install chromium
// Writes <outDir>/demo.webm, demo.mp4 (when ffmpeg is found) and demo.srt with the storyboard captions.
import { mkdir, readdir, rename, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const positional = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flag = name => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const url = positional[0] ?? 'https://handsel-mandate-demo.vercel.app/';
const outDir = path.resolve(positional[1] ?? 'demo-video');
const captions = process.argv.includes('--captions');   // burn the storyboard captions into the page while recording
const outro = flag('--outro');                           // optional closing card text, e.g. the mainnet settlement tx
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
const CAPTION_CSS = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:99999;background:rgba(23,32,54,.92);color:#fff;font:700 26px/1.3 Inter,-apple-system,"Noto Sans KR",sans-serif;padding:14px 26px;border-radius:14px;max-width:88vw;text-align:center;letter-spacing:-.3px;box-shadow:0 8px 30px rgba(0,0,0,.25);pointer-events:none';
async function showCaption(label) {
  if (!captions) return;
  await page.evaluate(([text, css]) => { let el = document.getElementById('__caption'); if (!el) { el = document.createElement('div'); el.id = '__caption'; el.style.cssText = css; document.body.append(el); } el.textContent = text; }, [label, CAPTION_CSS]).catch(() => {});
}
const mark = async label => { marks.push({ at: (Date.now() - t0) / 1000, label }); await showCaption(label); };
const pause = ms => page.waitForTimeout(ms);
const scrollTo = async (selector, offset = 90) => { await page.evaluate(([s, o]) => { const el = document.querySelector(s); window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - o, behavior: 'smooth' }); }, [selector, offset]); await pause(900); };

await page.goto(url, { waitUntil: 'networkidle' });
await mark('바이브 코딩으로 만든 도구 하나');
await pause(3500);
await scrollTo('#product-name', 120); await mark('가격을 정하고');
await pause(3200);
await scrollTo('#run', 260); await mark('에이전트가 산다');
await page.waitForFunction(() => !document.getElementById('run').disabled, null, { timeout: 15000 });
await pause(800);
await page.hover('#run'); await pause(400);
await page.click('#run'); await mark('발견 → 예산 확인 → 결제 → 결과 수령');
await page.waitForFunction(() => document.querySelector('li[data-step="result"] .dot').classList.contains('ok') || document.querySelector('li[data-step="result"] .dot').classList.contains('failed') || document.querySelector('li[data-step="budget"] .dot').classList.contains('blocked'), null, { timeout: 90000 });
await pause(1500);
await scrollTo('#result', 140); await mark('결과와 정산 기록');
await pause(4000);
await scrollTo('#sell', 80); await mark('엔드포인트 하나만. 개발자 프리뷰');
await pause(3600);
if (outro) {
  await mark(outro.split('\n')[0]);
  await page.evaluate(text => { const el = document.createElement('div'); el.style.cssText = 'position:fixed;inset:0;z-index:99998;background:#172036;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;font-family:Inter,-apple-system,"Noto Sans KR",sans-serif;text-align:center;padding:40px'; for (const [i, line] of text.split('\n').entries()) { const p = document.createElement('div'); p.textContent = line; p.style.cssText = i === 0 ? 'font-size:44px;font-weight:800;letter-spacing:-1px' : 'font-size:22px;opacity:.85;font-family:ui-monospace,Menlo,monospace'; el.append(p); } const c = document.getElementById('__caption'); if (c) c.remove(); document.body.append(el); }, outro);
  await pause(4000);
}
const total = (Date.now() - t0) / 1000;
await context.close(); await browser.close();

const webm = (await readdir(outDir)).filter(f => f.endsWith('.webm')).map(f => path.join(outDir, f)).sort()[0];
const finalWebm = path.join(outDir, 'demo.webm');
await rename(webm, finalWebm);
const srt = marks.map((m, i) => { const end = marks[i + 1]?.at ?? total; const ts = s => new Date(s * 1000).toISOString().slice(11, 23).replace('.', ','); return `${i + 1}\n${ts(m.at)} --> ${ts(end)}\n${m.label}\n`; }).join('\n');
await writeFile(path.join(outDir, 'demo.srt'), srt);

// Playwright's bundled ffmpeg only writes WebM, so MP4 (what X/YouTube want) needs a system ffmpeg:
// macOS `brew install ffmpeg`, Windows `winget install ffmpeg`, Ubuntu `sudo apt install ffmpeg`.
function findFfmpeg() { for (const bin of [process.env.FFMPEG_PATH, 'ffmpeg'].filter(Boolean)) { try { execFileSync(bin, ['-version'], { stdio: 'ignore' }); return bin; } catch {} } return null; }
const ffmpeg = findFfmpeg();
let mp4 = null;
if (ffmpeg) { mp4 = path.join(outDir, 'demo.mp4'); execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', finalWebm, '-vf', 'scale=1920:-2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-r', '30', mp4]); }
console.log(`recorded ${total.toFixed(1)}s\n  ${finalWebm}\n  ${mp4 ?? '(no system ffmpeg: install it and run  ffmpeg -i demo.webm -c:v libx264 -pix_fmt yuv420p -movflags +faststart demo.mp4)'}\n  ${path.join(outDir, 'demo.srt')}`);
