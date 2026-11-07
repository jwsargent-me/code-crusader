import { summarize } from './core.mjs';

// Reviewer-authored descriptions are opt-in via the report command. Escape them
// as inert Markdown text; neither source content nor evidence files are printed.
const text = value => String(value ?? '').replace(/[\r\n\x00-\x1f]+/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\`*_[\]|]/g, '\\$&');
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
  lines.push(`${summary.finding_counts.candidate_gaps} distinct candidate gaps; ${summary.finding_counts.evidence_requests} evidence requests. Control disposition counts can overlap the same finding.`, '');
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
      `Controls: ${finding.control_ids.map(text).join(', ')}. Asset: ${text(finding.asset)}.`, '', text(finding.claim), '',
      `Preconditions: ${finding.preconditions.map(text).join('; ') || 'None recorded; this is not proof of unconditional exposure.'}`, '',
      `Impact: ${text(finding.impact)}`, '', `Counterevidence: ${finding.counterevidence.map(text).join('; ') || 'None recorded.'}`, '',
      `Severity basis: ${text(finding.severity_basis)}`, '', `Confidence basis: ${text(finding.confidence_basis)}`, '',
      `Uncertainty: ${finding.uncertainty.map(text).join('; ') || 'None recorded.'}`, '',
      `Next validation: ${text(finding.validation_plan)}`, '');
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
