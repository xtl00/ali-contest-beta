import { screenDirection, stageAfterOpening } from '../../../src/engine/screen-insights.js';

const MAX_BODY_BYTES = 1_420_000;
const MAX_BASE64 = 1_400_000;
const STAGE = /^[1-9]-[1-7]$/;
const json = (status, value) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } });

class FrameRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) {
    throw new FrameRequestError(415, '请求必须使用 application/json。');
  }
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) {
    throw new FrameRequestError(413, '画面请求过大。');
  }
  if (!request.body) throw new FrameRequestError(400, '缺少画面请求。');
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new FrameRequestError(413, '画面请求过大。');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try { return JSON.parse(await new Blob(chunks).text()); }
  catch { throw new FrameRequestError(400, '无法解析画面请求。'); }
}

function validImage(image) {
  const { mediaType, data } = image || {};
  if (typeof data !== 'string' || data.length > MAX_BASE64 || data.length < 24 || data.length % 4 !== 0
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return false;
  const bytes = atob(data.slice(0, 24));
  if (mediaType === 'image/png') return bytes.startsWith('\x89PNG\r\n\x1a\n');
  if (mediaType === 'image/jpeg') return bytes.startsWith('\xff\xd8\xff');
  if (mediaType === 'image/webp') return bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
  return false;
}

function displayMatches(rows, ids) {
  const wanted = new Set(Array.isArray(ids) ? ids.slice(0, 20) : []);
  return rows.filter(row => wanted.has(row.id)).map(({ id, name }) => ({ id, name }));
}

const safeStage = value => typeof value === 'string' && STAGE.test(value) ? value : null;

export function createHandler({ token, loadCatalog, recognize }) {
  return async (request) => {
    if (request.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });
    if (!token) return json(503, { ok: false, error: 'gateway_not_configured' });
    if (request.headers.get('authorization') !== `Bearer ${token}`) {
      return json(401, { ok: false, error: 'unauthorized' });
    }
    if (!recognize) return json(503, { ok: false, error: 'vision_not_configured' });

    try {
      const frame = await readBody(request);
      if (!frame || !['datatft', 'dataj'].includes(frame.source)
          || frame.season !== 18 || frame.version !== '18.7' || !['scan', 'final'].includes(frame.mode)) {
        throw new FrameRequestError(400, '数据源、赛季、版本或识别模式无效。');
      }
      const hint = safeStage(frame.stageHint);
      const stopped = (stage) => json(200, { ok: true, stop: true, stage, observations: null, direction: null });
      if (stageAfterOpening(hint)) return stopped(hint);
      if (frame.mode === 'final' && frame.openingComplete !== true) {
        throw new FrameRequestError(400, '请确认已在 2-1 选完强化符文。');
      }
      if (!validImage(frame.image)) throw new FrameRequestError(400, '画面必须是有效的 JPEG、PNG 或 WebP Base64。');

      const catalog = await loadCatalog(frame.source);
      const evidence = await recognize(frame.image, catalog.setData);
      const observedStage = safeStage(evidence.stage);
      if (stageAfterOpening(observedStage)) return stopped(observedStage);
      const stage = observedStage || hint;
      const units = displayMatches(catalog.setData.units, evidence.unit_ids);
      const traits = displayMatches(catalog.setData.traits, evidence.trait_ids);
      const encounter = typeof evidence.encounter === 'string' ? evidence.encounter.trim().slice(0, 50) || null : null;
      const augment = typeof frame.chosenAugment === 'string'
        ? catalog.augments.find(row => row.id === frame.chosenAugment || row.name === frame.chosenAugment) : null;
      const augmentTraits = [...(augment?.traits || []), ...(augment?.grantTraits || [])];
      const final = frame.mode === 'final';
      const direction = final && (!stage || stage === '2-1')
        ? screenDirection(catalog.setData, catalog.comps, {
          units: units.map(row => row.id), traits: [...traits.map(row => row.id), ...augmentTraits],
        }) : null;
      return json(200, {
        ok: true, stage, stop: final, observations: { units, traits, encounter, chosenAugment: augment?.name ?? null },
        direction: direction ? { id: direction.id, name: direction.name } : null,
      });
    } catch (error) {
      if (error instanceof FrameRequestError) return json(error.status, { ok: false, error: error.message });
      return json(502, { ok: false, error: 'vision_or_catalog_unavailable' });
    }
  };
}
