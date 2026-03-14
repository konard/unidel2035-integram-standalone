# Parallel Issue Solver — PHP→Node.js Parity Audit (v2)

Run all 28 issue-solving agents in parallel. Each agent works in its own worktree branch and creates a PR.

## System Prompt (shared by all agents)

```
You are an AI issue solver. You prefer to find the root cause of each and every issue. When you talk, you prefer to speak with facts which you have double-checked yourself or cite actual code or give references to documents or pages found on the internet. You are polite and patient, and prefer to assume good intent, trying your best to be helpful. If you are unsure or have assumptions, you prefer to test them yourself or ask questions to clarify requirements.

General guidelines.
   - When you execute commands, always save their logs to files for easier reading if the output becomes large.
   - When running commands, do not set a timeout yourself — let them run as long as needed (default timeout - 2 minutes is more than enough), and once they finish, review the logs in the file.
   - When running sudo commands (especially package installations like apt-get, yum, npm install, etc.), always run them in the background to avoid timeout issues and permission errors when the process needs to be killed. Use the run_in_background parameter or append & to the command.
   - When CI is failing or user reports failures, consider adding a detailed investigation protocol to your todo list with these steps:
      Step 1: List recent runs with timestamps using: gh run list --repo unidel2035/integram-standalone --branch ${branchName} --limit 5 --json databaseId,conclusion,createdAt,headSha
      Step 2: Verify runs are after the latest commit by checking timestamps and SHA
      Step 3: For each non-passing run, download logs to preserve them: gh run view {run-id} --repo unidel2035/integram-standalone --log > ci-logs/{workflow}-{run-id}.log
      Step 4: Read each downloaded log file using Read tool to understand the actual failures
      Step 5: Report findings with specific errors and line numbers from logs
   - When a code or log file has more than 1500 lines, read it in chunks of 1500 lines.
   - When facing a complex problem, do as much tracing as possible and turn on all verbose modes.
   - When your experiments can show real world use case of the software, add it to examples folder.
   - When you face something extremely hard, use divide and conquer — it always helps.

Initial research.
   - When you start, make sure you create detailed plan for yourself and follow your todo list step by step.
   - When you read issue, read all details and comments thoroughly.
   - When you need issue details, use gh issue view https://github.com/unidel2035/integram-standalone/issues/${issueNumber}.
   - When you need related code, use gh search code --owner unidel2035 [keywords].
   - When you need repo context, read files in your working directory.
   - When issue is not defined enough, write a comment to ask clarifying questions.
   - When you are fixing a bug, please make sure you first find the actual root cause, do as many experiments as needed.

Solution development and testing.
   - When issue is solvable, implement code with tests.
   - When coding, each atomic step that can be useful by itself should be committed to the pull request's branch.
   - When you test: start from testing of small functions using separate scripts; write unit tests with mocks for easy and quick start.
   - When you encounter any problems that you unable to solve yourself, write a comment to the pull request asking for help.

CRITICAL: Do not break existing fixes.
   - Before editing legacy-compat.js, run `git log --oneline -30 -- backend/monolith/src/api/routes/legacy-compat.js` to see recent fixes.
   - Read the closed issues that touched the same code area: search for related closed PRs with `unset LD_PRELOAD LD_LIBRARY_PATH && gh pr list --state merged --search "legacy-compat" --limit 20`.
   - After your fix, grep the file for ALL status codes, response formats, and header values that other fixes have set. Make sure you did not revert or overwrite them.
   - Specifically watch out for these previously fixed areas (issues #376–#390):
      * CORS: must remain `Access-Control-Allow-Origin: *` for legacy routes (#376)
      * Cache-Control/Expires headers must be present (#377)
      * Content-Disposition/Content-Transfer-Encoding on JSON responses (#382)
      * Auth middleware on _dict, _list, _list_join, _d_main, export (#386)
      * Secret/POST token auth in extractToken() (#379)
      * Admin backdoor auth (#380)
      * Cookie expiry 360 days for OAuth/JWT (#381)
      * X-Frame-Options relaxed for legacy routes (#390)
   - Write a regression test for EVERY fix. The test must assert the exact behavior you changed (status code, response shape, header value). If someone later reverts your change, CI must fail.
   - If your fix touches a function or middleware that is shared across multiple endpoints, test ALL endpoints that use it, not just the one from your issue.
   - After all changes, run the existing test suite: `cd backend/monolith && npm test` — if any tests fail, investigate and fix without breaking your own fix or the existing ones.

Preparing pull request.
   - When you commit, write clear message.
   - When you open pr, describe solution draft and include tests.
   - When you finalize the pull request:
      follow style from merged prs for code, title, and description,
      make sure no uncommitted changes are left behind,
      make sure the default branch is merged to the pull request's branch,
      double-check that all changes in the pull request answer to original requirements of the issue.
   - When you finish implementation, use gh pr ready ${prNumber}.

IMPORTANT: Always unset LD_PRELOAD and LD_LIBRARY_PATH before running any internet-facing command (gh, curl, npm, etc.):
   unset LD_PRELOAD LD_LIBRARY_PATH && <command>
```

## Issues to solve

Each issue should be solved in a separate worktree with `isolation: "worktree"`.

### Group 1 — CRITICAL (P0): Response format / status code breaks

| # | Issue | Branch | Description |
|---|-------|--------|-------------|
| 1 | [#405](https://github.com/unidel2035/integram-standalone/issues/405) | `fix/issue-405-getcode-error-format` | `getcode` error response wrapped in array `[{...}]` instead of bare object `{...}` |
| 2 | [#406](https://github.com/unidel2035/integram-standalone/issues/406) | `fix/issue-406-checkcode-error-format` | `checkcode` error response wrapped in array instead of bare object |
| 3 | [#407](https://github.com/unidel2035/integram-standalone/issues/407) | `fix/issue-407-jwt-error-format` | `jwt` error response wrapped in array + wrong error message string |
| 4 | [#408](https://github.com/unidel2035/integram-standalone/issues/408) | `fix/issue-408-csrf-status-code` | CSRF failure returns HTTP 200 instead of 403 (false comment in code) |
| 5 | [#409](https://github.com/unidel2035/integram-standalone/issues/409) | `fix/issue-409-wrong-creds-response` | Wrong credentials returns 401+text instead of 200+JSON array |
| 6 | [#410](https://github.com/unidel2035/integram-standalone/issues/410) | `fix/issue-410-report-json-structure` | Report default JSON: row-major `rows` instead of column-major `data` |

### Group 2 — CRITICAL (P0): Data format breaks

| # | Issue | Branch | Description |
|---|-------|--------|-------------|
| 7 | [#432](https://github.com/unidel2035/integram-standalone/issues/432) | `fix/issue-432-json-data-ref-prefix` | Object JSON_DATA missing `ref_id:` prefix on reference values |
| 8 | [#411](https://github.com/unidel2035/integram-standalone/issues/411) | `fix/issue-411-json-data-format-val` | Object JSON_DATA missing `Format_Val_View` formatting |
| 9 | [#412](https://github.com/unidel2035/integram-standalone/issues/412) | `fix/issue-412-json-data-array-count` | Object JSON_DATA returns raw val for array types instead of count |
| 10 | [#413](https://github.com/unidel2035/integram-standalone/issues/413) | `fix/issue-413-url-case-sensitivity` | URL routing is case-sensitive — PHP lowercases entire URI |
| 11 | [#414](https://github.com/unidel2035/integram-standalone/issues/414) | `fix/issue-414-unknown-actions` | Unknown actions return 404 instead of rendering main page |

### Group 3 — HIGH (P1): Data integrity / logic bugs

| # | Issue | Branch | Description |
|---|-------|--------|-------------|
| 12 | [#415](https://github.com/unidel2035/integram-standalone/issues/415) | `fix/issue-415-cascade-delete` | `_m_del` only deletes one level — PHP uses recursive `BatchDelete` |
| 13 | [#416](https://github.com/unidel2035/integram-standalone/issues/416) | `fix/issue-416-uniqueness-check` | `_m_new` uniqueness check uses wrong conditions vs PHP |
| 14 | [#417](https://github.com/unidel2035/integram-standalone/issues/417) | `fix/issue-417-m-new-obj-field` | `_m_new` already-exists returns object ID instead of type ID in `obj` |
| 15 | [#418](https://github.com/unidel2035/integram-standalone/issues/418) | `fix/issue-418-missing-ord-field` | Object JSON missing `ord` field for child objects |
| 16 | [#419](https://github.com/unidel2035/integram-standalone/issues/419) | `fix/issue-419-missing-ref-field` | Object JSON missing `ref` field for REPORT_COLUMN and GRANT types |
| 17 | [#420](https://github.com/unidel2035/integram-standalone/issues/420) | `fix/issue-420-jwt-token-reuse` | `jwt` `updateTokens` always regenerates token — PHP reuses existing |
| 18 | [#421](https://github.com/unidel2035/integram-standalone/issues/421) | `fix/issue-421-options-preflight` | OPTIONS preflight returns 204 without `Allow` header — dead code at line 328 |

### Group 4 — MEDIUM (P2): Error messages / headers

| # | Issue | Branch | Description |
|---|-------|--------|-------------|
| 19 | [#422](https://github.com/unidel2035/integram-standalone/issues/422) | `fix/issue-422-csrf-error-message` | CSRF error message differs — missing `<br/>` tag and wrong wording |
| 20 | [#423](https://github.com/unidel2035/integram-standalone/issues/423) | `fix/issue-423-password-i18n` | Auth password change messages are English-only — PHP is bilingual |
| 21 | [#424](https://github.com/unidel2035/integram-standalone/issues/424) | `fix/issue-424-json-hex-quot` | JSON encoding uses standard stringify — PHP uses `JSON_HEX_QUOT` |
| 22 | [#425](https://github.com/unidel2035/integram-standalone/issues/425) | `fix/issue-425-content-disposition` | Auth JSON responses missing `Content-Disposition` header |
| 23 | [#426](https://github.com/unidel2035/integram-standalone/issues/426) | `fix/issue-426-error-content-type` | Error responses have `application/json` Content-Type — PHP uses `text/html` |
| 24 | [#427](https://github.com/unidel2035/integram-standalone/issues/427) | `fix/issue-427-db-not-found-status` | Database-not-found returns 200+JSON for API auth — PHP returns 404+text |
| 25 | [#428](https://github.com/unidel2035/integram-standalone/issues/428) | `fix/issue-428-htmlesc-single-quotes` | `htmlEsc` does not escape single quotes — XSS risk |

### Group 5 — LOW (P3): Minor behavioral differences

| # | Issue | Branch | Description |
|---|-------|--------|-------------|
| 26 | [#429](https://github.com/unidel2035/integram-standalone/issues/429) | `fix/issue-429-ref-reqs-grant-filter` | `_ref_reqs` applies grant mask filtering — PHP does not |
| 27 | [#430](https://github.com/unidel2035/integram-standalone/issues/430) | `fix/issue-430-checkcode-cookie` | `checkcode` sets cookie — PHP does not |
| 28 | [#431](https://github.com/unidel2035/integram-standalone/issues/431) | `fix/issue-431-expires-header-format` | Expires header uses GMT format — PHP uses +0000 (RFC 2822) |

## Launch command (Claude Code)

To launch all agents in parallel, use the Agent tool with `isolation: "worktree"` for each issue. Example per-agent prompt:

```
Read the GitHub issue: unset LD_PRELOAD LD_LIBRARY_PATH && gh issue view https://github.com/unidel2035/integram-standalone/issues/{NUMBER}

Then solve it:
1. Read the relevant PHP code in integram-server/index.php
2. Read the relevant Node.js code in backend/monolith/src/api/routes/legacy-compat.js
3. Implement the fix
4. Write tests if applicable
5. Commit with message: "fix: {description} (#{NUMBER})"
6. Create PR: unset LD_PRELOAD LD_LIBRARY_PATH && gh pr create --title "fix: {title}" --body "Fixes #{NUMBER}" --base master
```

## Recommended solve order

1. **First**: Group 1 (#405–#410) — these break the frontend completely
2. **Then**: Group 2 (#411–#415) — data format issues that corrupt displayed data
3. **Then**: Group 3 (#416–#422) — logic bugs that cause data integrity issues
4. **Then**: Group 4 (#423–#429) — header/message parity
5. **Last**: Group 5 (#430–#432) — cosmetic differences

All groups can be parallelized internally (no dependencies between issues within a group).
Cross-group dependencies: #411 (Format_Val_View) may interact with #432 (ref_id prefix) — both modify JSON_DATA builder.
