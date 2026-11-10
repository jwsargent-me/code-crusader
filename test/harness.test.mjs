import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, symlinkSync, rmSync, cpSync, readdirSync, existsSync, linkSync, copyFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute, basename, delimiter } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { catalog, catalogSource, catalogSchema, sets, manifestSchema, reportSchema, resolveCatalog, contractIdentity, hash, select, plan, snapshot, checkBundle, manifestErrors, catalogErrors, applicability, summarize } from '../src/core.mjs';
import { validTime, schemaErrors, shapeErrors } from '../src/shape.mjs';
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
function withEnvironment(entries, run) {
  const normalize = key => process.platform === 'win32' ? key.toUpperCase() : key;
  const names = new Set(Object.keys(entries).map(normalize));
  const saved = Object.entries(process.env).filter(([key]) => names.has(normalize(key)));
  const clear = () => { for (const key of Object.keys(process.env)) if (names.has(normalize(key))) delete process.env[key]; };
  clear(); Object.assign(process.env, entries);
  try { return run(); } finally { clear(); for (const [key, value] of saved) process.env[key] = value; }
}
const make = (options = {}) => plan({ root, paths: ['app.js'], selectors: ['A-01'], projectId: 'synthetic', authorizationRef: 'fixture-only', now: fixed, ...options });
const errors = bundle => checkBundle(bundle, { root, now });
function pass(options = {}) {
  const bundle = make({ mode: 'validation', validityDays: 1, validityPolicyRef: 'fixture-policy', ...options });
  const { report: r, manifest: m } = bundle;
  r.run.assessor = 'fixture-reviewer';
  r.evidence = [{ id: 'proof', type: 'source', locator: 'app.js:1', captured_at: fixed, snapshot: m.snapshot.digest,
    environment: null, summary: 'Synthetic fixture only.', limitations: [], artifact: { path: 'app.js', sha256: m.snapshot.files[0].sha256 } }];
  Object.assign(r.controls[0], { status: 'validated_pass', applicability: 'applicable', evidence_ids: ['proof'],
    remaining_validation: [], valid_until: '2026-11-08T12:00:00.000Z', coverage: {
      positive_check_ids: ['check'], negative_check_ids: [], negative_not_applicable_reason: 'Synthetic ownership inventory has no executable rejection path; reconcile the inventory independently.', exclusion_check_ids: []
    } });
  r.validation_checks = [{ id: 'check', control_ids: m.assigned_control_ids, finding_ids: [], case_kind: 'positive', state: 'executed', executed_at: fixed,
    method: 'Synthetic static fixture', authorization_ref: m.authorization_ref, expected: 'Synthetic requirement', actual: 'Fixture observed',
    result: 'supports_pass', evidence_ids: ['proof'], cleanup: 'not_required' }];
  r.gate_recommendation = 'eligible_for_owner_review';
  return bundle;
}
function finding(id = 'F1', outcome = 'confirmed') {
  return { id, fingerprint: id, prior_finding_ids: [], control_ids: ['A-01'], title: 'Synthetic gap', asset: 'app.js',
    claim: 'Fixture-only claim', impact: 'Fixture-only impact', preconditions: [], evidence_ids: ['proof'], counterevidence: [], uncertainty: [],
    severity: 'low', severity_basis: 'Synthetic', confidence: 'high', confidence_basis: 'Fixture', bucket: 'later_improvement',
    validation_plan: 'Synthetic check', outcome, outcome_rationale: 'Fixture', legal_context: null,
    issue_types: ['defect'], acknowledgement: null, claim_reference: null };
}
function asExclusion(bundle) {
  Object.assign(bundle, pass({ selectors: ['C-01'], features: { authorization: false, multi_tenant: false } }));
  bundle.report.validation_checks[0].case_kind = 'applicability';
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

test('carried findings retain contextual evidence bytes and metadata as well as control evidence', () => {
  const { bundle, original, path } = carryFixture();
  const contextPath = 'acknowledgement-fixture.txt';
  writeFileSync(join(root, contextPath), 'Original documented limitation and completion assertion.');
  const context = { ...copy(original.report.evidence[0]), id: 'context', type: 'configuration', locator: contextPath,
    artifact: { path: contextPath, sha256: hash(readFileSync(join(root, contextPath))) } };
  original.report.evidence.push(context);
  const item = finding('F1', 'candidate');
  Object.assign(item, { issue_types: ['incomplete_work', 'unsupported_claim'], evidence_ids: ['proof', 'context'],
    acknowledgement: { summary: 'Original documented limitation.', evidence_ids: ['context'] },
    claim_reference: { assertion: 'Complete', scope: 'Fixture release', evidence_ids: ['context'] } });
  original.report.findings = [item]; original.report.controls[0].finding_ids = ['F1'];
  writeFileSync(join(root, path), JSON.stringify(original));
  bundle.report.findings = copy(original.report.findings);
  bundle.report.controls[0] = { ...copy(original.report.controls[0]), prior_assessment: { report_evidence_id: 'prior' } };
  bundle.report.evidence.push(copy(context));
  bundle.report.evidence.find(e => e.id === 'prior').artifact.sha256 = hash(readFileSync(join(root, path)));
  assert.deepEqual(checkBundle(bundle, { root, evidenceRoot: root, now }), [], 'Unchanged acknowledgment and claim evidence can carry');
  for (const collection of ['evidence', 'findings']) {
    const ambiguous = copy(original);
    ambiguous.report[collection].push(copy(ambiguous.report[collection].find(e => e.id === (collection === 'evidence' ? 'context' : 'F1'))));
    writeFileSync(join(root, path), JSON.stringify(ambiguous));
    const changed = copy(bundle); changed.report.evidence.find(e => e.id === 'prior').artifact.sha256 = hash(readFileSync(join(root, path)));
    assert.ok(checkBundle(changed, { root, evidenceRoot: root, now }).includes('Invalid research carry-forward evidence or original disposition changed'));
  }
  writeFileSync(join(root, path), JSON.stringify(original));
  const metadata = copy(bundle); metadata.report.evidence.find(e => e.id === 'context').summary = 'Rewritten documentary interpretation';
  assert.ok(checkBundle(metadata, { root, evidenceRoot: root, now }).includes('Invalid research carry-forward evidence or original disposition changed'));
  writeFileSync(join(root, contextPath), 'Replacement document with different acknowledgment/claim facts.');
  bundle.report.evidence.find(e => e.id === 'context').artifact.sha256 = hash(readFileSync(join(root, contextPath)));
  assert.ok(checkBundle(bundle, { root, evidenceRoot: root, now }).includes('Invalid research carry-forward evidence or original disposition changed'));
});

test('assessed research cannot precede direct or finding-linked evidence capture', () => {
  const bundle = make(); bundle.report.evidence = copy(pass().report.evidence);
  Object.assign(bundle.report.controls[0], { status: 'needs_evidence', evidence_ids: ['proof'] });
  bundle.report.run.completed_at = '2026-11-07T12:01:00.000Z';
  bundle.report.evidence[0].captured_at = '2026-11-07T12:00:30.000Z';
  assert.ok(errors(bundle).includes('Control assessed before supporting evidence capture'));
  bundle.report.evidence[0].captured_at = '2026-11-07T11:59:00.000Z';
  assert.deepEqual(errors(bundle), [], 'Earlier source documents remain usable');
  const draft = copy(bundle); draft.report.controls[0].status = 'not_assessed';
  draft.report.evidence[0].captured_at = '2026-11-07T12:00:30.000Z';
  assert.deepEqual(errors(draft), [], 'A draft need not claim its final assessment timestamp');
  const linked = copy(bundle); linked.report.findings = [finding('F1', 'candidate')];
  linked.report.controls[0].status = 'candidate_gap'; linked.report.controls[0].finding_ids = ['F1'];
  linked.report.evidence.push({ ...copy(linked.report.evidence[0]), id: 'later', captured_at: '2026-11-07T12:00:30.000Z' });
  linked.report.findings[0].evidence_ids = ['later'];
  assert.ok(errors(linked).includes('Control assessed before supporting evidence capture'));
  const carried = carryFixture();
  assert.ok(Date.parse(carried.bundle.report.evidence.find(e => e.id === 'prior').captured_at) > Date.parse(carried.bundle.report.controls[0].assessed_at));
  assert.deepEqual(checkBundle(carried.bundle, { root, evidenceRoot: root, now }), [], 'Later provenance capture is not original substantive evidence');
});

test('schema inspection rejects unsupported or malformed keyword values before validation', () => {
  const invalid = [false, true, null, [], { items: false }, { items: true }, { if: false }, { then: false }, { else: true },
    { type: 'array', items: false }, { if: { const: 1 }, then: { items: false }, else: { type: 'string' } },
    { type: 'integer' }, { type: [] }, { type: ['string', false] }, { required: false }, { required: ['x', 1] },
    { properties: [] }, { $defs: null }, { allOf: {} }, { allOf: [] }, { enum: false }, { enum: [] },
    { minimum: 'invalid' }, { maximum: null }, { minItems: -1 }, { maxItems: 1.5 }, { minLength: false },
    { uniqueItems: 'false' }, { pattern: '[' }, { pattern: false }, { format: false }, { additionalProperties: 0 },
    { $ref: 42 }, { $ref: '#/toString' }, { const: undefined }, { const: Infinity }, { enum: [undefined] }];
  for (const rule of invalid) {
    assert.doesNotThrow(() => schemaErrors(rule));
    assert.ok(schemaErrors(rule).length, JSON.stringify(rule));
    for (const value of [[], [1], {}, { x: 1 }, 'accepted', -100]) {
      let result; assert.doesNotThrow(() => { result = shapeErrors(value, rule); });
      assert.ok(result.length, JSON.stringify(rule));
    }
  }
  const recursive = { $defs: { loop: { $ref: '#/$defs/loop' } } };
  assert.ok(schemaErrors(recursive).includes('Recursive bundled schema unsupported'));
  assert.ok(shapeErrors({}, recursive).length);
});

test('supported schema Boolean values and object subschemas retain their semantics', () => {
  assert.deepEqual(shapeErrors(false, { const: false }), []);
  assert.ok(shapeErrors(true, { const: false }).length);
  assert.deepEqual(shapeErrors(false, { enum: [false, true, null] }), []);
  assert.deepEqual(shapeErrors([1, 1], { type: 'array', uniqueItems: false, minItems: 0 }), []);
  assert.deepEqual(shapeErrors('', { type: 'string', minLength: 0, pattern: '' }), []);
  assert.deepEqual(shapeErrors({ extra: 1 }, { type: 'object', required: [], additionalProperties: true }), []);
  assert.ok(shapeErrors({ extra: 1 }, { type: 'object', additionalProperties: false }).length);
  assert.deepEqual(shapeErrors(['x'], { type: 'array', items: { type: 'string' } }), []);
  assert.ok(shapeErrors([1], { type: 'array', items: { type: 'string' } }).length);
  const rule = { $defs: { 'a/b': { type: 'string' } }, type: 'object', properties: { x: { $ref: '#/$defs/a~1b' } } };
  assert.deepEqual(shapeErrors({ x: 'text' }, rule), []);
  assert.ok(shapeErrors({ x: 1 }, rule).length);
  assert.deepEqual(shapeErrors({ b: 2, a: 1 }, { const: { a: 1, b: 2 } }), []);
  assert.deepEqual(shapeErrors({ b: 2, a: 1 }, { enum: [{ a: 1, b: 2 }] }), []);
  assert.ok(shapeErrors([{ a: 1, b: 2 }, { b: 2, a: 1 }], { type: 'array', uniqueItems: true }).length);
  assert.ok(shapeErrors({ a: Infinity }, { const: { a: null } }).length);
  assert.ok(schemaErrors({ enum: new Array(1) }).length);
});

test('security selection covers payment and non-payment event authenticity independently', () => {
  const selected = select(['application-security']);
  assert.ok(selected.includes('K-02')); assert.ok(selected.includes('S-01'));
  const bundle = pass({ selectors: ['K-02'], features: { payments: true, payment_events: true, inbound_events: false } });
  const control = bundle.report.controls[0];
  control.coverage.negative_not_applicable_reason = null; control.coverage.negative_check_ids = ['forged'];
  bundle.report.validation_checks.push({ ...copy(bundle.report.validation_checks[0]), id: 'forged', case_kind: 'negative',
    method: 'Synthetic forged-delivery observation', expected: 'No state change or consumer call', actual: 'No state change or consumer call' });
  bundle.report.validation_checks.push({ ...copy(bundle.report.validation_checks[0]), id: 'retry',
    method: 'Synthetic legitimate-retry observation', expected: 'Acknowledged without another business effect', actual: 'Acknowledged without another business effect' });
  control.coverage.positive_check_ids.push('retry');
  assert.deepEqual(errors(bundle), [], 'Checks validate record structure, not a real payment implementation');
  const missing = copy(bundle); missing.report.validation_checks.find(c => c.id === 'forged').result = 'inconclusive';
  assert.ok(errors(missing).some(e => /unsupported|unresolved/.test(e)));
  const failure = copy(bundle); failure.report.validation_checks.find(c => c.id === 'forged').result = 'supports_gap';
  assert.ok(errors(failure).some(e => /contradict|unsupported/.test(e)));
  const noNegative = copy(bundle); noNegative.report.controls[0].coverage.negative_check_ids = [];
  noNegative.report.controls[0].coverage.negative_not_applicable_reason = 'A synthetic inventory is not a replacement for the forged-delivery case.';
  assert.ok(errors(noNegative).includes('This control requires an executed negative case; an exemption cannot replace it'));
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
  'changed resolver engine': ({ original }) => { original.manifest.engine_hash = 'a'.repeat(64); original.report.manifest_hash = hash(original.manifest); },
  'unresolved carry chains': ({ original }) => { original.report.controls[0].prior_assessment = { report_evidence_id: 'older' }; }
})) test('rejects ' + name, () => {
  const fixture = carryFixture(); mutate(fixture);
  writeFileSync(join(root, fixture.path), JSON.stringify(fixture.original));
  fixture.bundle.report.evidence.find(item => item.id === 'prior').artifact.sha256 = hash(readFileSync(join(root, fixture.path)));
  assert.ok(checkBundle(fixture.bundle, { root, evidenceRoot: root, now }).length);
});
test('schema formats require an explicit reviewed structural fingerprint', () => {
  const pins = {
    record: { version: '4.0', hash: 'd39a8ad3d24c67690e910c250ea3011a577273a7d112950ec2f2961557638534' },
    catalog: { version: '1.0', hash: '139d5f81b45aef9cf12cb05d99764804f91fd58359a3ce3135f3d84e2ca1a304' }
  };
  assert.equal(schemaVersionFromSchemas(), pins.record.version);
  assert.equal(hash({ manifestSchema, reportSchema }), pins.record.hash, 'Review a record-format change and update its version/pin deliberately');
  assert.equal(catalogSource.format_version, pins.catalog.version);
  assert.equal(hash(catalogSchema), pins.catalog.hash, 'Review a catalog-structure change and update its version/pin deliberately');
});

test('fingerprinting a broad scope never implies reviewer inspection or execution', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'assurance-inspection-'));
  try {
    const paths = Array.from({ length: 215 }, (_, i) => 'file-' + String(i).padStart(3, '0') + '.js');
    for (const name of paths) writeFileSync(join(fixture, name), 'export const fixture = true;\n');
    const bundle = plan({ root: fixture, paths, selectors: ['A-01'], projectId: 'fixture', authorizationRef: 'fixture-only', now: fixed });
    const before = hash(bundle.manifest), issues = checkBundle(bundle, { root: fixture, now });
    assert.deepEqual(issues, []);
    const coverage = summarize(bundle, issues).inspection_coverage;
    assert.equal(coverage.fingerprinted_files, 215);
    assert.equal(coverage.uninspected_files, 215); assert.equal(coverage.execution_linked_files, 0);
    assert.equal(coverage.whole_file_inspections, 0); assert.equal(coverage.partial_file_inspections, 0);
    assert.ok(coverage.files.every(file => file.inspection === 'not_inspected' && file.execution_links.length === 0));
    bundle.report.run.assessor = 'fixture-reviewer';
    bundle.report.inspection_coverage = [{ path: paths[0], inspection: 'whole', inspection_notes: null, execution_links: [] }];
    assert.deepEqual(checkBundle(bundle, { root: fixture, now }), []);
    assert.equal(hash(bundle.manifest), before, 'Inspection updates do not alter frozen scope');
    assert.equal(summarize(bundle, []).assessment_complete, false, 'Reading a file is not validation credit');
    const report = renderReport(bundle, []);
    assert.ok(report.includes('215 fingerprinted; 1 whole-file inspections declared; 0 partial inspections declared; 214 uninspected'));
    assert.ok(report.includes('0 files linked to executed checks'));
  } finally { removeFixture(fixture); }
});

test('whole, partial and execution-linked coverage are independent declarations', () => {
  writeFileSync(join(root, 'partial.js'), 'export function validate(value) { return value; }\n');
  writeFileSync(join(root, 'unread.js'), 'export const helper = true;\n');
  const bundle = pass({ paths: ['app.js', 'partial.js', 'unread.js'] }), original = hash(bundle.manifest);
  bundle.report.inspection_coverage = [
    { path: 'app.js', inspection: 'whole', inspection_notes: null, execution_links: [{ check_id: 'check', behavior: 'Synthetic inventory assertion only; not every branch.' }] },
    { path: 'partial.js', inspection: 'partial', inspection_notes: 'Only validate(value); other behavior remains uninspected.', execution_links: [] },
    { path: 'unread.js', inspection: 'not_inspected', inspection_notes: null, execution_links: [{ check_id: 'check', behavior: 'Declared helper interaction in the synthetic check; source not inspected.' }] }
  ];
  assert.deepEqual(errors(bundle), []);
  const coverage = summarize(bundle, []).inspection_coverage;
  assert.equal(coverage.fingerprinted_files, 3); assert.equal(coverage.whole_file_inspections, 1);
  assert.equal(coverage.partial_file_inspections, 1); assert.equal(coverage.uninspected_files, 1);
  assert.equal(coverage.execution_linked_files, 2); assert.equal(coverage.files_without_execution_links, 1);
  assert.equal(coverage.files.find(file => file.path === 'unread.js').inspection, 'not_inspected');
  assert.deepEqual(coverage.files.map(file => file.sha256), bundle.manifest.snapshot.files.map(file => file.sha256));
  assert.equal(hash(bundle.manifest), original);
  assert.equal(summarize(bundle, []).assessment_complete, true, 'Coverage reporting adds no unrelated all-files-read gate');
});

test('coverage rejects invented scope, unsupported execution links and unqualified partial reads', () => {
  const makeCoverage = () => {
    const bundle = pass();
    bundle.report.inspection_coverage = [{ path: 'app.js', inspection: 'whole', inspection_notes: null, execution_links: [{ check_id: 'check', behavior: 'Synthetic scoped behavior' }] }];
    return bundle;
  };
  for (const [name, mutate, expected] of [
    ['unscoped file', b => { b.report.inspection_coverage[0].path = '../outside.js'; }, 'File inspection outside frozen scope'],
    ['duplicate file', b => { b.report.inspection_coverage.push(copy(b.report.inspection_coverage[0])); }, 'Duplicate file inspection declaration'],
    ['unknown check', b => { b.report.inspection_coverage[0].execution_links[0].check_id = 'unknown'; }, 'File execution link requires an executed artifact-backed check'],
    ['duplicate check', b => { b.report.inspection_coverage[0].execution_links.push(copy(b.report.inspection_coverage[0].execution_links[0])); }, 'Duplicate file execution link'],
    ['planned check', b => { Object.assign(b.report.validation_checks[0], { state: 'planned', executed_at: null, result: 'inconclusive', actual: 'Not run' }); }, 'File execution link requires an executed artifact-backed check'],
    ['missing proof', b => { b.report.validation_checks[0].evidence_ids = []; }, 'File execution link requires an executed artifact-backed check']
  ]) {
    const bundle = makeCoverage(); mutate(bundle);
    assert.ok(errors(bundle).includes(expected), name);
    assert.equal(summarize(bundle, errors(bundle)).assessment_complete, false, name);
  }
  for (const notes of [null, '', '   ']) {
    const bundle = makeCoverage(); Object.assign(bundle.report.inspection_coverage[0], { inspection: 'partial', inspection_notes: notes });
    assert.ok(errors(bundle).length);
  }
  const invented = makeCoverage(); invented.report.inspection_coverage[0].whole_file_tested = true;
  assert.ok(errors(invented).length, 'A file association cannot declare universal test coverage');
  const old = pass(); delete old.report.inspection_coverage;
  assert.ok(errors(old).length, 'Old records must be replanned instead of receiving invented coverage');
});

test('execution-linked files do not turn failed or inconclusive checks into passes', () => {
  for (const result of ['supports_gap', 'inconclusive']) {
    const bundle = pass(); bundle.report.validation_checks[0].result = result;
    bundle.report.inspection_coverage = [{ path: 'app.js', inspection: 'partial', inspection_notes: 'Only the asserted boundary was inspected.', execution_links: [{ check_id: 'check', behavior: 'The specific synthetic boundary, with unresolved or failed outcome.' }] }];
    const issues = errors(bundle), summary = summarize(bundle, issues);
    assert.ok(issues.length); assert.equal(summary.inspection_coverage.execution_linked_files, 1);
    assert.equal(summary.assessment_complete, false);
    assert.ok(renderReport(bundle, issues).includes(result.replaceAll('_', '\\_')));
  }
});

function schemaVersionFromSchemas() {
  assert.equal(manifestSchema.properties.schema_version.const, reportSchema.properties.schema_version.const);
  return manifestSchema.properties.schema_version.const;
}

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

test('security selection includes resource exposure, containment and financial continuity', () => {
  const selected = select(['application-security']);
  for (const id of ['A-02', 'A-07', 'B-04', 'B-05', 'D-01', 'F-01', 'F-08', 'L-07', 'O-01', 'O-04', 'O-05', 'R-06']) {
    assert.ok(selected.includes(id), 'Security review must include ' + id);
  }
  assert.equal(selected.length, new Set(selected).size);
  const quality = select(['application-quality']);
  assert.ok(quality.includes('R-06'), 'Shared budget coverage must remain in quality');
  assert.ok(select(['A']).includes('A-07'));
  assert.ok(select(['O']).includes('O-04'));
  assert.ok(select(['L']).includes('L-07'));
});

test('overlapping security and quality selections freeze each control once and exclusions apply to the union', () => {
  const security = select(['application-security']), quality = select(['application-quality']);
  const expected = catalog.controls.map(c => c.id).filter(id => security.includes(id) || quality.includes(id));
  assert.deepEqual(select(['application-quality', 'application-security', 'R-06', 'O-04']), expected);
  assert.deepEqual(select(['application-security', 'application-quality'], ['R-06']), expected.filter(id => id !== 'R-06'));
  const bundle = make({ selectors: ['application-security', 'application-quality', 'R-06'], exclusions: ['G'] });
  assert.deepEqual(bundle.manifest.assigned_control_ids, expected.filter(id => !id.startsWith('G-')));
  assert.deepEqual(bundle.report.controls.map(c => c.control_id), bundle.manifest.assigned_control_ids);
  assert.equal(bundle.report.controls.filter(c => c.control_id === 'R-06').length, 1);
  assert.deepEqual(errors(bundle), []);
  assert.equal(summarize(bundle, []).assessment_complete, false, 'A larger selection creates no assessment credit');
  const tampered = copy(bundle);
  tampered.manifest.assigned_control_ids = tampered.manifest.assigned_control_ids.filter(id => id !== 'O-04');
  tampered.report.manifest_hash = hash(tampered.manifest);
  assert.ok(errors(tampered).includes('Frozen selection mismatch'), 'Cannot silently drop containment from an approved selection');
});

test('intentional anonymous access can retain resource controls without an authentication requirement', () => {
  const bundle = pass({ selectors: ['F-08'], features: { http: true, identity: false, sessions: false, account_enrollment: false } });
  const control = bundle.report.controls[0];
  Object.assign(bundle.report.validation_checks[0], {
    method: 'Synthetic record of a permitted anonymous cache read within its resource budget',
    expected: 'Allowed read and bounded downstream work', actual: 'Fixture declaration only; not an application security test'
  });
  control.coverage.negative_not_applicable_reason = null;
  control.coverage.negative_check_ids = ['over-budget'];
  bundle.report.validation_checks.push({ ...copy(bundle.report.validation_checks[0]), id: 'over-budget', case_kind: 'negative',
    method: 'Synthetic record of concurrent over-budget anonymous and alternate-ingress requests',
    expected: 'Bounded rejected work and another principal retains its declared budget', actual: 'Fixture declaration only; not an application security test' });
  assert.deepEqual(errors(bundle), [], 'The record contract must not mandate sign-in or a gateway');
  const missing = copy(bundle); missing.report.validation_checks.pop();
  missing.report.controls[0].coverage.negative_check_ids = [];
  missing.report.controls[0].coverage.negative_not_applicable_reason = 'Data isolation policy is configured';
  assert.ok(errors(missing).includes('This control requires an executed negative case; an exemption cannot replace it'));
  const failed = copy(bundle); failed.report.validation_checks[1].result = 'supports_gap';
  assert.ok(errors(failed).length);
  assert.equal(summarize(failed, errors(failed)).assessment_complete, false);
  const unknown = copy(bundle); unknown.report.validation_checks[1].state = 'planned';
  unknown.report.validation_checks[1].result = 'inconclusive'; unknown.report.validation_checks[1].executed_at = null;
  assert.ok(errors(unknown).length, 'A planned abuse check cannot substitute for execution');
});

for (const [name, mutate] of Object.entries({
  'duplicate control ID': data => data.controls.push(copy(data.controls[0])),
  'unknown module': data => { data.controls[0].module_id = 'MISSING'; },
  'unknown feature': data => { data.controls[0].applicability.any_of = ['missing-feature']; },
  'missing research method': data => { delete data.controls[0].research; },
  'missing validation': data => { delete data.controls[0].validation; },
  'missing negative-case policy': data => { delete data.controls[0].validation.negative_case_required; },
  'unknown guidance reference': data => { data.controls[0].reference_ids = ['missing-reference']; },
  'inherited freshness policy': data => { data.controls[0].freshness = { policy_ref: '__proto__' }; },
  'unsafe default pass': data => { data.control_defaults.failure_significance.default_gate = 'eligible_for_owner_review'; },
  'misspelled control field': data => { data.controls[0].validaton = copy(data.controls[0].validation); },
  'duplicated module membership': data => { data.modules[0].control_ids = ['A-01']; },
  'malformed control': data => { data.controls[0] = null; },
  'invalid catalog version': data => { data.catalog_version = ''; },
  'non-semver catalog label': data => { data.catalog_version = 'latest'; },
  'non-semver set label': (_data, groups) => { groups.version = 'latest'; },
  'dangling set selector': (_data, groups) => { groups.sets.extra = ['MISSING']; },
  'catalog-coupled sets': (data, groups) => { groups.catalog_version = data.catalog_version; }
})) test('catalog authoring rejects ' + name, () => {
  const definition = copy(catalogSource), groups = copy(sets);
  mutate(definition, groups);
  let result;
  assert.doesNotThrow(() => { result = catalogErrors(definition, groups); });
  assert.ok(result.length, name);
});

test('new modules and all-set coverage are derived from catalog data', () => {
  const definition = copy(catalogSource);
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
    r.validation_checks = [{ id: 'check', control_ids: [control.id], finding_ids: [], case_kind: 'positive', state: 'executed', executed_at: at,
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
    writeFileSync(dataPath, '\uFEFF' + readFileSync(dataPath, 'utf8'));
    assert.equal(JSON.parse(run(['catalog'])).controls, definition.controls.length, 'Windows UTF-8 BOM does not change contract loading');
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
  bundle.report.validation_checks.push({ ...copy(bundle.report.validation_checks[0]), id: 'negative', case_kind: 'negative', expected: 'Denied case is rejected', actual: 'Denied case rejected' });
  bundle.report.controls[0].coverage.negative_check_ids = ['negative'];
  assert.deepEqual(errors(bundle), []);
});
test('security boundary controls cannot replace required negative cases with prose', () => {
  const bundle = pass();
  const scoped = make({ mode: 'validation', selectors: ['C-02'], features: { authorization: true, owned_resources: true }, validityDays: 1, validityPolicyRef: 'fixture-policy' });
  bundle.manifest = scoped.manifest;
  Object.assign(bundle.report, { manifest_hash: hash(scoped.manifest), snapshot: scoped.report.snapshot, assigned_control_ids: ['C-02'] });
  bundle.report.run.id = scoped.manifest.id;
  bundle.report.controls[0].control_id = 'C-02'; bundle.report.validation_checks[0].control_ids = ['C-02'];
  assert.ok(errors(bundle).some(error => error.includes('requires an executed negative case')));
  bundle.report.validation_checks.push({ ...copy(bundle.report.validation_checks[0]), id: 'denied', case_kind: 'negative', method: 'Synthetic denial fixture', expected: 'Unauthorized access rejected', actual: 'Unauthorized access rejected' });
  bundle.report.controls[0].coverage.negative_check_ids = ['denied']; bundle.report.controls[0].coverage.negative_not_applicable_reason = null;
  assert.deepEqual(errors(bundle), []);
});

test('exclusions cannot override true or unknown frozen applicability', () => {
  for (const [id, features] of [['A-01', {}], ['B-01', { identity: true }], ['C-01', {}]]) {
    const bundle = pass({ selectors: [id], features });
    Object.assign(bundle.report.controls[0], { status: 'not_applicable', applicability: 'not_applicable', valid_until: null,
      coverage: { positive_check_ids: [], negative_check_ids: [], negative_not_applicable_reason: null, exclusion_check_ids: ['check'] } });
    bundle.report.validation_checks[0].case_kind = 'applicability';
    assert.ok(errors(bundle).includes('Exclusion contradicts frozen applicability or leaves it unknown'), id);
  }
  const valid = pass(); asExclusion(valid);
  assert.deepEqual(errors(valid), []);
});

test('negative coverage rejects role relabeling and duplicate descriptions', () => {
  const bundle = pass({ selectors: ['C-02'], features: { authorization: true, owned_resources: true } });
  const control = bundle.report.controls[0];
  control.coverage.negative_not_applicable_reason = null;
  control.coverage.negative_check_ids = ['negative'];
  bundle.report.validation_checks.push({ ...copy(bundle.report.validation_checks[0]), id: 'negative' });
  assert.ok(errors(bundle).includes('Coverage requires a declared negative case'));
  bundle.report.validation_checks[1].case_kind = 'negative';
  assert.ok(errors(bundle).includes('Positive and negative cases repeat the same described check'));
  bundle.report.validation_checks[1].method = 'Exercise the denied principal instead of the allowed principal';
  assert.deepEqual(errors(bundle), [], 'Invariant expectations may match when the described cases genuinely differ');
});

test('conditional controls permit evidenced exclusions without weakening frozen facts', () => {
  const changed = ['G-02', 'G-05', 'G-06', 'G-07', 'G-08', 'O-02', 'O-03', 'P-04', 'P-05', 'P-07', 'R-05', 'S-01', 'S-02'];
  for (const id of changed) {
    const control = catalog.controls.find(item => item.id === id);
    assert.ok(!control.applicability.any_of.includes('all'), id);
    assert.equal(applicability(control, Object.fromEntries(control.applicability.any_of.map(flag => [flag, false]))), 'not_applicable');
    assert.equal(applicability(control, {}), 'unknown');
    assert.equal(applicability(control, { [control.applicability.any_of[0]]: true }), 'applicable');
  }
  const bundle = pass({ selectors: ['S-01'], features: { inbound_events: false } });
  Object.assign(bundle.report.controls[0], { status: 'not_applicable', applicability: 'not_applicable', valid_until: null,
    rationale: 'Synthetic inventory establishes no non-payment inbound events in scope.',
    coverage: { positive_check_ids: [], negative_check_ids: [], negative_not_applicable_reason: null, exclusion_check_ids: ['check'] } });
  bundle.report.validation_checks[0].case_kind = 'applicability';
  assert.deepEqual(errors(bundle), []);
  const unsupported = copy(bundle); unsupported.report.evidence = [];
  assert.ok(errors(unsupported).length, 'A false flag alone is insufficient');
  for (const value of [true, null]) {
    const contradiction = copy(bundle); contradiction.manifest.features.inbound_events = value;
    contradiction.report.manifest_hash = hash(contradiction.manifest);
    assert.ok(errors(contradiction).includes('Exclusion contradicts frozen applicability or leaves it unknown'));
  }
  const vacuous = copy(bundle); vacuous.report.controls[0].status = 'validated_pass';
  vacuous.report.controls[0].applicability = 'applicable';
  vacuous.report.controls[0].valid_until = '2026-11-08T12:00:00.000Z';
  assert.ok(errors(vacuous).includes('Pass has unresolved or contradicted feature applicability'));
  for (const id of ['A-01', 'A-02', 'R-06', 'R-08', 'R-09']) assert.equal(applicability(catalog.controls.find(c => c.id === id), {}), 'applicable');
});

for (const scenario of [
  { name: 'continuous deployment without tagged releases still needs artifact provenance', control: 'G-06', features: { releases: false, deployment: true }, expected: 'applicable',
    artifact: 'deployment.json', content: '{"deployment":"fixture","artifact":"fixture-build","lockfile":"fixture-lock"}' },
  { name: 'unchanged database migration history still needs replay and compatibility review', control: 'R-05', features: { compatibility_changes: false, database: true, stateful: false }, expected: 'applicable',
    artifact: 'applied-migrations.sql', content: '-- Existing history, unchanged by the current diff\nCREATE TABLE fixture (id INTEGER);\n' },
  { name: 'persisted file state still needs compatibility review without a database', control: 'R-05', features: { compatibility_changes: false, database: false, stateful: true }, expected: 'applicable',
    artifact: 'saved-state.json', content: '{"format":1,"fixture":true}' },
  { name: 'versioned interfaces need compatibility review without stored state', control: 'R-05', features: { compatibility_changes: true, database: false, stateful: false }, expected: 'applicable',
    artifact: 'interface.json', content: '{"supported_versions":[1,2],"fixture":true}' },
  { name: 'CI logs need safety review without application runtime logging', control: 'O-02', features: { logging: false, ci: true }, expected: 'applicable',
    artifact: 'build.log', content: 'Synthetic build output: private values must be withheld.\n' },
  { name: 'local tooling output needs safety review without CI', control: 'O-02', features: { logging: true, ci: false }, expected: 'applicable',
    artifact: 'tool-output.log', content: 'Synthetic diagnostic output for reviewer inspection.\n' },
  { name: 'no releases or deployments permits an evidenced release-integrity exclusion', control: 'G-06', features: { releases: false, deployment: false }, expected: 'not_applicable',
    artifact: 'inventory.json', content: '{"releases":[],"deployments":[]}' },
  { name: 'no history, state or versioned interfaces permits an evidenced compatibility exclusion', control: 'R-05', features: { compatibility_changes: false, database: false, stateful: false }, expected: 'not_applicable',
    artifact: 'inventory.json', content: '{"migration_history":[],"persisted_state":[],"versioned_interfaces":[]}' },
  { name: 'no logs, tooling output or CI permits an evidenced log-safety exclusion', control: 'O-02', features: { logging: false, ci: false }, expected: 'not_applicable',
    artifact: 'inventory.json', content: '{"logs":[],"tool_output":[],"ci":[]}' },
  { name: 'an unknown deployment cannot establish release-integrity inapplicability', control: 'G-06', features: { releases: false, deployment: null }, expected: 'unknown',
    artifact: 'inventory.json', content: '{"releases":[],"deployment_evidence":"unavailable"}' }
]) test(scenario.name, () => {
  const fixture = mkdtempSync(join(tmpdir(), 'assurance-scenario-'));
  try {
    writeFileSync(join(fixture, scenario.artifact), scenario.content);
    const bundle = plan({ root: fixture, paths: [scenario.artifact], selectors: [scenario.control], features: scenario.features,
      projectId: 'synthetic-scenario', authorizationRef: 'fixture-only', mode: 'validation', validityDays: 1, validityPolicyRef: 'fixture-policy', now: fixed });
    const { manifest: m, report: r } = bundle;
    r.run.assessor = 'fixture-reviewer'; r.gate_recommendation = 'eligible_for_owner_review';
    r.evidence = [{ id: 'inventory', type: 'source', locator: scenario.artifact, captured_at: fixed, snapshot: m.snapshot.digest, environment: null,
      summary: scenario.name, limitations: ['Synthetic declaration and artifact, not real deployment proof.'], artifact: { path: scenario.artifact, sha256: m.snapshot.files[0].sha256 } }];
    Object.assign(r.controls[0], { status: 'not_applicable', applicability: 'not_applicable', rationale: 'Synthetic reviewer attempts to exclude the selected control.',
      evidence_ids: ['inventory'], remaining_validation: [], coverage: { positive_check_ids: [], negative_check_ids: [], negative_not_applicable_reason: null, exclusion_check_ids: ['scope'] } });
    r.validation_checks = [{ id: 'scope', control_ids: [scenario.control], finding_ids: [], case_kind: 'applicability', state: 'executed', executed_at: fixed,
      method: 'Inspect the scoped synthetic inventory and declared feature facts', authorization_ref: m.authorization_ref, expected: 'No applicable control surface', actual: scenario.name,
      result: 'supports_pass', evidence_ids: ['inventory'], cleanup: 'not_required' }];
    assert.equal(applicability(catalog.controls.find(c => c.id === scenario.control), m.features), scenario.expected);
    const issues = checkBundle(bundle, { root: fixture, now });
    if (scenario.expected === 'not_applicable') assert.deepEqual(issues, []);
    else assert.ok(issues.includes('Exclusion contradicts frozen applicability or leaves it unknown'));
    assert.equal(summarize(bundle, issues).assessment_complete, scenario.expected === 'not_applicable');
  } finally { removeFixture(fixture); }
});

for (const scenario of [
  ['CLI data parser has no browser rendering', 'E-02', { untrusted_input: true, http: false, user_interface: false, browser_rendering: false }, false],
  ['CLI data parsing remains in scope', 'E-07', { untrusted_input: true }, true],
  ['CLI-generated HTML still requires browser checks', 'E-02', { http: false, user_interface: false, browser_rendering: true }, true],
  ['required but unimplemented browser output cannot be excluded', 'E-02', { browser_rendering: true }, true],
  ['unknown rendering stays unresolved despite untrusted input', 'E-02', { untrusted_input: true }, null],
  ['terminal UI does not imply browser rendering', 'E-02', { user_interface: true, browser_rendering: false }, false],
  ['JSON API need not invent HTML rendering', 'E-02', { http: true, browser_rendering: false }, false],
  ['HTTP API still needs header trust checks', 'E-05', { http: true, browser_rendering: false }, true],
  ['Markdown export is rich content without a browser UI', 'E-03', { rich_content: true, user_interface: false }, true],
  ['plain-data CLI has no interpreter sink', 'E-01', { untrusted_input: true, interpreter_sinks: false }, false],
  ['argument-safe subprocess is still an interpreter boundary', 'E-01', { interpreter_sinks: true }, true],
  ['CLI without network has no outbound request surface', 'E-06', { outbound_requests: false, untrusted_input: true }, false],
  ['CLI fetcher has outbound trust without inbound HTTP', 'E-06', { outbound_requests: true, http: false }, true],
  ['push messages alone do not imply email construction', 'E-04', { communications: true, email: false }, false],
  ['configuration-file reading is not an upload', 'E-08', { untrusted_input: true, uploads: false }, false],
  ['database without elevated routines needs no fabricated function call', 'D-04', { database: true, privileged_database_code: false }, false],
  ['object storage without views needs no view test', 'D-05', { object_storage: true, derived_relations: false }, false],
  ['database alone does not imply an object bucket', 'D-07', { database: true, object_storage: false }, false],
  ['service authentication without signup is not enrollment', 'B-02', { identity: true, account_enrollment: false }, false],
  ['delegated enrollment still needs abuse review without local identity handling', 'B-04', { account_enrollment: true, identity: false }, true],
  ['public data API still has resource exposure without accounts', 'F-08', { http: true, identity: false, account_enrollment: false }, true],
  ['private database still has query resource budgets without inbound HTTP', 'F-08', { http: false, database: true }, true],
  ['storage exposure cannot disappear behind an absent owned API', 'F-08', { http: false, object_storage: true }, true],
  ['non-HTTP realtime still has resource exposure', 'F-08', { http: false, realtime: true }, true],
  ['outbound-only client still has upstream resource exposure', 'F-08', { http: false, outbound_requests: true }, true],
  ['background-only work still has aggregate resource exposure', 'F-08', { http: false, background_jobs: true }, true],
  ['absent HTTP does not establish absent provider resource exposure', 'F-08', { http: false }, null],
  ['local tool without resource-service surfaces can exclude F-08', 'F-08', { http: false, database: false, object_storage: false, realtime: false, outbound_requests: false, background_jobs: false }, false],
  ['service credentials alone do not imply sessions', 'B-05', { identity: true, sessions: false }, false],
  ['online account switching still has a session boundary without offline writes', 'B-05', { identity: true, sessions: true, offline_writes: false }, true],
  ['authentication remains required for that service', 'B-01', { identity: true }, true],
  ['read-only ownership does not imply writable fields', 'C-04', { authorization: true, owned_resources: true, writable_fields: false }, false],
  ['owned read-only data still requires ownership checks', 'C-02', { owned_resources: true }, true],
  ['ordinary HTTP is not a flexible or live API', 'F-07', { http: true, realtime: false, flexible_api: false }, false],
  ['non-HTTP realtime transport has no CORS boundary', 'F-03', { realtime: true, http: false }, false],
  ['realtime operation checks remain selected', 'F-07', { realtime: true }, true],
  ['tracking without messages has no email policy', 'J-04', { tracking: true, communications: false, email: false }, false],
  ['tracking without messages has no message classification', 'J-03', { tracking: true, communications: false }, false],
  ['tracking inventory still applies', 'J-01', { tracking: true }, true],
  ['free subscriptions still need subscription terms', 'I-04', { subscriptions: true, purchases: false }, true],
  ['virtual purchases need purchase lifecycle without monetary payments', 'K-03', { purchases: true, payments: false }, true],
  ['payment notifications need K-02 when non-payment callbacks are absent', 'K-02', { payment_events: true, inbound_events: false }, true],
  ['payments alone do not invent an event receiver', 'K-02', { payments: true, payment_events: false }, false],
  ['non-payment callbacks remain independent', 'S-01', { inbound_events: true, payment_events: false }, true],
  ['non-AI automation has no prompt boundary', 'L-02', { autonomous_actions: true, ai: false }, false],
  ['non-AI automation still has tool authority', 'L-03', { autonomous_actions: true, ai: false }, true],
  ['state storage alone does not create an offline queue', 'M-04', { stateful: true, offline_writes: false }, false],
  ['state storage alone does not create a background job', 'M-06', { stateful: true, background_jobs: false }, false],
  ['state operation invariants still apply', 'M-01', { stateful: true }, true]
]) test('capability scenario: ' + scenario[0], () => {
  const [, id, features, expected] = scenario;
  const bundle = pass({ selectors: [id], features });
  const control = bundle.report.controls[0];
  Object.assign(control, { status: 'not_applicable', applicability: 'not_applicable', valid_until: null,
    rationale: 'Synthetic inventory for the explicitly declared capability scenario.',
    coverage: { positive_check_ids: [], negative_check_ids: [], negative_not_applicable_reason: null, exclusion_check_ids: ['check'] } });
  bundle.report.validation_checks[0].case_kind = 'applicability';
  const actual = applicability(catalog.controls.find(c => c.id === id), bundle.manifest.features);
  assert.equal(actual, expected === null ? 'unknown' : expected ? 'applicable' : 'not_applicable');
  const issues = errors(bundle);
  if (expected === false) {
    assert.deepEqual(issues, []);
    const unsupported = copy(bundle); unsupported.report.evidence = [];
    assert.ok(errors(unsupported).length, 'Capability absence alone is not an evidenced exclusion');
  } else assert.ok(issues.includes('Exclusion contradicts frozen applicability or leaves it unknown'));
  assert.equal(summarize(bundle, issues).assessment_complete, expected === false);
});

test('authored capability and freshness requirements work end to end without schema edits', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'assurance-authoring-'));
  try {
    for (const dir of ['src', 'bin', 'catalog', 'schemas']) cpSync(join(packageRoot, dir), join(fixture, dir), { recursive: true });
    writeFileSync(join(fixture, 'app.js'), 'export const fixture = true;\n');
    const definition = copy(catalogSource), schemaFiles = readdirSync(join(fixture, 'schemas')).sort();
    const schemaHashes = schemaFiles.map(file => hash(readFileSync(join(fixture, 'schemas', file))));
    const control = copy(definition.controls.find(item => item.id === 'S-01'));
    control.id = 'PROBE-01'; control.module_id = 'PROBE'; control.requires = ['git_observation'];
    control.applicability.any_of = ['inbound_events']; control.freshness = { policy_ref: 'probe' };
    definition.freshness_policies.probe = { max_age_days: 1, meaning: 'Synthetic one-day ceiling.' };
    definition.modules.push({ id: 'PROBE', title: 'Synthetic module', applicability: { any_of: ['inbound_events'] } });
    definition.controls.push(control);
    const dataPath = join(fixture, 'catalog/controls.json');
    const save = () => writeFileSync(dataPath, JSON.stringify(definition));
    const run = (args, status = 0) => {
      const result = spawnSync(process.execPath, ['bin/assurance.mjs', ...args], { cwd: fixture, encoding: 'utf8', timeout: 15000 });
      assert.equal(result.status, status, result.stderr || result.stdout); return result;
    };
    const base = ['plan', '--root', fixture, '--files', 'app.js', '--select', control.id, '--project', 'fixture', '--authorization', 'fixture'];
    save();
    assert.ok(run(base, 2).stderr.includes('bound local Git observation'));
    control.requires = ['runtime_evidence']; save();
    assert.equal(JSON.parse(run(base).stdout).report.phase, 'research');
    const validation = [...base, '--mode', 'validation', '--validity-policy', 'fixture', '--validity-days'];
    assert.ok(run([...validation, '1'], 2).stderr.includes('require runtime validation'));
    const runtime = ['--target', 'runtime', '--environment', 'fixture', '--deployment', 'synthetic'];
    assert.ok(run([...validation, '2', ...runtime], 2).stderr.includes('freshness ceiling'));
    assert.equal(JSON.parse(run([...validation, '1', ...runtime]).stdout).manifest.validity_days, 1);
    control.requires = []; save();
    writeFileSync(join(fixture, 'features.json'), JSON.stringify({ inbound_events: false }));
    const bundle = JSON.parse(run([...validation, '1', '--features', 'features.json']).stdout);
    const { manifest: m, report: r } = bundle, at = m.created_at;
    r.run.assessor = 'fixture-reviewer'; r.gate_recommendation = 'eligible_for_owner_review';
    r.evidence = [{ id: 'proof', type: 'source', locator: 'app.js', captured_at: at, snapshot: m.snapshot.digest,
      environment: null, summary: 'Synthetic source inventory.', limitations: [], artifact: { path: 'app.js', sha256: m.snapshot.files[0].sha256 } }];
    Object.assign(r.controls[0], { status: 'not_applicable', applicability: 'not_applicable', evidence_ids: ['proof'], remaining_validation: [],
      rationale: 'Synthetic inventory establishes no inbound events.', coverage: { positive_check_ids: [], negative_check_ids: [], negative_not_applicable_reason: null, exclusion_check_ids: ['inventory'] } });
    r.validation_checks = [{ id: 'inventory', control_ids: [control.id], finding_ids: [], case_kind: 'applicability', state: 'executed', executed_at: at,
      method: 'Inspect the synthetic source inventory', authorization_ref: m.authorization_ref, expected: 'No inbound event receiver', actual: 'None found', result: 'supports_pass', evidence_ids: ['proof'], cleanup: 'not_required' }];
    writeFileSync(join(fixture, 'bundle.json'), JSON.stringify(bundle));
    run(['verify', '--input', 'bundle.json', '--root', fixture, '--target', 'source', '--manifest-hash', hash(m)]);
    assert.deepEqual(schemaFiles.map(file => hash(readFileSync(join(fixture, 'schemas', file)))), schemaHashes);
    assert.equal(definition.catalog_version, catalogSource.catalog_version);
  } finally { removeFixture(fixture); }
});

test('shared defaults preserve requirements and reject misspelled nested fields', () => {
  const resolved = resolveCatalog(catalogSource);
  assert.deepEqual(resolved.controls, catalog.controls);
  assert.ok(catalogSource.controls.every(control => !Object.hasOwn(control, 'failure_significance')));
  assert.ok(catalogSource.controls.every(control => !Object.hasOwn(control.research, 'permitted_mode')));
  const invalid = copy(catalogSource);
  invalid.controls[0].validation.requires_runtime = true;
  assert.ok(catalogErrors(invalid).some(error => error.includes('unexpected field')));
  const weakened = copy(catalogSource);
  weakened.control_defaults.failure_significance.default_gate = 'eligible_for_owner_review';
  assert.ok(catalogErrors(weakened).length);
  const control = copy(catalogSource.controls[0]);
  control.validation.evidence_required = ['Specific synthetic evidence'];
  const augmented = resolveCatalog({ ...copy(catalogSource), controls: [control] }).controls[0];
  assert.deepEqual(augmented.validation.evidence_required, [...catalogSource.control_defaults.validation.evidence_required, 'Specific synthetic evidence']);
});

test('control overrides cannot replace safe failure defaults with a pass', () => {
  const valid = copy(catalogSource);
  valid.controls[0].failure_significance = copy(valid.control_defaults.failure_significance);
  assert.deepEqual(catalogErrors(valid), []);
  for (const [field, value] of [['default_gate', 'eligible_for_owner_review'], ['default_severity', 'none']]) {
    const invalid = copy(valid); invalid.controls[0].failure_significance[field] = value;
    assert.ok(catalogErrors(invalid).length, field);
  }
});

test('authored arrays reject duplicates while shared and control requirements combine', () => {
  const valid = copy(catalogSource);
  valid.controls[0].reference_ids = ['asvs'];
  assert.deepEqual(catalogErrors(valid), []);
  const duplicate = copy(valid); duplicate.controls[0].reference_ids.push('asvs');
  assert.deepEqual(resolveCatalog(duplicate).controls[0].reference_ids, ['asvs', 'asvs']);
  assert.ok(catalogErrors(duplicate).length);
  const sharedDuplicate = copy(valid);
  sharedDuplicate.controls[0].validation.evidence_required = ['Specific proof', 'Specific proof'];
  assert.ok(catalogErrors(sharedDuplicate).length, 'Raw duplicate requirements cannot be hidden by resolved deduplication');
  const overlap = copy(valid), shared = overlap.control_defaults.validation.evidence_required[0];
  overlap.controls[0].validation.evidence_required = [shared, 'Specific proof'];
  assert.deepEqual(catalogErrors(overlap), []);
  assert.deepEqual(resolveCatalog(overlap).controls[0].validation.evidence_required, [...overlap.control_defaults.validation.evidence_required, 'Specific proof']);
});

test('mixed array and object authoring values are rejected without index merging', () => {
  for (const [field, value] of [['research', []], ['reference_ids', { 0: 'asvs' }]]) {
    const invalid = copy(catalogSource); invalid.controls[0][field] = value;
    assert.deepEqual(resolveCatalog(invalid).controls[0][field], value);
    assert.ok(catalogErrors(invalid).length, field);
  }
});

test('release labels accept prerelease and build identifiers and reject malformed semver', () => {
  for (const version of ['0.0.0', '1.2.3-alpha.1', '1.2.3+001', '1.2.3-rc.1+build.007', '1.2.3-x-y-z.--']) {
    const valid = copy(catalogSource), groups = copy(sets); valid.catalog_version = version; groups.version = version;
    assert.deepEqual(catalogErrors(valid, groups), [], version);
  }
  for (const version of ['01.2.3', '1.02.3', '1.2.03', '1.2.3-01', '1.2.3-alpha..1', '1.2.3+build..1', '1.2.3+', '1.2.3\n']) {
    const invalid = copy(catalogSource); invalid.catalog_version = version;
    assert.ok(catalogErrors(invalid).length, 'catalog ' + JSON.stringify(version));
    const groups = copy(sets); groups.version = version;
    assert.ok(catalogErrors(catalogSource, groups).length, 'sets ' + JSON.stringify(version));
  }
});

test('Git and runtime requirements are data-driven outside module P', () => {
  const control = catalog.controls.find(item => item.id === 'Q-01');
  const original = copy(control.requires);
  try {
    control.requires = ['git_observation'];
    assert.throws(() => make({ selectors: ['Q-01'] }), /bound local Git observation/);
    control.requires = ['runtime_evidence'];
    assert.doesNotThrow(() => make({ selectors: ['Q-01'] }), 'Source research remains useful');
    assert.throws(() => make({ selectors: ['Q-01'], mode: 'validation' }), /require runtime validation/);
    assert.doesNotThrow(() => make({ selectors: ['Q-01'], mode: 'validation', assessmentTarget: 'runtime', metadata: { environment: 'fixture', deployment: 'fixture-release' } }));
  } finally { control.requires = original; }
});

test('catalog freshness ceilings bound owner-selected validity intervals', () => {
  const policy = catalog.freshness_policies.risk_based, original = policy.max_age_days;
  try {
    policy.max_age_days = 1;
    assert.throws(() => make({ mode: 'validation', validityDays: 2, validityPolicyRef: 'fixture-policy' }), /freshness ceiling/);
    assert.doesNotThrow(() => make({ mode: 'validation', validityDays: 1, validityPolicyRef: 'fixture-policy' }));
  } finally { policy.max_age_days = original; }
  const invalid = copy(catalogSource); invalid.freshness_policies.risk_based.max_age_days = 1.5;
  assert.ok(catalogErrors(invalid).some(error => error.includes('Invalid freshness ceiling')));
});

test('summaries expose contract identity, research exclusions and unfinished cleanup', () => {
  const bundle = make({ selectors: ['C-01'], features: { authorization: false, multi_tenant: false } });
  Object.assign(bundle.report.controls[0], { status: 'not_applicable', applicability: 'not_applicable', evidence_ids: ['proof'] });
  bundle.report.evidence = copy(pass().report.evidence);
  assert.deepEqual(errors(bundle), []);
  const summary = summarize(bundle, []);
  assert.equal(summary.outstanding_controls[0].status, 'not_applicable');
  assert.equal(summary.contract_identity.catalog_hash, bundle.manifest.catalog_hash);
  const unfinished = pass(); unfinished.report.validation_checks[0].result = 'inconclusive';
  unfinished.report.validation_checks[0].cleanup = 'incomplete';
  const blocked = summarize(unfinished, errors(unfinished));
  assert.equal(blocked.check_states.executed, 1);
  assert.equal(blocked.incomplete_cleanup[0].id, 'check');
  assert.equal(blocked.unresolved_checks[0].cleanup, 'incomplete');
  const report = renderReport(unfinished, errors(unfinished));
  assert.ok(report.includes(bundle.manifest.catalog_hash));
  assert.ok(report.includes('cleanup incomplete'));
});

test('authored report text cannot create headings, lists or automatic links', () => {
  for (const [claim, escaped] of [['# heading', '\\# heading'], ['---', '\\---'], ['- item', '\\- item'], ['1. item', '1\\. item'],
    ['1) item', '1\\) item'], ['~~~', '\\~\\~\\~'], ['~~claim~~', '\\~\\~claim\\~\\~'],
    ['https://example.invalid', 'https&#58;//example.invalid'], ['www.example.invalid', 'www&#46;example.invalid'], ['name@example.invalid', 'name&#64;example.invalid']]) {
    const bundle = make(); bundle.report.findings = [finding('F1', 'candidate')];
    bundle.report.findings[0].claim = claim;
    const report = renderReport(bundle, []);
    assert.ok(report.includes(escaped), claim);
    assert.ok(!report.split('\n').includes(claim), claim);
  }
  const readable = renderReport(make(), [], { controlIds: ['A-01'] });
  assert.ok(readable.includes('Catalog: ' + catalog.catalog_version));
  assert.ok(readable.includes('Assessed: ' + fixed));
});

test('URL escaping also covers underscore, digit and punctuation prefixes', () => {
  for (const claim of ['_www.example.invalid', 'x _https://example.invalid', '1https://example.invalid', '(www.example.invalid)', '*https://example.invalid', '~ftp://example.invalid', '_WWW.example.invalid', 'xHTTPS://example.invalid']) {
    const bundle = make(); bundle.report.findings = [finding('F1', 'candidate')]; bundle.report.findings[0].claim = claim;
    const report = renderReport(bundle, []);
    assert.ok(!/(?:https?|ftp):\/\/|www\./i.test(report), claim);
    assert.ok(report.includes('&#58;') || report.includes('&#46;'), claim);
    if (claim.includes('WWW.')) assert.ok(report.includes('WWW&#46;'), 'Escaping preserves authored case');
  }
});

test('snapshot rejects physical aliases without conflating distinct identical files', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'assurance-alias-'));
  try {
    writeFileSync(join(fixture, 'app.js'), 'same bytes');
    writeFileSync(join(fixture, 'other.js'), 'same bytes');
    assert.equal(snapshot(fixture, ['app.js', 'other.js']).files.length, 2);
    linkSync(join(fixture, 'app.js'), join(fixture, 'linked.js'));
    assert.throws(() => snapshot(fixture, ['app.js', 'linked.js']), /Duplicate physical file/);
    if (existsSync(join(fixture, 'APP.JS'))) assert.throws(() => snapshot(fixture, ['app.js', 'APP.JS']), /Duplicate physical file/);
    else { writeFileSync(join(fixture, 'APP.JS'), 'different case-sensitive file'); assert.equal(snapshot(fixture, ['app.js', 'APP.JS']).files.length, 2); }
    if (existsSync(join(fixture, 'app.js.'))) assert.throws(() => snapshot(fixture, ['app.js', 'app.js.']), /Duplicate physical file/);
  } finally { removeFixture(fixture); }
});

test('Git observations do not execute configured clean or process filters', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'assurance-filter-'));
  const git = (...args) => {
    const result = spawnSync('git', ['-C', fixture, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgSign=false', '-c', 'core.hooksPath=/dev/null', ...args], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, result.stderr); return result.stdout;
  };
  try {
    git('init', '--initial-branch=develop');
    const script = join(fixture, 'filter.cjs'), marker = join(fixture, '.git', 'filter-ran');
    writeFileSync(script, "const fs=require('node:fs');fs.writeFileSync(" + JSON.stringify(marker) + ",'ran');process.stdout.write(fs.readFileSync(0));");
    const quote = value => "'" + value.replaceAll('\\', '/').replaceAll("'", "'\\''") + "'";
    const command = quote(process.execPath) + ' ' + quote(script);
    for (const driver of ['fixture', 'a=b']) {
      git('config', 'filter.' + driver + '.clean', command);
      git('config', 'filter.' + driver + '.required', 'true');
      writeFileSync(join(fixture, '.gitattributes'), 'app.txt filter=' + driver + '\n');
      writeFileSync(join(fixture, 'app.txt'), 'one\n'); git('add', '.gitattributes', 'app.txt'); git('commit', '-m', 'Synthetic ' + driver + ' baseline');
      rmSync(marker, { force: true }); writeFileSync(join(fixture, 'app.txt'), 'two\n');
      git('status', '--porcelain'); assert.ok(existsSync(marker), 'Positive control proves the ' + driver + ' filter executes');
      rmSync(marker, { force: true });
      assert.equal(inspectGit(fixture, 'refs/heads/develop').working_tree_dirty, true);
      assert.equal(existsSync(marker), false);
      if (driver === 'fixture') {
        const alternate = join(fixture, '.git', 'empty.cfg'); writeFileSync(alternate, '');
        for (const key of process.platform === 'win32' ? ['GIT_CONFIG', 'git_config', 'Git_Config'] : ['GIT_CONFIG']) {
          withEnvironment({ [key]: alternate }, () => {
            assert.equal(inspectGit(fixture, 'refs/heads/develop').working_tree_dirty, true);
            assert.equal(existsSync(marker), false, key + ' must not hide the actual configured filter');
          });
        }
        const key = name => process.platform === 'win32' ? name.toLowerCase() : name;
        withEnvironment({ [key('GIT_DIR')]: join(fixture, 'not-a-repository'), [key('GIT_CONFIG_PARAMETERS')]: 'invalid-config-parameters',
          [key('GIT_CONFIG_COUNT')]: '1', [key('GIT_CONFIG_KEY_0')]: 'core.fsmonitor', [key('GIT_CONFIG_VALUE_0')]: 'untrusted-command' }, () => {
          assert.equal(inspectGit(fixture, 'refs/heads/develop').working_tree_dirty, true);
          assert.equal(existsSync(marker), false);
        });
      }
      git('config', 'filter.' + driver + '.process', command);
      assert.equal(inspectGit(fixture, 'refs/heads/develop').working_tree_dirty, true);
      assert.equal(existsSync(marker), false);
    }
  } finally { removeFixture(fixture); }
});
test('stash observations never invoke configured signature verification', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'assurance-signature-'));
  const git = (args, input) => {
    const result = spawnSync('git', ['-C', fixture, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgSign=false', '-c', 'core.hooksPath=/dev/null', ...args], { encoding: 'utf8', input, timeout: 10000 });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  try {
    git(['init', '--initial-branch=develop']);
    writeFileSync(join(fixture, 'app.js'), 'synthetic\n');
    git(['add', 'app.js']); git(['commit', '-m', 'Synthetic baseline']);
    const tree = git(['rev-parse', 'HEAD^{tree}']);
    const commit = `tree ${tree}\nauthor Fixture <fixture@example.invalid> 1794000000 +0000\ncommitter Fixture <fixture@example.invalid> 1794000000 +0000\ngpgsig -----BEGIN PGP SIGNATURE-----\n \n AA==\n -----END PGP SIGNATURE-----\n\nSynthetic signature fixture\n`;
    const oid = git(['hash-object', '-t', 'commit', '-w', '--stdin'], commit);
    git(['update-ref', '--create-reflog', '-m', 'Synthetic stash', 'refs/stash', oid]);
    const marker = join(fixture, '.git', 'signature-ran');
    const program = join(fixture, process.platform === 'win32' ? 'gpg-fixture.cmd' : 'gpg-fixture');
    const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
    writeFileSync(program, process.platform === 'win32'
      ? '@echo off\r\necho ran > "' + marker + '"\r\nexit /b 1\r\n'
      : '#!/bin/sh\nprintf ran > ' + quote(marker) + '\nexit 1\n');
    chmodSync(program, 0o700);
    git(['config', 'gpg.program', program.replaceAll('\\', '/')]);
    git(['config', 'log.showSignature', 'true']);
    git(['stash', 'list', '--format=%H']);
    assert.ok(existsSync(marker), 'Positive control exercises signature verification');
    rmSync(marker, { force: true });
    assert.equal(inspectGit(fixture, 'refs/heads/develop').stash_count, 1);
    assert.equal(existsSync(marker), false);
  } finally { removeFixture(fixture); }
});

test('Git executable lookup ignores a counterfeit in the working directory', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'assurance-executable-'));
  const git = (...args) => {
    const result = spawnSync('git', ['-C', fixture, ...args], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, result.stderr); return result.stdout;
  };
  try {
    git('init', '--initial-branch=develop');
    writeFileSync(join(fixture, 'app.js'), 'synthetic\n'); git('add', 'app.js');
    if (process.platform === 'win32') copyFileSync(process.execPath, join(fixture, 'git.exe'));
    else {
      writeFileSync(join(fixture, 'git'), '#!/bin/sh\nprintf "fixture-counterfeit\\n"\n');
      chmodSync(join(fixture, 'git'), 0o700);
    }
    const env = { ...process.env }, pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH';
    env[pathKey] = '.' + delimiter + (env[pathKey] ?? '');
    const vulnerable = spawnSync('git', ['--version'], { cwd: fixture, env, encoding: 'utf8', timeout: 10000 });
    assert.equal(vulnerable.stdout.trim(), process.platform === 'win32' ? process.version : 'fixture-counterfeit', 'Positive control exercises cwd or relative-PATH lookup');
    const cli = spawnSync(process.execPath, [join(packageRoot, 'bin/assurance.mjs'), 'inventory', '--root', fixture], { cwd: fixture, env, encoding: 'utf8', timeout: 15000 });
    assert.equal(cli.status, 0, cli.stderr);
    assert.ok(cli.stdout.includes('app.js'));
  } finally { removeFixture(fixture); }
});

test('unsupported record formats return an explicit replanning diagnostic', () => {
  const old = make(); old.manifest.schema_version = '3.3'; old.report.schema_version = '3.3';
  assert.deepEqual(errors(old), ['Unsupported record format; create a new plan with the current contracts']);
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
  r.validation_checks.push({ ...copy(r.validation_checks[0]), id: 'deny', case_kind: 'negative', method: 'Synthetic denial case', expected: 'Denied', actual: 'Denied', evidence_ids: ['proof'] });
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
  const selectedCount = select(['C']).length;
  assert.equal(bundle.report.controls.length, selectedCount);
  const input = join(root, 'bundle.json'); writeFileSync(input, created.stdout);
  assert.equal(cli('check', '--input', input, '--root', root).status, 0);
  const summary = cli('summarize', '--input', input, '--root', root);
  assert.equal(JSON.parse(summary.stdout).dispositions.not_assessed, selectedCount);
  const readable = cli('report', '--input', input, '--root', root);
  assert.equal(readable.status, 0); assert.ok(readable.stdout.includes(selectedCount + ' not\\_assessed'));
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

test('ordinary reviewer observations are optional and provide no assessment credit', () => {
  const bundle = make();
  assert.deepEqual(bundle.report.reviewer_observations, []);
  delete bundle.report.reviewer_observations;
  assert.deepEqual(errors(bundle), []);
  assert.equal(summarize(bundle, []).reviewer_observation_count, 0);
  bundle.report.reviewer_observations = [{ id: 'OBS', observation: 'A harness prompt could distinguish provider cursors.' }];
  assert.deepEqual(errors(bundle), []);
  assert.equal(summarize(bundle, []).reviewer_observation_count, 1);
  assert.equal(summarize(bundle, []).assessment_complete, false);
  bundle.report.gate_recommendation = 'eligible_for_owner_review';
  assert.ok(errors(bundle).length, 'Research cannot recommend eligibility');
  const draft = make({ mode: 'validation' }); draft.report.reviewer_observations = copy(bundle.report.reviewer_observations);
  draft.report.gate_recommendation = 'eligible_for_owner_review';
  assert.ok(errors(draft).includes('Unresolved results cannot recommend eligibility'));
  const complete = pass(); complete.report.reviewer_observations = copy(bundle.report.reviewer_observations);
  assert.deepEqual(errors(complete), [], 'A non-validating suggestion need not block a genuinely supported scoped result');
});

test('reviewer observations cannot replace evidence, checks or drill feedback', () => {
  const bundle = make({ purpose: 'harness-drill' });
  bundle.report.evidence = copy(pass().report.evidence);
  bundle.report.findings = [finding('F1', 'candidate')];
  Object.assign(bundle.report.controls[0], { status: 'candidate_gap', evidence_ids: ['proof'], finding_ids: ['F1'] });
  bundle.report.reviewer_observations = [{ id: 'OBS', observation: 'Improve a harness method.', control_ids: ['A-01'], finding_ids: ['F1'], evidence_ids: ['proof'] }];
  assert.deepEqual(errors(bundle), []);
  assert.equal(summarize(bundle, []).harness_feedback_complete, false);
  assert.deepEqual(summarize(bundle, []).findings_without_harness_feedback, ['F1']);
  const missing = pass(); missing.report.reviewer_observations = [{ id: 'proof', observation: 'Not an evidence artifact.' }];
  missing.report.evidence = [];
  assert.ok(errors(missing).includes('Unresolved evidence reference'));
  const skipped = pass(); skipped.report.reviewer_observations = [{ id: 'check', observation: 'Not execution.' }];
  skipped.report.validation_checks = [];
  assert.ok(errors(skipped).length);
});

test('reviewer observation links and IDs are checked while general suggestions need no links', () => {
  const makeObservation = () => {
    const bundle = make({ selectors: ['A-01', 'A-02'] });
    bundle.report.evidence = copy(pass().report.evidence);
    bundle.report.findings = [finding('F1', 'candidate')];
    Object.assign(bundle.report.controls[0], { status: 'candidate_gap', evidence_ids: ['proof'], finding_ids: ['F1'] });
    bundle.report.reviewer_observations = [{ id: 'OBS', observation: 'Harness-only suggestion.', suggestion: null, control_ids: ['A-01'], finding_ids: ['F1'], evidence_ids: ['proof'] }];
    return bundle;
  };
  assert.deepEqual(errors(makeObservation()), []);
  for (const mutate of [
    b => b.report.reviewer_observations.push(copy(b.report.reviewer_observations[0])),
    b => { b.report.reviewer_observations[0].control_ids = ['B-01']; },
    b => { b.report.reviewer_observations[0].control_ids = ['A-02']; },
    b => { b.report.reviewer_observations[0].finding_ids = ['missing']; },
    b => { b.report.reviewer_observations[0].evidence_ids = ['missing']; },
    b => { b.report.reviewer_observations[0].control_ids = ['A-01', 'A-01']; },
    b => { b.report.reviewer_observations[0].outcome = 'confirmed'; },
    b => { b.report.reviewer_observations[0].observation = '   '; }
  ]) { const bundle = makeObservation(); mutate(bundle); assert.ok(errors(bundle).length); }
});

test('acknowledged incomplete work retains gap, applicability and eligibility gates', () => {
  const bundle = pass();
  const item = finding(); item.issue_types = ['incomplete_work'];
  item.acknowledgement = { summary: 'Fixture scope requires this unfinished behavior; a retained note documents it.', evidence_ids: ['proof'] };
  bundle.report.findings = [item];
  Object.assign(bundle.report.controls[0], { status: 'validated_gap', valid_until: null, finding_ids: ['F1'] });
  bundle.report.controls[0].coverage.positive_check_ids = [];
  Object.assign(bundle.report.validation_checks[0], { result: 'supports_gap', finding_ids: ['F1'] });
  bundle.report.gate_recommendation = 'blocked';
  assert.deepEqual(errors(bundle), []);
  assert.equal(summarize(bundle, []).assessment_complete, false);
  const eligible = copy(bundle); eligible.report.gate_recommendation = 'eligible_for_owner_review';
  assert.ok(errors(eligible).includes('Unresolved results cannot recommend eligibility'));
  const relabeled = copy(bundle); relabeled.report.controls[0].status = 'validated_pass';
  assert.ok(errors(relabeled).length);
  const excluded = copy(bundle); excluded.report.controls[0].status = 'not_applicable';
  excluded.report.controls[0].applicability = 'not_applicable';
  assert.ok(errors(excluded).includes('Exclusion contradicts frozen applicability or leaves it unknown'));
  const unsupported = copy(bundle); unsupported.report.validation_checks = [];
  assert.ok(errors(unsupported).includes('Finding lacks exact supporting check'));
});

test('incomplete work and an unsupported claim share one finding with independent classifications', () => {
  const bundle = make(); bundle.report.evidence = copy(pass().report.evidence);
  const item = finding('F1', 'candidate');
  Object.assign(item, { issue_types: ['incomplete_work', 'unsupported_claim'],
    acknowledgement: { summary: 'A retained fixture note documents the unfinished work; no risk acceptance implied.', evidence_ids: ['proof'] },
    claim_reference: { assertion: 'Feature is complete', scope: 'Planned fixture release', evidence_ids: ['proof'] } });
  bundle.report.findings = [item];
  Object.assign(bundle.report.controls[0], { status: 'candidate_gap', evidence_ids: ['proof'], finding_ids: ['F1'] });
  assert.deepEqual(errors(bundle), []);
  const summary = summarize(bundle, []);
  assert.equal(summary.finding_counts.candidate_gaps, 1);
  assert.equal(summary.issue_type_counts.incomplete_work, 1);
  assert.equal(summary.issue_type_counts.unsupported_claim, 1);
  assert.equal(summary.findings.length, 1);
  assert.equal(summary.assessment_complete, false);
  const rendered = renderReport(bundle, []);
  assert.ok(rendered.includes('Assertion under review: Feature is complete'));
  assert.ok(rendered.includes('not risk acceptance or validation credit'));
});

test('finding context requires exact linked evidence and exclusive unresolved classification', () => {
  const base = () => {
    const bundle = make(); bundle.report.evidence = copy(pass().report.evidence);
    bundle.report.findings = [finding('F1', 'candidate')];
    Object.assign(bundle.report.controls[0], { status: 'candidate_gap', evidence_ids: ['proof'], finding_ids: ['F1'] });
    return bundle;
  };
  for (const mutate of [
    f => { f.issue_types = []; },
    f => { f.issue_types = ['defect', 'defect']; },
    f => { f.issue_types = ['new_defect']; },
    f => { f.issue_types = ['unsupported_claim']; },
    f => { f.issue_types = ['undetermined', 'defect']; f.bucket = 'evidence_request'; },
    f => { f.issue_types = ['undetermined']; },
    f => { f.issue_types = ['undetermined']; f.bucket = 'evidence_request'; f.outcome = 'confirmed'; },
    f => { f.issue_types = ['undetermined']; f.bucket = 'evidence_request'; f.outcome = 'refuted'; },
    f => { f.acknowledgement = { summary: 'Known', evidence_ids: [] }; },
    f => { f.acknowledgement = { summary: 'Known', evidence_ids: ['missing'] }; },
    f => { f.acknowledgement = { summary: 'Known', evidence_ids: ['proof'], accepted_risk: true }; },
    f => { f.claim_reference = { assertion: 'Complete', scope: 'Release', evidence_ids: ['proof'] }; },
    f => { f.issue_types = ['unsupported_claim']; f.claim_reference = { assertion: 'Complete', scope: '  ', evidence_ids: ['proof'] }; },
    f => { delete f.issue_types; }
  ]) { const bundle = base(); mutate(bundle.report.findings[0]); assert.ok(errors(bundle).length); }
  for (const key of ['acknowledgement', 'claim_reference']) {
    const bundle = base();
    bundle.report.evidence.push({ ...copy(bundle.report.evidence[0]), id: 'unlinked' });
    const item = bundle.report.findings[0];
    if (key === 'acknowledgement') item[key] = { summary: 'Known', evidence_ids: ['unlinked'] };
    else { item.issue_types = ['unsupported_claim']; item[key] = { assertion: 'Complete', scope: 'Release', evidence_ids: ['unlinked'] }; }
    assert.ok(errors(bundle).includes('Finding context evidence must support the finding'));
  }
  const unknown = base(); unknown.report.findings[0].issue_types = ['undetermined']; unknown.report.findings[0].bucket = 'evidence_request';
  assert.deepEqual(errors(unknown), []);
  assert.equal(summarize(unknown, []).assessment_complete, false);
  const documented = base(); documented.report.findings[0].acknowledgement = { summary: 'Documented after the assessment time.', evidence_ids: ['later'] };
  documented.report.evidence.push({ ...copy(documented.report.evidence[0]), id: 'later', captured_at: '2026-11-07T12:00:30Z' });
  documented.report.findings[0].evidence_ids.push('later'); documented.report.run.completed_at = '2026-11-07T12:01:00Z';
  assert.ok(errors(documented).includes('Control assessed before supporting evidence capture'));
});

test('new observation and finding descriptions are escaped and absent acknowledgment implies no prior knowledge claim', () => {
  const bundle = make(); bundle.report.evidence = copy(pass().report.evidence);
  const payload = '<img src=x> [click](https://example.invalid) @everyone';
  const item = finding('F1', 'candidate'); item.issue_types = ['unsupported_claim'];
  item.claim_reference = { assertion: payload, scope: payload, evidence_ids: ['proof'] };
  bundle.report.findings = [item];
  Object.assign(bundle.report.controls[0], { status: 'candidate_gap', evidence_ids: ['proof'], finding_ids: ['F1'] });
  bundle.report.reviewer_observations = [{ id: payload, observation: payload, suggestion: payload }];
  assert.deepEqual(errors(bundle), []);
  let rendered = renderReport(bundle, []);
  assert.ok(rendered.includes('Prior acknowledgment not established.'));
  item.acknowledgement = { summary: payload, evidence_ids: ['proof'] };
  rendered = renderReport(bundle, []);
  assert.ok(rendered.includes('&lt;img'));
  assert.ok(!rendered.includes('<img')); assert.ok(!rendered.includes('[click]('));
  assert.ok(!rendered.includes('https://')); assert.ok(!rendered.includes('@everyone'));
});

test('legitimately deferred behavior needs no invented finding and does not grant unassessed controls a pass', () => {
  const bundle = make(); bundle.report.limitations.push('Future feature excluded from this release; no completion claim or current exposure established.');
  assert.deepEqual(errors(bundle), []);
  assert.deepEqual(bundle.report.findings, []);
  assert.equal(summarize(bundle, []).assessment_complete, false);
  const complete = pass(); complete.report.limitations.push(...bundle.report.limitations);
  assert.deepEqual(errors(complete), [], 'Unrelated deferred behavior does not automatically create a defect');
});

test('refuted claim classifications retain resolution context without reporting an active unsupported assertion', () => {
  const bundle = pass(); const item = finding('F1', 'refuted');
  Object.assign(item, { issue_types: ['incomplete_work', 'unsupported_claim'], outcome_rationale: 'Fixture check established this deferred feature was not promised for the assessed release.',
    claim_reference: { assertion: 'Feature is complete', scope: 'A different release', evidence_ids: ['proof'] } });
  bundle.report.findings = [item]; bundle.report.controls[0].finding_ids = ['F1']; bundle.report.validation_checks[0].finding_ids = ['F1'];
  assert.deepEqual(errors(bundle), []);
  assert.equal(summarize(bundle, []).assessment_complete, true, 'Evidence-backed refutation remains supported');
  const rendered = renderReport(bundle, []);
  assert.ok(rendered.includes('Disposition rationale: Fixture check established'));
  assert.ok(rendered.includes('including refuted findings'));
  assert.ok(rendered.includes('Assertion under review: Feature is complete'));
  assert.ok(!rendered.includes('Unsupported assertion:'));
});

test('CLI validates observation and finding context before check, summary, rendering or eligibility', () => {
  const stamp = new Date().toISOString();
  const bundle = make({ now: stamp }); bundle.report.evidence = copy(pass().report.evidence);
  bundle.report.evidence[0].captured_at = stamp;
  const item = finding('F1', 'candidate');
  item.issue_types = ['incomplete_work', 'unsupported_claim'];
  item.acknowledgement = { summary: 'Known unfinished fixture behavior.', evidence_ids: ['proof'] };
  item.claim_reference = { assertion: 'Complete', scope: 'Fixture release', evidence_ids: ['proof'] };
  bundle.report.findings = [item];
  Object.assign(bundle.report.controls[0], { status: 'candidate_gap', evidence_ids: ['proof'], finding_ids: ['F1'] });
  bundle.report.reviewer_observations = [{ id: 'OBS', observation: 'Harness-only suggestion.', finding_ids: ['F1'] }];
  const input = join(root, 'context-cli.json');
  const cli = (command, value) => {
    writeFileSync(input, JSON.stringify(value));
    const args = ['bin/assurance.mjs', command, '--input', input, '--root', root];
    if (command === 'verify') args.push('--target', 'source', '--manifest-hash', hash(value.manifest));
    return spawnSync(process.execPath, args, { cwd: packageRoot, encoding: 'utf8', timeout: 15000 });
  };
  for (const command of ['check', 'summarize', 'report']) assert.equal(cli(command, bundle).status, 0, command);
  assert.equal(cli('verify', bundle).status, 1, 'A well-formed unfinished record is not eligible');
  for (const mutate of [
    b => { b.report.reviewer_observations[0].finding_ids = ['missing']; },
    b => { b.report.findings[0].claim_reference = null; },
    b => { b.report.findings[0].acknowledgement.evidence_ids = []; },
    b => { b.report.gate_recommendation = 'eligible_for_owner_review'; }
  ]) {
    const invalid = copy(bundle); mutate(invalid);
    for (const command of ['check', 'summarize', 'report', 'verify']) {
      const result = cli(command, invalid);
      assert.equal(result.status, 1, command + ': ' + result.stderr);
      assert.ok(!result.stdout.includes('**eligible_for_owner_review**'));
    }
  }
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
