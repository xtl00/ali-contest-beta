import { adaptBoard } from '../../../src/adapters/board-sources.js';
import { validateComps } from '../../../src/adapters/provider.js';

export function createCatalogLoader({ url, key, fetchImpl = fetch }) {
  async function load(dataset, source, version) {
    const endpoint = new URL('/rest/v1/tft_catalog', url);
    endpoint.search = new URLSearchParams({
      dataset: `eq.${dataset}`, source: `eq.${source}`, season: 'eq.18',
      version: `eq.${version}`, select: 'payload', limit: '1',
    }).toString();
    const response = await fetchImpl(endpoint, {
      headers: { apikey: key }, signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) throw new Error('Catalog request failed');
    const [row] = await response.json();
    if (!row?.payload) throw new Error('Catalog snapshot unavailable');
    return row.payload;
  }

  return async (source) => {
    const [setData, items, augmentData, raw] = await Promise.all([
      load('units-traits', 'riot', '16.23.1'),
      load('items', 'riot', '16.23.1'),
      load('augments', 'riot', '16.23.1'),
      load(source === 'datatft' ? 'compositions' : 'rankings', source, '18.7'),
    ]);
    const board = adaptBoard(raw, { source, setData, items });
    const { comps } = validateComps(board.comps, setData);
    return { setData, comps, augments: augmentData.augments };
  };
}
