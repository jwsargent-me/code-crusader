// Maintainer-only regeneration. Does not inspect applications or alter v1.0.0.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const base = new URL('../', import.meta.url);
if (process.argv.slice(2).some(arg => arg !== '--check') || process.argv.slice(2).length > 1) throw new Error('Usage: node tools/build-contracts.mjs [--check]');
const checkOnly = process.argv.includes('--check');
const read = name => JSON.parse(readFileSync(new URL(name, base), 'utf8'));
const write = (name, value) => {
  const text = JSON.stringify(value, null, 2) + '\n';
  if (checkOnly) { if (readFileSync(new URL(name, base), 'utf8') !== text) throw new Error('Generated contracts differ; regenerate and review'); }
  else writeFileSync(new URL(name, base), text);
};
if (!checkOnly) for (const dir of ['catalog', 'schemas', 'sets']) mkdirSync(new URL(dir + '/', base), { recursive: true });
const catalog = read('baseline/v1.0.0/catalog.json');
catalog.schema_version = '3.3';
catalog.catalog_version = '3.3.0';
catalog.published_on = '2026-11-07';
catalog.purpose = 'Self-contained on-demand review and evidence validation. No automatic certification, remediation, or release.';
const additions = {
  P: ['Git and change quality', [
    ['Checkout and work preservation', 'Changes preserve user edits and occupied checkouts and start from the intended source base.', 'Inspect source-base metadata, worktree occupancy and pre-existing edits.', 'A dirty checkout alone is not a defect; interference or lost-work risk must be identified.'],
    ['Diff scope and relevance', 'Changed files serve the stated outcome without unrelated formatting, dependency churn or generated output.', 'Compare the full diff with the stated objective and inspect each changed file.', 'A large diff or mechanical migration can be justified; size alone is insufficient.'],
    ['Branch and promotion correctness', 'Head, base, upstream and promotion path follow the repository policy and actual enforcement is known.', 'Compare repository policy with ref topology and available branch-protection metadata.', 'Local policy text does not prove hosted enforcement; unavailable remote facts remain unknown.'],
    ['PR purpose and proportionality', 'Each PR has a concrete benefit, coherent scope and a reason to remain independently open.', 'Compare intent, net changes, overlapping PRs, supersession and review dependencies.', 'Small fixes and useful documentation PRs are valid; avoid line-count or PR-count quotas.'],
    ['Review and CI currency', 'Review and required checks cover the current proposed head and base with failed, skipped and unresolved checks visible.', 'Bind review and CI records to exact commits and compare current PR metadata.', 'Green CI does not establish review quality or correctness; unavailable hosted state cannot pass.'],
    ['Branch and PR lifecycle', 'Inactive branches and PRs have ownership, a disposition and an actionable next step.', 'Inspect last activity, blockers, dependencies and explicit paused or superseded status.', 'Age triggers investigation; intentionally paused work is not automatically abandoned.'],
    ['Safe retirement of work', 'Retirement proposals preserve unique work, dirty files, stashes and dependent branches.', 'Inspect reachability, patch equivalence, merged PRs, untracked work and dependent refs.', 'Unpushed work or a closed PR is not deletion proof; this control never authorizes cleanup.'],
    ['Maintainer-facing artifacts', 'Branch names, commits and PR descriptions explain concrete changes and truthful verification using repository conventions.', 'Read full artifact text and compare claimed validation with evidence.', 'Quoted UI copy, necessary detail and technical examples are legitimate; length heuristics are advisory.']
  ]],
  Q: ['Repository and documentation hygiene', [
    ['Repository footprint', 'Tracked files have a justified purpose and accidental caches, exports, binaries and temporary evidence are identified.', 'Inspect tracked paths, ignore rules, generated-file policy and ownership.', 'Required vendored, generated or binary assets may be intentional; establish a concrete maintenance cost.'],
    ['Documentation necessity', 'Documents serve an identifiable audience and durable purpose with proportional maintenance cost.', 'Compare documents for duplication, speculative plans and repetitive completion reports.', 'Do not impose a document-count cap or remove valuable design history solely because it is old.'],
    ['Documentation authority and freshness', 'Policies and procedures have a clear authoritative location and match implemented behavior.', 'Trace references and compare conflicting copies, commands, status claims and implementation.', 'Historical proposals may remain when clearly marked; never mistake a proposal for an implemented command.'],
    ['Reproducible handoff', 'Setup and verification are documented accurately without undocumented machine state or embedded credentials.', 'Compare documented commands, pinned dependencies, configuration templates and required local services.', 'Do not execute setup during review; a successful install does not prove the product works.']
  ]],
  R: ['Application engineering quality', [
    ['Test effectiveness', 'Tests detect meaningful regressions across essential positive, negative and boundary behavior.', 'Inspect assertions, skipped tests, mocks, error paths and linkage to user outcomes.', 'Coverage percentage and test count are insufficient; mutation execution requires a separate permitted scope.'],
    ['Verification authenticity', 'Verification claims distinguish planned, attempted, executed, passed, failed, skipped and inconclusive work with exact provenance.', 'Trace each claim to recorded checks, source identity, expected outcomes and sanitized actual results.', 'A command string or successful process exit alone does not prove the intended outcome.'],
    ['Requirement and behavior traceability', 'Essential intended user outcomes have coherent acceptance criteria and end-to-end behavior.', 'Trace representative tasks through UI, trusted enforcement, persistence and downstream completion.', 'A polished screen or isolated unit test does not establish a complete workflow.'],
    ['Maintainability and implementation legitimacy', 'Production paths use real supported interfaces and avoid harmful duplication, dead scaffolding and unnecessary abstractions.', 'Trace imports, callers, duplicated logic, placeholder implementations and dependency API usage.', 'Local similarity or abstraction count alone is not a defect; identify an incorrect behavior or maintenance burden.'],
    ['Migration and compatibility safety', 'Schema, data and interface changes preserve supported versions and have a bounded rollout and recovery path.', 'Inspect migration order, old/new client compatibility, backfills, partial failure and destructive steps.', 'No production migration is authorized; rollback may require forward recovery rather than reversing data loss.'],
    ['Performance and resource budgets', 'Essential workloads have justified latency, memory, storage and cost budgets with representative evidence.', 'Inspect hot paths, query bounds, pagination, bundle growth and representative workload assumptions.', 'No universal budget or benchmark threshold; synthetic results must disclose their workload limitations.'],
    ['Configuration contracts', 'Required configuration is validated at the appropriate boundary and missing or inconsistent settings fail safely across supported environments.', 'Trace configuration definitions, defaults, startup validation, public/private boundaries and environment-specific behavior.', 'A populated example file does not prove deployed configuration; never read or print secret values to fill evidence gaps.'],
    ['Assessment scope completeness', 'Validation identifies the relevant assets, dependencies, enforcement boundaries and unassessed surfaces before recommending scoped eligibility.', 'Compare selected files, environments, controls and evidence with an independent system inventory; identify omitted paths and change-invalidation triggers.', 'A complete selected checklist is not whole-project coverage; explicit narrow assessments remain useful when labelled accurately.'],
    ['Validation gate integrity', 'Validation gates reject unknown, skipped, contradictory, stale or unsupported evidence and bind completion to the approved scope.', 'Inspect negative fixtures, gate exit semantics, schema support, evidence artifacts and current source/runtime identities.', 'A passing record checker does not prove application behavior or authenticated authorization; preserve that distinction in automation.']
  ]],
  S: ['Additional security boundaries', [
    ['Inbound event authenticity', 'Non-payment webhooks and callbacks authenticate origin, bind payloads and handle replay and duplicate delivery safely.', 'Trace signature verification over the correct bytes, freshness, event scope, key rotation and deduplication.', 'Payment events remain covered by K-02; IP filtering alone may be an insufficient compensating control.'],
    ['Cryptographic construction and key lifecycle', 'Security-sensitive cryptography uses appropriate maintained primitives with safe randomness, nonces, key separation and recovery.', 'Inspect security-sensitive cryptographic calls, key references, nonce construction and rotation procedures.', 'Do not invent cryptographic requirements for non-security hashes or export key material.']
  ]]
};
const template = catalog.controls.find(control => control.id === 'G-01');
const publicErrors = structuredClone(template);
Object.assign(publicErrors, { id: 'F-09', module_id: 'F', title: 'Public error confidentiality',
  expected_outcome: 'Public error responses avoid internal diagnostics, credential material and unnecessary private context while retaining useful stable error codes and safe correlation.',
  false_positive_guidance: 'Generic UI copy does not establish API response confidentiality. A stable public error code or safe correlation identifier is not inherently a leak; establish the actual returned information and caller boundary.', reference_ids: ['asvs'] });
publicErrors.applicability = { any_of: ['http', 'realtime'] };
publicErrors.research.method = 'Trace public catch/error responses and upstream exception propagation, including API callers that bypass the UI. Compare related endpoints and client-side masking without inducing errors.';
publicErrors.validation.method = 'Use inert provider/database stubs with synthetic private diagnostic markers; verify positive safe public errors and negative rejection of raw diagnostics without exposing real secrets or exercising production.';
publicErrors.validation.evidence_required.push('Public error payloads from permitted positive and negative fixtures, linked to the actual handler and exact source snapshot.');
catalog.controls.push(publicErrors);
catalog.modules.find(module => module.id === 'F').control_ids.push('F-09');
catalog.references['owasp-webhooks'] = { title: 'OWASP Webhook Security Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Webhook_Security_Cheat_Sheet.html', kind: 'technical_guidance', pinned_version: null };
for (const [moduleId, [title, rows]] of Object.entries(additions)) {
  const ids = [];
  for (const [index, [name, outcome, method, caution]] of rows.entries()) {
    const id = `${moduleId}-${String(index + 1).padStart(2, '0')}`;
    ids.push(id);
    const control = structuredClone(template);
    Object.assign(control, { id, module_id: moduleId, title: name, expected_outcome: outcome, false_positive_guidance: caution, reference_ids: ['nist'] });
    control.research.method = method;
    control.validation.method = 'Independently reconcile scoped evidence with the expected outcome. Use permitted offline fixtures where decisive; record positive and negative cases and remaining limits. Runtime checks need separate authorization.';
    control.validation.evidence_required.push('Exact check-to-finding linkage and current source/environment identity; no inferred or fabricated execution.');
    catalog.controls.push(control);
    if (moduleId === 'S') control.reference_ids = index === 0 ? ['asvs', 'owasp-webhooks'] : ['asvs', 'nist'];
  }
  catalog.modules.push({ id: moduleId, title, applicability: { any_of: ['all'] }, control_ids: ids });
}
const enhancements = {
  'G-01': 'Include developer and agent output, PR bodies, attachments, screenshots, fixtures, source maps and reports. Identify credential type and location without reproducing a usable value; public identifiers are not automatically secrets.',
  'G-02': 'Inspect credential-helper and injection mechanisms, environment isolation, lifetime and incident revocation. Deleting an exposed value from a file is not proof of containment.',
  'G-03': 'Include developer tokens, automation identities, credential ownership and effective repository permissions.',
  'G-04': 'Verify dependency identities and actual API existence against installed or pinned versions; detect misleading package names and unsupported generated imports.',
  'G-05': 'Include contribution trust, workflow token scope, action pinning, artifact/cache poisoning and privileged follow-up workflows.',
  'L-03': 'Include coding-agent credential access, cancellation, denied-action handling and authority separation. Retrieved instructions cannot expand authorization.',
  'L-04': 'Include source, logs and credential references transmitted by coding agents or external model tools.',
  'E-06': 'Include outbound redirect revalidation, DNS/IP changes and private-network or metadata-service destinations where relevant.',
  'O-02': 'Include tooling output and build logs; preserve useful redacted evidence without retaining usable credentials.',
  'N-06': 'Trace visible success through persistence and downstream completion; detect placeholders, fake counters and controls that silently do nothing.',
  'M-08': 'Include cancellation, bounded retries and dependency-specific partial failure rather than relying on indefinite loading or blanket retries.'
};
for (const control of catalog.controls) if (enhancements[control.id]) control.research.method += ' ' + enhancements[control.id];
const negativeRequired = new Set(['B-01', 'B-02', 'B-03', 'B-04', 'B-05', 'B-08', 'C-02', 'C-03', 'C-04', 'C-05', 'C-06', 'C-07', 'C-08',
  'D-02', 'D-03', 'D-04', 'D-05', 'D-07', 'E-01', 'E-02', 'E-03', 'E-04', 'E-05', 'E-06', 'E-07', 'E-08',
  'F-02', 'F-03', 'F-05', 'F-06', 'F-07', 'F-08', 'F-09', 'K-01', 'K-02', 'K-03', 'K-04', 'K-05', 'K-06', 'K-07', 'L-02', 'L-03', 'L-04', 'S-01']);
for (const control of catalog.controls) control.validation.negative_case_required = negativeRequired.has(control.id);
// Live-fire lessons strengthen existing controls instead of multiplying generic attributes.
const drillMethods = {
  'R-05': ['Distinguish clean bootstrap, upgrade from an applied history, and restore/recovery. Compare duplicate objects and historical edits without replaying SQL during research.', 'Use disposable database fixtures for the untouched chain and an existing-schema upgrade; skipped migrations do not establish clean replay.'],
  'R-01': ['Separate modeled handler assertions and SQL text guards from actual database grants, transactions and independent-session locking.', 'Exercise real permission/rollback/concurrency boundaries where claimed; show that a targeted weakened variant fails. Failed setup is inconclusive.'],
  'R-02': ['Bind each verification claim to its actual engine, source and execution; a synchronous model cannot establish multi-session database locking.', 'Compare recorded assertions with their actual execution environment, including skipped fixtures and historical partial rehearsals.'],
  'G-06': ['Trace backend as well as frontend dependency resolution, direct and transitive identities, retained bundles and actual deploy-tool lock consumption.', 'Compare isolated clean build graphs with retained deployment artifacts; a lockfile that the deploy tool ignores is insufficient.'],
  'R-04': ['Trace verification flags from untrusted input to every consumer. Separate client-reported telemetry from trusted entitlement or reward enforcement and inspect dormant feature activation.', 'Use arbitrary, absent, mismatched and replayed synthetic markers; verify independent entitlement/rate boundaries and the stated trust contract.'],
  'M-03': ['Trace older retained writes against both newer still-pending and newer already-acknowledged peer writes. Inspect scalar, precise-index and full-column conflicts and session boundaries.', 'Use two-client synthetic sequences: fail A, acknowledge newer B, retry A. Cover permanent/transient errors, same/different fields and an explicit conflict policy without discarding unsaved work.'],
  'E-03': ['Trace dynamic text through email templates as well as browser sinks, including generated content, global writers and recipient ownership.', 'Render inert special-character/markup fixtures through real templates. Establish any crossed principal boundary; self-authored markup alone does not prove cross-user injection.'],
  'M-07': ['Inspect complete enumeration across independent paginated sources and aggregate-before-limit ranking. Trace silent missing-identity skips and truthful partial-result accounting.', 'Place eligible items on final pages, fail a later page, and compare more-than-one-page aggregate/rank results with an independent complete-data oracle.'],
  'M-06': ['Trace customer and operations jobs separately. Establish schedule, logical notification identity, retry-versus-reminder semantics and provider acceptance versus final delivery.', 'Use inert partial-success, accepted-but-response-lost, timeout and duplicate-invocation fixtures with bounded retries and defined cadence. Do not assume exactly-once inbox delivery.'],
  'N-03': ['Inspect decorative infinite animations, particles and preference-change handling; aria-hidden does not suppress visible motion.', 'Compare normal and reduced-motion settings on synthetic representative surfaces while preserving essential status feedback.'],
  'P-07': ['Separate unique SHA reachability from patch equivalence, squashed integration, backup and owner intent. Cached refs are not current hosted state.', 'Use permitted read-only equivalence and retention evidence; no age/count/closed-PR heuristic can authorize retirement.'],
  'R-08': ['Record whether the invocation assesses a consumer or drills the harness. In a drill, map consumer observations back to control coverage, false positives, evidence gaps and harness changes before proposing consumer work.', 'Reconcile every pilot finding to explicit harness feedback. Preserve historical source research and do not silently promote it to deployed facts.'],
  'R-09': ['Inspect case-specific source/runtime proof and execution freshness separately from artifact recapture. Test source-only negative cases borrowed by a runtime-positive result.', 'Reject each false-pass fixture independently; require runtime proof for every claimed runtime case and prevent fresh artifacts from laundering old executions.']
};
const drillCautions = {
  'R-04': 'A misleading verification label does not itself prove a paywall or entitlement bypass; establish consumers and active exposure.',
  'E-03': 'Unescaped text is not proof of browser-equivalent email XSS; trace writer authority, recipients and actual rendering.',
  'M-06': 'Repeated reminders can be intentional. Establish cadence and retry requirements before requiring durable identity or exactly-once behavior.',
  'M-07': 'Bounded results may cover a small cohort. Separate current impact from scale thresholds; a ranking error does not automatically invalidate billing or enforcement.',
  'G-06': 'Floating source imports do not prove a vulnerable SDK or changing live bundle. Retained build artifacts may supply a binding absent from the repository.',
  'R-05': 'Broken fresh replay need not break an already-migrated deployment. Avoid casually rewriting applied history.',
  'N-03': 'A motion observation does not establish full accessibility nonconformance or a flashing-threshold violation.'
};
for (const control of catalog.controls) {
  if (drillMethods[control.id]) {
    control.research.method += ' ' + drillMethods[control.id][0];
    control.validation.method += ' ' + drillMethods[control.id][1];
  }
  if (drillCautions[control.id]) control.false_positive_guidance = (control.false_positive_guidance ? control.false_positive_guidance + ' ' : '') + drillCautions[control.id];
}
write('catalog/v3.3.0.json', catalog);
const sets = { version: '3.3.0', catalog_version: '3.3.0', sets: {
  'repository-hygiene': ['P', 'Q', 'G-01', 'G-02', 'G-03', 'G-05'],
  'application-quality': ['M', 'N', 'R', 'Q-04'],
  'application-security': ['B', 'C', 'D', 'E', 'F', 'G', 'L-02', 'L-03', 'L-04', 'S'],
  'all': catalog.modules.map(module => module.id)
} };
write('sets/v3.3.0.json', sets);

// v3 adds artifact proof, assessment boundaries and explicit case coverage.
const schema = read('baseline/v1.0.0/assessment.schema.json');
schema.$id = 'urn:project-assurance:assessment:3.3';
schema.properties.schema_version.const = '3.3';
schema.properties.catalog_version = { const: '3.3.0' };
schema.$defs.controlIds.items.pattern = '^[A-Z][A-Z0-9_]*-[0-9]{2,}$';
schema.$defs.controlResult.properties.control_id.pattern = schema.$defs.controlIds.items.pattern;
schema.required.push('manifest_hash');
schema.properties.manifest_hash = { type: 'string', pattern: '^[a-f0-9]{64}$' };
schema.$defs.check.required.push('finding_ids', 'state', 'executed_at');
schema.$defs.check.properties.finding_ids = { $ref: '#/$defs/evidenceIds' };
schema.$defs.check.properties.state = { enum: ['planned', 'attempted', 'executed', 'skipped', 'inconclusive'] };
schema.$defs.check.properties.executed_at = { type: ['string', 'null'], format: 'date-time' };
schema.$defs.evidence.properties.snapshot = { type: 'string', pattern: '^[a-f0-9]{64}$' };
schema.$defs.evidence.required.push('artifact');
schema.$defs.evidence.properties.artifact = {
  type: 'object', additionalProperties: false, required: ['path', 'sha256'],
  properties: { path: { type: 'string', minLength: 1 }, sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' } }
};
schema.$defs.controlResult.required.push('coverage');
schema.$defs.controlResult.properties.coverage = {
  type: 'object', additionalProperties: false,
  required: ['positive_check_ids', 'negative_check_ids', 'negative_not_applicable_reason', 'exclusion_check_ids'],
  properties: {
    positive_check_ids: { $ref: '#/$defs/evidenceIds' }, negative_check_ids: { $ref: '#/$defs/evidenceIds' },
    negative_not_applicable_reason: { type: ['string', 'null'], minLength: 1 },
    exclusion_check_ids: { $ref: '#/$defs/evidenceIds' }
  }
};
schema.$defs.controlResult.required.push('prior_assessment');
schema.$defs.controlResult.properties.prior_assessment = {
  type: ['object', 'null'], additionalProperties: false, required: ['report_evidence_id'],
  properties: { report_evidence_id: { type: 'string', minLength: 1 } }
};
schema.required.push('harness_feedback');
schema.properties.harness_feedback = {
  type: 'array', items: {
    type: 'object', additionalProperties: false,
    required: ['id', 'finding_ids', 'control_ids', 'category', 'observation', 'recommendation', 'validation_plan'],
    properties: {
      id: { type: 'string', minLength: 1 }, finding_ids: { $ref: '#/$defs/evidenceIds' },
      control_ids: { $ref: '#/$defs/controlIds' },
      category: { enum: ['missing_control', 'weak_method', 'false_positive_guidance', 'record_validator', 'reporting', 'workflow', 'evidence_gap', 'no_harness_change'] },
      observation: { type: 'string', minLength: 1 }, recommendation: { type: 'string', minLength: 1 }, validation_plan: { type: 'string', minLength: 1 }
    }
  }
};
write('schemas/assessment.v3.3.schema.json', schema);
const text = { type: 'string', minLength: 1 };
const nullable = { type: ['string', 'null'] };
const strings = { type: 'array', uniqueItems: true, items: text };
const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const timestamp = { type: 'string', format: 'date-time' };
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const manifest = object({
  schema_version: { const: '3.3' }, catalog_version: { const: '3.3.0' },
  catalog_hash: hash, sets_hash: hash, schema_hash: hash, engine_hash: hash,
  assessment_target: { enum: ['source', 'runtime'] }, purpose: { enum: ['project-assessment', 'harness-drill'] },
  git_snapshot: { type: ['object', 'null'], additionalProperties: false, required: ['base_ref', 'digest'], properties: { base_ref: text, digest: hash } },
  id: text, project_id: text, mode: { enum: ['review', 'validation'] }, created_at: timestamp,
  authorization_ref: text, selectors: { ...strings, minItems: 1 }, exclusions: strings,
  assigned_control_ids: { ...strings, minItems: 1 },
  features: { type: 'object', additionalProperties: { enum: [true, false, null] } },
  validity_days: { type: ['number', 'null'], minimum: 1, maximum: 365 },
  validity_policy_ref: nullable,
  snapshot: object({ root: text, source_revision: nullable, environment: nullable, deployment: nullable,
    files: { type: 'array', minItems: 1, items: object({ path: text, sha256: hash }) }, digest: hash }),
  capabilities: { const: ['read_explicit_files', 'validate_records', 'emit_report'] },
  limitations: strings
});
manifest.$schema = schema.$schema;
manifest.$id = 'urn:project-assurance:manifest:3.3';
write('schemas/manifest.v3.3.schema.json', manifest);
