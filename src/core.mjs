import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, realpathSync, lstatSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { shapeErrors, schemaErrors } from './shape.mjs';
import { inspectGit } from './git.mjs';

const base = new URL('../', import.meta.url);
export const load = name => JSON.parse(readFileSync(new URL(name, base), 'utf8'));
export const catalog = load('catalog/v3.3.0.json');
export const sets = load('sets/v3.3.0.json');
export const reportSchema = load('schemas/assessment.v3.3.schema.json');
export const manifestSchema = load('schemas/manifest.v3.3.schema.json');
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
export const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
export const engineHash = () => hash(['src/core.mjs', 'src/shape.mjs', 'src/git.mjs', 'src/report.mjs', 'bin/assurance.mjs'].map(name => ({ name, hash: hash(readFileSync(new URL(name, base))) })));
const same = (a, b) => canonical(a) === canonical(b);
const duplicates = values => new Set(values).size !== values.length;
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
function gitDigest(root, base) {
  const { captured_at, ...observation } = inspectGit(root, base);
  return hash(observation);
}

export function select(selectors, exclusions = []) {
  if (!Array.isArray(selectors) || !selectors.length || !Array.isArray(exclusions)) throw new Error('Invalid selection');
  const known = new Set(catalog.controls.map(control => control.id));
  const expand = selector => {
    if (typeof selector !== 'string') throw new Error('Invalid selector');
    if (known.has(selector)) return [selector];
    const module = catalog.modules.find(item => item.id === selector);
    if (module) return module.control_ids;
    if (Object.hasOwn(sets.sets, selector)) return sets.sets[selector].flatMap(item => {
      if (known.has(item)) return [item];
      const found = catalog.modules.find(module => module.id === item);
      if (!found) throw new Error('Invalid named set');
      return found.control_ids;
    });
    throw new Error('Unknown selector');
  };
  const included = new Set(selectors.flatMap(expand));
  for (const id of new Set(exclusions.flatMap(expand))) {
    if (!included.has(id)) throw new Error('Exclusion outside selection');
    included.delete(id);
  }
  const ids = catalog.controls.map(control => control.id).filter(id => included.has(id));
  if (!ids.length) throw new Error('Empty selection');
  return ids;
}

export function applicability(control, features) {
  const flags = control.applicability.any_of;
  if (flags.includes('all') || flags.some(flag => features[flag] === true)) return 'applicable';
  if (flags.some(flag => features[flag] !== false)) return 'unknown';
  return 'not_applicable';
}

function safeFile(root, name) {
  if (typeof name !== 'string' || !name || /[\x00-\x1f:]/.test(name) || isAbsolute(name)
      || name.includes('\\') || name.split('/').some(part => !part || part === '..' || part === '.')) throw new Error('Unsafe scoped path');
  let target = root;
  for (const part of name.split('/')) {
    target = resolve(target, part);
    if (lstatSync(target).isSymbolicLink()) throw new Error('Scoped symlinks and junctions are unsupported');
  }
  const actual = realpathSync.native(target);
  const rel = relative(root, actual);
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new Error('Scoped file escapes root');
  const stat = lstatSync(actual);
  if (!stat.isFile() || stat.size > 10 * 1024 * 1024) throw new Error('Scoped input must be a regular file of at most 10 MiB');
  return actual;
}

export function snapshot(root, paths, metadata = {}) {
  const actualRoot = realpathSync.native(resolve(root));
  if (!lstatSync(actualRoot).isDirectory() || !Array.isArray(paths) || !paths.length || paths.length > 1000 || duplicates(paths)) throw new Error('Invalid snapshot scope');
  const files = [...paths].sort().map(path => ({ path, sha256: hash(readFileSync(safeFile(actualRoot, path))) }));
  const result = { root: actualRoot, source_revision: metadata.source_revision ?? null,
    environment: metadata.environment ?? null, deployment: metadata.deployment ?? null, files };
  return { ...result, digest: hash(result) };
}

export function plan({ root, paths, selectors, exclusions = [], projectId, authorizationRef,
  mode = 'review', purpose = 'project-assessment', assessmentTarget = 'source', gitBase, features = {}, validityDays = null, validityPolicyRef = null, metadata = {}, now = new Date().toISOString() }) {
  const assigned = select(selectors, exclusions);
  if (!features || typeof features !== 'object' || Array.isArray(features)) throw new Error('Features must be an object');
  if (Object.keys(features).some(key => !catalog.feature_keys.includes(key))) throw new Error('Unknown feature key');
  const resolvedFeatures = Object.fromEntries(catalog.feature_keys.map(key => [key, features[key] ?? null]));
  const manifest = {
    schema_version: '3.3', catalog_version: catalog.catalog_version, assessment_target: assessmentTarget, engine_hash: engineHash(),
    git_snapshot: gitBase ? { base_ref: gitBase, digest: gitDigest(root, gitBase) } : null,
    catalog_hash: hash(catalog), sets_hash: hash(sets), schema_hash: hash({ manifestSchema, reportSchema }),
    id: randomUUID(), project_id: projectId, mode, purpose, created_at: now,
    authorization_ref: authorizationRef, selectors, exclusions, assigned_control_ids: assigned,
    features: resolvedFeatures, validity_days: validityDays, validity_policy_ref: validityPolicyRef,
    snapshot: snapshot(root, paths, metadata),
    capabilities: ['read_explicit_files', 'validate_records', 'emit_report'],
    limitations: ['Authorization references are declarations, not verified grants.',
      'Only explicitly listed files are fingerprinted. Git metadata and runtime identity are not independently verified.',
      'The harness validates records and freshness; it does not execute application tests or establish evidence truth.']
  };
  const errors = manifestErrors(manifest, Date.parse(now));
  if (errors.length) throw new Error('Invalid planning contract: ' + errors.join('; '));
  const report = {
    schema_version: '3.3', catalog_version: catalog.catalog_version, manifest_hash: hash(manifest),
    project_id: projectId, phase: mode === 'review' ? 'research' : 'validation',
    run: { id: manifest.id, assessor: 'unassigned', model_requested: null, model_actual: null, started_at: now, completed_at: now },
    snapshot: { repository: manifest.snapshot.root, source_revision: manifest.snapshot.source_revision,
      deployment: manifest.snapshot.deployment, environment: manifest.snapshot.environment, profile_ref: hash(manifest.features) },
    authorization_ref: authorizationRef, assigned_control_ids: assigned,
    controls: assigned.map(id => {
      const control = catalog.controls.find(item => item.id === id);
      const applies = applicability(control, resolvedFeatures);
      return { control_id: id, status: 'not_assessed', applicability: applies === 'not_applicable' ? 'unknown' : applies,
        rationale: 'Not inspected. Feature flags are planning aids, not exclusion evidence.', evidence_ids: [], finding_ids: [],
        remaining_validation: [control.expected_outcome], assessed_at: now, valid_until: null, prior_assessment: null,
        coverage: { positive_check_ids: [], negative_check_ids: [], negative_not_applicable_reason: null, exclusion_check_ids: [] } };
    }), findings: [], evidence: [], validation_checks: [], harness_feedback: [], limitations: [...manifest.limitations],
    gate_recommendation: mode === 'review' ? 'needs_validation' : 'needs_review'
  };
  return { manifest, report };
}

export function manifestErrors(manifest, now = Date.now()) {
  const errors = shapeErrors(manifest, manifestSchema);
  if (errors.length) return errors;
  const fail = message => errors.push(message);
  if (manifest.assigned_control_ids.some(id => id.startsWith('P-')) && manifest.git_snapshot === null) fail('Git controls require a bound local Git observation');
  if (!same(Object.keys(manifest.features).sort(), [...catalog.feature_keys].sort())) fail('Feature coverage mismatch');
  if (manifest.catalog_hash !== hash(catalog) || manifest.sets_hash !== hash(sets)
    || manifest.schema_hash !== hash({ manifestSchema, reportSchema }) || manifest.engine_hash !== engineHash()) fail('Pinned contract or engine changed');
  if (manifest.assessment_target === 'runtime' && (!nonempty(manifest.snapshot.environment) || !nonempty(manifest.snapshot.deployment))) fail('Runtime target requires environment and deployment identity');
  if (manifest.purpose === 'harness-drill' && manifest.mode !== 'review') fail('Harness drills are research; runtime validation requires a separate project assessment');
  try { if (!same(select(manifest.selectors, manifest.exclusions), manifest.assigned_control_ids)) fail('Frozen selection mismatch'); }
  catch { fail('Invalid manifest selectors'); }
  const { digest, ...source } = manifest.snapshot;
  if (digest !== hash(source) || source.files.length > 1000 || duplicates(source.files.map(item => item.path))) fail('Invalid snapshot digest or duplicate paths');
  if (Date.parse(manifest.created_at) > now) fail('Future manifest timestamp');
  if (manifest.validity_days !== null && (!Number.isInteger(manifest.validity_days) || !nonempty(manifest.validity_policy_ref))) fail('Validity interval needs an explicit policy reference');
  return errors;
}

export function checkBundle(bundle, { root, evidenceRoot, expectedManifestHash, now = Date.now() } = {}) {
  if (!Number.isFinite(now)) return ['Invalid verification clock'];
  const contractErrors = catalogErrors();
  if (contractErrors.length) return contractErrors;
  if (!bundle || typeof bundle !== 'object' || !same(Object.keys(bundle).sort(), ['manifest', 'report'])) return ['Invalid bundle envelope'];
  const { manifest: m, report: r } = bundle;
  const errors = manifestErrors(m, now);
  errors.push(...shapeErrors(r, reportSchema));
  if (errors.length) return errors;
  const fail = message => errors.push(message);
  if (expectedManifestHash !== undefined && expectedManifestHash !== hash(m)) fail('Approved manifest hash mismatch');
  if (r.manifest_hash !== hash(m)) fail('Report manifest binding mismatch');
  if (r.project_id !== m.project_id || r.run.id !== m.id || r.authorization_ref !== m.authorization_ref
    || r.phase !== (m.mode === 'review' ? 'research' : 'validation') || !same(r.assigned_control_ids, m.assigned_control_ids)) fail('Report scope mismatch');
  if (!same(r.snapshot, { repository: m.snapshot.root, source_revision: m.snapshot.source_revision,
    deployment: m.snapshot.deployment, environment: m.snapshot.environment, profile_ref: hash(m.features) })) fail('Report snapshot mismatch');
  if (!root) fail('An explicit root is required for current file verification');
  else try {
    const current = snapshot(root, m.snapshot.files.map(file => file.path), m.snapshot);
    if (!same(current, m.snapshot)) fail('Source snapshot changed');
    if (m.git_snapshot && gitDigest(root, m.git_snapshot.base_ref) !== m.git_snapshot.digest) fail('Git snapshot changed');
  } catch { fail('Source snapshot unavailable or unsafe'); }
  const assigned = new Set(m.assigned_control_ids);
  const controls = new Map(r.controls.map(item => [item.control_id, item]));
  const findings = new Map(r.findings.map(item => [item.id, item]));
  const evidence = new Map(r.evidence.map(item => [item.id, item]));
  if (controls.size !== r.controls.length || controls.size !== assigned.size || [...controls.keys()].some(id => !assigned.has(id))) fail('Control coverage mismatch');
  if (findings.size !== r.findings.length || evidence.size !== r.evidence.length || duplicates(r.validation_checks.map(item => item.id)) || duplicates(r.findings.map(item => item.fingerprint))) fail('Duplicate report IDs or finding fingerprints');
  const start = Date.parse(r.run.started_at), end = Date.parse(r.run.completed_at);
  if (start < Date.parse(m.created_at) || end < start || end > now) fail('Invalid run chronology');
  if (r.run.model_requested && r.run.model_requested !== r.run.model_actual) fail('Requested model identity not satisfied');
  const refs = ids => { if (ids.some(id => !evidence.has(id))) fail('Unresolved evidence reference'); };
  for (const item of r.evidence) {
    if (item.snapshot !== m.snapshot.digest || item.environment !== m.snapshot.environment) fail('Evidence scope mismatch');
    if (Date.parse(item.captured_at) > end) fail('Future evidence or evidence after run completion');
    if (item.type === 'source') {
      if (!m.snapshot.files.some(file => file.path === item.artifact.path && file.sha256 === item.artifact.sha256)) fail('Source evidence artifact is not in scoped snapshot');
    } else if (!evidenceRoot) fail('An explicit evidence root is required for external artifacts');
    else try {
      const actualRoot = realpathSync.native(resolve(evidenceRoot));
      if (hash(readFileSync(safeFile(actualRoot, item.artifact.path))) !== item.artifact.sha256) fail('Evidence artifact changed');
    } catch { fail('Evidence artifact unavailable or unsafe'); }
  }
  const conclusive = check => check.state === 'executed' && check.result !== 'inconclusive'
    && check.executed_at !== null && check.evidence_ids.length > 0 && check.cleanup !== 'incomplete';
  for (const check of r.validation_checks) {
    refs(check.evidence_ids);
    if (check.authorization_ref !== m.authorization_ref || check.control_ids.some(id => !assigned.has(id))) fail('Check outside authorized scope');
    if (check.finding_ids.some(id => !findings.has(id) || !findings.get(id).control_ids.some(control => check.control_ids.includes(control)))) fail('Check finding mismatch');
    if (check.result !== 'inconclusive' && !conclusive(check)) fail('Unexecuted or unsupported conclusive check');
    if (check.state === 'executed' && (check.executed_at === null || !nonempty(check.actual))) fail('Executed check lacks actual result or time');
    if (check.state !== 'executed' && check.executed_at !== null) fail('Unexecuted check carries execution time');
    if (check.executed_at !== null && (Date.parse(check.executed_at) < start || Date.parse(check.executed_at) > end)) fail('Check execution outside run');
  }
  const priorReports = new Map();
  const carriedResearchIsValid = result => {
    try {
      if (r.phase !== 'research' || !['needs_evidence', 'candidate_gap', 'not_applicable'].includes(result.status) || !evidenceRoot) return false;
      const reference = evidence.get(result.prior_assessment.report_evidence_id);
      if (!reference || reference.type !== 'configuration') return false;
      if (!priorReports.has(reference.id)) {
        const bytes = readFileSync(safeFile(realpathSync.native(resolve(evidenceRoot)), reference.artifact.path));
        if (hash(bytes) !== reference.artifact.sha256) return false;
        const contents = bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.subarray(2).toString('utf16le') : bytes.toString('utf8').replace(/^\uFEFF/, '');
        priorReports.set(reference.id, JSON.parse(contents));
      }
      const previous = priorReports.get(reference.id);
      const version = previous?.manifest?.schema_version;
      if (!['3.1', '3.2', '3.3'].includes(version)) return false;
      const previousReportSchema = version === '3.3' ? reportSchema : load(`schemas/assessment.v${version}.schema.json`);
      const previousManifestSchema = version === '3.3' ? manifestSchema : load(`schemas/manifest.v${version}.schema.json`);
      const previousCatalog = version === '3.3' ? catalog : load(`catalog/v${version}.0.json`);
      const previousSets = version === '3.3' ? sets : load(`sets/v${version}.0.json`);
      if (shapeErrors(previous.report, previousReportSchema).length || shapeErrors(previous.manifest, previousManifestSchema).length) return false;
      const old = previous.report;
      if (old.phase !== 'research' || previous.manifest.mode !== 'review' || old.gate_recommendation !== 'needs_validation'
        || old.project_id !== r.project_id || old.project_id !== previous.manifest.project_id
        || old.manifest_hash !== hash(previous.manifest) || previous.manifest.catalog_hash !== hash(previousCatalog)
        || previous.manifest.schema_hash !== hash({ manifestSchema: previousManifestSchema, reportSchema: previousReportSchema })
        || previous.manifest.sets_hash !== hash(previousSets) || old.run.id !== previous.manifest.id
        || !same(old.assigned_control_ids, previous.manifest.assigned_control_ids)
        || previous.manifest.assessment_target !== m.assessment_target || !same(previous.manifest.features, m.features)
        || (previous.manifest.git_snapshot !== null && !same(previous.manifest.git_snapshot, m.git_snapshot))
        || !same(previous.manifest.snapshot, m.snapshot) || !same(old.snapshot, r.snapshot)
        || Date.parse(old.run.completed_at) > start || Date.parse(old.run.started_at) < Date.parse(previous.manifest.created_at)) return false;
      const original = old.controls.filter(item => item.control_id === result.control_id);
      if (original.length !== 1 || original[0].prior_assessment != null || !old.assigned_control_ids.includes(result.control_id)
        || Date.parse(original[0].assessed_at) < Date.parse(old.run.started_at) || Date.parse(original[0].assessed_at) > Date.parse(old.run.completed_at)) return false;
      const withoutOrigin = ({ prior_assessment, ...item }) => item;
      if (!same(withoutOrigin(original[0]), withoutOrigin(result))) return false;
      if (!same(previousCatalog.controls.find(item => item.id === result.control_id), catalog.controls.find(item => item.id === result.control_id))) return false;
      if (result.evidence_ids.some(id => !same(old.evidence.find(item => item.id === id), evidence.get(id)))) return false;
      if (result.finding_ids.some(id => !same(old.findings.find(item => item.id === id), findings.get(id)))) return false;
      return true;
    } catch { return false; }
  };
  for (const result of r.controls) {
    if (!assigned.has(result.control_id)) continue;
    refs(result.evidence_ids);
    if (result.prior_assessment !== null) {
      if (!carriedResearchIsValid(result)) fail('Invalid research carry-forward evidence or original disposition changed');
    } else if (Date.parse(result.assessed_at) < start) fail('Control assessment outside run');
    if (Date.parse(result.assessed_at) > end) fail('Control assessment outside run');
    if (result.applicability === 'not_applicable' && result.status !== 'not_applicable') fail('Inconsistent applicability');
    if (result.status !== 'validated_pass' && result.valid_until !== null) fail('Only validated passes carry validity');
    if (result.finding_ids.some(id => !findings.has(id) || !findings.get(id).control_ids.includes(result.control_id))) fail('Control finding mismatch');
    const relevant = r.validation_checks.filter(check => check.control_ids.includes(result.control_id));
    const supported = relevant.filter(conclusive);
    for (const check of relevant) {
      if (['validated_pass', 'not_applicable'].includes(result.status) && conclusive(check)
        && (m.validity_days === null || now - Date.parse(check.executed_at) > m.validity_days * 86400000)) fail('Supporting check execution is stale or lacks validity policy');
      if (check.executed_at && Date.parse(check.executed_at) > Date.parse(result.assessed_at)) fail('Control assessed before linked execution');
      for (const id of check.evidence_ids) if (evidence.has(id) && Date.parse(evidence.get(id).captured_at) > Date.parse(result.assessed_at)) fail('Control assessed before linked evidence capture');
      if (['validated_pass', 'not_applicable'].includes(result.status)) for (const id of check.evidence_ids) {
        if (evidence.has(id) && (m.validity_days === null || now - Date.parse(evidence.get(id).captured_at) > m.validity_days * 86400000)) fail('Supporting check evidence is stale or lacks validity policy');
      }
    }
    const coverage = result.coverage;
    const coverageIds = [...coverage.positive_check_ids, ...coverage.negative_check_ids, ...coverage.exclusion_check_ids];
    if (coverageIds.some(id => !supported.some(check => check.id === id && check.result === 'supports_pass' && check.evidence_ids.some(proof => result.evidence_ids.includes(proof))))) fail('Coverage references unsupported or unlinked check');
    if (coverage.negative_check_ids.some(id => coverage.positive_check_ids.includes(id))) fail('Positive and negative cases must be distinct checks');
    if (coverage.negative_check_ids.length && coverage.negative_not_applicable_reason !== null) fail('Negative case and exemption conflict');
    if (['validated_pass', 'not_applicable'].includes(result.status) && (result.remaining_validation.length || relevant.some(check => !conclusive(check)) || supported.some(check => check.result === 'supports_gap'))) fail('Pass or exclusion has unresolved or contradictory validation');
    if (result.status === 'validated_pass') {
      const until = Date.parse(result.valid_until), assessed = Date.parse(result.assessed_at);
      if (m.validity_days === null || until <= now || until <= assessed || until - assessed > m.validity_days * 86400000) fail('Expired pass or missing/exceeded validity policy');
      if (applicability(catalog.controls.find(item => item.id === result.control_id), m.features) !== 'applicable') fail('Pass has unresolved or contradicted feature applicability');
      if (!supported.some(check => check.result === 'supports_pass' && check.evidence_ids.some(id => result.evidence_ids.includes(id)) && Date.parse(check.executed_at) <= assessed)) fail('Pass lacks current linked check');
      if (r.validation_checks.some(check => check.control_ids.includes(result.control_id) && !conclusive(check))) fail('Pass retains an unresolved check');
      if (result.finding_ids.some(id => findings.get(id)?.outcome !== 'refuted') || supported.some(check => check.result === 'supports_gap')) fail('Pass contradicts finding or check');
      if (!coverage.positive_check_ids.length || (!coverage.negative_check_ids.length && !nonempty(coverage.negative_not_applicable_reason)) || coverage.exclusion_check_ids.length) fail('Pass lacks explicit positive/negative coverage or justified negative exclusion');
      if (catalog.controls.find(item => item.id === result.control_id).validation.negative_case_required && !coverage.negative_check_ids.length) fail('This control requires an executed negative case; an exemption cannot replace it');
      if (m.assessment_target === 'runtime' && !supported.some(check => check.result === 'supports_pass' && check.evidence_ids.some(id => result.evidence_ids.includes(id) && evidence.get(id)?.type === 'runtime'))) fail('Runtime pass lacks linked runtime evidence');
      if (m.assessment_target === 'runtime' && [...coverage.positive_check_ids, ...coverage.negative_check_ids].some(id =>
        !supported.find(check => check.id === id)?.evidence_ids.some(proof => result.evidence_ids.includes(proof) && evidence.get(proof)?.type === 'runtime'))) fail('Runtime coverage lacks case-specific runtime evidence');
      for (const id of result.evidence_ids) if (evidence.has(id) && (Date.parse(evidence.get(id).captured_at) > assessed || assessed - Date.parse(evidence.get(id).captured_at) > m.validity_days * 86400000)) fail('Pass evidence outside validity interval');
    }
    if (result.status === 'validated_gap' && !result.finding_ids.some(id => findings.get(id)?.outcome === 'confirmed')) fail('Validated gap lacks confirmed finding');
    if (result.status === 'not_applicable' && r.phase === 'validation') {
      if (m.validity_days === null) fail('Eligibility needs a validity policy for exclusions');
      for (const id of result.evidence_ids) if (evidence.has(id) && (Date.parse(evidence.get(id).captured_at) > Date.parse(result.assessed_at)
        || now - Date.parse(evidence.get(id).captured_at) > m.validity_days * 86400000)) fail('Exclusion evidence is stale or future');
      if (!supported.some(check => check.result === 'supports_pass' && check.evidence_ids.some(id => result.evidence_ids.includes(id)))) fail('Eligibility exclusion lacks an executed supporting check');
      if (!coverage.exclusion_check_ids.length || coverage.positive_check_ids.length || coverage.negative_check_ids.length || coverage.negative_not_applicable_reason !== null) fail('Exclusion lacks explicit applicability check coverage');
      if (m.assessment_target === 'runtime' && coverage.exclusion_check_ids.some(id =>
        !supported.find(check => check.id === id)?.evidence_ids.some(proof => result.evidence_ids.includes(proof)
          && ['runtime', 'configuration'].includes(evidence.get(proof)?.type)))) fail('Runtime exclusion lacks linked deployment applicability evidence');
    }
  }
  for (const finding of r.findings) {
    refs(finding.evidence_ids);
    refs(finding.legal_context?.source_evidence_ids ?? []);
    if (finding.control_ids.some(id => !assigned.has(id) || !controls.get(id)?.finding_ids.includes(finding.id))) fail('Finding coverage mismatch');
    if (finding.bucket !== 'evidence_request' && !finding.evidence_ids.length) fail('Gap claim lacks evidence');
    if (finding.legal_context && (!finding.legal_context.source_evidence_ids.length || finding.legal_context.source_evidence_ids.some(id => evidence.get(id)?.type !== 'primary_source'))) fail('Legal context lacks primary-source evidence');
    if (['confirmed', 'refuted'].includes(finding.outcome)) {
      const expected = finding.outcome === 'confirmed' ? 'supports_gap' : 'supports_pass';
      if (!r.validation_checks.some(check => conclusive(check) && check.result === expected && check.finding_ids.includes(finding.id)
        && finding.control_ids.every(id => check.control_ids.includes(id)) && check.evidence_ids.some(id => finding.evidence_ids.includes(id)))) fail('Finding lacks exact supporting check');
      if (r.validation_checks.some(check => check.finding_ids.includes(finding.id) && (!conclusive(check) || check.result !== expected))) fail('Finding has contradictory or unresolved checks');
    }
    if (finding.outcome === 'confirmed' && finding.control_ids.some(id => controls.get(id)?.status !== 'validated_gap')) fail('Confirmed finding contradicts control disposition');
  }
  if (duplicates(r.harness_feedback.map(item => item.id))) fail('Duplicate harness feedback IDs');
  if (m.purpose !== 'harness-drill' && r.harness_feedback.length) fail('Harness feedback requires an explicitly scoped drill');
  for (const item of r.harness_feedback) {
    if (item.control_ids.some(id => !assigned.has(id)) || item.finding_ids.some(id => !findings.has(id))) fail('Harness feedback outside frozen scope');
    if (item.finding_ids.some(id => !findings.get(id)?.control_ids.some(control => item.control_ids.includes(control)))) fail('Harness feedback does not link the observed control');
  }
  if (r.gate_recommendation === 'eligible_for_owner_review' && (r.run.assessor === 'unassigned'
    || r.controls.some(control => !['validated_pass', 'not_applicable'].includes(control.status))
    || r.findings.some(finding => finding.outcome !== 'refuted')
    || r.validation_checks.some(check => check.state !== 'executed' || check.result === 'inconclusive' || check.cleanup === 'incomplete'))) fail('Unresolved results cannot recommend eligibility');
  return [...new Set(errors)];
}

export function catalogErrors() {
  const errors = [...schemaErrors(reportSchema), ...schemaErrors(manifestSchema)];
  const ids = catalog.controls.map(item => item.id);
  const listed = catalog.modules.flatMap(item => item.control_ids);
  if (duplicates(ids) || duplicates(catalog.modules.map(item => item.id)) || duplicates(listed) || !same([...ids].sort(), [...listed].sort())) errors.push('Catalog membership mismatch');
  for (const item of catalog.controls) {
    if (!/^[A-Z][A-Z0-9_]*-[0-9]{2,}$/.test(item.id) || !catalog.modules.find(module => module.id === item.module_id)?.control_ids.includes(item.id)
      || ![item.title, item.expected_outcome, item.research?.method, item.validation?.method].every(nonempty)
      || item.research.permitted_mode !== 'read_only' || !item.applicability?.any_of?.length
      || item.applicability.any_of.some(flag => flag !== 'all' && !catalog.feature_keys.includes(flag))
      || !item.reference_ids?.length || item.reference_ids.some(id => !Object.hasOwn(catalog.references, id))) errors.push('Invalid catalog control');
    if (!item.research.evidence_required?.length || !item.validation.evidence_required?.length || !nonempty(item.validation.authorization)
      || !catalog.freshness_policies[item.freshness?.policy_ref] || !item.freshness?.invalidate_on?.length
      || item.failure_significance?.default_severity !== 'unassessed' || item.failure_significance?.default_gate !== 'needs_review') errors.push('Incomplete or unsafe catalog validation contract');
    if (typeof item.validation.negative_case_required !== 'boolean') errors.push('Missing negative-case policy');
  }
  if (sets.catalog_version !== catalog.catalog_version) errors.push('Set version mismatch');
  for (const name of Object.keys(sets.sets)) try { select([name]); } catch { errors.push('Invalid named set'); }
  return errors;
}

export function summarize(bundle, errors) {
  if (!bundle || shapeErrors(bundle.manifest, manifestSchema).length || shapeErrors(bundle.report, reportSchema).length) return {
    record_validation: 'invalid', errors, assessment_complete: false, gate_recommendation: 'blocked', meaning: 'Malformed records cannot produce a completion result.'
  };
  const counts = {};
  for (const result of bundle.report.controls) counts[result.status] = (counts[result.status] ?? 0) + 1;
  return { record_validation: errors.length ? 'invalid' : 'valid', errors,
    catalog_version: bundle.manifest.catalog_version, selected_controls: bundle.manifest.assigned_control_ids.length,
    dispositions: counts, findings: bundle.report.findings.map(item => ({ id: item.id, bucket: item.bucket, severity: item.severity, confidence: item.confidence, outcome: item.outcome })),
    assessment_target: bundle.manifest.assessment_target,
    purpose: bundle.manifest.purpose,
    finding_counts: { candidate_gaps: bundle.report.findings.filter(item => item.bucket !== 'evidence_request' && item.outcome === 'candidate').length,
      evidence_requests: bundle.report.findings.filter(item => item.bucket === 'evidence_request').length },
    harness_feedback_complete: bundle.manifest.purpose === 'harness-drill' ? !errors.length && bundle.report.harness_feedback.length > 0
      && bundle.report.controls.every(item => item.status !== 'not_assessed')
      && bundle.report.findings.every(item => bundle.report.harness_feedback.some(feedback => feedback.finding_ids.includes(item.id))) : null,
    findings_without_harness_feedback: bundle.manifest.purpose === 'harness-drill' ? bundle.report.findings.filter(item => !bundle.report.harness_feedback.some(feedback => feedback.finding_ids.includes(item.id))).map(item => item.id) : [],
    carried_research_controls: bundle.report.controls.filter(item => item.prior_assessment !== null).map(item => ({ control_id: item.control_id, assessed_at: item.assessed_at, report_evidence_id: item.prior_assessment.report_evidence_id })),
    assessment_complete: !errors.length && bundle.report.gate_recommendation === 'eligible_for_owner_review',
    outstanding_controls: bundle.report.controls.filter(item => !['validated_pass', 'not_applicable'].includes(item.status)).map(item => ({ control_id: item.control_id, status: item.status, remaining_validation: item.remaining_validation })),
    gate_recommendation: errors.length ? 'blocked' : bundle.report.gate_recommendation,
    limitations: [...new Set([...bundle.manifest.limitations, ...bundle.report.limitations])],
    meaning: 'Valid records are not proof of evidence truth, whole-project coverage, or release authorization.' };
}
