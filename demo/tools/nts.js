// Product: 사업자등록 상태 조회 (국세청). Wraps the National Tax Service business
// registration status API from 공공데이터포털 (이용허락범위 제한 없음, 무료) so an
// agent can check up to 100 business registration numbers per paid call without
// obtaining its own data.go.kr key. Our key stays server-side; inputs are never logged.
const UPSTREAM = 'https://api.odcloud.kr/api/nts-businessman/v1/status';
const MAX_NUMBERS = 100, MAX_BODY = 32 * 1024, TIMEOUT_MS = 15000;

export const NTS_EXAMPLE_REQUEST = { b_no: ['1248100998'] };
export const NTS_EXAMPLE_RESPONSE = { format: 'handsel.nts-business-status.v1', request_cnt: 1, match_cnt: 1, source: '국세청 사업자등록정보 상태조회 (공공데이터포털)', data: [{ b_no: '1248100998', b_stt: '계속사업자', b_stt_cd: '01', tax_type: '부가가치세 일반과세자', tax_type_cd: '01', end_dt: '', utcc_yn: 'N', tax_type_change_dt: '', invoice_apply_dt: '', rbf_tax_type: '해당없음', rbf_tax_type_cd: '99' }] };

async function readJson(req) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > MAX_BODY) throw Object.assign(new Error('Request body too large'), { status: 413 }); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('Body must be JSON {"b_no": ["1234567890", ...]}'), { status: 400 }); }
}
export function normalizeNumbers(input) {
  const list = Array.isArray(input) ? input : typeof input === 'string' ? [input] : null;
  if (!list || !list.length) throw Object.assign(new Error('b_no must be a non-empty array of business registration numbers'), { status: 400 });
  if (list.length > MAX_NUMBERS) throw Object.assign(new Error(`At most ${MAX_NUMBERS} numbers per call`), { status: 400 });
  return list.map(v => { const d = String(v).replace(/-/g, '').trim(); if (!/^\d{10}$/.test(d)) throw Object.assign(new Error(`Invalid business registration number: ${String(v).slice(0, 20)}`), { status: 400 }); return d; });
}

export function ntsTool({ serviceKey, fetcher = fetch, upstream = UPSTREAM } = {}) {
  if (typeof serviceKey !== 'string' || serviceKey.length < 16) throw new Error('NTS_SERVICE_KEY (공공데이터포털 인증키) is required for the business status product');
  async function lookup(numbers) {
    const url = `${upstream}?serviceKey=${encodeURIComponent(serviceKey)}`;
    let res;
    try { res = await fetcher(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ b_no: numbers }), redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) }); }
    catch (error) { throw Object.assign(new Error(`국세청 API unreachable: ${error.name === 'TimeoutError' ? 'timeout' : 'network error'}`), { status: 502 }); }
    let json = null; try { json = await res.json(); } catch {}
    if (!res.ok || json?.status_code !== 'OK' || !Array.isArray(json.data)) throw Object.assign(new Error(`국세청 API returned HTTP ${res.status}${json?.msg ? `: ${String(json.msg).slice(0, 120)}` : ''}; payment cancelled`), { status: 502 });
    const body = { format: 'handsel.nts-business-status.v1', request_cnt: json.request_cnt, match_cnt: json.match_cnt, source: NTS_EXAMPLE_RESPONSE.source, data: json.data.map(({ b_no, b_stt, b_stt_cd, tax_type, tax_type_cd, end_dt, utcc_yn, tax_type_change_dt, invoice_apply_dt, rbf_tax_type, rbf_tax_type_cd }) => ({ b_no, b_stt, b_stt_cd, tax_type, tax_type_cd, end_dt, utcc_yn, tax_type_change_dt, invoice_apply_dt, rbf_tax_type, rbf_tax_type_cd })) };
    return { contentType: 'application/json; charset=utf-8', body: Buffer.from(JSON.stringify(body)) };
  }
  return {
    name: '사업자등록 상태 조회 (국세청)',
    description: '사업자등록번호를 넣으면 국세청 기준 사업자 상태(계속·휴업·폐업), 과세유형, 폐업일을 돌려줍니다. 한 번에 최대 100건, 인증키 불필요. Korea business registration status check: given Korean business registration numbers (사업자등록번호), returns the National Tax Service (NTS) status (active / suspended / closed), VAT taxpayer type and closure date, up to 100 numbers per call. Source: NTS via data.go.kr.',
    serviceName: 'Korea Business Status (NTS)', tags: ['korea', 'business', 'registration', 'nts', 'verify'],
    terms: { dataSource: '국세청 사업자등록정보 상태조회 (공공데이터포털, 이용허락범위 제한 없음)', maxItemsPerCall: MAX_NUMBERS, upstreamQuota: '100 items per call, 1,000,000 per day (shared)', inputs: 'business registration numbers only; not stored or logged' },
    method: 'POST', path: '/biz/status', builtin: true,
    exampleRequest: NTS_EXAMPLE_REQUEST, exampleResponse: NTS_EXAMPLE_RESPONSE,
    runSample: () => lookup(NTS_EXAMPLE_REQUEST.b_no),
    run: async req => { const parsed = await readJson(req); return lookup(normalizeNumbers(parsed?.b_no)); },
  };
}
