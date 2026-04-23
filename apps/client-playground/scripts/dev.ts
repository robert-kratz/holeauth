#!/usr/bin/env node
/**
 * Pre-dev bootstrapper for the client playground:
 *   1. ensure .env.local exists
 *   2. ensure the `client_playground` DB exists
 *   3. push drizzle schema
 *   4. start Next.js on port 3001
 *
 * Does NOT start Postgres — the main playground owns docker-compose.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const envFile = path.join(root, '.env.local');
const exampleFile = path.join(root, '.env.example');

function ensureEnv() {
  if (existsSync(envFile)) return;
  if (existsSync(exampleFile)) {
    writeFileSync(envFile, readFileSync(exampleFile, 'utf8'));
    console.log('[client-dev] copied .env.example → .env.local — fill in CLIENT_ID/CLIENT_SECRET');
  }
}

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  return r.status ?? 0;
}

ensureEnv();

if (run('pnpm', ['exec', 'tsx', 'scripts/bootstrap-db.ts']) !== 0) {
  console.warn('[client-dev] db bootstrap failed — continuing anyway');
}
if (run('pnpm', ['exec', 'drizzle-kit', 'push']) !== 0) {
  console.warn('[client-dev] drizzle-kit push failed — continuing');
}

const proc = spawn('pnpm', ['exec', 'next', 'dev', '-p', '3001'], { stdio: 'inherit' });
proc.on('exit', (c) => process.exit(c ?? 0));
