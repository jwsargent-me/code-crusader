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
node examples/demo.mjs
```

Verification must pass without skipped tests. The demo should report valid records and `assessment_complete: false`. Tests use disposable fixtures; host-denied Git/junction creation is incomplete verification. CI targets Windows/Linux and Node 20/24/26; claim support only for environments actually checked.

Changes to validator decisions need a regression demonstrating the wrong result and a neighboring legitimate case that still works. Keep application commands, live credentials, billable calls, deployments and messages out of self-tests. Bound cleanup to each test's own fixture.

Fork workflows from external contributors require maintainer approval. Actions use read-only tokens and an explicit allowlist of full-SHA pins. Action updates need a reviewed pin change and a matching allowlist update; do not request secrets or a privileged workflow to make a fork PR pass.

## Controls and contracts

For bugs, provide the smallest synthetic reproduction, expected/actual behavior, Node/Git/OS versions and exit status. For control changes, identify the affected IDs, missing outcome, counterevidence, false-positive boundaries and decisive validation case. Reuse an existing control when it covers the outcome.

Edit `tools/build-contracts.mjs`, regenerate with `node tools/build-contracts.mjs`, review the output and run verification. Preserve stable IDs and historical bytes pinned by `provenance.json` and `compatibility.json`. Requirement/schema transitions need an explicit versioning decision. Engine changes invalidate existing run fingerprints; do not rewrite old reports to appear fresh.

## License

Contributions are submitted under the root [MIT License](LICENSE). Confirm that you have the right to submit the material and preserve applicable third-party notices. Contributors retain copyright in their contributions.
