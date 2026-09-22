import { buildProduct, routesFor, simulatePurchase } from './model.js';
const $ = id => document.getElementById(id);
const form = $('product-form');
let product = null;
function invalidate() {
  product = null;
  $('product').hidden = true;
  $('empty').hidden = false;
  $('simulate').disabled = true;
  $('receipt').textContent = '상품 초안을 먼저 만드세요.';
  $('form-status').textContent = '';
}
form.addEventListener('input', invalidate);
$('example').addEventListener('click', () => {
  invalidate();
  const sample = { name: 'PDF Table Extractor', description: '공개 PDF 주소를 입력하면 문서에 포함된 표를 JSON으로 반환합니다.', endpoint: 'https://example.com/extract', method: 'POST', price: '0.01', payTo: '0x1111111111111111111111111111111111111111', request: '{"fileUrl":"https://example.com/report.pdf"}', response: '{"tables":[{"columns":["항목","금액"],"rows":[["예제 매출",12000]]}]}' };
  for (const [key, value] of Object.entries(sample)) form.elements.namedItem(key).value = value;
  $('form-status').textContent = '예제 주소·수취 주소입니다. 실제 판매 전 본인 정보로 교체하세요.';
});
form.addEventListener('submit', event => {
  event.preventDefault();
  try {
    product = buildProduct(Object.fromEntries(new FormData(form)));
    $('preview-name').textContent = product.name;
    $('preview-description').textContent = product.description;
    $('preview-price').textContent = product.payment.price;
    $('preview-endpoint').textContent = `${product.method} ${product.endpoint}`;
    $('preview-output').textContent = JSON.stringify(product.examples.response, null, 2);
    $('empty').hidden = true;
    $('product').hidden = false;
    $('simulate').disabled = false;
    $('form-status').textContent = '초안을 만들었습니다. 입력값은 서버로 전송하거나 저장하지 않습니다. 필요한 설정을 다운로드하세요.';
  } catch (error) { invalidate(); $('form-status').textContent = error.message; }
});
$('simulate').addEventListener('click', () => {
  if (!product) return;
  try {
    const receipt = simulatePurchase(product, $('budget').value);
    $('receipt').textContent = `모의 구매 완료 · 실제 결제 0 USDC\n예제 결과 (API 미호출):\n${JSON.stringify(receipt.fixtureOutput, null, 2)}`;
  } catch (error) { $('receipt').textContent = error.message; }
});
$('download').addEventListener('click', () => {
  if (!product) return;
  const body = { product, x402Routes: routesFor(product), nextSteps: ['서버의 해당 경로에 공식 x402 SDK와 exact EVM scheme을 연결하세요.', 'facilitator와 Base Sepolia USDC 지원을 확인하세요.', '이 파일에는 Bazaar 확장 등록이나 결제 검증 코드가 포함되지 않습니다.', '실제 테스트넷 정산과 API 결과를 별도로 검증하세요.'] };
  const url = URL.createObjectURL(new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'blockflow-product-draft.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
