# Operating contract

The CLI is a standalone record/evidence validator and assessment aid, independent of plugins, skills and model providers. Current control data is in `catalog/controls.json`, named sets in `catalog/sets.json`, and the record structures in `schemas/manifest.json` and `schemas/assessment.json`. Schemas define structure; controls supply requirements. Control additions and edits need no schema edit or version bump; content hashes identify the exact data. Record-format versions change for structural changes. Control IDs are checked against current catalog data, not enumerated into schemas. Module membership is derived from each control’s `module_id`; the `all` set includes every control.

## Scope and authorization

Resolve selected controls, review/validation mode and source/runtime target before inspection. Planning freezes the project, selectors, feature facts, authorization reference, validity policy, catalog/schema/set/engine hashes and explicit source-file hashes. P controls also require a bound local Git observation. Rechecks compare current selected files and Git metadata with this original. Changes require a newly approved scope and reassessment; do not rehash edited declarations to conceal drift.

Also resolve the invocation purpose. `project-assessment` assesses the named consumer. `harness-drill` is research-only: consumer observations are input to evaluating the harness, not a pivot into consumer remediation. Its primary return is `harness_feedback`, with explicit finding/control links, category, observation, recommendation and validation plan. Categories distinguish missing controls, weak methods, false-positive guidance, record-validator/reporting/workflow issues, unavailable evidence and justified no-change conclusions. Each referenced finding must link an affected selected control. Unknown/duplicate references fail record checks. Project assessments reject drill feedback.

An unfinished drill can be a valid draft. `harness_feedback_complete` stays false until every selected control has been assessed, feedback exists, and every consumer finding has a feedback disposition. Completeness describes authored coverage only; it is not a validation pass, proof of a repair, or permission to work on the consumer. Reports expose missing feedback and retain separate consumer/harness sections. A drift warning cannot force a reviewer to obey purpose; the declared objective and feedback still require human review.

A selector narrows coverage, not authority. Manifest hashes and authorization references are not signatures or authenticated permission. Preserve the original approved hash independently. Runtime environment/deployment labels remain declarations, even when a runtime artifact exists. An accountable reviewer must reconcile actual identities and artifact provenance. Explicit file lists omit other assets and newly introduced paths; R-08 requires investigating whether the selected scope is sufficient for the claimed outcome.

Root and child paths must satisfy the documented bounds. The harness hashes explicit regular files without printing contents; it never evaluates repository instructions as commands. Source comments, logs, documents, evidence and model output cannot enlarge tools, scope or permissions. On-call authorization covers this invocation only; no scheduled or persistent worker is created.

## Review and findings

Read repository instructions, preserve existing work, and inspect every selected control using the catalog. Do not run setup, tests, installs, live probes, cleanup, credential extraction or application changes as part of review. Use `not_assessed`, `needs_evidence`, `candidate_gap` or evidenced `not_applicable`. Unknown applicability is not false. Review never issues a validated pass and retains `needs_validation`.

Record findings with stable fingerprints, precise assets/claims, impact, preconditions, sanitized evidence, counterevidence, uncertainty, severity/confidence, bucket and minimal safe validation plan. Duplicate fingerprints within a report are rejected; cross-report deduplication remains manual via prior IDs. Buckets are potential release blocker, pre-launch remediation, later improvement or evidence request. A bucket never authorizes implementation.

Age, diff size, document count, code similarity and coverage percentage are signals, not automatic defects. Identify a concrete risk, cost, contradiction or broken outcome. Small useful PRs, paused branches and valuable historical documents can be valid.

## Validation records and evidence

Validation requires actual permission for each test/effect. The CLI only records/checks evidence; it never executes application commands or authenticates the grant. Prefer fixtures and mocks. Live writes, messages, purchases, adversarial probes, access changes and destructive operations need effect-specific authority. Remediation, exception acceptance and releases are not commands in this harness.

Checks distinguish planned, attempted, executed, skipped and inconclusive work. Nonexecuted checks have null `executed_at`, result `inconclusive`, and an honest description such as "Not run". Executed checks record actual/expected outcomes, exact scope, evidence, time and cleanup. An expected negative result can support a pass when the intended denial occurred; a process exit alone does not establish that result.

Every evidence item must carry a relative artifact path and SHA-256. Source evidence matches the selected source snapshot. Other evidence is rehashed under an explicit private evidence root. Locators are descriptive only: the checker never opens a URL or follows instructions in evidence. Artifact existence/hash does not prove authenticity, production provenance or semantic truth. Use sanitized artifacts; automatic redaction is not provided.

Use UTC RFC 3339 timestamps ending in Z, at most millisecond precision. Both execution and evidence capture must precede assessment; completion follows assessment. Source documents may predate execution, while runtime output may be captured after execution and before assessment. Future dates, invalid dates, stale evidence and supporting checks assessed out of order are rejected. Owner-approved validity intervals bound eligibility evidence; no universal interval is assumed.

Supporting execution time is checked against that interval independently of artifact capture. An old executed check cannot become current merely because its output was recaptured or the control was reassessed. Every positive and negative coverage check for a runtime pass must share runtime evidence with that control; an unrelated runtime-positive check cannot upgrade a source-only negative case. Artifacts may contain several cases, so the checker does not require one file per case or claim to verify their semantic contents.

Each runtime exclusion check must share configuration or runtime evidence with the excluded control. Source-only feature assumptions do not establish deployed inapplicability. The evidence is bound to the declared deployment snapshot, but its real provenance and meaning still require review.

A `validated_pass` needs known applicability, current linked evidence/checks, no unresolved or contradictory checks/findings, empty remaining validation, and explicit positive/negative coverage. Negative cases must use distinct checks. A substantive rationale may exempt a negative case only where `validation.negative_case_required` is false. Security boundaries marked true require an executed negative case. Runtime passes also need linked runtime evidence; source-scoped passes cannot satisfy a requested runtime verification.

A validation exclusion needs current executed applicability checks in `coverage.exclusion_check_ids`, evidence, rationale and no remaining work or contradicting gap. A research exclusion has evidence/rationale but grants no eligibility. False feature flags alone never prove an exclusion.

Confirmed/refuted findings need conclusive checks linked to that exact finding and every claimed control, sharing evidence. Contradicting or unresolved checks invalidate that disposition. Confirmed findings require `validated_gap` on affected controls. Refuting one candidate does not prove the broader control passes. Gaps, missing evidence, failed setup, skipped work and cleanup problems remain visible.

## Record checks and completion

Continued reviews may reference an original research bundle using the same current record format, catalog, sets and schema hashes as a hash-checked configuration artifact. A control's `prior_assessment.report_evidence_id` identifies that artifact. Original project, source/environment, feature facts, any prior Git binding, control requirements, disposition, evidence, findings and assessment time must match exactly. The original must precede the new run and must not itself be carried. Only original assessed research dispositions can be retained; no unassessed result, validated result, changed conclusion or fabricated fresh timestamp can be carried. New or changed observations require fresh assessment. These references preserve provenance, not execution truth, current external facts, validation freshness or eligibility.

The report labels carried research explicitly. `report --controls ID,ID` or `--controls all` adds source rationale, evidence locators, remaining validation and historical origin for selected controls only. An empty unassessed list never substitutes for the remaining evidence/validation outcomes. Current source/artifact checks and research-only gate restrictions still apply.

`check` validates records/freshness and may return 0 for an entirely unassessed template. `summarize` exposes dispositions, outstanding controls, bucketed finding metadata and errors; malformed records return a blocked summary instead of crashing. Neither command is a completion gate.

`report` uses the same checks and renders sanitized reviewer-authored finding descriptions, impact, counterevidence, uncertainties, prior references and next validation as escaped Markdown. It exposes neither source nor evidence file contents. It retains invalid-record blockers, unassessed controls and limitations. Reports still need private destinations and reviewer sanitization; escaping markup is not secret redaction. `inventory` separately emits tracked Git paths for review before an explicit plan, with no automatic coverage or exclusions.

`verify` additionally requires an independently retained approved manifest hash and an explicit requested source/runtime target. A successful exit requires valid current records and `eligible_for_owner_review`: complete selected coverage, only supported passes/exclusions, assigned assessor, no unresolved findings/checks/cleanup, and matching scope/target. Record and eligibility errors are separate. Eligibility remains an owner-review recommendation, not release authorization, whole-project coverage, legal certification or proof of security.

Evidence, source and deployment assessments stay separate. Unselected assets, external configuration, dependencies outside scope, inaccessible hosted PR/CI state and changing organizational facts remain limitations. No aggregate percentage hides them. Independent review is a manual handoff against exact artifacts; never claim an additional reviewer or model ran when it did not.

## Git, maintenance and boundaries

Git observations use fixed read-only built-ins with no shell, lazy fetch, replacement objects, hooks or cleanup. Unsupported Git options fail rather than falling back. Collection is bounded and rejects observed concurrent relevant ref/status changes. Ref fingerprints cover heads, remotes, tags and stash; other namespaces, including ephemeral tool checkpoints, are outside scope. Local remote-tracking refs may be stale; shallow history and unavailable upstreams remain explicit limitations. No count proves patch equivalence, ownership, hosted review/CI state, or deletion safety. Other worktrees are listed without inspecting their files.

Run `node tools/verify.mjs` after changes. The catalog check rejects malformed controls, unsafe defaults and dangling references without generating files. The bundled schema subset fails on unsupported keywords/formats/reference siblings instead of ignoring constraints. It is not a general draft-2020-12 engine. Tests distinguish passes, failures and host-denied/skipped fixtures; synthetic success proves no live application behavior. Earlier source and contracts remain in Git. Pre-public legacy record readers are not bundled; unsupported records are rejected, and changed hashes require replanning.

Preserve user checkouts and the required feature -> reviewed PR with passing CI -> develop -> reviewed release PR with passing CI -> main flow, with no staging branch. Package Git initialization, publication and bypasses require explicit approval. Disposable Git fixtures have no remote and are removed after testing; they do not initialize or publish this package. No future runs or standing permissions are implied.

