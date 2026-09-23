// Product discovery for the 402-LAB MCP server. Default source is the x402
// Bazaar (CDP discovery API, ~15k listed resources), plus any seller
// product.json files (blockflow.product.v1). Everything is filtered to one
// network and to exact USDC offers the wallet can actually pay.
import { HTTPFacilitatorClient } from '@x402/core/server';
import { withBazaar } from '@x402/extensions/bazaar';
import { NETWORKS } from './wallet.js';

export const BAZAAR_URL = 'https://api.cdp.coinbase.com/platform/v2/x402';
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const words = text => String(text ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 1);
const usdc = m => (Number(m) / 1e6).toFixed(6).replace(/\.?0+$/, '');

export function payableOffer(accepts, network) {
  const net = NETWORKS[network];
  return (accepts ?? []).find(a => a.scheme === 'exact' && a.network === network && same(a.asset ?? a.currency, net?.usdc) && /^[1-9]\d{0,12}$/.test(String(a.amount ?? a.maxAmountRequired ?? '')) && (!a.extra?.paymentFlow || a.extra.paymentFlow === 'authorization'));
}
export function normalizeProduct(product, source, network) {
  if (product?.format !== 'blockflow.product.v1' || !Array.isArray(product.endpoints)) return [];
  if (network && product.network !== network) return [];
  return product.endpoints.map(e => ({ id: `${e.method} ${e.url}`, name: product.name, description: `${product.description ?? ''}${e.description ? ` — ${e.description}` : ''}`, method: e.method, url: e.url, price: product.price, network: product.network, payTo: product.payTo, exampleRequest: e.request ?? null, exampleQuery: null, exampleResponse: product.exampleResponse ?? null, source }));
}
export function normalizeBazaar(item, network) {
  const offer = payableOffer(item.accepts, network);
  if (!offer || item.type !== 'http' || !/^https:\/\//.test(item.resource ?? '')) return null;
  const info = item.extensions?.bazaar?.info ?? item.discoveryInfo ?? null;
  const method = String(info?.input?.method ?? item.method ?? (info?.input?.bodyType ? 'POST' : 'GET')).toUpperCase();
  if (!['GET', 'POST'].includes(method)) return null;
  let name = item.serviceName; try { const u = new URL(item.resource); name ??= `${u.hostname}${u.pathname}`; } catch { return null; }
  return { id: `${method} ${item.resource}`, name, description: item.description ?? '', method, url: item.resource, price: usdc(offer.amount ?? offer.maxAmountRequired), network, payTo: offer.payTo ?? offer.recipient, exampleRequest: method === 'POST' ? (info?.input?.body ?? null) : null, exampleQuery: info?.input?.queryParams ?? null, exampleResponse: info?.output?.example ?? null, quality: item.quality ?? null, lastUpdated: item.lastUpdated ?? null, source: 'bazaar' };
}

export function createCatalog({ network, catalogUrls = [], bazaar = true, bazaarUrl = BAZAAR_URL, fetcher = fetch, maxPrice, bazaarClient } = {}) {
  const client = () => bazaarClient ?? withBazaar(new HTTPFacilitatorClient({ url: bazaarUrl, timeoutMs: 15000 }));
  async function fromProducts() {
    const items = [], errors = [];
    for (const url of catalogUrls) {
      try { const res = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(10000) }); if (!res.ok) throw new Error(`HTTP ${res.status}`); items.push(...normalizeProduct(await res.json(), url, network)); }
      catch (error) { errors.push(`${url}: ${error.message}`); }
    }
    return { items, errors };
  }
  async function fromBazaar(query) {
    if (!bazaar) return { items: [], errors: [] };
    try {
      const c = client();
      let raw = [];
      if (query) { const s = await c.extensions.bazaar.search({ query, type: 'http', network }); raw = s.resources ?? s.items ?? []; }
      if (!raw.length) { const l = await c.extensions.bazaar.listResources({ type: 'http', network, limit: 100 }); raw = l.items ?? []; }
      // The API does not reliably filter by network; normalizeBazaar does.
      return { items: raw.map(i => normalizeBazaar(i, network)).filter(Boolean), errors: [] };
    } catch (error) { return { items: [], errors: [`bazaar: ${error.message}`] }; }
  }
  return {
    async discover(query = '', { limit = 10 } = {}) {
      const [p, b] = await Promise.all([fromProducts(), fromBazaar(query)]);
      const q = words(query);
      const scored = [...p.items, ...b.items].filter(i => !maxPrice || Number(i.price) <= Number(maxPrice))
        .map(i => ({ ...i, score: q.length ? q.filter(w => `${i.name} ${i.description} ${i.url}`.toLowerCase().includes(w)).length : 0 }))
        // Bazaar search already ranked its results; only local products need a keyword hit.
        .filter(i => !q.length || i.score > 0 || i.source === 'bazaar')
        .sort((x, y) => (y.source !== 'bazaar') - (x.source !== 'bazaar') || y.score - x.score || Number(x.price) - Number(y.price));
      const seen = new Set();
      return { network, items: scored.filter(i => !seen.has(i.id) && seen.add(i.id)).slice(0, limit).map(({ score, ...i }) => i), sources: { products: p.items.length, bazaar: b.items.length }, errors: [...p.errors, ...b.errors] };
    },
  };
}
