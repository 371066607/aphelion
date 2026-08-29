---
name: "working-loop"
description: "Run the working loop explore → plan → work → critique → promote. Use when the user says scout and plan, implement and review, working loop, harness loop, or wants a staged agent pipeline with a confirm gate after the plan."
version: 2
created: "2026-08-27"
updated: "2026-08-27"
---
## When to Use
Use when the user wants Explore → plan → work → critique → promote, or says scout and plan, implement and review, working loop, or harness loop. Scout and plan stops after the DAG is confirmed. Implement and review starts at work if a confirmed DAG already exists. All roles use the current session model.

## Procedure
1. Explore: dispatch scout (read-only recon). Return a compressed handoff. No file edits.
2. Plan: dispatch planner with the scout handoff. Output an implementation plan as an explicit DAG (directed acyclic graph) of tasks — nodes, order, and dependencies. No code. Stop at the first commit gate and wait for explicit user confirmation.
3. Work: after confirmation, dispatch worker on one DAG node at a time. Finish and check that node before starting the next. Do not implement nodes the user did not confirm.
4. Critique: after the DAG (or a batch the user named) is implemented, dispatch reviewer on the actual diff. Reviewer reports issues; it does not rewrite the feature.
5. If critique finds must-fix items, send worker back on those nodes only, then critique again until residual risk is named.
6. Promote: second commit gate. Write a promote brief for other humans — what shipped, why it matters, how to verify, residual risk. This step is communication, not git merge/push/tag. Do not merge unless the user asked to ship.
7. Every role inherits the current session model (scout, planner, worker, reviewer). Do not pick a cheaper or frontier model per stage. Prewalk-style model split is deferred.

## Pitfalls
- Implementing during Explore or Plan, or jumping the confirm gate.
- Dumping a prose plan with no DAG nodes/order. Worker will then do everything at once.
- Worker taking more than one DAG node in a single pass.
- Reviewer rewriting the feature, or treating merge as promote. Promote is telling other people; ship is a separate user ask.
- Switching models per role. Use the current session model for all stages until the user says otherwise.
- Starting Implement and review with no confirmed DAG: run Plan first, then stop.

## Verification
1. Scout handoff exists; plan is a DAG; no repo edits before user confirmation.
2. Worker completed confirmed nodes one at a time; no extra scope.
3. Reviewer ran on the real diff before the work was called done.
4. Promote brief is readable by someone who did not watch the session. Merge/push only if the user asked to ship.
5. No role used a different model than the current session.
