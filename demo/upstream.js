// Seller-side paywall: the tool being sold is the seller's own existing API.
// The proxy forwards only to this one fixed URL, over https, without redirects,
// with size and time limits, and tags each forwarded call with a shared secret
// so the upstream can reject unpaid direct calls.
import { convertMarkdownTables, MAX_INPUT_CHARS } from './tool.js';
import { readFile } from 'node:fs/promises';

const MAX_REQUEST_BYTES = 256 * 1024, MAX_RESPONSE_BYTES = 1024 * 1024, UPSTREAM_TIMEOUT_MS = 20000;
export const SECRET_HEADER = 'x-paywall-secret';
const loopback = host => ['127.0.0.1', 'localhost', '[::1]'].includes(host);

export function parseUpstreamUrl(value) {
  let url; try { url = new URL(String(value ?? '')); } catch { throw new Error('UPSTREAM_URL must be an absolute URL'); }
  if (url.username || url.password || url.hash || url.search) throw new Error('UPSTREAM_URL must not contain credentials, a query string or a fragment');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback(url.hostname))) throw new Error('UPSTREAM_URL must use https (http is allowed only for loopback tests)');
  if (url.pathname === '/' || url.pathname.endsWith('/sample')) throw new Error('UPSTREAM_URL needs a non-root path that does not end in /sample');
  return url;
}

async function limited(body, max, label) {
  const chunks = []; let size = 0;
  for await (const chunk of body) { size += chunk.length; if (size > max) throw Object.assign(new Error(`${label} exceeds ${max} bytes`), { status: 413 }); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function readBody(req, limit) {
  try { return await limited(req, limit, 'Request body'); } catch (error) { throw Object.assign(new Error(error.message), { status: error.status ?? 400 }); }
}

// A tool is { name, description, method, path, exampleRequest, exampleResponse, runSample(), run(req, {payer}) }
// run/runSample resolve to { contentType, body: Buffer }.
export function builtinTool() {
  let samplePromise;
  const sample = () => (samplePromise ??= readFile(new URL('./sample.md', import.meta.url), 'utf8'));
  const json = value => ({ contentType: 'application/json; charset=utf-8', body: Buffer.from(JSON.stringify(value)) });
  return {
    name: 'Markdown 표 → JSON 변환기', description: 'Markdown 문서에 포함된 표(GFM table)를 JSON으로 변환합니다. 공개 샘플 문서 변환은 GET, 직접 문서 전달은 POST를 사용합니다.',
    method: 'POST', path: '/convert', builtin: true,
    exampleRequest: { markdown: '| a | b |\n|---|---|\n| 1 | 2 |' },
    exampleResponse: { format: 'handsel.markdown-tables.v1', tableCount: 1, tables: [{ columns: ['a', 'b'], rows: [['1', '2']] }], sourceChars: 27 },
    async runSample() { return json(convertMarkdownTables(await sample())); },
    async run(req) {
      let parsed; try { parsed = JSON.parse((await readBody(req, MAX_INPUT_CHARS * 4)).toString('utf8')); } catch (error) { throw Object.assign(new Error(error.status ? error.message : 'Body must be JSON {"markdown": "..."}'), { status: error.status ?? 400 }); }
      if (typeof parsed?.markdown !== 'string') throw Object.assign(new Error('Body must be JSON {"markdown": "..."}'), { status: 400 });
      return json(convertMarkdownTables(parsed.markdown));
    },
  };
}

export function upstreamTool({ url, method = 'POST', secret, name, description, exampleRequest, exampleResponse, fetcher = fetch }) {
  const target = parseUpstreamUrl(url);
  method = String(method).toUpperCase();
  if (!['GET', 'POST'].includes(method)) throw new Error('UPSTREAM_METHOD must be GET or POST');
  if (typeof secret !== 'string' || secret.length < 16) throw new Error('UPSTREAM_SECRET must be at least 16 characters; the upstream should reject calls without it');
  if (!name || !description) throw new Error('PRODUCT_NAME and PRODUCT_DESCRIPTION are required for an upstream tool');
  if (method === 'POST' && (!exampleRequest || typeof exampleRequest !== 'object')) throw new Error('A JSON example request is required so buyers (and the demo agent) can call the sample route');
  async function forward({ body, contentType, payer }) {
    const headers = { [SECRET_HEADER]: secret, accept: 'application/json, */*;q=0.5', 'x-paid-by': payer ?? '', 'x-paywall-network': 'eip155:84532' };
    if (body) headers['content-type'] = contentType ?? 'application/json';
    let response;
    try { response = await fetcher(target.href, { method, headers, body, redirect: 'error', signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) }); }
    catch (error) { throw Object.assign(new Error(`Upstream unreachable: ${error.name === 'TimeoutError' ? 'timeout' : error.message}`), { status: 502 }); }
    if (!response.ok) { await response.body?.cancel(); throw Object.assign(new Error(`Upstream returned HTTP ${response.status}; payment cancelled`), { status: 502 }); }
    let out; try { out = await limited(response.body ?? [], MAX_RESPONSE_BYTES, 'Upstream response'); } catch (error) { throw Object.assign(new Error(error.message), { status: 502 }); }
    return { contentType: response.headers.get('content-type') ?? 'application/octet-stream', body: out };
  }
  return {
    name, description, method, path: target.pathname, builtin: false, upstream: target.href, exampleRequest: exampleRequest ?? null, exampleResponse: exampleResponse ?? null,
    runSample: ({ payer } = {}) => forward({ body: method === 'POST' ? JSON.stringify(exampleRequest) : undefined, payer }),
    run: async (req, { payer } = {}) => forward({ body: method === 'POST' ? await readBody(req, MAX_REQUEST_BYTES) : undefined, contentType: method === 'POST' ? String(req.headers['content-type'] ?? 'application/json') : undefined, payer }),
  };
}

// Reads a Seller Studio export (blockflow-product-draft.json) or a bare product object.
export function productDraftToUpstream(draft, { secret } = {}) {
  const product = draft?.product ?? draft;
  if (product?.format !== 'blockflow.product-draft.v1') throw new Error('PRODUCT_FILE must be a Seller Studio export (blockflow.product-draft.v1)');
  return { url: product.endpoint, method: product.method, secret, name: product.name, description: product.description, exampleRequest: product.examples?.request, exampleResponse: product.examples?.response, price: product.payment?.price, payTo: product.payment?.payTo };
}
