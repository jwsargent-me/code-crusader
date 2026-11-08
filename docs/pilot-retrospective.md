# Live-fire lessons for the harness

A read-only drill against a private consumer repository exposed gaps in the assurance tool itself. Consumer details and the original case crosswalk are retained privately outside this distribution. This summary discusses only harness behavior and synthetic reproductions.

Two v3.2 false passes were reproduced with synthetic records and corrected in v3.3: a source-only negative case could borrow runtime status from another case, and a newly captured artifact could conceal a stale execution. Tests now reject each record while accepting neighboring legitimate cases. Public preparation found one related v3.3 gap: runtime exclusions could rely on source-only applicability assumptions. The 3.3.1 engine requires linked runtime or configuration evidence for those exclusion checks, retaining the declared deployment binding and human provenance review.

The drill also showed that reports hid preconditions and severity/confidence rationale already present in JSON. Those fields are now rendered, and counts distinguish distinct findings and evidence requests from overlapping control dispositions.

An explicit harness-drill purpose and scoped feedback section now keep consumer observations separate from the primary return to harness improvements. Feedback coverage is not proof that a recommendation was implemented. The CLI cannot force a reviewer to stay on task outside its records.

Thirteen existing control methods were strengthened: R-01/R-02/R-04/R-05/R-08/R-09, G-06, M-03/M-06/M-07, E-03, N-03 and P-07. Their scenarios include untouched migration replay, real database permission/concurrency evidence, dependency-graph binding, trust-label consumers, acknowledged-write conflicts, complete pagination and aggregation, retry identity, email rendering, reduced motion and safe work retirement. Seven controls gained explicit false-positive cautions. These changes strengthened existing outcomes rather than adding control IDs.

The checker verifies record structure, scope, artifact hashes and supported chronology. It cannot authenticate permission grants, establish evidence truth, redact authored text or certify a consumer application. Synthetic regression tests establish these decision boundaries, not live security. Runs remain bound to exact contract hashes; old research never silently gains validation credit. Historical source versions remain in Git.
