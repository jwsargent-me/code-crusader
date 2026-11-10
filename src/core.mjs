import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, realpathSync, lstatSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { shapeErrors, schemaErrors } from './shape.mjs';
import { inspectGit } from './git.mjs';

const base = new URL('../', import.meta.url);
export const load = name => JSON.parse(readFileSync(new URL(name, base), 'utf8').replace(/^\uFEFF/, ''));
export const catalogSchema = load('schemas/catalog.json');
export const catalogSource = load('catalog/controls.json');
export const catalog = resolveCatalog(catalogSource);
export const sets = load('catalog/sets.json');
export const reportSchema = load('schemas/assessment.json');
export const manifestSchema = load('schemas/manifest.json');
export const schemaVersion = manifestSchema.properties.schema_version.const;
export function resolveCatalog(definition) {
  const defaults = definition?.control_defaults ?? {};
  const merge = (shared, own) => {
    if (Array.isArray(shared) && Array.isArray(own)) return [...new Set([...shared, ...own])];
    if (shared && typeof shared === 'object' && !Array.isArray(shared)
      && own && typeof own === 'object' && !Array.isArray(own)) {
      const keys = new Set([...Object.keys(shared), ...Object.keys(own)]);
      return Object.fromEntries([...keys].map(key => [key, merge(shared[key], own[key])]));
    }
    return structuredClone(own === undefined ? shared : own);
  };
  return { ...definition, controls: Array.isArray(definition?.controls) ? definition.controls.map(control => merge(defaults, control)) : definition?.controls };
}

export function contractIdentity() {
  return { catalog_version: catalogSource.catalog_version, sets_version: sets.version, schema_version: schemaVersion,
    catalog_format: catalogSource.format_version, catalog_hash: hash(catalogSource), sets_hash: hash(sets),
    schema_hash: hash({ manifestSchema, reportSchema, catalogSchema }), engine_hash: engineHash() };
}

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

export function select(selectors, exclusions = [], definition = catalog, namedSets = sets) {
  if (!Array.isArray(selectors) || !selectors.length || !Array.isArray(exclusions)) throw new Error('Invalid selection');
  const known = new Set(definition.controls.map(control => control.id));
  const members = moduleId => definition.controls.filter(control => control.module_id === moduleId).map(control => control.id);
  const expand = selector => {
    if (typeof selector !== 'string') throw new Error('Invalid selector');
    if (known.has(selector)) return [selector];
    if (definition.modules.some(module => module.id === selector)) return members(selector);
    if (Object.hasOwn(namedSets.sets, selector)) return namedSets.sets[selector].flatMap(item => {
      if (item === '*') return [...known];
      if (known.has(item)) return [item];
      if (!definition.modules.some(module => module.id === item)) throw new Error('Invalid named set');
      return members(item);
    });
    throw new Error('Unknown selector');
  };
  const included = new Set(selectors.flatMap(expand));
  for (const id of new Set(exclusions.flatMap(expand))) {
    if (!included.has(id)) throw new Error('Exclusion outside selection');
    included.delete(id);
  }
  const ids = definition.controls.map(control => control.id).filter(id => included.has(id));
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
  const identities = new Set();
  const files = [...paths].sort().map(path => {
    const actual = safeFile(actualRoot, path), stat = lstatSync(actual, { bigint: true });
    const identity = stat.ino !== 0n ? stat.dev + ':' + stat.ino : actual;
    if (identities.has(identity)) throw new Error('Duplicate physical file in snapshot');
    identities.add(identity);
    return { path, sha256: hash(readFileSync(actual)) };
  });
  const result = { root: actualRoot, source_revision: metadata.source_revision ?? null,
    environment: metadata.environment ?? null, deployment: metadata.deployment ?? null, files };
  return { ...result, digest: hash(result) };
}

export function plan({ root, paths, selectors, exclusions = [], projectId, authorizationRef,
  mode = 'review', purpose = 'project-assessment', assessmentTarget = 'source', gitBase, features = {}, validityDays = null, validityPolicyRef = null, metadata = {}, now = new Date().toISOString() }) {
  const contractErrors = catalogErrors();
  if (contractErrors.length) throw new Error('Invalid catalog: ' + contractErrors.join('; '));
  const assigned = select(selectors, exclusions);
  if (!features || typeof features !== 'object' || Array.isArray(features)) throw new Error('Features must be an object');
  if (Object.keys(features).some(key => !catalog.feature_keys.includes(key))) throw new Error('Unknown feature key');
  const resolvedFeatures = Object.fromEntries(catalog.feature_keys.map(key => [key, features[key] ?? null]));
  const manifest = {
    schema_version: schemaVersion, catalog_version: catalog.catalog_version, assessment_target: assessmentTarget, engine_hash: engineHash(),
    git_snapshot: gitBase ? { base_ref: gitBase, digest: gitDigest(root, gitBase) } : null,
    catalog_hash: hash(catalogSource), sets_hash: hash(sets), schema_hash: hash({ manifestSchema, reportSchema, catalogSchema }),
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
    schema_version: schemaVersion, catalog_version: catalog.catalog_version, manifest_hash: hash(manifest),
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
    }), findings: [], evidence: [], validation_checks: [], harness_feedback: [], reviewer_observations: [], inspection_coverage: [], limitations: [...manifest.limitations],
    gate_recommendation: mode === 'review' ? 'needs_validation' : 'needs_review'
  };
  return { manifest, report };
}

export function manifestErrors(manifest, now = Date.now()) {
  const errors = shapeErrors(manifest, manifestSchema);
  if (errors.length) return errors;
  const fail = message => errors.push(message);
  if (manifest.catalog_version !== catalog.catalog_version) fail('Catalog version mismatch');
  const selected = catalog.controls.filter(control => manifest.assigned_control_ids.includes(control.id));
  if (selected.some(control => control.requires.includes('git_observation')) && manifest.git_snapshot === null) fail('Selected controls require a bound local Git observation');
  if (manifest.mode === 'validation' && manifest.assessment_target !== 'runtime' && selected.some(control => control.requires.includes('runtime_evidence'))) fail('Selected controls require runtime validation');
  const exceedsFreshness = selected.some(control => {
    const limit = catalog.freshness_policies[control.freshness.policy_ref].max_age_days;
    return limit !== null && manifest.validity_days > limit;
  });
  if (manifest.validity_days !== null && exceedsFreshness) fail('Validity interval exceeds a selected control freshness ceiling');
  if (!same(Object.keys(manifest.features).sort(), [...catalog.feature_keys].sort())) fail('Feature coverage mismatch');
  if (manifest.catalog_hash !== hash(catalogSource) || manifest.sets_hash !== hash(sets)
    || manifest.schema_hash !== hash({ manifestSchema, reportSchema, catalogSchema }) || manifest.engine_hash !== engineHash()) fail('Pinned contract or engine changed');
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
  if ([m?.schema_version, r?.schema_version].some(version => typeof version === 'string' && version !== schemaVersion)) return ['Unsupported record format; create a new plan with the current contracts'];
  const errors = manifestErrors(m, now);
  errors.push(...shapeErrors(r, reportSchema));
  if (errors.length) return errors;
  const fail = message => errors.push(message);
  if (expectedManifestHash !== undefined && expectedManifestHash !== hash(m)) fail('Approved manifest hash mismatch');
  if (r.manifest_hash !== hash(m)) fail('Report manifest binding mismatch');
  if (r.catalog_version !== m.catalog_version || r.project_id !== m.project_id || r.run.id !== m.id || r.authorization_ref !== m.authorization_ref
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
  const checks = new Map(r.validation_checks.map(check => [check.id, check]));
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
  const scopedFiles = new Set(m.snapshot.files.map(file => file.path));
  if (duplicates(r.inspection_coverage.map(item => item.path))) fail('Duplicate file inspection declaration');
  for (const item of r.inspection_coverage) {
    if (!scopedFiles.has(item.path)) fail('File inspection outside frozen scope');
    if (duplicates(item.execution_links.map(link => link.check_id))) fail('Duplicate file execution link');
    for (const link of item.execution_links) {
      const check = checks.get(link.check_id);
      if (!check || check.state !== 'executed' || check.executed_at === null || !check.evidence_ids.length
        || check.evidence_ids.some(id => !evidence.has(id))) fail('File execution link requires an executed artifact-backed check');
    }
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
      if (version !== schemaVersion) return false;
      if (shapeErrors(previous.report, reportSchema).length || shapeErrors(previous.manifest, manifestSchema).length) return false;
      const old = previous.report;
      if (old.phase !== 'research' || previous.manifest.mode !== 'review' || old.gate_recommendation !== 'needs_validation'
        || old.project_id !== r.project_id || old.project_id !== previous.manifest.project_id
        || old.manifest_hash !== hash(previous.manifest) || previous.manifest.engine_hash !== m.engine_hash
        || old.catalog_version !== m.catalog_version || previous.manifest.catalog_version !== m.catalog_version
        || previous.manifest.catalog_hash !== hash(catalogSource)
        || previous.manifest.schema_hash !== hash({ manifestSchema, reportSchema, catalogSchema })
        || previous.manifest.sets_hash !== hash(sets) || old.run.id !== previous.manifest.id
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
      if (result.finding_ids.some(id => {
        const matches = old.findings.filter(item => item.id === id);
        return matches.length !== 1 || !same(matches[0], findings.get(id));
      })) return false;
      const supportingIds = new Set([...result.evidence_ids, ...result.finding_ids.flatMap(id => findings.get(id)?.evidence_ids ?? [])]);
      if ([...supportingIds].some(id => {
        const matches = old.evidence.filter(item => item.id === id);
        return matches.length !== 1 || !evidence.has(id) || !same(matches[0], evidence.get(id));
      })) return false;
      return true;
    } catch { return false; }
  };
  for (const result of r.controls) {
    if (!assigned.has(result.control_id)) continue;
    refs(result.evidence_ids);
    if (result.status !== 'not_assessed') {
      const supportingIds = new Set([...result.evidence_ids, ...result.finding_ids.flatMap(id => findings.get(id)?.evidence_ids ?? [])]);
      if ([...supportingIds].some(id => evidence.has(id) && Date.parse(evidence.get(id).captured_at) > Date.parse(result.assessed_at))) fail('Control assessed before supporting evidence capture');
    }
    if (result.prior_assessment !== null) {
      if (!carriedResearchIsValid(result)) fail('Invalid research carry-forward evidence or original disposition changed');
    } else if (Date.parse(result.assessed_at) < start) fail('Control assessment outside run');
    if (Date.parse(result.assessed_at) > end) fail('Control assessment outside run');
    if (result.status === 'not_applicable' && applicability(catalog.controls.find(control => control.id === result.control_id), m.features) !== 'not_applicable') fail('Exclusion contradicts frozen applicability or leaves it unknown');
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
    for (const [field, kind] of [['positive_check_ids', 'positive'], ['negative_check_ids', 'negative'], ['exclusion_check_ids', 'applicability']]) {
      if (coverage[field].some(id => checks.get(id)?.case_kind !== kind)) fail('Coverage requires a declared ' + kind + ' case');
    }
    const describedCase = check => hash([check.method, check.expected, check.actual].map(value => value.trim().replace(/\s+/g, ' ')));
    if (coverage.negative_check_ids.some(id => checks.has(id) && coverage.positive_check_ids.some(positive => checks.has(positive) && describedCase(checks.get(id)) === describedCase(checks.get(positive))))) fail('Positive and negative cases repeat the same described check');
    if (coverage.negative_check_ids.some(id => coverage.positive_check_ids.includes(id))) fail('Positive and negative cases must be distinct checks');
    if (coverage.negative_check_ids.length && coverage.negative_not_applicable_reason !== null) fail('Negative case and exemption conflict');
    if ((result.status === 'validated_pass' || (result.status === 'not_applicable' && r.phase === 'validation')) && (result.remaining_validation.length || relevant.some(check => !conclusive(check)) || supported.some(check => check.result === 'supports_gap'))) fail('Pass or exclusion has unresolved or contradictory validation');
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
    if (finding.issue_types.includes('undetermined') && (finding.issue_types.length !== 1 || finding.bucket !== 'evidence_request' || !['candidate', 'inconclusive'].includes(finding.outcome))) fail('Undetermined issue type requires an exclusive unresolved evidence request');
    if (finding.issue_types.includes('unsupported_claim') !== (finding.claim_reference !== null)) fail('Unsupported claim requires an exact claim reference and scope');
    for (const context of [finding.acknowledgement, finding.claim_reference].filter(Boolean)) {
      refs(context.evidence_ids);
      if (context.evidence_ids.some(id => !finding.evidence_ids.includes(id))) fail('Finding context evidence must support the finding');
    }
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
  const observations = r.reviewer_observations ?? [];
  if (duplicates(observations.map(item => item.id))) fail('Duplicate reviewer observation IDs');
  for (const item of observations) {
    refs(item.evidence_ids ?? []);
    if ((item.control_ids ?? []).some(id => !assigned.has(id)) || (item.finding_ids ?? []).some(id => !findings.has(id))) fail('Reviewer observation outside frozen scope');
    if ((item.control_ids ?? []).length && (item.finding_ids ?? []).some(id => !findings.get(id)?.control_ids.some(control => item.control_ids.includes(control)))) fail('Reviewer observation does not link the observed control');
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

export function catalogErrors(definition = catalogSource, namedSets = sets) {
  const errors = [...schemaErrors(reportSchema), ...schemaErrors(manifestSchema), ...schemaErrors(catalogSchema),
    ...shapeErrors(definition, catalogSchema), ...shapeErrors(namedSets, catalogSchema.$defs.namedSets, catalogSchema)];
  if (errors.length) return errors;
  const effective = resolveCatalog(definition);
  if (reportSchema.properties.schema_version.const !== schemaVersion) errors.push('Record schema format mismatch');
  const modules = effective.modules.map(module => module.id), ids = effective.controls.map(control => control.id);
  if (duplicates(modules)) errors.push('Duplicate module ID');
  if (duplicates(ids)) errors.push('Duplicate control ID');
  if (duplicates(effective.feature_keys)) errors.push('Duplicate feature key');
  for (const [name, policy] of Object.entries(effective.freshness_policies)) if (policy.max_age_days !== null && !Number.isInteger(policy.max_age_days)) errors.push('Invalid freshness ceiling: ' + name);
  const flagsKnown = rule => rule.any_of.every(flag => flag === 'all' || effective.feature_keys.includes(flag));
  if (effective.modules.some(module => !flagsKnown(module.applicability))) errors.push('Unknown module discovery feature');
  for (const item of effective.controls) {
    errors.push(...shapeErrors(item, catalogSchema.$defs.effectiveControl, catalogSchema).map(error => item.id + ': ' + error));
    if (!modules.includes(item.module_id) || !item.id.startsWith(item.module_id + '-')) errors.push(item.id + ': Invalid control module');
    if (!flagsKnown(item.applicability)) errors.push(item.id + ': Unknown applicability feature');
    if (item.reference_ids.some(id => !Object.hasOwn(effective.references, id))) errors.push(item.id + ': Unknown guidance reference');
    if (!Object.hasOwn(effective.freshness_policies, item.freshness.policy_ref)) errors.push(item.id + ': Unknown freshness policy');
  }
  if (!same(namedSets.sets.all, ['*'])) errors.push('The all set must include every control using ["*"]');
  for (const [name, selectors] of Object.entries(namedSets.sets)) {
    if (!/^[a-z][a-z0-9-]*$/.test(name) || selectors.some(id => id !== '*' && !ids.includes(id) && !modules.includes(id))) errors.push('Invalid named set: ' + name);
    else try { select([name], [], effective, namedSets); } catch { errors.push('Empty or invalid named set: ' + name); }
  }
  return errors;
}

export function summarize(bundle, errors) {
  if (!bundle || shapeErrors(bundle.manifest, manifestSchema).length || shapeErrors(bundle.report, reportSchema).length) return {
    record_validation: 'invalid', errors, assessment_complete: false, gate_recommendation: 'blocked', meaning: 'Malformed records cannot produce a completion result.'
  };
  const counts = {};
  for (const result of bundle.report.controls) counts[result.status] = (counts[result.status] ?? 0) + 1;
  const declarations = new Map(bundle.report.inspection_coverage.map(item => [item.path, item]));
  const checks = new Map(bundle.report.validation_checks.map(item => [item.id, item]));
  const evidenceIds = new Set(bundle.report.evidence.map(item => item.id));
  const files = bundle.manifest.snapshot.files.map(file => {
    const declared = declarations.get(file.path);
    return { path: file.path, sha256: file.sha256, inspection: declared?.inspection ?? 'not_inspected', inspection_notes: declared?.inspection_notes ?? null,
      execution_links: (declared?.execution_links ?? []).map(link => ({ ...link, state: checks.get(link.check_id)?.state ?? 'unknown', result: checks.get(link.check_id)?.result ?? 'unknown', cleanup: checks.get(link.check_id)?.cleanup ?? 'unknown' })) };
  });
  const executionLinked = file => file.execution_links.some(link => {
    const check = checks.get(link.check_id);
    return check?.state === 'executed' && check.executed_at !== null && check.evidence_ids.length > 0 && check.evidence_ids.every(id => evidenceIds.has(id));
  });
  return { record_validation: errors.length ? 'invalid' : 'valid', errors,
    inspection_coverage: {
      fingerprinted_files: files.length, whole_file_inspections: files.filter(file => file.inspection === 'whole').length,
      partial_file_inspections: files.filter(file => file.inspection === 'partial').length,
      uninspected_files: files.filter(file => file.inspection === 'not_inspected').length,
      execution_linked_files: files.filter(executionLinked).length, files_without_execution_links: files.filter(file => !executionLinked(file)).length,
      files, meaning: 'Fingerprints establish identity. Inspection and behavior-to-execution links are reviewer declarations; execution is not a pass or proof of whole-file coverage.'
    },
    contract_identity: {
      catalog_version: bundle.manifest.catalog_version, schema_version: bundle.manifest.schema_version,
      catalog_hash: bundle.manifest.catalog_hash, sets_hash: bundle.manifest.sets_hash,
      schema_hash: bundle.manifest.schema_hash, engine_hash: bundle.manifest.engine_hash
    },
    check_states: Object.fromEntries(reportSchema.$defs.check.properties.state.enum.map(state => [state, bundle.report.validation_checks.filter(check => check.state === state).length])),
    unresolved_checks: bundle.report.validation_checks.filter(check => check.state !== 'executed' || check.result === 'inconclusive' || check.cleanup === 'incomplete').map(check => ({ id: check.id, control_ids: check.control_ids, case_kind: check.case_kind, state: check.state, result: check.result, cleanup: check.cleanup })),
    incomplete_cleanup: bundle.report.validation_checks.filter(check => check.cleanup === 'incomplete').map(check => ({ id: check.id, control_ids: check.control_ids })),
    catalog_version: bundle.manifest.catalog_version, selected_controls: bundle.manifest.assigned_control_ids.length,
    dispositions: counts, findings: bundle.report.findings.map(item => ({ id: item.id, bucket: item.bucket, severity: item.severity, confidence: item.confidence, outcome: item.outcome,
      issue_types: item.issue_types, acknowledgement: item.acknowledgement, claim_reference: item.claim_reference })),
    reviewer_observation_count: (bundle.report.reviewer_observations ?? []).length,
    issue_type_counts: Object.fromEntries(reportSchema.$defs.finding.properties.issue_types.items.enum.map(type => [type, bundle.report.findings.filter(item => item.issue_types.includes(type)).length])),
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
    outstanding_controls: bundle.report.controls.filter(item => item.status !== 'validated_pass' && !(item.status === 'not_applicable' && bundle.report.phase === 'validation')).map(item => ({ control_id: item.control_id, status: item.status, remaining_validation: item.remaining_validation })),
    gate_recommendation: errors.length ? 'blocked' : bundle.report.gate_recommendation,
    limitations: [...new Set([...bundle.manifest.limitations, ...bundle.report.limitations])],
    meaning: 'Valid records are not proof of evidence truth, whole-project coverage, or release authorization.' };
}
