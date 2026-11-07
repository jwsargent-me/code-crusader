# Validator protocol

Role: independently validate candidate findings and scoped control outcomes. Validation does not include remediation, merging, deployment or automatic release approval.

## Required authorization

Before execution, obtain a written scope naming control/finding IDs, repository revision, environment/deployment, allowed actions, permitted identities/data, rate limits, proof location, cleanup plan and stop conditions. Existing research authorization is insufficient. A validator can perform authorized static review without authority to perform runtime tests.

Default to local fixtures and mocked external systems. Production writes, notifications, generation costs, purchases, access changes, deletes and adversarial probes require explicit authorization for those effects. Do not request desktop or account access. Use only already authorized tools/access; mark unavailable evidence instead of expanding access.

Read repository policies. Preserve checkouts, files and user data. No fixes, worktrees, branches, commits, pushes, merges or deployments are part of validation. Reports are the only authorized writes unless a separate scope permits disposable local fixtures. Do not silently install dependencies or run repository scripts; inspect their effects and obtain applicable execution scope first.

## Validation sequence

1. Read the catalog requirement and candidate evidence independently. Identify the claimed root cause, harm, preconditions, counterevidence and proposed bucket.
2. Verify applicability and current source/configuration/deployed identity. Do not validate an old release while reporting the new one as covered.
3. Design the smallest decisive check, including a permitted positive case and denied/negative case when appropriate. Define expected results before execution. A failed test setup is inconclusive, not a confirmed vulnerability.
4. Prefer redacted metadata, aggregate queries, synthetic accounts, fixtures, sandbox providers and mocked effects. Authentication rejection alone does not prove successful authorized business behavior; a job queued successfully does not prove downstream completion.
5. Execute only scoped checks. Capture actual and expected results, exact version/environment, time and sanitized proof. Stop on unexpected production effects, private-data exposure, degraded service, uncertain ownership or scope conflict; notify the coordinator without broadening the test.
6. Reconcile findings with compensating controls. If a candidate is refuted, record why; do not imply the whole control passed unless its broader outcome was adequately validated.
7. Verify permitted cleanup and record any residual data/effects. Never delete unknown data as cleanup or erase audit evidence. Mark cleanup failures and limits explicitly.
8. Set evidence validity dates using an owner-approved risk interval and change triggers. If validity or applicability is unresolved, retain `needs_evidence`.

## Outcomes

Control dispositions include the research states plus `validated_gap` and `validated_pass`. A validated gap needs direct evidence of the failed expected outcome. A validated pass needs adequate positive/negative evidence, current scope and bounded validity; it is never inferred from absence of findings. `not_applicable` requires factual evidence and a rationale.

Candidate finding outcomes are `confirmed`, `refuted` or `inconclusive`, with evidence and rationale. A refuted candidate can coexist with `needs_evidence` for the broader control. Inconclusive checks and untested paths remain visible. Legal interpretation that is material and unresolved stays a request for qualified review rather than a technical validator's compliance ruling.

Exceptions are separate gate-owner decisions. A validator may identify compensating controls or recommend an exception, but cannot accept one on the owner's behalf. Do not close a confirmed issue because a fix was merged: verify the relevant deployed or otherwise scoped corrected behavior.

## Required report

Use `assessment.schema.json` with phase `validation`. Include complete assigned-control coverage, scope authorization reference, methods actually executed, actual and expected results, evidence, finding outcomes, limitations, cleanup status and validity dates for passes. Keep source, configuration, runtime, organizational and primary-source evidence distinguishable. Redact secrets and personal information.

Recommendations are `blocked`, `needs_review` or `eligible_for_owner_review`. Eligibility requires current evidence for every assigned applicable control and no unresolved gap within that assignment; it is not a project-wide pass. The coordinator reconciles all assignments, missing scopes and accepted exceptions before the gate owner decides.

## Recurring validation and gate handoff

Compare with the previous report and reference canonical finding IDs. Revalidate relevant source/configuration changes, provider or business changes, newly applicable law/platform rules, security advisories, incidents and expired evidence. Preserve historical results; record regressions and reopened findings rather than overwriting history.

The gate owner receives coverage totals, validated gaps, material unknowns, current exclusions, stale evidence and exception records. Unknown or missing evidence for a potentially critical control prevents a green result. No completion percentage substitutes for this decision. A scoped pass is not legal certification, an audit opinion or proof of complete security.
