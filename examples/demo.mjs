// Synthetic local example: no real repository, accounts, credentials or network.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute, basename } from 'node:path';
import { plan, checkBundle, summarize } from '../src/core.mjs';

const fixture = mkdtempSync(join(tmpdir(), 'assurance-demo-'));
try {
  writeFileSync(join(fixture, 'example.js'), 'export const example = true;\n');
  const bundle = plan({ root: fixture, paths: ['example.js'], selectors: ['A-01'],
    projectId: 'synthetic-example', authorizationRef: 'self-owned-disposable-demo' });
  const errors = checkBundle(bundle, { root: fixture });
  const result = summarize(bundle, errors);
  console.log(JSON.stringify({ record_validation: result.record_validation, dispositions: result.dispositions,
    assessment_complete: result.assessment_complete, explanation: 'Valid records; no assessment was performed and no pass was granted.' }, null, 2));
  if (errors.length || result.assessment_complete) process.exitCode = 1;
} finally {
  const target = resolve(fixture), inside = relative(resolve(tmpdir()), target);
  if (!inside || inside.startsWith('..') || isAbsolute(inside) || !basename(target).startsWith('assurance-demo-')) throw new Error('Refuse unsafe fixture cleanup');
  rmSync(target, { recursive: true, force: true });
}
