import { docs } from '@/.source/server';
import { loader } from 'fumadocs-core/source';

export const source = loader({
  // The docs app runs on its own host (docs.holeauth.dev) with no basePath.
  // Fumadocs URLs are built relative to baseUrl, e.g. /getting-started.
  baseUrl: '/',
  source: docs.toFumadocsSource(),
});
