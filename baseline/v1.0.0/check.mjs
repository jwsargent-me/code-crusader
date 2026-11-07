#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const base = new URL('./', import.meta.url)
const read = name => JSON.parse(readFileSync(new URL(name, base), 'utf8'))
const catalog = read('catalog.json')
const schema = read('assessment.schema.json')
const nonempty = value => typeof value === 'string' && value.trim().length > 0
const duplicates = values => values.length !== new Set(values).size

export function catalogErrors(value, profile) {
  const errors = []
  const fail = message => errors.push(message)
  if (value.schema_version !== '1.0' || value.catalog_version !== '1.0.0') fail('Unsupported catalog/schema version')
  if (value.controls?.length !== 120 || value.modules?.length !== 15) fail('Expected 120 controls across 15 modules')
  const ids = (value.controls ?? []).map(control => control.id)
  if (duplicates(ids)) fail('Duplicate control ID')
  const moduleIds = value.modules.map(module => module.id)
  if (duplicates(moduleIds)) fail('Duplicate module ID')
  const listed = value.modules.flatMap(module => module.control_ids)
  if (duplicates(listed) || listed.length !== ids.length || listed.some(id => !ids.includes(id))) fail('Module control coverage mismatch')
  for (const module of value.modules) {
    if (!/^[A-O]$/.test(module.id) || module.control_ids.length !== 8 || !nonempty(module.title)) fail('Invalid module')
    for (let n = 1; n <= 8; n++) if (!module.control_ids.includes(`${module.id}-0${n}`)) fail(`Missing stable ID in module ${module.id}`)
  }
  for (const control of value.controls) {
    if (!/^[A-O]-0[1-8]$/.test(control.id) || !moduleIds.includes(control.module_id) || !control.id.startsWith(control.module_id + '-')) fail('Invalid control identity')
    if (!value.modules.find(module => module.id === control.module_id)?.control_ids.includes(control.id)) fail(`Wrong module membership: ${control.id}`)
    for (const field of ['title', 'expected_outcome']) if (!nonempty(control[field])) fail(`Missing ${field}: ${control.id}`)
    const selectors = control.applicability?.any_of
    if (!Array.isArray(selectors) || !selectors.length || selectors.some(key => key !== 'all' && !value.feature_keys.includes(key))) fail(`Invalid applicability: ${control.id}`)
    if (control.research?.permitted_mode !== 'read_only' || !nonempty(control.research?.method) || !control.research?.evidence_required?.length) fail(`Invalid research contract: ${control.id}`)
    if (!nonempty(control.validation?.method) || !nonempty(control.validation?.authorization) || !control.validation?.evidence_required?.length) fail(`Invalid validation contract: ${control.id}`)
    if (control.failure_significance?.default_severity !== 'unassessed' || control.failure_significance?.default_gate !== 'needs_review') fail(`Unsafe default: ${control.id}`)
    if (!value.freshness_policies[control.freshness?.policy_ref] || !control.freshness?.invalidate_on?.length) fail(`Missing freshness policy: ${control.id}`)
    if (!control.reference_ids?.length || control.reference_ids.some(id => !value.references[id])) fail(`Broken reference: ${control.id}`)
  }
  for (const reference of Object.values(value.references)) {
    try { if (new URL(reference.url).protocol !== 'https:' || !nonempty(reference.title)) fail('Invalid primary reference') } catch { fail('Invalid primary reference URL') }
  }
  if (profile) {
    if (profile.profile_status !== 'incomplete' || profile.authorized_scope.validation.production_effects_approved !== false) fail('Example profile must remain incomplete and non-authorizing')
    if (value.feature_keys.some(key => !(key in profile.features)) || Object.keys(profile.features).some(key => !value.feature_keys.includes(key))) fail('Profile feature coverage mismatch')
    if (Object.values(profile.features).some(value => value !== null)) fail('Example features must remain unknown')
  }
  return errors
}

// Implements only the JSON Schema keywords used by the bundled report schema.
// This is not a general JSON Schema implementation or an evidence-truth validator.
export function shapeErrors(value, rule = schema, path = '$') {
  const errors = []
  const fail = message => errors.push(`${path}: ${message}`)
  if (rule.$ref) {
    const target = rule.$ref.split('/').slice(1).reduce((part, key) => part[key], schema)
    return shapeErrors(value, target, path)
  }
  const types = rule.type ? [rule.type].flat() : []
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
  if (types.length && !types.includes(actual)) return [`${path}: incorrect type`]
  if ('const' in rule && JSON.stringify(value) !== JSON.stringify(rule.const)) fail('incorrect constant')
  if (rule.enum && !rule.enum.includes(value)) fail('value outside enum')
  if (typeof value === 'string') {
    if (rule.minLength && value.trim().length < rule.minLength) fail('empty text')
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) fail('invalid ID pattern')
    if (rule.format === 'date-time' && (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value)))) fail('invalid timestamp')
  }
  if (Array.isArray(value)) {
    if (rule.minItems !== undefined && value.length < rule.minItems) fail('too few entries')
    if (rule.maxItems !== undefined && value.length > rule.maxItems) fail('too many entries')
    if (rule.uniqueItems && duplicates(value.map(item => JSON.stringify(item)))) fail('duplicate entries')
    if (rule.items) value.forEach((item, i) => errors.push(...shapeErrors(item, rule.items, `${path}[${i}]`)))
  }
  if (actual === 'object') {
    for (const key of rule.required ?? []) if (!(key in value)) fail(`missing field ${key}`)
    for (const [key, item] of Object.entries(value)) {
      if (rule.properties?.[key]) errors.push(...shapeErrors(item, rule.properties[key], `${path}.${key}`))
      else if (rule.additionalProperties === false) fail(`unexpected field ${key}`)
    }
  }
  for (const subrule of rule.allOf ?? []) errors.push(...shapeErrors(value, subrule, path))
  if (rule.if) {
    const branch = shapeErrors(value, rule.if, path).length === 0 ? rule.then : rule.else
    if (branch) errors.push(...shapeErrors(value, branch, path))
  }
  return errors
}

export function reportErrors(report, now = Date.now()) {
  const errors = shapeErrors(report)
  if (errors.length) return errors
  const fail = message => errors.push(message)
  if (report.catalog_version !== catalog.catalog_version) fail('Report catalog version mismatch')
  const known = new Set(catalog.controls.map(control => control.id))
  const assigned = new Set(report.assigned_control_ids)
  if (report.assigned_control_ids.some(id => !known.has(id))) fail('Unknown assigned control')
  const assessed = report.controls.map(result => result.control_id)
  if (duplicates(assessed) || assessed.length !== assigned.size || assessed.some(id => !assigned.has(id))) fail('Assignment coverage mismatch')
  const evidence = new Map(report.evidence.map(item => [item.id, item]))
  const findings = new Map(report.findings.map(item => [item.id, item]))
  if (evidence.size !== report.evidence.length || findings.size !== report.findings.length || duplicates(report.validation_checks.map(check => check.id))) fail('Duplicate report IDs')
  if (Date.parse(report.run.completed_at) < Date.parse(report.run.started_at)) fail('Run timestamps out of order')
  const checkEvidence = ids => { if (ids.some(id => !evidence.has(id))) fail('Unresolved evidence reference') }
  for (const result of report.controls) {
    checkEvidence(result.evidence_ids)
    if (result.finding_ids.some(id => !findings.has(id) || !findings.get(id).control_ids.includes(result.control_id))) fail('Unresolved/mismatched control finding reference')
    if (result.applicability === 'not_applicable' && result.status !== 'not_applicable') fail('Inconsistent applicability disposition')
    if (result.status === 'validated_pass') {
      if (Date.parse(result.valid_until) <= now || Date.parse(result.valid_until) <= Date.parse(result.assessed_at)) fail('Pass evidence is expired or invalid')
      if (!report.validation_checks.some(check => check.control_ids.includes(result.control_id) && check.result === 'supports_pass' && check.evidence_ids.length)) fail('Pass lacks a supporting check')
    }
    if (result.status === 'validated_gap' && !result.finding_ids.some(id => findings.get(id)?.outcome === 'confirmed')) fail('Validated gap lacks a confirmed finding')
  }
  for (const finding of report.findings) {
    if (finding.control_ids.some(id => !assigned.has(id))) fail('Finding outside assignment')
    for (const id of finding.control_ids) if (!report.controls.find(control => control.control_id === id)?.finding_ids.includes(finding.id)) fail('Missing reciprocal finding link')
    checkEvidence(finding.evidence_ids)
    checkEvidence(finding.legal_context?.source_evidence_ids ?? [])
    if (finding.legal_context && (!finding.legal_context.source_evidence_ids.length || finding.legal_context.source_evidence_ids.some(id => evidence.get(id)?.type !== 'primary_source'))) fail('Legal context lacks primary-source evidence')
    if (finding.bucket !== 'evidence_request' && !finding.evidence_ids.length) fail('Gap claim lacks evidence')
    if (finding.outcome === 'confirmed' && !report.validation_checks.some(check => check.result === 'supports_gap' && check.control_ids.some(id => finding.control_ids.includes(id)) && check.evidence_ids.length)) fail('Confirmed finding lacks a supporting check')
  }
  for (const check of report.validation_checks) {
    if (check.control_ids.some(id => !assigned.has(id))) fail('Check outside assignment')
    checkEvidence(check.evidence_ids)
    if (check.result !== 'inconclusive' && !check.evidence_ids.length) fail('Conclusive check lacks evidence')
  }
  if (report.gate_recommendation === 'eligible_for_owner_review') {
    if (report.controls.some(control => !['validated_pass', 'not_applicable'].includes(control.status)) || report.findings.some(finding => finding.outcome !== 'refuted') || report.validation_checks.some(check => check.cleanup === 'incomplete')) fail('Unresolved results cannot recommend eligibility')
  }
  return errors
}

function selfTest() {
  const copy = value => structuredClone(value)
  assert.deepEqual(catalogErrors(catalog, read('project-profile.example.json')), [])
  const duplicate = copy(catalog); duplicate.controls[1].id = duplicate.controls[0].id
  assert.ok(catalogErrors(duplicate).length)
  const missing = copy(catalog); missing.controls.pop()
  assert.ok(catalogErrors(missing).length)
  const broken = copy(catalog); broken.controls[0].reference_ids = ['missing']
  assert.ok(catalogErrors(broken).length)
  const timestamp = '2026-10-31T12:00:00Z'
  const report = {schema_version:'1.0',catalog_version:'1.0.0',project_id:'fixture',phase:'research',run:{id:'fixture',assessor:'fixture',model_requested:null,model_actual:null,started_at:timestamp,completed_at:timestamp},snapshot:{repository:null,source_revision:null,deployment:null,environment:null,profile_ref:'fixture'},authorization_ref:'fixture-read-only',assigned_control_ids:['A-01'],controls:[{control_id:'A-01',status:'needs_evidence',applicability:'unknown',rationale:'Owner evidence unavailable.',evidence_ids:[],finding_ids:[],remaining_validation:['Confirm ownership.'],assessed_at:timestamp,valid_until:null}],findings:[],evidence:[],validation_checks:[],limitations:['Synthetic fixture only.'],gate_recommendation:'needs_validation'}
  assert.deepEqual(reportErrors(report), [])
  const illegalPass = copy(report); illegalPass.controls[0].status = 'validated_pass'
  assert.ok(reportErrors(illegalPass).length)
  const uncovered = copy(report); uncovered.assigned_control_ids.push('A-02')
  assert.ok(reportErrors(uncovered).length)
  const evidence = copy(report); evidence.controls[0].evidence_ids.push('absent')
  assert.ok(reportErrors(evidence).length)
  const early = copy(report); early.gate_recommendation = 'eligible_for_owner_review'
  assert.ok(reportErrors(early).length)
  const validation = copy(report); validation.phase='validation'; validation.gate_recommendation='eligible_for_owner_review'
  assert.ok(reportErrors(validation).length)
  const notApplicable = copy(report); notApplicable.controls[0].status='not_applicable'; notApplicable.controls[0].applicability='not_applicable'
  assert.ok(reportErrors(notApplicable).length)
  const valid = copy(report)
  valid.phase='validation'; valid.gate_recommendation='eligible_for_owner_review'
  valid.evidence=[{id:'proof',type:'organizational',locator:'synthetic-fixture',captured_at:timestamp,snapshot:'fixture-v1',environment:'isolated',summary:'Synthetic ownership review.',limitations:[]}]
  valid.controls[0]={...valid.controls[0],status:'validated_pass',applicability:'applicable',evidence_ids:['proof'],remaining_validation:[],valid_until:'2026-11-30T12:00:00Z'}
  valid.validation_checks=[{id:'check',control_ids:['A-01'],method:'Synthetic static review.',authorization_ref:'fixture',expected:'Ownership records.',actual:'Synthetic records present.',result:'supports_pass',evidence_ids:['proof'],cleanup:'not_required'}]
  const fixedNow=Date.parse('2026-11-01T00:00:00Z')
  assert.deepEqual(reportErrors(valid,fixedNow),[])
  const expired=copy(valid);expired.controls[0].valid_until='2026-10-31T12:02:00Z'
  assert.ok(reportErrors(expired,fixedNow).length)
  const unsupported=copy(valid);unsupported.validation_checks=[]
  assert.ok(reportErrors(unsupported,fixedNow).length)
  const cleanup=copy(valid);cleanup.validation_checks[0].cleanup='incomplete'
  assert.ok(reportErrors(cleanup,fixedNow).length)
  const wrongEvidence=copy(valid);wrongEvidence.evidence.push(copy(wrongEvidence.evidence[0]))
  assert.ok(reportErrors(wrongEvidence,fixedNow).length)
  console.log('PASS: 16 contract/policy cases, including valid scoped validation and rejected stale/unsupported passes, incomplete cleanup, missing coverage and broken evidence.')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const errors = catalogErrors(catalog, read('project-profile.example.json'))
    for (const name of ['README.md','researcher-protocol.md','validator-protocol.md']) if (!readFileSync(new URL(name, base), 'utf8').trim()) errors.push(`Empty protocol: ${name}`)
    if (process.argv[2] === '--self-test') selfTest()
    else if (process.argv[2]) errors.push(...reportErrors(JSON.parse(readFileSync(process.argv[2], 'utf8'))))
    if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1 }
    else console.log('PASS: 120 controls, 15 modules, profile selectors and reference links are consistent' + (process.argv[2] && process.argv[2] !== '--self-test' ? '; report policy checks passed.' : '.'))
  } catch {
    console.error('Check failed: malformed input, missing file or invalid contract. Raw report contents withheld.')
    process.exitCode = 1
  }
}
