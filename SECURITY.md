# Code Crusader security reporting

The review target is the current experimental engine and contracts. Historical contracts are retained for provenance, not supported as current validation engines. No formal support window or response-time commitment has been established.

GitHub private vulnerability reporting is enabled for this repository. Use [Report a vulnerability](https://github.com/jwsargent-me/code-crusader/security/advisories/new) for sensitive findings. Do not place exploitable private-project findings, credentials, personal records or raw evidence in a public issue. Provide a minimal synthetic reproduction, exact version/environment, expected and actual validator behavior, and the affected trust boundary.

The main boundaries are source/evidence path confinement, record and artifact integrity, scope/authorization declarations, source versus runtime proof, freshness, and honest eligibility. The tool cannot authenticate reviewer claims or grants, establish artifact truth, redact authored text, run application tests, accept exceptions or approve releases. See the [operating contract](docs/workflow-design.md).

Do not test a suspected defect against another person's repository or service without permission. Prefer synthetic files and inert markers. A reported false pass should demonstrate the incorrect decision and a legitimate neighboring record without including real secrets.
