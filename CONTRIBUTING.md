# Contributing to Code Crusader

Contributions should improve a reviewer's decision: reproduce a false pass or false positive, strengthen a control's acceptance criteria, verify a supported platform, or make an existing workflow easier to use.

Use [issues](https://github.com/jwsargent-me/code-crusader/issues) for non-sensitive bugs and proposals. Report sensitive findings through [SECURITY.md](SECURITY.md). Examples and fixtures must be synthetic; exclude private assessments, credentials, personal records and customer data.

## Git and review

- Work on a feature branch and open a focused PR into `develop`.
- Use merge commits for feature PRs into `develop` and release PRs from `develop` to `main`. Squash merging is disabled. There is no staging branch.
- Review the diff and passing checks before merging. Preserve failed/skipped checks and remaining uncertainty in the review record.
- Protect `main` and `develop` against direct pushes, force pushes and deletion; require PRs, resolved conversations and the verified CI checks.
- Independent approval is optional while there is one maintainer. CODEOWNERS routes requests; it does not prove a review happened.
- Preserve other people's files, branches, stashes and reports. Retire work only after checking ownership, unique commits and useful unmerged changes.
- Bootstrap exceptions need explicit maintainer approval and must end after initialization. See the [release checklist](docs/releasing.md).

## Commit and PR copy

- Use a short, descriptive, imperative commit subject that states the change. Add a body when the reason, behavior or tradeoff needs explanation.
- Lead a PR description with the concrete problem and resulting behavior. Explain why the change helps and what verification supports it.
- Keep copy proportionate to the change. Omit chat history, temporary setup status, repetitive disclaimers, promotional claims and generated filler.
- Record the commands and outcomes that matter, including failures, skips and limits. Distinguish local checks from hosted CI and source review from runtime proof.
- Use accurate authorship, assistance and review credits. Do not invent co-authors, independent reviewers or successful checks. AI-assisted contributions remain the submitter's responsibility.
- Update the title and description to describe the final diff. Keep unrelated cleanup and documentation out of the PR.

## Verification

Use Node 20+ and Git supporting `--no-lazy-fetch`. No dependency installation is needed. From the repository root:

```text
node tools/verify.mjs
```

Verification runs the catalog checks, synthetic demo and self-tests, and must pass without skipped tests. The demo should report valid records and `assessment_complete: false`. Tests use disposable fixtures; host-denied Git/link creation is incomplete verification. CI targets Windows/Linux and Node 20/24/26; claim support only for environments actually checked.

Changes to validator decisions need a regression demonstrating the wrong result and a neighboring legitimate case that still works. Keep application commands, live credentials, billable calls, deployments and messages out of self-tests. Bound cleanup to each test's own fixture.

Fork workflows from external contributors require maintainer approval. Actions use read-only tokens and an explicit allowlist of full-SHA pins. Action updates need a reviewed pin change and a matching allowlist update; do not request secrets or a privileged workflow to make a fork PR pass.

## Controls and contracts

For bugs, provide the smallest synthetic reproduction, expected/actual behavior, Node/Git/OS versions and exit status. For control changes, identify the affected IDs, missing outcome, counterevidence, false-positive boundaries and decisive validation case. Reuse an existing control when it covers the outcome.

The five current contracts are maintained directly:

| File | Change it for |
| --- | --- |
| `catalog/controls.json` | Control definitions, modules, features, guidance references and catalog metadata |
| `catalog/sets.json` | Named selections of modules/control IDs; `all: ["*"]` includes every control |
| `schemas/catalog.json` | Catalog authoring structure, shared defaults and named-set structure |
| `schemas/manifest.json` | Frozen-manifest record structure |
| `schemas/assessment.json` | Assessment record structure |

To add one control:

1. Add an object to `controls` in `catalog/controls.json`. Use an unused stable ID with the existing module prefix, such as `R-10`, and its `module_id`. Module membership is derived; there is no second ID list to update.
2. Supply the title, expected outcome, applicability, read-only research method, validation method, explicit `negative_case_required` boolean and guidance references. Shared `control_defaults` supply common evidence, authorization, freshness and failure rules; arrays add to those defaults without repeating them. Add outcome-specific evidence and false-positive guidance where needed. Declare `requires: ["git_observation"]` or `["runtime_evidence"]` when the control needs those capabilities; requirements are independent of its ID prefix.
3. Existing module selections and `all` include the new control automatically. Named sets may overlap: a control has one owning module but can belong to multiple review selections. Selector unions deduplicate in catalog order; explicit exclusions apply to the union. Edit named sets when their intended coverage changes and test important cross-module coverage; add a module definition only for a new module. No version bump is required to add or edit a control.
4. Run `node bin/assurance.mjs catalog` and `node tools/verify.mjs`. Review the diff. A control-only addition needs no generator, new schema file, schema edit or package-version edit. Include a focused regression if the new control addresses a validator behavior gap.

Schemas define structure: fields, types and structural constraints. Controls supply the requirements expressed through that structure. Change the affected format version only when its structure changes, using the same schema file paths, and deliberately review/update the structural fingerprint in the self-tests. Unpublished candidate schemas may be refined under their prospective format version; incompatible changes to published structure or constraints require a new format version. Catalog, set and package version labels identify releases; updating control data does not require incrementing them. Content hashes bind each assessment to the exact data it used. Preserve existing control IDs and make breaking changes explicit.

The engine binds each run to the current catalog, sets, schemas and engine hashes. Any changed contract invalidates an existing frozen run; make a new plan and assess the new scope. Research carry-forward requires the same current contract and engine hashes and unchanged source/evidence facts. Release labels use [SemVer 2.0.0](https://semver.org/), including prerelease/build identifiers; independently versioned contracts need not share a label. The unpublished record format 4.0 candidate adds explicit check case roles, file-inspection declarations, optional reviewer observations and evidence-linked finding classifications; catalog format 1.0 defines shared defaults and capability requirements. Earlier record formats, including 3.3, are unsupported. Old records remain historical evidence, not current validation input. There is no automatic migration or refreshed validation credit. Earlier source versions remain in Git. Never rewrite an old report's metadata to make it current.

## License

Contributions are submitted under the root [MIT License](LICENSE). Confirm that you have the right to submit the material and preserve applicable third-party notices. Contributors retain copyright in their contributions.
