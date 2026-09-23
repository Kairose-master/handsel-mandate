// Product discovery for the 402-LAB MCP server: seller product.json files
// (blockflow.product.v1, what our seller pages publish) plus the CDP/x402
// Bazaar discovery API when enabled. Everything is filtered to one network.
import { HTTPFacilitatorClient } from '@x402/core/server';
import { withBazaar } from '@x402/extensions/bazaar';

const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const words = text => String(text ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 1);

export function normalizeProduct(product, source) {
  if (product?.format !== 'blockflow.product.v1' || !Array.isArray(product.endpoints)) return [];
  return product.endpoints.map(e => ({ id: `${e.method} ${e.url}`, name: product.name, description: `${product.description ?? ''}${e.description ? ` — ${e.description}` : ''}`, method: e.method, url: e.url, price: product.price, network: product.network, payTo: product.payTo, testnet: product.testnet === true, exampleRequest: e.request ?? null, exampleResponse: product.exampleResponse ?? null, source }));
}
export function normalizeBazaar(item) {
  const offer = item.accepts?.find(a => a.scheme === 'exact') ?? item.accepts?.[0];
  const info = item.extensions?.bazaar?.info ?? item.discoveryInfo;
  const method = info?.input?.method ?? item.method ?? (info?.input?.bodyType ? 'POST' : 'GET');
  return { id: `${method} ${item.resource ?? item.resourceUrl}`, name: item.serviceName ?? item.description ?? item.resource, description: item.description ?? '', method, url: item.resource ?? item.resourceUrl, price: offer ? (Number(offer.amount) / 1e6).toString() : null, network: offer?.network ?? null, payTo: offer?.payTo ?? null, testnet: offer?.network === 'eip155:84532', exampleRequest: info?.input?.body ?? info?.input?.queryParams ?? null, exampleResponse: info?.output?.example ?? null, source: 'bazaar' };
}

export function createCatalog({ network, catalogUrls = [], bazaar = false, facilitatorUrl, fetcher = fetch, maxPrice }) {
  async function fromProducts() {
    const out = [];
    for (const url of catalogUrls) {
      try { const res = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(10000) }); if (!res.ok) throw new Error(`HTTP ${res.status}`); out.push(...normalizeProduct(await res.json(), url)); }
      catch (error) { out.push({ id: `error ${url}`, error: `${url}: ${error.message}` }); }
    }
    return out;
  }
  async function fromBazaar(query) {
    if (!bazaar) return [];
    try {
      const client = withBazaar(new HTTPFacilitatorClient({ url: facilitatorUrl }));
      const res = query ? await client.extensions.bazaar.search({ query, network, type: 'http' }) : await client.extensions.bazaar.listResources({ network, type: 'http' });
      return (res.resources ?? res.items ?? []).map(normalizeBazaar);
    } catch (error) { return [{ id: 'error bazaar', error: `bazaar: ${error.message}` }]; }
  }
  return {
    async discover(query = '', { limit = 10 } = {}) {
      const [a, b] = await Promise.all([fromProducts(), fromBazaar(query)]);
      const errors = [...a, ...b].filter(i => i.error).map(i => i.error);
      const q = words(query);
      const items = [...a, ...b].filter(i => !i.error && same(i.network, network) && i.url && (!maxPrice || (i.price !== null && Number(i.price) <= Number(maxPrice))))
        .map(i => ({ ...i, score: q.length ? q.filter(w => `${i.name} ${i.description} ${i.url}`.toLowerCase().includes(w)).length : 0 }))
        .filter(i => !q.length || i.score > 0 || i.source === 'bazaar')
        .sort((x, y) => y.score - x.score || Number(x.price ?? 0) - Number(y.price ?? 0));
      const seen = new Set();
      return { network, items: items.filter(i => !seen.has(i.id) && seen.add(i.id)).slice(0, limit).map(({ score, ...i }) => i), errors };
    },
  };
}
