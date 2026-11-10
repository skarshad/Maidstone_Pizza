// Vercel entrypoint: a file at src/index.ts that default-exports the Hono app.
// https://vercel.com/docs/frameworks/backend/hono
import { Hono } from 'hono';
import { createApp } from './app';
import { createDeps } from './deps';

const app = new Hono();
app.route(
  '/',
  createApp(() => createDeps()),
);

export default app;
