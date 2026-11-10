// Local dev server. Production runs src/index.ts on Vercel Functions.
import { serve } from '@hono/node-server';
import app from './index';
import { loadEnv } from './deps';

loadEnv(); // fail fast locally with a readable list of missing variables

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`API listening on http://localhost:${port}  (docs: /docs)`);
});
