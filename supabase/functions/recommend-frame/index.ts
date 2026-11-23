import { createCatalogLoader } from './catalog.mjs';
import { createHandler } from './handler.mjs';
import { createOpenAIRecognizer } from './provider.mjs';

const apiKey = Deno.env.get('OPENAI_API_KEY');
const model = Deno.env.get('TFT_VISION_MODEL');
const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');

Deno.serve(createHandler({
  token: Deno.env.get('TFT_VISION_GATEWAY_TOKEN'),
  loadCatalog: createCatalogLoader({
    url: Deno.env.get('SUPABASE_URL'),
    key: Deno.env.get('TFT_CATALOG_PUBLIC_KEY') || publishableKeys.default || Deno.env.get('SUPABASE_ANON_KEY'),
  }),
  recognize: apiKey && model ? createOpenAIRecognizer({ apiKey, model }) : undefined,
}));
