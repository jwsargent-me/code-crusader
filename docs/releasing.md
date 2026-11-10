# Release checklist

Publish only the reviewed snapshot and history. A release, push, visibility change or bootstrap exception requires explicit maintainer authorization.

## Prepare the candidate

1. Review the diff for source, current contracts, docs and assets. Keep private assessments, evidence, credentials, local paths, logs and concept galleries outside the distribution. Review every commit that would be published, not only the working tree.
2. Validate the five current contracts directly. Update release labels when preparing a release; control edits need no version bump. Change format versions only for structural changes, review the structural fingerprint pins in the self-tests, and keep schema paths stable. Content hashes identify exact control/set revisions. Use Git for historical sources instead of bundling snapshots. Document unsupported record formats and require replanning when contract/engine hashes change; technical `project-assurance` identifiers require a compatibility plan before renaming.
3. Confirm redistribution rights and preserve the MIT License and applicable third-party notices. Keep `private: true` in package.json unless npm publication is separately authorized.
4. Verify a fresh checkout without installed dependencies:

   ```text
   node tools/verify.mjs
   ```

   Require zero failed/skipped self-tests and an incomplete assessment in the synthetic demo. Record the actual platform, versions, commands and outcomes privately. Verify documentation links, artwork provenance and the social-preview JPEG's size below 1 MB.
5. Reconcile the committed file list and hashes with the reviewed inventory. Reassess any changed bytes before publication.

## Initial publication

For an explicitly approved bootstrap, prepare one clean project-import commit on top of any retained public initialization commit and align local `main` and `develop` at that snapshot. Keep development contract versions intact; choose the public release/tag separately.

If branch enforcement is temporarily disabled for initialization, restore both branch rulesets immediately after the authorized import. Inspect the first hosted run, verify the required check names and GitHub Actions app identity, then activate the CI requirement and read back effective rules. Keep normal merges paused until those checks are enforced. An expected check name inferred from YAML is not hosted evidence.

The maintainer's [rulesets](https://github.com/jwsargent-me/code-crusader/rules) are the authority for current hosted enforcement. This checklist describes the required configuration, not a live guarantee that settings or checks are active.

## Required repository settings

- `main` and `develop`: PRs, resolved conversations, strict up-to-date CI checks, and blocks on force pushes/deletion. Require independent approvals when another maintainer is available; use zero required approvals while there is one maintainer.
- Use merge commits for feature PRs into `develop` and release PRs into `main`. Keep squash, rebase and auto-merge disabled. Delete merged feature branches while protecting long-lived branches.
- Protect `v*` release tags against deletion and rewriting. Do not require linear history on either long-lived branch with the merge-commit strategy.
- Require full-SHA action pins and allow only the reviewed actions. Keep workflow tokens read-only, workflow approval permissions disabled, external fork runs subject to maintainer approval, and logs/artifacts limited to 30 days. Update the allowlist with action pins.
- Enable private vulnerability reporting, secret scanning, push protection and vulnerability alerts. Keep private-report links in SECURITY.md and the issue chooser working.

The verification workflow targets Windows/Linux on Node 20/24/26. Confirm all six actual job contexts before enforcing them. Passing local tests does not establish hosted matrix success or protection enforcement.

## Subsequent releases

Review a release PR from `develop` into `main` against the exact candidate and required hosted checks. After explicit release approval, merge it, tag the approved commit and verify the published result. Keep release notes focused on behavior, compatibility and known limits. Do not claim certification, independent review or platform support without corresponding evidence.

The README uses light/dark Sentinel artwork. Upload `docs/assets/code-crusader-social-preview.jpg` separately for GitHub's social preview; the PNG is its master. Artwork provenance is documented [with the assets](assets/README.md).
