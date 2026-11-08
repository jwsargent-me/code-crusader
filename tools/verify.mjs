// Package self-tests only. Never executes commands in a consumer repository.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function testSummary(tap) {
  const counts = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map(key => {
    const matches = [...tap.matchAll(new RegExp('^# ' + key + ' (\\d+)\\r?$', 'gm'))];
    return [key, matches.length === 1 ? Number(matches[0][1]) : null];
  }));
  if (Object.values(counts).some(value => value === null) || counts.tests < 1 || counts.pass !== counts.tests
    || ['fail', 'cancelled', 'skipped', 'todo'].some(key => counts[key] !== 0)) throw new Error('Self-tests incomplete, failed, skipped, or missing an unambiguous TAP summary');
  return counts;
}

function main() {
  if (process.argv.length !== 2) throw new Error('Usage: node tools/verify.mjs');
  const cwd = fileURLToPath(new URL('../', import.meta.url));
  for (const args of [['bin/assurance.mjs', 'catalog'], ['--test', '--test-reporter=tap']]) {
    const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
    process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '');
    if (result.status !== 0 || result.error) throw new Error('Package verification command failed or timed out');
    if (args[0] === '--test') testSummary(result.stdout);
  }
  process.stdout.write('Package verification passed with no skipped self-tests. This is not a consumer assessment.\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
