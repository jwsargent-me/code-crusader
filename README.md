# Code Crusader

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/sentinel-logo-dark.png">
    <img src="docs/assets/sentinel-logo-light.png" alt="Code Crusader Sentinel emblem" width="300" height="300">
  </picture>
</p>

**Engineering claims need engineering evidence.**

Code Crusader is a local engineering review harness for human-written and AI-assisted software. Its catalog covers application quality and security, Git and PR hygiene, documentation, reliability and verification.

Reviewers assess the work and run authorized checks. The harness freezes scope, fingerprints source and evidence, records findings and unknowns, and checks whether the resulting record supports a scoped conclusion. It helps answer:

- Does the evidence match this source, deployment and point in time?
- Do the tests exercise the claimed behavior and its failure cases?
- What remains unassessed, uncertain or in need of validation?
- Is the selected assessment ready for owner review?

**Experimental:** controls and named sets are maintained as data, separately from the assessment record format. The repository contains only the current contracts; version history lives in Git.

## Requirements

- Node 20+; core commands use only its standard library.
- Git supporting `--no-lazy-fetch` for Git controls; tested with Git 2.53.0.

No installation step, plugins, skills, accounts, model provider or runtime network service is required.

## Try it

From the repository root:

```text
node examples/demo.mjs
```

The demo creates and removes a synthetic fixture. Expected output includes valid records, one unassessed control and `assessment_complete: false`. A valid record is not an assurance pass.

Run the package checks with:

```text
node tools/verify.mjs
```

Verification checks catalog authoring rules, both record schemas and synthetic self-tests, rejecting failures and skips. Git/junction fixtures need host permission to create disposable repositories and links. The CI matrix covers Windows/Linux and Node 20/24/26; hosted execution must be verified separately.

## Start a review

Resolve the authorized controls, review/validation mode and source/runtime target first. Save an explicit JSON array of relative source paths, such as `["README.md","src/app.js"]`, in a private `files.json`. There is no glob expansion or directory recursion.

```powershell
node bin/assurance.mjs plan --root C:/path/to/app --files-from C:/private/files.json --select application-quality --project example-app --authorization review-approval > C:/private/review.json
node bin/assurance.mjs check --input C:/private/review.json --root C:/path/to/app
node bin/assurance.mjs report --input C:/private/review.json --root C:/path/to/app > C:/private/review.md
```

Templates begin with `not_assessed`, never automatic passes. A reviewer supplies dispositions, findings and evidence. Select modules (`C`), controls (`C-02`) or sets such as `application-quality`, `application-security` and `repository-hygiene`. Git controls also require `--git-base` and an existing local base ref.

`inventory --root C:/path/to/app` lists tracked paths for scope review without reading their contents or fetching. It omits untracked/ignored files and does not establish whole-project coverage. Explicit source scope is limited to 1,000 files and 10 MiB per file; symlinks/junctions, traversal and directory paths are rejected.

## Understand the result

| Command | What success establishes |
| --- | --- |
| `check` | Record consistency and current scoped files; an unassessed template can return 0. |
| `verify` | Scoped eligibility for owner review, requiring an independently retained approved manifest hash and an explicit source/runtime target. |

For a completed validation record:

```powershell
node bin/assurance.mjs verify --input C:/private/validation.json --root C:/path/to/app --evidence-root C:/private/evidence --target runtime --manifest-hash APPROVED_ORIGINAL_MANIFEST_SHA256
```

Run `node bin/assurance.mjs --help` for all command options, including validation planning and evidence fingerprinting. A manifest hash must be retained when the scope is approved; deriving a new hash from an edited bundle does not authenticate approval.

Validation needs current artifact-backed evidence and linked checks. Required negative cases cannot be replaced by a positive result. Source checks cannot establish runtime coverage, and recapturing an old result cannot refresh its execution. Private evidence is rehashed under an explicit evidence root; URLs are descriptive and never fetched.

The harness does not execute application tests, authenticate authorization declarations, establish artifact truth, automatically redact text or approve releases. A successful scoped record does not certify complete security. Keep private reports, credentials and raw evidence outside the repository.

For assessment fields, validation requirements, carry-forward rules, Git observations and harness drills, read the [operating contract](docs/workflow-design.md) and current [assessment schema](schemas/assessment.json). The [pilot retrospective](docs/pilot-retrospective.md) explains the synthetic regressions behind several validation boundaries.

## Contribute

Read [CONTRIBUTING.md](CONTRIBUTING.md) to add a control without changing schemas, and for Git flow, commit/PR copy and verification rules, [SECURITY.md](SECURITY.md) for private reporting, and the [release checklist](docs/releasing.md) for publication steps. Runs are on demand; using the harness creates no hooks, services, schedules or permission for future work.

[MIT License](LICENSE), copyright 2026 Jonathan Sargent. [Artwork provenance](docs/assets/README.md).
