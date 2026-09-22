export function buildProduct(input) {
  const name = String(input.name || '').trim();
  const description = String(input.description || '').trim();
  if (!name || name.length > 80) throw new Error('상품 이름을 1–80자로 입력하세요.');
  if (description.length < 10 || description.length > 1000) throw new Error('설명을 10–1,000자로 입력하세요.');
  let url;
  try { url = new URL(input.endpoint); } catch { throw new Error('올바른 HTTPS 주소를 입력하세요.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new Error('인증정보·쿼리·해시가 없는 HTTPS 주소를 사용하세요. API 키를 입력하지 마세요.');
  if (!['GET', 'POST'].includes(input.method)) throw new Error('GET 또는 POST를 선택하세요.');
  const price = String(input.price || '').trim();
  if (!/^(0|[1-9]\d{0,5})(\.\d{1,6})?$/.test(price)) throw new Error('가격은 소수점 6자리 이하의 USDC 금액이어야 합니다.');
  const [whole, fraction = ''] = price.split('.');
  const amount = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
  if (amount <= 0n) throw new Error('가격은 0보다 커야 합니다.');
  if (!/^0x[0-9a-fA-F]{40}$/.test(input.payTo || '') || /^0x0{40}$/i.test(input.payTo))
    throw new Error('0이 아닌 EVM 수취 주소를 입력하세요.');
  let requestExample, responseExample;
  try { requestExample = JSON.parse(input.request); responseExample = JSON.parse(input.response); }
  catch { throw new Error('입력·출력 예제를 올바른 JSON으로 작성하세요.'); }
  if (!requestExample || Array.isArray(requestExample) || typeof requestExample !== 'object')
    throw new Error('입력 예제는 JSON 객체여야 합니다.');
  return {
    format: 'blockflow.product-draft.v1', status: 'draft', name, description,
    endpoint: url.href, method: input.method,
    payment: { network: 'eip155:84532', currency: 'USDC', price, amount: amount.toString(), payTo: input.payTo },
    examples: { request: requestExample, response: responseExample },
    verification: { endpointCalled: false, paymentSettled: false, bazaarIndexed: false },
  };
}

export function routesFor(product) {
  return {
    [`${product.method} ${new URL(product.endpoint).pathname}`]: {
      accepts: [{ scheme: 'exact', network: product.payment.network, price: `$${product.payment.price}`, payTo: product.payment.payTo }],
      description: product.description, mimeType: 'application/json',
    },
  };
}

export function simulatePurchase(product, budget) {
  if (!/^\d+(\.\d{1,6})?$/.test(String(budget))) throw new Error('예산은 소수점 6자리 이하로 입력하세요.');
  const [whole, fraction = ''] = String(budget).split('.');
  const available = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
  if (BigInt(product.payment.amount) > available) throw new Error('건당 예산을 초과하여 모의 구매를 차단했습니다.');
  return { mode: 'simulation', settled: false, charged: '0', fixtureOutput: product.examples.response };
}
