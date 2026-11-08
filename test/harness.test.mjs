import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, symlinkSync, rmSync, cpSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { catalog, sets, hash, select, plan, snapshot, checkBundle, manifestErrors, catalogErrors, applicability, summarize } from '../src/core.mjs';
import { validTime, schemaErrors } from '../src/shape.mjs';
import { inspectGit, trackedFiles } from '../src/git.mjs';
import { renderReport } from '../src/report.mjs';
import { testSummary } from '../tools/verify.mjs';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const fixed = '2026-11-07T12:00:00.000Z';
const now = Date.parse('2026-11-07T12:01:00.000Z');
const root = mkdtempSync(join(tmpdir(), 'assurance-test-'));
writeFileSync(join(root, 'app.js'), 'export const value = 1;\n');
function removeFixture(path) {
  const target = resolve(path), inside = relative(resolve(tmpdir()), target);
  assert.ok(inside && !inside.startsWith('..') && !isAbsolute(inside) && basename(target).startsWith('assurance-'));
  rmSync(target, { recursive: true, force: true });
}
test.after(() => removeFixture(root));
const copy = value => structuredClone(value);
const make = (options = {}) => plan({ root, paths: ['app.js'], selectors: ['A-01'], projectId: 'synthetic', authorizationRef: 'fixture-only', now: fixed, ...options });
const errors = bundle => checkBundle(bundle, { root, now });
function pass() {
  const bundle = make({ mode: 'validation', validityDays: 1, validityPolicyRef: 'fixture-policy' });
  const { report: r, manifest: m } = bundle;
  r.run.assessor = 'fixture-reviewer';
  r.evidence = [{ id: 'proof', type: 'source', locator: 'app.js:1', captured_at: fixed, snapshot: m.snapshot.digest,
    environment: null, summary: 'Synthetic fixture only.', limitations: [], artifact: { path: 'app.js', sha256: m.snapshot.files[0].sha256 } }];
  Object.assign(r.controls[0], { status: 'validated_pass', applicability: 'applicable', evidence_ids: ['proof'],
    remaining_validation: [], valid_until: '2026-11-08T12:00:00.000Z', coverage: {
      positive_check_ids: ['check'], negative_check_ids: [], negative_not_applicable_reason: 'Synthetic ownership inventory has no executable rejection path; reconcile the inventory independently.', exclusion_check_ids: []
    } });
  r.validation_checks = [{ id: 'check', control_ids: ['A-01'], finding_ids: [], state: 'executed', executed_at: fixed,
    method: 'Synthetic static fixture', authorization_ref: m.authorization_ref, expected: 'Synthetic requirement', actual: 'Fixture observed',
    result: 'supports_pass', evidence_ids: ['proof'], cleanup: 'not_required' }];
  r.gate_recommendation = 'eligible_for_owner_review';
  return bundle;
}
function finding(id = 'F1', outcome = 'confirmed') {
  return { id, fingerprint: id, prior_finding_ids: [], control_ids: ['A-01'], title: 'Synthetic gap', asset: 'app.js',
    claim: 'Fixture-only claim', impact: 'Fixture-only impact', preconditions: [], evidence_ids: ['proof'], counterevidence: [], uncertainty: [],
    severity: 'low', severity_basis: 'Synthetic', confidence: 'high', confidence_basis: 'Fixture', bucket: 'later_improvement',
    validation_plan: 'Synthetic check', outcome, outcome_rationale: 'Fixture', legal_context: null };
}
function asExclusion(bundle) {
  Object.assign(bundle.report.controls[0], { status: 'not_applicable', applicability: 'not_applicable', valid_until: null,
    coverage: { positive_check_ids: [], negative_check_ids: [], negative_not_applicable_reason: null, exclusion_check_ids: ['check'] } });
}
function carryFixture() {
  const original = make();
  original.report.evidence = [copy(pass().report.evidence[0])];
  Object.assign(original.report.controls[0], { status: 'needs_evidence', rationale: 'Source inventory inspected; runtime evidence unavailable.', evidence_ids: ['proof'] });
  const path = 'prior-review.json'; writeFileSync(join(root, path), JSON.stringify(original));
  const bundle = make({ now: '2026-11-07T12:00:10.000Z' });
  bundle.report.controls[0] = { ...copy(original.report.controls[0]), prior_assessment: { report_evidence_id: 'prior' } };
  bundle.report.evidence = [...copy(original.report.evidence), { id: 'prior', type: 'configuration', locator: 'prior-review.json',
    captured_at: bundle.manifest.created_at, snapshot: bundle.manifest.snapshot.digest, environment: null,
    summary: 'Original research record, not execution proof.', limitations: ['Historical research only.'], artifact: { path, sha256: hash(readFileSync(join(root, path))) } }];
  return { bundle, original, path };
}
test('research carry-forward preserves exact original facts, evidence and timestamps', () => {
  const { bundle } = carryFixture();
  assert.deepEqual(checkBundle(bundle, { root, evidenceRoot: root, now }), []);
  assert.equal(bundle.report.controls[0].assessed_at, fixed);
  const readable = renderReport(bundle, [], { controlIds: ['A-01'] });
  assert.ok(readable.includes('original timestamps')); assert.ok(readable.includes('Historical source: prior'));
  assert.throws(() => renderReport(bundle, [], { controlIds: ['C-01'] }));
});
test('unsupported historical research formats are rejected without archive dependencies', () => {
  const { bundle, original, path } = carryFixture();
  original.manifest.schema_version = '3.2'; original.report.schema_version = '3.2';
  original.report.manifest_hash = hash(original.manifest);
  writeFileSync(join(root, path), JSON.stringify(original));
  bundle.report.evidence.find(item => item.id === 'prior').artifact.sha256 = hash(readFileSync(join(root, path)));
  assert.ok(checkBundle(bundle, { root, evidenceRoot: root, now }).length);
});

for (const [name, mutate] of Object.entries({
  'rewritten old assessment date': ({ bundle }) => { bundle.report.controls[0].assessed_at = bundle.manifest.created_at; },
  'validation use of historical research': ({ bundle }) => { bundle.manifest.mode = 'validation'; bundle.report.phase = 'validation'; bundle.report.gate_recommendation = 'needs_review'; bundle.report.manifest_hash = hash(bundle.manifest); },
  'unreferenced earlier assessment': ({ bundle }) => { bundle.report.controls[0].prior_assessment = null; },
  'changed carried conclusion': ({ bundle }) => { bundle.report.controls[0].rationale = 'Changed conclusion'; },
  'changed carried source evidence': ({ bundle }) => { bundle.report.evidence[0].summary = 'Rewritten source observation'; },
  'cross-project history': ({ original }) => { original.manifest.project_id = 'another-project'; original.report.project_id = 'another-project'; original.report.manifest_hash = hash(original.manifest); },
  'changed historical Git binding': ({ original }) => { original.manifest.git_snapshot = { base_ref: 'refs/heads/develop', digest: 'a'.repeat(64) }; original.report.manifest_hash = hash(original.manifest); },
  'unresolved carry chains': ({ original }) => { original.report.controls[0].prior_assessment = { report_evidence_id: 'older' }; }
})) test('rejects ' + name, () => {
  const fixture = carryFixture(); mutate(fixture);
  writeFileSync(join(root, fixture.path), JSON.stringify(fixture.original));
  fixture.bundle.report.evidence.find(item => item.id === 'prior').artifact.sha256 = hash(readFileSync(join(root, fixture.path)));
  assert.ok(checkBundle(fixture.bundle, { root, evidenceRoot: root, now }).length);
});
test('current authoring contracts are valid and preserve security defaults', () => {
  assert.deepEqual(catalogErrors(), []);
  for (const control of catalog.controls) {
    assert.equal(control.research.permitted_mode, 'read_only');
    assert.equal(control.failure_significance.default_gate, 'needs_review');
    if (control.false_positive_guidance) assert.ok(!control.false_positive_guidance.startsWith('undefined '));
  }
  assert.equal(catalog.controls.find(item => item.id === 'F-09').validation.negative_case_required, true);
});

test('selectors resolve modules, sets, unions and exclusions in catalog order', () => {
  const moduleIds = catalog.controls.filter(item => item.module_id === 'C').map(item => item.id);
  assert.deepEqual(select(['C']), moduleIds);
  assert.deepEqual(select(['C', 'C-01'], ['C-02']), moduleIds.filter(id => id !== 'C-02'));
  assert.ok(select(['repository-hygiene']).includes('Q-04'));
  for (const [selectors, excluded] of [[[], []], [['bad'], []], [['C'], ['B']], [['C'], ['C']], [['__proto__'], []]]) assert.throws(() => select(selectors, excluded));
});

for (const [name, mutate] of Object.entries({
  'duplicate control ID': data => data.controls.push(copy(data.controls[0])),
  'unknown module': data => { data.controls[0].module_id = 'MISSING'; },
  'unknown feature': data => { data.controls[0].applicability.any_of = ['missing-feature']; },
  'missing research method': data => { delete data.controls[0].research; },
  'missing validation': data => { delete data.controls[0].validation; },
  'missing negative-case policy': data => { delete data.controls[0].validation.negative_case_required; },
  'unknown guidance reference': data => { data.controls[0].reference_ids = ['missing-reference']; },
  'inherited freshness policy': data => { data.controls[0].freshness.policy_ref = '__proto__'; },
  'unsafe default pass': data => { data.controls[0].failure_significance.default_gate = 'eligible_for_owner_review'; },
  'misspelled control field': data => { data.controls[0].validaton = copy(data.controls[0].validation); },
  'duplicated module membership': data => { data.modules[0].control_ids = ['A-01']; },
  'malformed control': data => { data.controls[0] = null; },
  'invalid catalog version': data => { data.catalog_version = ''; },
  'dangling set selector': (_data, groups) => { groups.sets.extra = ['MISSING']; },
  'catalog-coupled sets': (data, groups) => { groups.catalog_version = data.catalog_version; }
})) test('catalog authoring rejects ' + name, () => {
  const definition = copy(catalog), groups = copy(sets);
  mutate(definition, groups);
  let result;
  assert.doesNotThrow(() => { result = catalogErrors(definition, groups); });
  assert.ok(result.length, name);
});

test('new modules and all-set coverage are derived from catalog data', () => {
  const definition = copy(catalog);
  let moduleId = 'EXTRA';
  while (definition.modules.some(module => module.id === moduleId)) moduleId += '_X';
  const controlId = moduleId + '-01';
  definition.modules.push({ id: moduleId, title: 'Synthetic module', applicability: { any_of: ['all'] } });
  definition.controls.push({ ...copy(definition.controls[0]), id: controlId, module_id: moduleId });
  assert.deepEqual(catalogErrors(definition), []);
  assert.deepEqual(select([moduleId], [], definition), [controlId]);
  assert.ok(select(['all'], [], definition).includes(controlId));
});

test('catalog and report version labels must match the actual frozen contracts', () => {
  const wrongManifest = make();
  wrongManifest.manifest.catalog_version = '999.0.0';
  wrongManifest.report.manifest_hash = hash(wrongManifest.manifest);
  assert.ok(errors(wrongManifest).includes('Catalog version mismatch'));
  const wrongReport = make();
  wrongReport.report.catalog_version = '999.0.0';
  assert.ok(errors(wrongReport).includes('Report scope mismatch'));
});

test('adding one control needs only catalog data with no schema or version changes', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'assurance-contribution-'));
  try {
    for (const dir of ['src', 'bin', 'catalog', 'schemas']) cpSync(join(packageRoot, dir), join(fixture, dir), { recursive: true });
    writeFileSync(join(fixture, 'app.js'), 'export const fixture = true;\n');
    const schemaFiles = readdirSync(join(fixture, 'schemas')).sort();
    const schemaHashes = schemaFiles.map(file => hash(readFileSync(join(fixture, 'schemas', file))));
    const originalSets = readFileSync(join(fixture, 'catalog/sets.json'));
    const run = (args, status = 0) => {
      const result = spawnSync(process.execPath, ['bin/assurance.mjs', ...args], { cwd: fixture, encoding: 'utf8', timeout: 15000, maxBuffer: 8 * 1024 * 1024 });
      assert.equal(result.status, status, result.stderr || result.stdout);
      return result.stdout;
    };
    const planning = ['plan', '--root', fixture, '--files', 'app.js', '--project', 'contribution-fixture', '--authorization', 'synthetic-fixture'];
    const previous = JSON.parse(run([...planning, '--select', 'A-01']));
    const dataPath = join(fixture, 'catalog/controls.json');
    const definition = JSON.parse(readFileSync(dataPath, 'utf8'));
    let nextId = 1;
    while (definition.controls.some(control => control.id === `A-${String(nextId).padStart(2, '0')}`)) nextId++;
    const control = copy(definition.controls.find(item => item.id === 'A-01'));
    control.id = `A-${String(nextId).padStart(2, '0')}`;
    control.title = 'Synthetic contribution fixture';
    definition.controls.push(control);
    writeFileSync(dataPath, JSON.stringify(definition, null, 2) + '\n');
    assert.equal(JSON.parse(run(['catalog'])).controls, definition.controls.length);
    for (const selector of [control.id, 'A', 'all']) assert.ok(JSON.parse(run(['list', '--select', selector])).some(item => item.id === control.id));
    const bundle = JSON.parse(run([...planning, '--select', control.id, '--mode', 'validation', '--validity-days', '1', '--validity-policy', 'synthetic-policy']));
    const { manifest: m, report: r } = bundle, at = m.created_at;
    assert.equal(m.catalog_version, previous.manifest.catalog_version);
    assert.equal(m.schema_hash, previous.manifest.schema_hash);
    assert.equal(m.schema_version, previous.manifest.schema_version);
    assert.equal(m.engine_hash, previous.manifest.engine_hash);
    assert.notEqual(m.catalog_hash, previous.manifest.catalog_hash);
    r.run.assessor = 'fixture-reviewer';
    r.evidence = [{ id: 'proof', type: 'source', locator: 'app.js', captured_at: at, snapshot: m.snapshot.digest,
      environment: null, summary: 'Synthetic record fixture.', limitations: [], artifact: { path: 'app.js', sha256: m.snapshot.files[0].sha256 } }];
    Object.assign(r.controls[0], { status: 'validated_pass', applicability: 'applicable', rationale: 'Synthetic source inventory reconciled.',
      evidence_ids: ['proof'], remaining_validation: [], valid_until: new Date(Date.parse(at) + 86400000).toISOString(),
      coverage: { positive_check_ids: ['check'], negative_check_ids: [], negative_not_applicable_reason: 'Synthetic ownership inventory has no executable denial path.', exclusion_check_ids: [] } });
    r.validation_checks = [{ id: 'check', control_ids: [control.id], finding_ids: [], state: 'executed', executed_at: at,
      method: 'Read synthetic source fixture', authorization_ref: m.authorization_ref, expected: 'Synthetic source present', actual: 'Synthetic source present',
      result: 'supports_pass', evidence_ids: ['proof'], cleanup: 'not_required' }];
    r.gate_recommendation = 'eligible_for_owner_review';
    writeFileSync(join(fixture, 'review.json'), JSON.stringify(bundle));
    run(['verify', '--input', 'review.json', '--root', fixture, '--target', 'source', '--manifest-hash', hash(m)]);
    writeFileSync(join(fixture, 'old.json'), JSON.stringify(previous));
    run(['check', '--input', 'old.json', '--root', fixture], 1);
    assert.deepEqual(readdirSync(join(fixture, 'schemas')).sort(), schemaFiles);
    assert.deepEqual(schemaFiles.map(file => hash(readFileSync(join(fixture, 'schemas', file)))), schemaHashes);
    assert.deepEqual(readFileSync(join(fixture, 'catalog/sets.json')), originalSets);
  } finally { removeFixture(fixture); }
});

test('package verification rejects skipped, absent, ambiguous and failed test summaries', () => {
  const tap = '# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
  assert.equal(testSummary(tap).pass, 2);
  assert.throws(() => testSummary(tap.replace('# skipped 0', '# skipped 1')));
  assert.throws(() => testSummary(tap.replace('# fail 0', '# fail 1')));
  assert.throws(() => testSummary(tap.replace('# todo 0', '# todo 1')));
  assert.throws(() => testSummary(tap.replace('# tests 2', '# tests 0')));
  assert.throws(() => testSummary(''));
  assert.throws(() => testSummary(tap + '# pass 2\n'));
});
test('unknown feature flags never silently exclude controls', () => {
  const control = catalog.controls.find(item => item.id === 'C-01');
  assert.equal(applicability(control, {}), 'unknown');
  assert.equal(applicability(control, { authorization: false, multi_tenant: false }), 'not_applicable');
  assert.equal(make({ selectors: ['C-01'], features: { authorization: false, multi_tenant: false } }).report.controls[0].status, 'not_assessed');
  assert.throws(() => make({ features: { made_up: true } }));
});
test('review and validation templates are honest valid records with no pass', () => {
  for (const mode of ['review', 'validation']) {
    const bundle = make({ mode });
    assert.deepEqual(errors(bundle), []);
    assert.equal(bundle.report.controls[0].status, 'not_assessed');
  }
});
test('well supported scoped pass and exact confirmed/refuted finding accepted', () => {
  assert.deepEqual(errors(pass()), []);
  for (const outcome of ['confirmed', 'refuted']) {
    const bundle = pass(), r = bundle.report;
    r.findings = [finding('F1', outcome)]; r.controls[0].finding_ids = ['F1']; r.validation_checks[0].finding_ids = ['F1'];
    if (outcome === 'confirmed') {
      r.controls[0].status = 'validated_gap'; r.controls[0].valid_until = null;
      r.controls[0].coverage = { positive_check_ids: [], negative_check_ids: [], negative_not_applicable_reason: null, exclusion_check_ids: [] };
      r.validation_checks[0].result = 'supports_gap'; r.gate_recommendation = 'blocked';
    }
    assert.deepEqual(errors(bundle), []);
  }
});

const rejected = {
  'research claiming validation': b => { b.manifest.mode = 'review'; b.report.phase = 'research'; b.report.manifest_hash = hash(b.manifest); },
  'premature eligibility': b => { b.report.controls[0].status = 'needs_evidence'; },
  'missing coverage': b => { b.report.controls = []; },
  'extra unknown control': b => { b.report.controls.push({ ...copy(b.report.controls[0]), control_id: 'ZZ-01' }); },
  'duplicate control': b => { b.report.controls.push(copy(b.report.controls[0])); },
  'duplicate evidence': b => { b.report.evidence.push(copy(b.report.evidence[0])); },
  'missing evidence': b => { b.report.evidence = []; },
  'borrowed proof for another finding': b => { b.report.findings = [finding('F1'), finding('F2')]; b.report.controls[0].finding_ids = ['F1', 'F2']; b.report.controls[0].status = 'validated_gap'; b.report.controls[0].valid_until = null; b.report.validation_checks[0].result = 'supports_gap'; b.report.validation_checks[0].finding_ids = ['F1']; b.report.gate_recommendation = 'blocked'; },
  'missing validity policy': b => { b.manifest.validity_days = null; b.report.manifest_hash = hash(b.manifest); },
  'expired pass': b => { b.report.controls[0].valid_until = fixed; },
  'overlong validity': b => { b.report.controls[0].valid_until = '2026-12-01T12:00:00Z'; },
  'future evidence': b => { b.report.evidence[0].captured_at = '2026-11-09T12:00:00Z'; },
  'stale evidence': b => { b.report.evidence[0].captured_at = '2026-11-01T12:00:00Z'; },
  'invalid calendar date': b => { b.report.evidence[0].captured_at = '2026-02-30T12:00:00Z'; },
  'cross-snapshot evidence': b => { b.report.evidence[0].snapshot = 'a'.repeat(64); },
  'cross-environment evidence': b => { b.report.evidence[0].environment = 'production'; },
  'planned check claiming pass': b => { b.report.validation_checks[0].state = 'planned'; },
  'skipped check claiming pass': b => { b.report.validation_checks[0].state = 'skipped'; },
  'inconclusive check claiming pass': b => { b.report.validation_checks[0].result = 'inconclusive'; },
  'pass with another unresolved check': b => { b.report.gate_recommendation = 'needs_review'; b.report.validation_checks.push({ ...copy(b.report.validation_checks[0]), id: 'unresolved', state: 'skipped', executed_at: null, result: 'inconclusive' }); },
  'incomplete cleanup': b => { b.report.validation_checks[0].cleanup = 'incomplete'; },
  'check outside authorization': b => { b.report.validation_checks[0].authorization_ref = 'different'; },
  'missing execution time': b => { b.report.validation_checks[0].executed_at = null; },
  'check after assessment': b => { b.report.validation_checks[0].executed_at = '2026-11-07T12:00:30Z'; b.report.run.completed_at = '2026-11-07T12:00:30Z'; },
  'frozen selection modified': b => { b.manifest.assigned_control_ids = ['A-02']; },
  'manifest changed': b => { b.manifest.authorization_ref = 'changed'; },
  'contract digest changed': b => { b.manifest.catalog_hash = 'a'.repeat(64); },
  'capability escalation': b => { b.manifest.capabilities.push('execute_commands'); },
  'unrequested report field': b => { b.report.execute = 'untrusted instruction'; },
  'model substitution': b => { b.report.run.model_requested = 'requested'; b.report.run.model_actual = 'different'; },
  'scope changed': b => { b.report.snapshot.source_revision = 'different'; },
  'pass with unknown applicability': b => { const other = make({ mode: 'validation', selectors: ['C-01'], validityDays: 1, validityPolicyRef: 'fixture' }); b.manifest = other.manifest; b.report.manifest_hash = hash(other.manifest); b.report.run.id = other.manifest.id; b.report.assigned_control_ids = ['C-01']; b.report.controls[0].control_id = 'C-01'; b.report.validation_checks[0].control_ids = ['C-01']; },
  'unsupported exclusion': b => { b.report.controls[0].status = 'not_applicable'; b.report.controls[0].applicability = 'not_applicable'; b.report.controls[0].evidence_ids = []; b.report.controls[0].valid_until = null; }
};
Object.assign(rejected, {
  'excluded control with contradictory gap check': b => {
    asExclusion(b);
    b.report.validation_checks.push({ ...copy(b.report.validation_checks[0]), id: 'contradiction', result: 'supports_gap' });
  },
  'stale evidence hidden in supporting check': b => {
    b.report.evidence.push({ ...copy(b.report.evidence[0]), id: 'stale', captured_at: '2026-11-01T12:00:00Z' });
    b.report.validation_checks[0].evidence_ids.push('stale');
  },
  'exclusion with remaining validation': b => {
    asExclusion(b); b.report.controls[0].remaining_validation = ['Still needs verification'];
  },
  'gap assessed before supporting execution': b => {
    b.report.controls[0].status = 'validated_gap'; b.report.controls[0].valid_until = null;
    b.report.controls[0].finding_ids = ['F1']; b.report.findings = [finding()];
    b.report.controls[0].coverage = { positive_check_ids: [], negative_check_ids: [], negative_not_applicable_reason: null, exclusion_check_ids: [] };
    Object.assign(b.report.validation_checks[0], { result: 'supports_gap', finding_ids: ['F1'], executed_at: '2026-11-07T12:00:30Z' });
    b.report.run.completed_at = '2026-11-07T12:00:30Z'; b.report.gate_recommendation = 'blocked';
  }
});
for (const [name, mutate] of Object.entries(rejected)) test('rejects ' + name, () => {
  const bundle = pass(); mutate(bundle); assert.ok(errors(bundle).length, name);
});
test('eligibility exclusions need current evidence and an executed supporting check', () => {
  const bundle = pass();
  asExclusion(bundle);
  assert.deepEqual(errors(bundle), []);
  const stale = copy(bundle); stale.report.evidence[0].captured_at = '2026-11-01T12:00:00Z';
  assert.ok(errors(stale).length);
  const unchecked = copy(bundle); unchecked.report.validation_checks = [];
  assert.ok(errors(unchecked).length);
});
test('reproduced false-pass regressions fail for their specific cause', () => {
  for (const [name, expected] of [
    ['excluded control with contradictory gap check', /contradictory validation/],
    ['stale evidence hidden in supporting check', /Supporting check evidence is stale/],
    ['exclusion with remaining validation', /unresolved or contradictory validation/],
    ['gap assessed before supporting execution', /assessed before linked execution/]
  ]) {
    const bundle = pass(); rejected[name](bundle);
    assert.ok(errors(bundle).some(error => expected.test(error)), name);
  }
});
test('positive and negative case coverage is explicit and separate', () => {
  const bundle = pass();
  bundle.report.controls[0].coverage.negative_not_applicable_reason = null;
  assert.ok(errors(bundle).some(error => error.includes('positive/negative coverage')));
  bundle.report.controls[0].coverage.negative_check_ids = ['check'];
  assert.ok(errors(bundle).some(error => error.includes('distinct checks')));
  bundle.report.validation_checks.push({ ...copy(bundle.report.validation_checks[0]), id: 'negative', expected: 'Denied case is rejected', actual: 'Denied case rejected' });
  bundle.report.controls[0].coverage.negative_check_ids = ['negative'];
  assert.deepEqual(errors(bundle), []);
});
test('security boundary controls cannot replace required negative cases with prose', () => {
  const bundle = pass();
  const scoped = make({ mode: 'validation', selectors: ['C-02'], features: { authorization: true }, validityDays: 1, validityPolicyRef: 'fixture-policy' });
  bundle.manifest = scoped.manifest;
  Object.assign(bundle.report, { manifest_hash: hash(scoped.manifest), snapshot: scoped.report.snapshot, assigned_control_ids: ['C-02'] });
  bundle.report.run.id = scoped.manifest.id;
  bundle.report.controls[0].control_id = 'C-02'; bundle.report.validation_checks[0].control_ids = ['C-02'];
  assert.ok(errors(bundle).some(error => error.includes('requires an executed negative case')));
  bundle.report.validation_checks.push({ ...copy(bundle.report.validation_checks[0]), id: 'denied' });
  bundle.report.controls[0].coverage.negative_check_ids = ['denied']; bundle.report.controls[0].coverage.negative_not_applicable_reason = null;
  assert.deepEqual(errors(bundle), []);
});
test('evidence artifacts and approved manifests are verified without reading locators', () => {
  const source = pass();
  source.report.evidence[0].locator = 'https://untrusted.invalid/do-not-fetch';
  assert.deepEqual(errors(source), []);
  source.report.evidence[0].artifact.sha256 = 'a'.repeat(64);
  assert.ok(errors(source).some(error => error.includes('artifact is not in scoped snapshot')));
  const external = pass(); external.report.evidence[0].type = 'organizational';
  assert.ok(errors(external).some(error => error.includes('evidence root')));
  assert.deepEqual(checkBundle(external, { root, evidenceRoot: root, now, expectedManifestHash: hash(external.manifest) }), []);
  external.report.evidence[0].artifact.path = '../outside';
  assert.ok(checkBundle(external, { root, evidenceRoot: root, now }).some(error => error.includes('artifact unavailable or unsafe')));
  assert.ok(checkBundle(pass(), { root, now, expectedManifestHash: 'a'.repeat(64) }).includes('Approved manifest hash mismatch'));
});
test('runtime claims require declared identity and linked runtime artifacts', () => {
  assert.throws(() => make({ assessmentTarget: 'runtime' }));
  const bundle = pass();
  bundle.manifest.assessment_target = 'runtime'; bundle.manifest.snapshot.environment = 'fixture'; bundle.manifest.snapshot.deployment = 'synthetic-release';
  const { digest, ...identity } = bundle.manifest.snapshot; bundle.manifest.snapshot.digest = hash(identity);
  bundle.report.manifest_hash = hash(bundle.manifest);
  bundle.report.snapshot.environment = 'fixture'; bundle.report.snapshot.deployment = 'synthetic-release';
  bundle.report.evidence[0].environment = 'fixture'; bundle.report.evidence[0].snapshot = bundle.manifest.snapshot.digest;
  assert.ok(errors(bundle).some(error => error.includes('Runtime pass lacks')));
  bundle.report.evidence[0].type = 'runtime';
  assert.deepEqual(checkBundle(bundle, { root, evidenceRoot: root, now }), []);
  bundle.report.evidence[0].artifact.sha256 = 'a'.repeat(64);
  assert.ok(checkBundle(bundle, { root, evidenceRoot: root, now }).includes('Evidence artifact changed'));
});
test('runtime coverage cannot borrow a source-only negative case', () => {
  const bundle = pass(), { manifest: m, report: r } = bundle;
  m.assessment_target = 'runtime'; m.snapshot.environment = 'fixture'; m.snapshot.deployment = 'synthetic-release';
  const { digest, ...identity } = m.snapshot; m.snapshot.digest = hash(identity);
  r.snapshot.environment = 'fixture'; r.snapshot.deployment = 'synthetic-release';
  r.evidence[0].environment = 'fixture'; r.evidence[0].snapshot = m.snapshot.digest;
  r.evidence.push({ ...copy(r.evidence[0]), id: 'runtime', type: 'runtime' });
  r.controls[0].evidence_ids.push('runtime');
  r.validation_checks[0].evidence_ids = ['runtime'];
  r.validation_checks.push({ ...copy(r.validation_checks[0]), id: 'deny', evidence_ids: ['proof'] });
  r.controls[0].coverage.negative_check_ids = ['deny'];
  r.controls[0].coverage.negative_not_applicable_reason = null;
  r.manifest_hash = hash(m);
  const rejected = checkBundle(bundle, { root, evidenceRoot: root, now });
  assert.notDeepEqual(rejected, [], 'A source-only denial must not qualify a runtime pass');
  assert.ok(rejected.includes('Runtime coverage lacks case-specific runtime evidence'));
  r.validation_checks[1].evidence_ids = ['runtime'];
  assert.deepEqual(checkBundle(bundle, { root, evidenceRoot: root, now }), []);
  r.validation_checks[0].evidence_ids = ['proof'];
  assert.ok(checkBundle(bundle, { root, evidenceRoot: root, now }).includes('Runtime coverage lacks case-specific runtime evidence'));
});

test('fresh artifacts cannot refresh a stale execution', () => {
  const bundle = pass();
  bundle.manifest.created_at = '2026-11-05T12:00:00.000Z';
  bundle.report.run.started_at = bundle.manifest.created_at;
  bundle.report.validation_checks[0].executed_at = bundle.manifest.created_at;
  bundle.report.manifest_hash = hash(bundle.manifest);
  const rejected = errors(bundle);
  assert.notDeepEqual(rejected, [], 'Fresh evidence must not qualify a stale execution');
  assert.ok(rejected.includes('Supporting check execution is stale or lacks validity policy'));
  bundle.report.validation_checks[0].executed_at = fixed;
  assert.deepEqual(errors(bundle), []);
});

test('an exclusion cannot borrow a newly captured artifact from a stale applicability check', () => {
  const bundle = pass(); asExclusion(bundle);
  bundle.manifest.created_at = '2026-11-05T12:00:00.000Z'; bundle.report.run.started_at = bundle.manifest.created_at;
  bundle.report.validation_checks[0].executed_at = bundle.manifest.created_at;
  bundle.report.manifest_hash = hash(bundle.manifest);
  assert.ok(errors(bundle).includes('Supporting check execution is stale or lacks validity policy'));
  bundle.report.validation_checks[0].executed_at = fixed;
  assert.deepEqual(errors(bundle), []);
});

test('runtime exclusions require deployment applicability evidence rather than source-only assumptions', () => {
  const bundle = pass(); asExclusion(bundle);
  const { manifest: m, report: r } = bundle;
  m.assessment_target = 'runtime'; m.snapshot.environment = 'fixture'; m.snapshot.deployment = 'synthetic-release';
  const { digest, ...identity } = m.snapshot; m.snapshot.digest = hash(identity);
  r.snapshot.environment = 'fixture'; r.snapshot.deployment = 'synthetic-release';
  r.evidence[0].environment = 'fixture'; r.evidence[0].snapshot = m.snapshot.digest;
  r.manifest_hash = hash(m);
  const rejected = checkBundle(bundle, { root, evidenceRoot: root, now });
  assert.notDeepEqual(rejected, [], 'Source-only applicability must not exclude a deployed control');
  assert.ok(rejected.includes('Runtime exclusion lacks linked deployment applicability evidence'));
  r.evidence[0].type = 'configuration';
  assert.deepEqual(checkBundle(bundle, { root, evidenceRoot: root, now }), []);
});

test('unsupported schema rules, invalid clocks and absent Git bindings fail closed', () => {
  assert.ok(schemaErrors({ type: 'string', not: { const: 'forbidden' } }).length);
  assert.ok(schemaErrors({ type: 'string', format: 'unsupported' }).length);
  assert.ok(schemaErrors({ $ref: '#/missing' }).length);
  assert.ok(schemaErrors({ $ref: '#/$defs/text', minLength: 20, $defs: { text: { type: 'string' } } }).length);
  assert.ok(checkBundle(pass(), { root, now: NaN }).length);
  assert.throws(() => make({ selectors: ['P-01'] }));
});
test('direct Git collector reports synthetic state without changing it', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'assurance-git-'));
  const git = (...args) => {
    const result = spawnSync('git', ['-C', fixture, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'commit.gpgSign=false', '-c', 'core.hooksPath=' + join(fixture, 'empty-hooks'), ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  try {
    mkdirSync(join(fixture, 'empty-hooks'));
    git('init', '--initial-branch=develop');
    writeFileSync(join(fixture, 'app.js'), 'one'); git('add', 'app.js'); git('commit', '-m', 'Synthetic baseline');
    git('switch', '-c', 'fix/fixture');
    writeFileSync(join(fixture, 'app.js'), 'two'); git('add', 'app.js'); git('commit', '-m', 'Synthetic change');
    writeFileSync(join(fixture, 'untracked.txt'), 'retained work');
    const before = { status: git('status', '--porcelain=v1'), refs: git('show-ref'), head: git('rev-parse', 'HEAD'), index: hash(readFileSync(join(fixture, '.git', 'index'))) };
    const observed = inspectGit(fixture, 'refs/heads/develop');
    assert.deepEqual(trackedFiles(fixture), ['app.js']);
    assert.equal(observed.working_tree_dirty, true);
    assert.equal(observed.branches.find(branch => branch.ref === 'refs/heads/fix/fixture').base_divergence.branch_only, 1);
    assert.equal(observed.stash_count, 0);
    assert.ok(observed.branches.every(branch => branch.commits_not_in_local_remote_refs > 0));
    assert.ok(!JSON.stringify(observed).includes('fixture@example.invalid'));
    assert.deepEqual({ status: git('status', '--porcelain=v1'), refs: git('show-ref'), head: git('rev-parse', 'HEAD'), index: hash(readFileSync(join(fixture, '.git', 'index'))) }, before);
    assert.throws(() => inspectGit(fixture, '--upload-pack=command'));
    assert.throws(() => inspectGit(fixture, 'refs/heads/missing'));
    const bound = make({ root: fixture, selectors: ['P-01'], gitBase: 'refs/heads/develop' });
    assert.deepEqual(checkBundle(bound, { root: fixture, now }), []);
    git('update-ref', 'refs/codex/turn-diffs/checkpoint', 'HEAD');
    assert.deepEqual(checkBundle(bound, { root: fixture, now }), []);
    const withoutInternal = inspectGit(fixture, 'refs/heads/develop');
    assert.ok(!withoutInternal.ref_state.includes('refs/codex/'));
    git('tag', 'fixture-tag');
    assert.ok(checkBundle(bound, { root: fixture, now }).includes('Git snapshot changed'));
    git('tag', '-d', 'fixture-tag');
    git('branch', 'fix/new-ref');
    assert.ok(checkBundle(bound, { root: fixture, now }).includes('Git snapshot changed'));
  } finally { removeFixture(fixture); }
});

test('file changes and removals invalidate records; no root cannot claim freshness', () => {
  const privateRoot = mkdtempSync(join(tmpdir(), 'assurance-drift-'));
  try {
    writeFileSync(join(privateRoot, 'app.js'), 'one');
    const bundle = make({ root: privateRoot });
    assert.deepEqual(checkBundle(bundle, { root: privateRoot, now }), []);
    writeFileSync(join(privateRoot, 'app.js'), 'two');
    assert.ok(checkBundle(bundle, { root: privateRoot, now }).includes('Source snapshot changed'));
    rmSync(join(privateRoot, 'app.js'));
    assert.ok(checkBundle(bundle, { root: privateRoot, now }).length);
    assert.ok(checkBundle(make(), { now }).length);
  } finally { removeFixture(privateRoot); }
});
test('path traversal, absolute paths, ambiguous paths and oversized inputs fail closed', () => {
  for (const name of ['../app.js', '/app.js', 'C:/app.js', 'dir/../../app.js', './app.js', 'dir\\app.js', 'app.js\n']) assert.throws(() => snapshot(root, [name]));
  assert.throws(() => snapshot(root, ['app.js', 'app.js']));
  assert.throws(() => snapshot(root, []));
  writeFileSync(join(root, 'large'), Buffer.alloc(10 * 1024 * 1024 + 1));
  assert.throws(() => snapshot(root, ['large']));
});
test('directory junctions cannot escape scoped root', t => {
  const other = mkdtempSync(join(tmpdir(), 'assurance-external-'));
  try {
    writeFileSync(join(other, 'file'), 'external');
    try { symlinkSync(other, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) {
      if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('Host denies fixture symlink creation; junction boundary not exercised.'); return; }
      throw error;
    }
    assert.throws(() => snapshot(root, ['linked/file']));
  } finally { rmSync(join(root, 'linked'), { force: true }); removeFixture(other); }
});
test('malformed bundles fail as records, not uncaught exceptions', () => {
  for (const value of [null, [], {}, { manifest: null, report: {} }, { manifest: make().manifest, report: [] }]) assert.ok(errors(value).length);
  assert.equal(validTime('2026-02-30T12:00:00Z'), false);
  assert.equal(validTime('2026-11-07T24:00:00Z'), false);
  assert.ok(manifestErrors({}).length);
});
test('CLI round trip, rejected input, and source unchanged', () => {
  const cli = (...args) => spawnSync(process.execPath, ['bin/assurance.mjs', ...args], { cwd: packageRoot, encoding: 'utf8' });
  assert.equal(cli('catalog').status, 0);
  const created = cli('plan', '--root', root, '--files', 'app.js', '--select', 'C', '--project', 'fixture', '--authorization', 'fixture');
  assert.equal(created.status, 0, created.stderr);
  const bundle = JSON.parse(created.stdout);
  assert.equal(bundle.report.controls.length, 8);
  const input = join(root, 'bundle.json'); writeFileSync(input, created.stdout);
  assert.equal(cli('check', '--input', input, '--root', root).status, 0);
  const summary = cli('summarize', '--input', input, '--root', root);
  assert.equal(JSON.parse(summary.stdout).dispositions.not_assessed, 8);
  const readable = cli('report', '--input', input, '--root', root);
  assert.equal(readable.status, 0); assert.ok(readable.stdout.includes('8 not\\_assessed'));
  const appendix = cli('report', '--input', input, '--root', root, '--controls', 'C-02,C-03');
  assert.equal(appendix.status, 0); assert.ok(appendix.stdout.includes('Selected control review'));
  assert.ok(appendix.stdout.includes('### C-02')); assert.ok(!appendix.stdout.includes('### C-01'));
  assert.equal(cli('report', '--input', input, '--root', root, '--controls', 'B-01').status, 2);
  assert.equal(cli('verify', '--input', input, '--root', root, '--target', 'source', '--manifest-hash', hash(bundle.manifest)).status, 1);
  assert.equal(cli('verify', '--input', input, '--root', root, '--target', 'source').status, 2);
  bundle.report.gate_recommendation = 'eligible_for_owner_review'; writeFileSync(input, JSON.stringify(bundle));
  assert.equal(cli('check', '--input', input, '--root', root).status, 1);
  writeFileSync(input, '{malformed');
  const malformed = cli('check', '--input', input, '--root', root);
  assert.equal(malformed.status, 2); assert.ok(!malformed.stderr.includes('{malformed'));
  assert.equal(cli('plan', '--root', root, '--root', root).status, 2);
  assert.equal(cli('list', '--select', 'unknown').status, 2);
  assert.equal(readFileSync(join(root, 'app.js'), 'utf8'), 'export const value = 1;\n');
});

test('readable reports expose actionable candidates while escaping Markdown and HTML', () => {
  const bundle = make();
  const proof = pass().report.evidence[0];
  bundle.report.evidence = [proof]; bundle.report.findings = [finding('PILOT-F01', 'candidate')];
  Object.assign(bundle.report.controls[0], { status: 'candidate_gap', evidence_ids: ['proof'], finding_ids: ['PILOT-F01'] });
  bundle.report.findings[0].title = 'Replay conflict <img src=x>';
  bundle.report.findings[0].claim = 'Two migrations create the same relation.';
  assert.deepEqual(errors(bundle), []);
  const rendered = renderReport(bundle, []);
  assert.ok(rendered.includes('Two migrations create the same relation.'));
  assert.ok(rendered.includes('Next validation:'));
  assert.ok(rendered.includes('Preconditions:')); assert.ok(rendered.includes('Severity basis:')); assert.ok(rendered.includes('Confidence basis:'));
  assert.ok(rendered.includes('not defects in the assurance harness'));
  assert.ok(rendered.includes('candidate'));
  assert.ok(!rendered.includes('<img'));
  assert.ok(rendered.includes('needs\\_validation'));
  const malformed = renderReport({ manifest: bundle.manifest, report: null }, ['Malformed report']);
  assert.ok(malformed.includes('blocked')); assert.ok(!malformed.includes('Replay conflict'));
});

test('harness drills keep the return to controls explicit and incomplete until findings are mapped', () => {
  const bundle = make({ purpose: 'harness-drill' }), r = bundle.report;
  assert.deepEqual(errors(bundle), []);
  assert.equal(summarize(bundle, []).harness_feedback_complete, false);
  assert.ok(renderReport(bundle, []).includes('primary drill deliverable is outstanding'));
  r.evidence = copy(pass().report.evidence);
  r.findings = [finding('PILOT', 'candidate')];
  r.controls[0].status = 'candidate_gap'; r.controls[0].finding_ids = ['PILOT']; r.controls[0].evidence_ids = ['proof'];
  assert.deepEqual(errors(bundle), []);
  assert.deepEqual(summarize(bundle, []).findings_without_harness_feedback, ['PILOT']);
  r.harness_feedback = [{ id: 'HF01', finding_ids: ['PILOT'], control_ids: ['A-01'], category: 'weak_method',
    observation: 'Synthetic drill exposed a missing scenario.', recommendation: 'Strengthen the harness method <script>fixture</script>.', validation_plan: 'Synthetic regression fixture; no consumer changes.' }];
  assert.deepEqual(errors(bundle), []);
  const summary = summarize(bundle, []);
  assert.equal(summary.harness_feedback_complete, true); assert.equal(summary.assessment_complete, false);
  assert.deepEqual(summary.finding_counts, { candidate_gaps: 1, evidence_requests: 0 });
  const rendered = renderReport(bundle, []);
  assert.ok(rendered.includes('Harness recommendation:')); assert.ok(!rendered.includes('<script>'));
  r.harness_feedback[0].finding_ids = ['MISSING'];
  assert.ok(errors(bundle).includes('Harness feedback outside frozen scope'));
  r.harness_feedback[0].finding_ids = ['PILOT']; r.harness_feedback.push(copy(r.harness_feedback[0]));
  assert.ok(errors(bundle).includes('Duplicate harness feedback IDs'));
  r.harness_feedback.pop(); bundle.manifest.purpose = 'project-assessment'; r.manifest_hash = hash(bundle.manifest);
  assert.ok(errors(bundle).includes('Harness feedback requires an explicitly scoped drill'));
  assert.throws(() => make({ purpose: 'harness-drill', mode: 'validation' }));
  assert.throws(() => make({ purpose: 'invented-mode' }));
});

test('CLI completion check, file lists and Windows PowerShell encoding work end to end', () => {
  const cli = (...args) => spawnSync(process.execPath, ['bin/assurance.mjs', ...args], { cwd: packageRoot, encoding: 'utf8' });
  const fixture = mkdtempSync(join(tmpdir(), 'assurance-cli-'));
  try {
    writeFileSync(join(fixture, 'app.js'), 'export const value = 1;\n');
    writeFileSync(join(fixture, 'a,b.txt'), 'comma name');
    const filesPath = join(fixture, 'files.json'); writeFileSync(filesPath, JSON.stringify(['app.js', 'a,b.txt']));
    const created = cli('plan', '--root', fixture, '--files-from', filesPath, '--select', 'A-01', '--project', 'fixture', '--authorization', 'fixture', '--purpose', 'harness-drill');
    assert.equal(created.status, 0, created.stderr); assert.equal(JSON.parse(created.stdout).manifest.snapshot.files.length, 2);
    assert.equal(JSON.parse(created.stdout).manifest.purpose, 'harness-drill');
    assert.equal(cli('fingerprint', '--root', fixture, '--files-from', filesPath).status, 0);
    const bundle = pass();
    const scoped = snapshot(fixture, ['app.js']); bundle.manifest.snapshot = scoped; bundle.report.snapshot.repository = scoped.root;
    bundle.report.evidence[0].snapshot = scoped.digest;
    const actualNow = new Date(); const stamp = actualNow.toISOString();
    bundle.manifest.created_at = stamp; bundle.report.run.started_at = stamp; bundle.report.run.completed_at = stamp;
    bundle.report.controls[0].assessed_at = stamp; bundle.report.controls[0].valid_until = new Date(+actualNow + 86400000).toISOString();
    bundle.report.evidence[0].captured_at = stamp; bundle.report.validation_checks[0].executed_at = stamp;
    bundle.report.manifest_hash = hash(bundle.manifest);
    const input = join(fixture, 'validation.json');
    writeFileSync(input, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(JSON.stringify(bundle), 'utf16le')]));
    assert.equal(cli('verify', '--input', input, '--root', fixture, '--target', 'source', '--manifest-hash', hash(bundle.manifest)).status, 0);
    assert.equal(cli('verify', '--input', input, '--root', fixture, '--target', 'runtime', '--manifest-hash', hash(bundle.manifest)).status, 1);
    const malformed = { manifest: bundle.manifest, report: { ...bundle.report, controls: [null] } };
    writeFileSync(input, JSON.stringify(malformed));
    const summary = cli('summarize', '--input', input, '--root', fixture);
    assert.equal(summary.status, 1); assert.equal(JSON.parse(summary.stdout).assessment_complete, false);
  } finally { removeFixture(fixture); }
});
