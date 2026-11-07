# Project assurance catalog

Version 1.0.0 contains 120 controls in 15 modules. This package supports read-only research, separately authorized validation, and an accountable release decision. It does not certify legal compliance or guarantee security.

## Files

| File | Purpose |
| --- | --- |
| `catalog.json` | Stable control IDs, applicability, expected outcomes, research/validation methods, evidence requirements, freshness and references |
| `researcher-protocol.md` | Discovery-only assignments and findings classification |
| `validator-protocol.md` | Independent validation and evidence-based disposition |
| `assessment.schema.json` | JSON Schema for each research or validation report |
| `research-report.example.json` | Synthetic one-control report illustrating an evidence request without claiming a pass |
| `project-profile.example.json` | Unpopulated, reusable project scope and authorization template |
| `check.mjs` | Dependency-free catalog consistency and report policy checks; not a full JSON Schema engine |

Copy this directory to reuse it. Complete a project profile separately; do not edit the catalog to insert project-specific credentials or deployment details. Store private profiles and evidence in an appropriate private location. An example profile is deliberately incomplete and does not authorize access, probes, or deployments.

## Workflow

1. Inventory the project and complete known profile facts. Keep genuinely unknown facts null. Record exact source revisions, deployment identities and declared environments.
2. Assign control IDs in related modules. Designate a coordinator, report location, model, tool allowlist and research scope. Do not dispatch until scope and destinations are established.
3. Researchers use `researcher-protocol.md` and return schema-shaped reports. Only the coordinator writes reports to an authorized destination; workers have read-only source access and no edit/shell/network-scanning tools by default.
4. Reconcile coverage and deduplicate candidates against prior findings. Every assigned control needs a disposition, including missing evidence and not assessed.
5. Establish a separate written validation scope. Validators use `validator-protocol.md`; research authorization does not authorize validation effects.
6. An accountable gate owner reviews validated gaps, missing evidence and time-limited exceptions. Research output never passes a release. A validator may recommend eligibility for owner review, not authorize deployment.

Run `node docs/project-assurance/check.mjs` from the repository root. An optional report argument checks core report structure and policy: `node docs/project-assurance/check.mjs /path/to/report.json`. For exhaustive structural validation, also validate against `assessment.schema.json` with a JSON Schema draft 2020-12 implementation. Neither structural check establishes that claims or evidence are true.

Run `node docs/project-assurance/check.mjs --self-test` to exercise positive contracts and rejected duplicate IDs, missing coverage/evidence, unsupported passes and premature gate recommendations. `research-report.example.json` is a synthetic one-control report, not an assessment of any real project.

## Applicability and platform adapters

Modules use tri-state feature flags: true, false or null. The `all` selector always applies. A module applies if any named flag is true, is unknown if no flag is true and one is unknown, and is potentially inapplicable only when all flags are false. A control-level not-applicable decision still requires evidence and rationale. For example, valuable state can activate module K without making card-payment checks applicable. Unknown flags are never equivalent to false.

Add project-specific checks under a separate namespace and link them to core IDs. Platform adapters can cover Supabase RLS/RPC/Storage, Cloudflare configuration, native-app permissions and distribution, SaaS tenancy, or local desktop/CLI execution. Supabase-specific references apply only to Supabase; equivalent controls apply elsewhere. A public browser API or publishable identifier is not by itself a private-data leak. Assess effective authorization and secret type.

Other conditional extensions may be needed for cryptographic key management, device/firmware safety, healthcare, regulated finance, government systems, high-impact decisions or physical infrastructure. This is a baseline, not an assertion that every product's requirements fit 120 checks.

## Evidence and recurring review

Record evidence type, locator, version/environment, capture time and limitations. Keep source, configuration, runtime and organizational evidence distinguishable. Do not copy secrets, personal rows or unredacted logs into reports. A secret exposure finding identifies its location and type, never the value.

Set risk-based review intervals in the project profile and per-control validation records. No interval is pre-approved by this catalog. Relevant changes invalidate earlier evidence immediately: authentication, schema/policy, dependencies, deployments, provider settings, models/prompts, audience, markets, data uses and public promises. A report can be structurally valid but stale or insufficient for a gate.

Recurring runs compare against the previous baseline. Reopen stale evidence, changed scope and regressions; update existing findings rather than issuing duplicate tickets. Record first/last seen, source/deployment identities, prior report references and accepted-exception expiry. Scheduling periodic runs is a separate action; this package creates no automation.

## Gate and exception rules

- Critical unknowns or evidence gaps cannot produce a green result.
- Severity and confidence are independent; a severe suspicion remains unvalidated.
- Proposed buckets are potential release blocker, pre-launch remediation, later improvement, or evidence request. These are recommendations, not final release decisions.
- A current scoped pass requires valid evidence for all applicable controls, justified exclusions, and explicit owner approval of any remaining exceptions. A raw percentage score is insufficient.
- An exception needs a finding/control reference, named accountable owner, rationale, impact, compensating controls, approval record, expiry and reconsideration triggers. Expired exceptions provide no gate credit. Legal duties cannot be waived by internal risk acceptance.
- Maintain separate source and deployed assessments when versions differ. A merged fix or passing offline test is not proof of deployed remediation.

## References and maintenance

Catalog references are starting points, not a legal applicability matrix. Researchers must use current primary sources for the actual question, record source dates and jurisdictions, and distinguish binding obligations, contracts, guidance and internal policy. US FTC sources do not cover every jurisdiction or privacy duty. Do not assume GDPR, CCPA/CPRA, COPPA, HIPAA, payment obligations, or marketplace rules apply or do not apply without their factual predicates. Flag material unresolved interpretations for qualified review.

Technical anchors include OWASP ASVS 5.0.0, NIST SSDF and WCAG 2.2; these do not constitute adopted legal requirements by default. Set explicit applicable versions/levels and conformance targets in the project profile. Recheck evolving standards and legal sources during each applicability review.

Use semantic catalog versions. Clarifications preserve IDs; new controls get new IDs; retired IDs are retained as retired and never reused. Breaking report or applicability semantics require a major version change. Reports pin catalog version and schema version; old evidence is not silently migrated to new requirements.
