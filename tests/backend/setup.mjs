// Loaded only by the backend test command, never by the application.
// No test may inherit real ecommerce credentials or accidentally make network calls.
import { randomBytes } from 'node:crypto';
process.env.SHOPIFY_ACCESS_TOKEN = '';
process.env.SHOPIFY_SHOP = 'synthetic-store.myshopify.com';
process.env.SHOPIFY_CREDENTIALS_KEY = randomBytes(32).toString('hex');
globalThis.fetch = async () => {
  throw new Error('External network access is disabled in backend tests. Install an explicit fixture.');
};
