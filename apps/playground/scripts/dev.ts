#!/usr/bin/env node
/**
 * Pre-dev bootstrapper: make sure Docker Postgres is running, then
 * generate + push the schema, then start Next.js.
 *
 * Run with `pnpm dev`. Idempotent on repeated runs.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const envFile = path.join(root, '.env.local');
const composeFile = path.join(root, 'docker-compose.yml');

function run(cmd: string, args: string[], opts: { silent?: boolean } = {}) {
  const r = spawnSync(cmd, args, {
    stdio: opts.silent ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
  });
  return { code: r.status ?? 0, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function hasDocker(): boolean {
  return run('docker', ['--version'], { silent: true }).code === 0;
}

function composeCmd(): [string, string[]] {
  // prefer `docker compose` (v2), fallback to `docker-compose`.
  const v2 = run('docker', ['compose', 'version'], { silent: true });
  if (v2.code === 0) return ['docker', ['compose']];
  return ['docker-compose', []];
}

function ensureEnv() {
  if (existsSync(envFile)) return;
  const defaults = [
    'DATABASE_URL=postgres://holeauth:holeauth@localhost:54329/holeauth',
    'HOLEAUTH_SECRET=dev-secret-change-me-please',
    'APP_URL=http://localhost:3000',
    'PASSKEY_RP_ID=localhost',
    'PASSKEY_RP_NAME=Holeauth Playground',
    '',
    '# Optional SSO:',
    '# GOOGLE_CLIENT_ID=',
    '# GOOGLE_CLIENT_SECRET=',
    '# GITHUB_CLIENT_ID=',
    '# GITHUB_CLIENT_SECRET=',
    '',
  ].join('\n');
  writeFileSync(envFile, defaults);
  console.log('[dev] wrote .env.local');
}

function waitForDb(timeoutMs = 30_000): boolean {
  const [cmd, pre] = composeCmd();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = run(cmd, [...pre, '-f', composeFile, 'exec', '-T', 'postgres', 'pg_isready', '-U', 'holeauth', '-d', 'holeauth'], {
      silent: true,
    });
    if (r.code === 0) return true;
    spawnSync('sleep', ['1']);
  }
  return false;
}

function bootDocker() {
  if (!hasDocker()) {
    console.warn('[dev] docker not found — skipping db auto-boot. Set DATABASE_URL yourself.');
    return false;
  }
  const [cmd, pre] = composeCmd();
  console.log('[dev] starting postgres …');
  const up = run(cmd, [...pre, '-f', composeFile, 'up', '-d', 'postgres']);
  if (up.code !== 0) {
    console.error('[dev] failed to start postgres — see above. Falling back.');
    return false;
  }
  if (!waitForDb()) {
    console.error('[dev] postgres did not become ready in time.');
    return false;
  }
  console.log('[dev] postgres ready');
  return true;
}

function pushSchema() {
  mkdirSync(path.join(root, 'db', 'migrations'), { recursive: true });
  console.log('[dev] pushing drizzle schema …');
  const r = run('pnpm', ['exec', 'drizzle-kit', 'push']);
  if (r.code !== 0) console.warn('[dev] drizzle-kit push failed — open the logs above.');
}

function startNext() {
  const proc = spawn('pnpm', ['exec', 'next', 'dev', '-p', '3000'], { stdio: 'inherit' });
  proc.on('exit', (c) => process.exit(c ?? 0));
}

ensureEnv();
const booted = bootDocker();
if (booted) pushSchema();
startNext();
