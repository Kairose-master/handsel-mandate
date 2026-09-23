const $ = id => document.getElementById(id);
const usdc = v => v ?? '…';
let status = null;
async function loadStatus() {
  const res = await fetch('./demo/status', { cache: 'no-store' });
  status = await res.json();
  $('mode-badge').textContent = status.mode === 'testnet' ? 'Base Sepolia 테스트넷 · 실제 테스트넷 정산' : '로컬 시뮬레이션 · 체인 미사용';
  $('product-name').textContent = status.product.name;
  $('product-description').textContent = status.product.description ?? '';
  $('product-price').textContent = status.product.price;
  $('product-endpoint').textContent = `GET ${status.product.endpoint}`;
  $('product-payto').textContent = status.product.payTo;
  $('curl-example').textContent = `curl -i ${status.product.endpoint}\n# → HTTP/1.1 402 Payment Required\n# → PAYMENT-REQUIRED: <base64 x402 v2 quote: exact · eip155:84532 · USDC · ${status.product.price}>`;
  $('count-external').textContent = status.purchases.external;
  $('count-internal').textContent = status.purchases.internal;
  const info = $('agent-info'); info.replaceChildren();
  if (status.agent) {
    const b = status.agent.budget;
    for (const [k, v] of [['데모 에이전트', status.agent.address], ['건당 한도', `${usdc(b.perCall)} USDC`], ['남은 총예산', `${usdc(b.remaining)} / ${usdc(b.total)} USDC (예산 만료 ${new Date(b.expiresAt).toLocaleTimeString()})`], ['이 시간 구매', String(b.purchases)]]) {
      const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; dd.className = 'mono'; info.append(dt, dd);
    }
    const f = status.agent.funding;
    if (f) { const dt = document.createElement('dt'); dt.textContent = '지갑 잔액'; const dd = document.createElement('dd'); dd.className = 'mono'; dd.textContent = f.usdcBalance === null ? `확인 실패 (${f.error})` : `${f.usdcBalance} USDC (Base Sepolia)`; info.append(dt, dd); }
    if (f && f.funded !== true) {
      $('run').disabled = true;
      $('run-status').replaceChildren(`데모 에이전트 지갑에 테스트넷 USDC가 없습니다. 아래 주소에 Base Sepolia USDC를 보내면 버튼이 켜집니다: ${f.address} · `, Object.assign(document.createElement('a'), { href: f.faucet, textContent: 'Circle 테스트넷 faucet', target: '_blank', rel: 'noopener' }));
    } else $('run').disabled = false;
  } else { $('run').disabled = true; $('run-status').textContent = '이 서버에는 데모 에이전트 키가 없습니다. 오른쪽 curl 예제로 직접 구매하세요.'; }
  if (status.recent?.length) { $('recent').hidden = false; $('recent').textContent = status.recent.map(r => `${r.at}  ${r.route}  ${r.amount} µUSDC  ${r.internal ? '[internal]' : '[EXTERNAL]'}  ${r.explorer ?? r.transaction ?? ''}`).join('\n'); }
}
function paint(id, state, detail) {
  const li = document.querySelector(`li[data-step="${id}"]`); if (!li) return;
  const dot = li.querySelector('.dot'); dot.className = `dot ${state}`; dot.textContent = state === 'ok' ? '✓' : state === 'running' ? '…' : state === 'blocked' || state === 'failed' ? '✕' : dot.textContent;
  if (detail) li.querySelector('.step-detail').textContent = detail;
}
function describe(step) {
  const d = step;
  switch (step.id) {
    case 'discover': return `${d.endpoint} · 수취 ${d.payTo} · ${d.network}`;
    case 'quote': return step.status === 'ok' ? `가격 ${d.price} USDC · 승인 유효 ${d.maxTimeoutSeconds}초 · 자산 ${d.asset}` : `402가 아닌 응답 (HTTP ${d.httpStatus})`;
    case 'budget': return step.status === 'ok' ? `허용: 가격 ${d.price} ≤ 건당 ${d.perCall}, 남은 예산 ${d.remaining} USDC` : `차단: ${d.reason} (가격 ${d.price}, 건당 ${d.perCall}, 남은 예산 ${d.remaining})`;
    case 'pay': return step.status === 'ok' ? `서명 전송 → HTTP ${d.httpStatus}` : `결제 응답 실패 (HTTP ${d.httpStatus})`;
    case 'result': return step.status === 'ok' ? (d.simulation ? `결과 수신 · 로컬 시뮬레이션 (온체인 정산 없음) · ${d.transaction}` : `결과 수신 · 테스트넷 정산 tx ${d.transaction}`) : `실패: ${d.reason ?? d.status}`;
    default: return '';
  }
}
$('run').addEventListener('click', async () => {
  $('run').disabled = true; $('result').hidden = true; $('run-status').textContent = '에이전트 실행 중… (테스트넷 정산에는 수 초가 걸릴 수 있습니다)';
  for (const id of ['discover', 'quote', 'budget', 'pay', 'result']) paint(id, 'running');
  try {
    const res = await fetch('./demo/run', { method: 'POST' });
    const run = await res.json();
    if (!res.ok) { $('run-status').textContent = run.error ?? `HTTP ${res.status}`; for (const id of ['discover', 'quote', 'budget', 'pay', 'result']) paint(id, ''); return; }
    const seen = new Set();
    // Reveal steps one by one so the flow reads at a glance (and records well).
    for (const step of run.steps) { seen.add(step.id); paint(step.id, step.status, describe(step)); await new Promise(r => setTimeout(r, 450)); }
    for (const id of ['discover', 'quote', 'budget', 'pay', 'result']) if (!seen.has(id)) paint(id, 'failed', '건너뜀');
    const last = run.steps.at(-1);
    if (last?.id === 'result' && last.status === 'ok') {
      $('result').hidden = false;
      $('result').textContent = (run.explorer ? `정산 확인: ${run.explorer}\n\n` : '') + JSON.stringify(last.result, null, 2);
      $('run-status').textContent = run.mode === 'testnet' ? '테스트넷 구매 완료. Basescan 링크에서 USDC 전송을 직접 확인하세요.' : '로컬 시뮬레이션 완료. 서명은 검증됐지만 체인에는 아무것도 기록되지 않았습니다.';
    } else $('run-status').textContent = last?.status === 'blocked' ? '예산 정책이 결제를 차단했습니다. 서명은 만들어지지 않았습니다.' : `실패: ${run.error ?? last?.reason ?? '알 수 없음'}`;
  } catch (error) { $('run-status').textContent = `요청 실패: ${error.message}`; }
  finally { await loadStatus().catch(() => {}); }
});
loadStatus().catch(error => { $('run-status').textContent = `상태를 불러오지 못했습니다: ${error.message}`; });
