import { summarize } from './core.mjs';

// Reviewer-authored descriptions are opt-in via the report command. Escape them
// as literal Markdown text; source content and evidence file bytes are never printed.
const text = value => String(value ?? '').replace(/[\r\n\x00-\x1f]+/g, ' ').trimStart()
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\`*_[\]|~]/g, '\\$&')
  .replace(/^[#+=-]/, '\\$&').replace(/^(\d{1,9})([.)])(?=\s|$)/, '$1\\$2')
  .replace(/(https?|ftp):(?=\/\/)/gi, '$1&#58;').replace(/(www)\./gi, '$1&#46;').replace(/@(?=\S)/g, '&#64;');
export function renderReport(bundle, errors, { controlIds = [] } = {}) {
  const summary = summarize(bundle, errors);
  const lines = ['# Project assurance report', '', `Record validation: **${summary.record_validation}**. Gate: **${text(summary.gate_recommendation)}**.`, ''];
  if (!summary.dispositions) return [...lines, ...errors.map(error => '- ' + text(error)), ''].join('\n');
  if (!Array.isArray(controlIds) || new Set(controlIds).size !== controlIds.length || controlIds.some(id => !bundle.report.assigned_control_ids.includes(id))) throw new Error('Control appendix outside frozen scope');
  lines.push(`Project: ${text(bundle.report.project_id)}. Catalog: ${text(summary.catalog_version)}. Target: ${text(summary.assessment_target)}.`,
    `Purpose: ${text(summary.purpose)}. Phase: ${text(bundle.report.phase)}. Findings below concern this consumer project, not defects in the assurance harness.`,
    `Source revision: ${text(bundle.manifest.snapshot.source_revision ?? 'unknown')}. Selected files: ${bundle.manifest.snapshot.files.length}.`,
    '', '## Coverage', '', `${summary.selected_controls} controls: ${Object.entries(summary.dispositions).map(([status, count]) => `${count} ${text(status)}`).join('; ')}.`,
    '', summary.meaning, '');
  const inspection = summary.inspection_coverage;
  lines.push('## File inspection and execution links', '',
    `${inspection.fingerprinted_files} fingerprinted; ${inspection.whole_file_inspections} whole-file inspections declared; ${inspection.partial_file_inspections} partial inspections declared; ${inspection.uninspected_files} uninspected.`, '',
    `${inspection.execution_linked_files} files linked to executed checks; ${inspection.files_without_execution_links} without execution links. Counts overlap; a check link describes specific behavior, not every line or branch.`, '',
    inspection.meaning, '');
  for (const file of inspection.files.filter(file => file.inspection !== 'not_inspected' || file.inspection_notes !== null || file.execution_links.length)) {
    lines.push(`- ${text(file.path)}: ${text(file.inspection)}${file.inspection_notes ? '; ' + text(file.inspection_notes) : ''}`);
    for (const link of file.execution_links) lines.push(`  - ${text(link.check_id)}: ${text(link.behavior)}; ${text(link.state)}; ${text(link.result)}; cleanup ${text(link.cleanup)}`);
  }
  lines.push('', 'Unlisted file declarations mean not inspected and no execution link. The JSON summary lists every fingerprinted file; file coverage does not replace control-level findings or remaining validation.', '');
  lines.push('## Contract identity', '', ...Object.entries(summary.contract_identity).map(([name, value]) => `- ${name}: ${text(value)}`), '',
    '## Validation execution', '', Object.entries(summary.check_states).map(([state, count]) => `${state}: ${count}`).join('; '), '',
    ...bundle.report.validation_checks.map(check => `- ${text(check.id)}: ${text(check.case_kind)}; ${text(check.state)}; ${text(check.result)}; cleanup ${text(check.cleanup)}`), '',
    'Incomplete cleanup: ' + (summary.incomplete_cleanup.map(check => text(check.id)).join(', ') || 'None recorded.'), '',
    'Outstanding controls: ' + (summary.outstanding_controls.map(control => `${text(control.control_id)} (${text(control.status)})`).join(', ') || 'None.'), '');
  lines.push(`${summary.finding_counts.candidate_gaps} distinct candidate gaps; ${summary.finding_counts.evidence_requests} evidence requests. Control disposition counts can overlap the same finding.`, '');
  lines.push('Issue classifications: ' + Object.entries(summary.issue_type_counts).map(([type, count]) => `${text(type)}: ${count}`).join('; ') + '. Counts include all recorded outcomes, including refuted findings, and overlap; each finding retains one identity.', '');
  if (summary.reviewer_observation_count) {
    lines.push('## Reviewer observations about the harness', '',
      `${summary.reviewer_observation_count} suggestions; not validated harness findings, control evidence or drill completion credit. Assessment-affecting concerns must also remain in limitations or unresolved validation.`, '');
    for (const item of bundle.report.reviewer_observations) {
      lines.push(`### ${text(item.id)}`, '', text(item.observation), '',
        `Suggestion: ${text(item.suggestion ?? 'None recorded.')}`, '',
        `Controls: ${(item.control_ids ?? []).map(text).join(', ') || 'None linked'}. Findings: ${(item.finding_ids ?? []).map(text).join(', ') || 'None linked'}. Evidence: ${(item.evidence_ids ?? []).map(text).join(', ') || 'None linked'}.`, '');
    }
  }
  if (summary.purpose === 'harness-drill') {
    lines.push('## Harness drill objective', '', 'The consumer is read-only drill input. The primary deliverable is harness/control feedback; consumer remediation requires a separate project scope.', '',
      `Harness feedback coverage: ${summary.harness_feedback_complete ? 'complete (authored recommendations, not proof of implementation)' : 'INCOMPLETE — do not treat consumer triage as the drill result'}.`, '',
      'Findings awaiting feedback: ' + (summary.findings_without_harness_feedback.map(text).join(', ') || 'None; selected controls and feedback presence still determine completeness.'), '',
      '## Harness and control feedback', '');
    for (const item of bundle.report.harness_feedback) lines.push(`### ${text(item.id)} — ${text(item.category)}`, '',
      `Consumer observations: ${item.finding_ids.map(text).join(', ') || 'Control review without a consumer finding'}. Controls: ${item.control_ids.map(text).join(', ')}.`, '',
      text(item.observation), '', `Harness recommendation: ${text(item.recommendation)}`, '', `Harness validation needed: ${text(item.validation_plan)}`, '');
    if (!bundle.report.harness_feedback.length) lines.push('No harness feedback recorded. The primary drill deliverable is outstanding.', '');
  }
  if (summary.carried_research_controls.length) lines.push(`${summary.carried_research_controls.length} research dispositions retain their original timestamps and exact prior-report references; they were not revalidated in this run.`, '');
  if (errors.length) lines.push('## Record errors', '', ...errors.map(error => '- ' + text(error)), '');
  lines.push('## Consumer findings and evidence requests', '');
  if (!bundle.report.findings.length) lines.push('No findings recorded. This does not establish a pass.', '');
  for (const finding of bundle.report.findings) {
    lines.push(`### ${text(finding.id)} — ${text(finding.title)}`, '',
      `${text(finding.severity)} severity; ${text(finding.confidence)} confidence; ${text(finding.bucket)}; ${text(finding.outcome)}.`,
      `Disposition rationale: ${text(finding.outcome_rationale)}`, '',
      `Controls: ${finding.control_ids.map(text).join(', ')}. Asset: ${text(finding.asset)}.`, '', text(finding.claim), '',
      `Issue types: ${finding.issue_types.map(text).join(', ')}.`, '',
      finding.acknowledgement ? `Documented acknowledgment: ${text(finding.acknowledgement.summary)}. Evidence: ${finding.acknowledgement.evidence_ids.map(text).join(', ')}. This is not risk acceptance or validation credit.` : 'Prior acknowledgment not established.', '',
      `Preconditions: ${finding.preconditions.map(text).join('; ') || 'None recorded; this is not proof of unconditional exposure.'}`, '',
      `Impact: ${text(finding.impact)}`, '', `Counterevidence: ${finding.counterevidence.map(text).join('; ') || 'None recorded.'}`, '',
      `Severity basis: ${text(finding.severity_basis)}`, '', `Confidence basis: ${text(finding.confidence_basis)}`, '',
      `Uncertainty: ${finding.uncertainty.map(text).join('; ') || 'None recorded.'}`, '',
      `Next validation: ${text(finding.validation_plan)}`, '');
    if (finding.claim_reference) lines.push(`Assertion under review: ${text(finding.claim_reference.assertion)}`, '',
      `Claimed scope: ${text(finding.claim_reference.scope)}. Evidence: ${finding.claim_reference.evidence_ids.map(text).join(', ')}.`, '');
    if (finding.prior_finding_ids.length) lines.push(`Prior records: ${finding.prior_finding_ids.map(text).join(', ')}.`, '');
    const evidence = bundle.report.evidence.filter(item => finding.evidence_ids.includes(item.id));
    lines.push('Evidence: ' + evidence.map(item => `${text(item.id)} (${text(item.locator)})`).join('; '), '');
  }
  lines.push('## Unassessed controls', '', bundle.report.controls.filter(item => item.status === 'not_assessed').map(item => text(item.control_id)).join(', ') || 'None.', '',
    'No unassessed controls does not mean all controls passed; evidence requests and candidate gaps still need validation.', '',
    'Every selected control disposition, rationale and remaining check is retained in the JSON bundle.', '',
    '## Limitations', '', ...summary.limitations.map(item => '- ' + text(item)), '');
  if (controlIds.length) {
    lines.push('## Selected control review', '');
    for (const id of controlIds) {
      const result = bundle.report.controls.find(item => item.control_id === id);
      const evidence = bundle.report.evidence.filter(item => result.evidence_ids.includes(item.id));
      lines.push(`### ${text(id)} — ${text(result.status)}`, '', text(result.rationale), '',
        `Assessed: ${text(result.assessed_at)}. Applicability: ${text(result.applicability)}.`, '',
        'Evidence: ' + (evidence.map(item => `${text(item.id)} (${text(item.locator)})`).join('; ') || 'Unavailable; see remaining checks.'), '',
        'Remaining validation: ' + (result.remaining_validation.map(text).join('; ') || 'None recorded.'), '');
      if (result.prior_assessment) lines.push(`Historical source: ${text(result.prior_assessment.report_evidence_id)}; original disposition and timestamp retained.`, '');
    }
  }
  return lines.join('\n');
}
