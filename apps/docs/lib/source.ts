import { docs } from '@/.source/server';
import { loader } from 'fumadocs-core/source';

export const source = loader({
  // baseUrl is relative to basePath (/docs). Fumadocs generates /getting-started
  // which Next.js Link renders as /docs/getting-started. Do not prefix with /docs.
  baseUrl: '/',
  source: docs.toFumadocsSource(),
});
