# Needs Your Review

Items in this file require explicit owner (and, where noted, architect) sign-off
before an autonomous session may act on them — per CLAUDE.md: new credentials,
new infrastructure/bindings, anything that would push to `master`, new
`source_url` domains, deletion/restructuring of existing entries, or genuinely
ambiguous design decisions. Autonomous sessions should skip these and work the
`automation/TODO_LIST.md` items instead.

---

## Branch cleanup inventory — 8 branches DELETED 2026-08-01

*(compiled 2026-08-01 by a directed session; **executed 2026-08-01** by a
follow-up directed session with owner + architect pre-approval. Every branch
was re-verified against the evidence below immediately before deletion — all
8 still matched their row exactly, so none were skipped.)*

All 10 remote refs on `origin`, checked against current `master`. "Merged"
means `git branch -r --merged origin/master` reports the branch's tip as an
ancestor of `master` — i.e. its diff vs `master` is genuinely empty, not
merely equivalent.

| Branch | TODO item | Merged into `master`? | Diff vs `master` | Status |
|---|---|---|---|---|
| `dc-auto-2026-07-20_125410` | TODO-003 — copy-to-clipboard on usage rows | **No** | 5 files, +145/-1 (3-dot) | **DELETED 2026-08-01** (tip `a6b28bc`) — conscious exception, see note below |
| `dc-auto-2026-07-20_151157` | TODO-004 — bookmark browsing/management panel | Yes | empty | **DELETED 2026-08-01** (tip `c31fbe8`) |
| `dc-auto-2026-07-21_023811` | TODO-014 — `check-links.js` 1COM/MirtaPBX blind spot | Yes | empty | **DELETED 2026-08-01** (tip `8a3cde7`) |
| `dc-auto-2026-07-22_023726` | TODO-016 — contribution guide | Yes | empty | **DELETED 2026-08-01** (tip `8675b9c`) |
| `dc-auto-2026-07-23_023736` | TODO-017 — `aria-live` on streaming AI chat | Yes | empty | **DELETED 2026-08-01** (tip `7cd4ff2`) |
| `dc-auto-2026-07-24_023859` | TODO-001 — suggestion-block parser + UI | Yes | empty | **DELETED 2026-08-01** (tip `411ea6e`) |
| `dc-auto-2026-07-25_023002` | TODO-012 — slide-generation scoping | Yes | empty | **DELETED 2026-08-01** (tip `488ddcd`) |
| `dc-auto-2026-07-26_023002` | TODO-013 — workflow-generation scoping | Yes | empty | **DELETED 2026-08-01** (tip `393c662`) |
| `cloudflare/workers-autoconfig` | *(none — not automation-created)* | **No** | 2 files, +20 | **still pending** — investigated 2026-08-01, recommendation below |
| `master` / `HEAD` | — | — | — | leave alone (`HEAD` is a symref to `master`) |

**Pre-deletion re-verification (2026-08-01).** For the 7 merged branches,
`git merge-base origin/master origin/<branch>` was confirmed equal to the
branch tip and the 3-dot diff confirmed literally 0 lines — so each carried
zero unshipped work. For `dc-auto-2026-07-20_125410`, the three components
of its only substantive change were byte-compared against `master` and all
three are identical there: `copyUsageCmd()`, the `.usage-copy-btn` CSS block
(including the 44px mobile touch-target rule), and the `<button
class="usage-copy-btn">` markup line. Its destructive-if-merged property was
also re-confirmed: a naive 2-dot apply would have deleted 11,622 lines,
including all 12 `data/notebooks/*.json` files, `sync-notebooks.js`,
`spec-drift-check.js`, `notebook-sync.yml`, `data/workflows.json` and the
`workflows/*.md` files.

Tip SHAs are recorded above so any branch can be restored with
`git push origin <sha>:refs/heads/<name>` while the objects remain in
GitHub's reflog window.

**Remaining remote refs after cleanup:** `master`, `HEAD`, and
`cloudflare/workers-autoconfig`.

Seven of the eight `dc-auto-*` branches were literal ancestors of `master`
with a genuinely empty diff. They carried zero unshipped work and existed only
as historical markers of which Builder run produced which merge.

### `dc-auto-2026-07-20_125410` (TODO-003) — stale, and merging it would have been destructive

This is the branch the "TODO-003 branch left for manual review" section below
describes. Its work **was** shipped, by the isolated-patch route recorded
there (`b3451b1`), so the branch itself was never merged and its three-dot
diff still shows the original +145 lines. Verified this session:

- `copyUsageCmd()` on the branch is **byte-identical** to `master`'s, and
  `usage-copy-btn` markup/CSS/44px-touch-target rule are all present on
  `master`. Nothing in the `index.html` change is unshipped.
- Its `automation/NEEDS_YOUR_REVIEW.md` (+21) and `TODO_LIST.md` (+11)
  additions — the TODO-005–011 pause note and the `## Completed` scaffold —
  are both on `master` already, in a further-evolved form.
- Its `DATA_CENTER_RUN_LOG.md` / `state/dc_automation_state.json` additions
  are superseded by 12 days of later runs.

**Do not merge it.** The branch tip is 12 days behind `master`, so a plain
merge/`git diff master <branch>` apply would *remove* ~11,500 lines — the
entire `data/notebooks/` mirror, `sync-notebooks.js`, `spec-drift-check.js`,
`notebook-sync.yml`, both automation instruction files, the recommendation
documents, `data/workflows.json` and the `workflows/*.md` files, and the
`worker.js` Notebook-X changes. It was purely stale: safe to delete, unsafe to
merge.

**Deleted 2026-08-01** (tip `a6b28bc`) as a deliberate, architect-approved
exception to the branch-retention rule that the "Resolution" note further
down this file invoked when it kept the branch as historical record. The
exception was granted because the branch's historical value is nil (its work
is byte-identical on `master`) while its risk is real and ongoing (a
mistaken merge silently deletes the notebooks mirror and the sync
infrastructure). The audit trail it represented lives on in this file and in
`b3451b1`.

### `cloudflare/workers-autoconfig` — unclear, needs an owner decision

Single commit `4749560` (2026-06-09), never merged, not created by this
repo's automation — it looks like output from a Cloudflare "connect a repo"
integration. It adds a **root** `wrangler.jsonc` declaring
`name: "data-center"` with `assets.directory: "."` (a static-asset Worker for
the whole repo), which is a *different, competing* config from the real
`cloudflare-worker/wrangler.toml` (`name = "data-center-api"`, the API proxy).

Decide whether the repo ever intends to deploy as an assets Worker. If not,
this is safe to delete too; nothing on `master` references it.

> **Correction (2026-08-01).** This section previously claimed the branch's
> `.gitignore` change *removes* `package-lock.json`, `.env.*`, and `audits/`,
> and that adopting it would un-ignore `.env.cloudflare` — a token-hygiene
> regression. **That claim was wrong, and it should not influence the
> decision.** It came from reading a two-dot diff (`git diff master
> <branch>`), which attributes *`master`'s own later additions* to the branch
> as deletions. The branch's real change (three-dot diff) is **purely
> additive**: six lines of wrangler patterns and nothing removed. The
> `.env.*` rule did not exist when the branch was cut on 2026-06-09 — it was
> added to `master` two days later by `9e20080` (2026-06-11). A genuine
> `git merge` would three-way merge against that base and preserve `.env.*`
> intact. See the full investigation below for the corrected recommendation.

---

## Disabled workflows + cloudflare branch — investigation

*(investigated 2026-08-01 by a directed session. **Report only — nothing was
enabled, fixed, or deleted.** Every YAML was read in full and every script it
calls was executed locally to get real exit codes rather than inferred ones.)*

`gh workflow list --all` shows 5 workflows `disabled_manually`. The question
put to this session was whether any are office-AI-agents leftovers, and which
are safe to re-enable given an operating reality of near-zero maintenance
time — where "safe" means failures are visible but never urgent, and nothing
writes code or content on its own.

### Decide by reading only this table

| # | Item | Classification | The one thing that decides it |
|---|---|---|---|
| 1 | `validate.yml` | **SAFE-AS-IS** | Read-only; blocks nothing; failures surface on the commit/PR itself, not just the Actions tab. Re-enable today. |
| 2 | `link-check.yml` | **SAFE-AS-IS** | Read-only; already dedupes *and* auto-closes its issue. Will open one issue immediately — 2 URLs really are dead. |
| 3 | `health.yml` | **NEEDS-SMALL-FIX-FIRST** | Missing the dedup guard its sibling has — opens a **new** issue every Monday, forever, and never closes any. |
| 4 | `monthly-review.yml` | **NEEDS-SMALL-FIX-FIRST** | Its grep can never match the row format this repo actually uses. Silently green forever. |
| 5 | `changelog.yml` | **NEEDS-SMALL-FIX-FIRST** | The only one of the 5 that writes to `master`. Races the twice-daily automation's pushes with no rebase or retry. |
| 6 | `cloudflare/workers-autoconfig` | **extract-one-line-then-delete** | Superseded hosting config. Salvage `.dev.vars*` for `.gitignore`, then delete. |

**Office-AI-agents residue: none, in any of the five.** This was the
suspicion that prompted the investigation, and it does not hold up. A
case-insensitive scan of all of `.github/` for `office`, `agent-sim`,
`meeting`, `persona`, `runbook`, `standup`, `employee`, `colleague` returns
exactly one hit, and it is a false positive — the word "personal" inside a
comment in `notebook-sync.yml` (which is not one of the five and is currently
active). Every one of the five references only data-center's own assets:
`validate-json.js`, `spec-drift-check.js`, `health-check.js`,
`check-links.js`, `flagged/pending-review.md`, `CHANGELOG.md`.

Their creation history says the same thing: all five were authored by the
owner on 2026-06-09/06-10 as data-center's original CI, *before* the office
simulation's own tooling landed. They are not leftovers of a dead project;
they are this project's CI, switched off.

**Why they are off is a separate question, and the run history answers it:**
all five were passing green when they stopped. Last successful runs —
changelog 2026-07-01, validate 2026-07-01, monthly-review 2026-07-01, health
2026-07-06, link-check 2026-07-07. Nothing was failing. This reads as a
deliberate blanket switch-off around 2026-07-07, not an abandonment of broken
jobs.

**Cost, for all five combined: $0.** The repo is public, so GitHub Actions
minutes on standard runners are free and unmetered. The only external calls
are link-check's 105 HTTP HEAD/GET requests per day.

---

#### 1. `validate.yml` — SAFE-AS-IS

**What it does.** Triggers on push *and* pull_request to `**` (every branch).
Checks out, installs Node 20, then runs three steps in order: (a)
`validate-json.js` — schema, bilingual `*_he`/`*_en` pairs, Hebrew-in-`cmd`
rejection, approved/blocked domain enforcement; (b) `spec-drift-check.js
--self-test`; (c) `spec-drift-check.js`.

Step (b) is the interesting one and is worth keeping deliberately: it mutates
the spec in-memory 11 ways and asserts the checker notices each, so a drift
checker that silently stopped working can't report green forever. Verified
locally — all three pass, in well under a second each: 11/11 mutations
caught, 16 spec claims checked, 0 drifted.

**On failure.** Visible in the right place: the run is attached to the commit
or PR that caused it, so it shows as a red ✗ next to the commit in the GitHub
UI and blocks nothing else. This is the one workflow whose failures find you
rather than waiting in the Actions tab.

**On success-with-problems.** Not applicable — it is pass/fail only. Note
`validate-json.js` prints advisory warnings (e.g. "6 mirtapbx entries share
one source_url") without failing; those are informational and stay in the log.

**Why it matters more than it looks.** While this is disabled, Builder
branches get pushed with no CI validation at all. The Auditor's
Push-Authorization Checklist item (d) currently re-runs both validators by
hand precisely because nothing else does. Re-enabling restores the automatic
first line of defence.

**Cost.** ~30–40s per push. No network beyond the checkout. No API calls.

---

#### 2. `link-check.yml` — SAFE-AS-IS

**What it does.** Daily at 06:00 UTC (plus `workflow_dispatch`). Runs
`check-links.js` over every unique `source_url` (105 today) with
`continue-on-error: true`, always writes a summary to the run page, then: on
failure, opens a `broken-link` issue — **but only if no open one already
exists** (`if (issues.length > 0) return;`); on success, closes every open
`broken-link` issue and comments "✅ Resolved — all source URLs are reachable
again."

That open/close pairing is exactly the shape unattended work wants: one issue
at a time, self-clearing, no accumulation.

**On failure.** A GitHub Issue — visible outside the Actions tab, and it
closes itself when fixed.

**On success-with-problems.** It distinguishes real breakage from bot-blocking:
401/403/429 are reported as warnings and explicitly *not* counted as broken
(the TODO-014 fix). So a rate-limiting site does not cause a false alarm.

**Heads-up before you re-enable it: it will open an issue on the first run.**
Executed locally this session — exit code 1, 2 genuinely dead links:

- `https://linux.die.net/man/8/iotop` → 404 (used by `linux.json::iotop`)
- `https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/net-start`
  → 404 (used by `cmd.json::net-start-stop`)

Plus 2 rate-limited-not-broken warnings on `rfc-editor.org` (429), correctly
classified. Both 404s appeared after the workflow's last green run on
2026-07-07 — which is the argument *for* turning it back on. Fixing the two
URLs before re-enabling would mean the first run is green.

**Cost.** ~40s and 105 outbound requests per day. Nothing metered.

---

#### 3. `health.yml` — NEEDS-SMALL-FIX-FIRST

**What it does.** Weekly, Monday 08:00 UTC. Runs `health-check.js`
(`continue-on-error: true`), writes a markdown table of per-module entry
counts to the run summary, then opens a `data-quality` issue if the check
step failed. Verified locally: passes clean today, exit 0, both plain and
`--summary` modes.

**The fix it needs, precisely.** The "Open GitHub Issue on critical failure"
step has **no duplicate guard**. Compare `link-check.yml`, which opens with:

```js
const { data: issues } = await github.rest.issues.listForRepo({
  owner: context.repo.owner, repo: context.repo.repo,
  state: 'open', labels: 'broken-link',
});
if (issues.length > 0) return;
```

`health.yml` calls `issues.create()` with no such check, and has no
counterpart to link-check's "Close issue if check passed" step. So a data
quality problem that isn't fixed the same week produces a fresh issue every
Monday indefinitely, and none of them ever close — the exact failure mode
that turns an unattended repo's issue list into noise nobody reads.

**The change:** copy link-check's dedup guard into the create step (with
`labels: 'data-quality'`), and copy its auto-close step across as well. Both
are lifts from a sibling file in the same repo, no new logic.

**Also worth cleaning while in there (cosmetic, not blocking).** The run step
is:

```yaml
run: |
  node .github/scripts/health-check.js
  echo "exit_code=$?" >> $GITHUB_OUTPUT
```

Under Actions' default `bash -e`, a non-zero exit from the first line aborts
the step, so the `echo` never runs and `steps.health.outputs.exit_code` is
never set. It is dead code. Harmless — the workflow correctly gates on
`steps.health.outcome == 'failure'`, which is evaluated before
`continue-on-error` is applied — but it misleads anyone reading the file.

**On failure / on problems.** A GitHub Issue, with the duplication caveat
above. **Cost:** ~30s weekly, no network, no API cost.

---

#### 4. `monthly-review.yml` — NEEDS-SMALL-FIX-FIRST

**What it does.** Monthly, 1st at 08:00 UTC. No Node, no scripts — it checks
out the repo, greps `flagged/pending-review.md` for pending rows, and opens a
`source-review` reminder issue if it finds any (with a dedup guard, which
this one does have).

**The fix it needs, precisely — this workflow currently cannot ever fire.**
The grep is:

```bash
if grep -qE '^\| *\[' flagged/pending-review.md; then
```

That pattern requires a table row beginning with `| [` — i.e. a URL written
as a markdown link. But the row format this repo actually uses is a **bare
URL**. From `flagged/approved-sources.md`:

```
| https://1com.co.il/ | `data/1com.json` (general) | 2026-06-15 — vendor's own site... |
```

A row in that format starts `| h`, not `| [`, so the pattern misses it. Ran
the exact grep against the current file this session: `pending=false`. That
is correct *today* only by accident — `pending-review.md` is an empty table.
The moment a real entry is added in the repo's own format, the workflow keeps
reporting `pending=false` and the monthly reminder silently never arrives.

This is the "green forever" failure mode: no red run, no error, just a
safeguard that quietly does nothing — the same class of bug the spec-drift
self-test exists to prevent.

**The change:** widen the pattern to match any data row, bare URL or markdown
link, while still excluding the header and separator lines:

```bash
if grep -qE '^\|[[:space:]]*(https?://|\[)' flagged/pending-review.md; then
```

Header `| URL |` starts `| U` and separator `|-----|` starts `|-`, so neither
matches; both real row formats do.

**On failure.** Nothing meaningful can fail — worst case the checkout fails
and the run turns red in the Actions tab, which nobody would notice. But
there is nothing at risk either.

**On success-with-problems.** Opens a `source-review` issue, deduped. No
auto-close (it is a reminder, so this is defensible — you close it when you
have done the review).

**Cost.** ~10s once a month. No network, no Node, no API calls. The cheapest
of the five by a wide margin.

---

#### 5. `changelog.yml` — NEEDS-SMALL-FIX-FIRST

**Read this one against your own stated bar**, because it is the only one of
the five that fails it as written: *"nothing writes code or content on its
own."* This workflow writes `CHANGELOG.md` and pushes it to `master`. CLAUDE.md
already carves it out as an accepted exception ("`changelog.yml` (`CHANGELOG.md`
only)"), so this is not a new violation — but it is worth re-confirming
deliberately rather than inheriting.

**What it does.** On every push to `main`/`master`, with `contents: write`:
checks out full history, collects commits between `github.event.before` and
`github.sha`, formats them as markdown bullets with commit links, prepends a
`## [date — sha] (branch)` section directly under the `# Changelog` header,
then commits as `github-actions[bot]` with `[skip ci]` and pushes. The
`[skip ci]` tag is what stops it from retriggering itself — that part is
sound.

**The fix it needs, precisely.** The final step is a bare:

```bash
git push
```

with no `git pull --rebase` beforehand, no retry, and no `concurrency:` block
on the job. When this workflow was last active, `master` received pushes only
from the owner. That is no longer true: the twice-daily unattended automation
now pushes `master` (the Auditor's merges, and its unconditional daily
`DATA_CENTER_AUDIT.md` push), and `notebook-sync.yml` pushes `data/notebooks/`
weekly. If any of those lands while a changelog run is in flight, the push is
rejected non-fast-forward, the run goes red in the Actions tab where nobody
looks, and **that changelog entry is lost permanently** — there is no retry
and the next run only covers its own `before..after` range.

**The change:** add a job-level concurrency group so runs serialise —

```yaml
concurrency:
  group: changelog-${{ github.ref }}
  cancel-in-progress: false
```

— and make the push resilient, e.g. `git pull --rebase origin "$BRANCH"`
before `git push`, or a short retry loop. Both are needed: concurrency stops
changelog runs racing *each other*, the rebase handles the automation pushing
underneath it.

**Second thing to decide, separate from the fix.** Re-enabling changes what
`CHANGELOG.md` becomes. Every Auditor run pushes `DATA_CENTER_AUDIT.md` to
`master` daily, so the changelog will accrue a bot commit plus an audit-
bookkeeping entry every day, and the file drifts from "what changed in the
product" toward "what the automation did." If you want it to stay a product
changelog, it needs a commit-message filter (e.g. skip `chore(automation):`
and `chore: daily automation audit`) — that is a larger change than the race
fix and should be a decision, not a default.

**Also note:** `CHANGELOG.md` currently ends at 2026-07-01. Everything since —
the whole of July, including the Notebook-X mirror, the self-hosted Workflows
tab, the audit-session fixes, and the automation build-out — is missing.
Re-enabling does **not** backfill it; the workflow only ever looks at the
current push's commit range. Backfilling, if wanted, is a separate one-off.

**On failure.** Red run in the Actions tab only, and silent data loss as
described. **Cost:** ~20s per push to `master`, plus one bot commit per push.

---

### `cloudflare/workers-autoconfig` — recommendation: extract one line, then delete

**What is actually on it.** Single commit `4749560`, 2026-06-09, authored by
`cloudflare-workers-and-pages[bot]` — machine-generated onboarding output from
Cloudflare's "connect a repo" flow, not written by the owner and not produced
by this repo's automation. The complete three-dot diff is two files, +20
lines, and that is genuinely all of it:

1. **`wrangler.jsonc` (new, root, 14 lines)** — declares a Worker named
   `data-center` with `assets.directory: "."`, `nodejs_compat`, and
   observability enabled. It is a *static-asset* Worker serving the whole repo
   root, which is a different and competing thing from the real
   `cloudflare-worker/wrangler.toml` (`name = "data-center-api"`, the API
   proxy with the Anthropic key).
2. **`.gitignore` (+6 lines, purely additive)** — a `# wrangler files`
   comment plus `.wrangler`, `.dev.vars*`, `!.dev.vars.example`,
   `!.env.example`. **Nothing is removed** — see the correction above; the
   earlier "it deletes `.env.*`" reading was a two-dot-diff artifact.

**What it was trying to do.** Set the repo up to deploy as a Cloudflare
static-assets Worker. The timing places it in the same week the owner was
experimenting with Cloudflare deploys for the office-era agent-runner
(`9e20080`, 2026-06-11) — so it is office-*adjacent* in origin, but its
content is not office code: it names `data-center` and points at the repo
root.

**Is any of it unshipped work with remaining value?**

- **The assets Worker: fully superseded, and was never wanted.** Hosting is
  GitHub Pages (`pages-build-deployment` is active, the live site is
  `avivnofar.github.io/data-center`), and CLAUDE.md fixes hosting at
  "GitHub Pages — $0/month". Deploying the repo root as a second static site
  on `*.workers.dev` would duplicate hosting for no benefit and add a second
  URL to keep in sync. Nothing on `master` references `wrangler.jsonc` or an
  assets Worker anywhere. A root `wrangler.jsonc` would also sit in the path
  of any future `wrangler` invocation in this repo and could be picked up
  ahead of the real `cloudflare-worker/wrangler.toml` — a small but real
  foot-gun.
- **One line is worth keeping: `.dev.vars*`.** `master`'s `.gitignore` covers
  `.env`, `.env.*`, and `.wrangler/` — but **not** `.dev.vars`, which is
  wrangler's local-secrets file. Anyone running `wrangler dev` inside
  `cloudflare-worker/` to test the Worker would produce a
  `cloudflare-worker/.dev.vars` holding the Anthropic API key, and nothing
  currently stops it being committed. That is a genuine gap in a repo whose
  first rule is never to ship credentials, and it costs one line to close.
  (`!.env.example` / `!.dev.vars.example` are unnecessary — neither file
  exists here.)

**Recommendation: extract `.dev.vars*` into `.gitignore` on `master`, then
delete the branch.** The extraction is a one-line commit that stands entirely
on its own merit and does not require adopting anything else from the branch;
the branch itself carries nothing else of value and one mild foot-gun. Not
done in this session — the brief was report-only, and the `.gitignore` line
should land as its own deliberate change.

---

## TODO-012 + TODO-013 — two recommendations awaiting your decision

*(added 2026-07-26 by the CLAUDE_AUDIT review — retroactive backfill of
entries the Builder should have written itself; the instruction gap that
allowed this has been closed in `automation/instructions_builder.txt` §5)*

Both of these ran to completion and produced a full recommendation document,
then went invisible: for two days nothing on `master` recorded that they had
happened. The Auditor behaved correctly in both cases (a scoping-only
`needs-review` item is deliberately not auto-mergeable) and did note the
branches in `DATA_CENTER_RUN_LOG.md` — but a run-log mention is not a review
queue, and nothing escalated them here.

**Both branches have since been merged to `master` (2026-07-27), so the
documents are no longer stranded** — read them at
`automation/recommendations/`. What is still open is the actual decision:
whether to build either feature. Because `needs-review` is a hard skip for
future Builder runs, neither item will be picked up again automatically.

### TODO-012 — presentation/slide generation

- **Branch:** `dc-auto-2026-07-25_023002` — merged 2026-07-27
- **Deliverable:** `automation/recommendations/TODO-012-presentation-slides.md`
- **Recommendation:** conditional go — scope it to Workflow markdown documents
  only, and reuse the existing `window.print()` + `@media print` pattern
  already in `index.html` rather than adding a slide library.
- **Also on the branch:** new TODO-026 and TODO-027 entries sizing the work.

### TODO-013 — workflow document generation

- **Branch:** `dc-auto-2026-07-26_023002` — merged 2026-07-27
- **Deliverable:** `automation/recommendations/TODO-013-workflow-generation.md`
- **Recommendation:** do **not** build an in-app editor that commits straight
  to `workflows/` — it would need a new GitHub write credential, the same
  open question already parked in this file. Build a client-side markdown
  template/preview tool instead: form → assembled markdown → live preview via
  the existing `renderMarkdown()` → Blob download. No commits, no credentials.
- **Also on the branch:** a new TODO-028 entry sizing the work.

### What we need from you

For each: (a) accept the recommendation and open an implementation TODO,
(b) reject it and note why here, or (c) re-queue the scoping work with a
`"status": "cleared-for-retry"` entry for that ID in
`automation/state/dc_automation_state.json`.

Follow-up items sized by these two runs are already in `TODO_LIST.md` as
TODO-026, TODO-027 (from TODO-012) and TODO-028 (from TODO-013). They are
proposals, not commitments — nothing will pick them up without your decision.

**Note also:** TODO-015 (PWA/offline scoping) is the next scoping-only item in
the queue and would have hit exactly the same dead end. With the instruction
fix in place it will now surface here properly instead.

---

## TODO-005 through TODO-011 — paused pending Notebook-X architecture decision

*(added 2026-07-20, when the twice-daily unattended automation was built —
see `automation/DATA_CENTER_AUTOMATION_SPEC.md` §4, §10)*

TODO-005 through TODO-011 (activating the `powershell`, `cloud`, `security`,
`docker`, `cicd`, `casestudies`, `cli` content modules) are paused and must
not be authored by any automated Builder run until the Notebook-X
integration architecture decision above resolves — even though nothing else
in this file previously marked them blocked. Several of these items'
`TODO_LIST.md` descriptions reference Notebook-X notebooks as topic-outline
references, and the underlying "what does citing/using Notebook-X content
actually look like" question is exactly what's undecided above. TODO-010
additionally stays excluded unconditionally once this pause lifts (its own
entry calls for an owner-approved schema-design split first).

This does not block TODO-001 through TODO-004 or TODO-014/016/017, which
have no dependency on this decision.

---

## Notebook-X Integration — Architecture Decision Needed — RESOLVED 2026-07-21

**Decision (owner + architect):** repo mirror, not live fetch or KV. A
scheduled GitHub Action (`.github/workflows/notebook-sync.yml` +
`.github/scripts/sync-notebooks.js`) pulls the Notebook-X public index and
all 12 notebooks verbatim into this repo's own `data/notebooks/` weekly,
using a read-only fine-grained PAT (`NOTEBOOKX_READ_TOKEN` repo secret,
Contents:read on `avivnofar/Notebook-X` only — created manually by the
owner). The Worker (`worker.js`) stays a dumb proxy: `getNotebookXContext()`
(the confirmed silent no-op described below) is deleted, not fixed. The
client (`index.html`) matches the user's query against the mirrored index
(`matchNotebooks()` — word-boundary + stopword-filtered scoring, minimum
relevance threshold so an unrelated notebook is never attached) and
attaches only relevant sections (`buildNotebookContext()`, capped at ~15 KB,
truncated at section boundaries) as a new `notebook_context` request field.
The Worker appends it to the system prompt with a 20 KB server-side cap as
defense in depth. No Cloudflare KV, no new Cloudflare infrastructure of any
kind. Implemented and committed locally this session (not yet pushed to
master — see CURRENT-SPEC.md "Recently Completed" for the full change
list); the owner still needs to create the `NOTEBOOKX_READ_TOKEN` secret
before `notebook-sync.yml`'s first scheduled run will succeed (this
session's `data/notebooks/` content was a one-time manual copy via `gh api`
so the feature is testable immediately).

This resolves the architecture question below but does **not** itself lift
the TODO-005–011 pause (that's a separate owner decision, still open — see
that section above).

*(Part A investigation, 2026-07-19 — read-only, no code changed)*

### 0. Prior partial attempt: none found

Searched `git log --all` (repo-wide and scoped to `cloudflare-worker/`) for
anything referencing Notebook-X, sync, or KV from the last few days. The only
Notebook-X-related history is the existing, already-documented index-injection
feature — two commits (`455a087` and `7761e13`) with **identical timestamps and
identical diffs** (a duplicate/merge artifact from the same change, not two
separate attempts). No commit anywhere mentions a KV binding or a sync job.
`cloudflare-worker/wrangler.toml` defines nothing beyond `name`/`main`/
`compatibility_date` and a comment about the `ANTHROPIC_API_KEY` secret — no
KV namespace, no cron trigger. `worker.js` has no stub functions, no
commented-out fetch calls, and no unused env var references — `env.ANTHROPIC_API_KEY`
is the only env reference in the file (grepped for `env.`, `GITHUB_TOKEN`,
`GH_TOKEN`, `Authorization`, `process.env`). The `automation/` directory itself
held only two empty (0-byte) placeholder files when this session started —
nothing to recover there either. **Conclusion: there is no partial sync attempt
to build on — the "maybe requested yesterday" concern doesn't match repo state.**

### 1. Auth finding — the current fetch is live and silently broken

`getNotebookXContext()` (`cloudflare-worker/worker.js:70-95`) does a bare
`fetch()` against
`https://raw.githubusercontent.com/avivnofar/Notebook-X/main/notebooks/_index-public.json`
with **no `Authorization` header and no token anywhere in the codebase**.

Verified directly: `curl` of that exact URL, unauthenticated, from this
session returns **HTTP 404**. Notebook-X is a private repo; GitHub's
raw-content host returns 404 (not 401) for private-repo paths when
unauthenticated, by design, to avoid leaking repo existence. Because
`getNotebookXContext()` treats any non-`ok` response as "fail gracefully,
return `''`" (`worker.js:75`), **this has been silently failing in production
the whole time it's been live** — the "NOTEBOOK-X REFERENCE NOTEBOOKS" block
is never actually appended to the system prompt today. There is no error
anywhere to notice; it just quietly does nothing.

**Documentation drift found, not fixed (flagging per instructions):**
CURRENT-SPEC.md's "Architecture" section and "Recently Completed" list this as
a working, live feature. It is real, deployed code — but it is currently a
no-op against the actual (private) Notebook-X repo. Recommend CURRENT-SPEC.md
be corrected to reflect this once the owner/architect confirm the finding.

Whichever path is chosen below, **a GitHub credential of some kind is
unavoidable** — Notebook-X's privacy is the root blocker, not the fetch
pattern.

### 2. Corpus size

`_index-public.json` currently lists **12 notebooks**. Fetched via `gh api` using the CLI's own existing
`repo`-scoped GitHub auth (read-only investigation of a repo the same owner
already has access to — nothing was written, cached, or exposed anywhere).

| Notebook | Domain | Bytes |
|---|---|---:|
| kb-networking.json | networking | 73,100 |
| kb-ai-tools.json | ai | 70,552 |
| kb-mirtapbx.json | pbx | 48,186 |
| kb-cloud-devops.json | devops | 49,533 |
| kb-voip-sip.json | telecom | 47,583 |
| kb-firewall.json | security | 41,812 |
| kb-vpn.json | networking/security | 31,580 |
| kb-1com.json | telecom | 30,848 |
| kb-linux.json | linux | 28,289 |
| kb-bash.json | linux | 26,235 |
| kb-cybersecurity.json | security | 25,142 |
| kb-remote-access.json | it-support | 22,792 |
| **Total (12 files)** | | **495,652 bytes (~484 KB)** |

Range: 22.8 KB – 73.1 KB per notebook. Well within a single Worker request's
budget either as a live fetch or as KV reads.

### 3. Structural notes — no schema drift found

Checked 4 of 12 notebooks in full (`kb-linux`, `kb-firewall`, `kb-voip-sip`,
`kb-cybersecurity`) — schema is identical across all four:

- Top level: `id, name, version, format, domain, tags, description, language,
  createdAt, updatedAt, generatedBy, pinned, relatedNotebooks,
  relatedProjects, githubRawUrl, knowledgeBase, fileMemory, busSync,
  metadata, files, messages`
- `knowledgeBase`: `summary, lastWebVerified, webSources, sections, glossary,
  commonIssues, commands`
- `knowledgeBase.sections[]`: `id, title, content, subsections, tags,
  lastUpdated, sources` — richer than "id/title/content/tags" (also has
  `subsections`, `lastUpdated`, `sources`), but consistent across every
  notebook checked. No drift.

### 4. Two architecture options — undecided, needs owner + architect discussion

**(a) Extend the live-fetch pattern to pull full notebook content per-request**
- Pros: no new infrastructure; reuses the existing edge-cache pattern
  (5-min TTL already in place); simplest mental model; notebook edits are
  visible within ~5 minutes.
- Cons: still needs the GitHub-token problem solved (see finding #1); adds
  ~20–70 KB per fetched notebook to relevant requests (cost + latency on a
  free-tier Worker); ties request-path reliability to GitHub's uptime; no
  offline/degraded fallback beyond empty string.

**(b) Scheduled sync into a Cloudflare KV mirror**
- Pros: Worker reads become fast/local, no per-request GitHub round-trip;
  decouples user latency from GitHub availability; sync can run on a cadence
  matched to Notebook-X's actual ~weekly update rate instead of every request.
- Cons: needs a **new Cloudflare KV namespace binding** (new infra — sign-off
  required per CLAUDE.md); needs a **scheduled sync job** with its own
  read-only GitHub token, stored either as a GitHub Actions secret (if the
  sync runs from Notebook-X's or data-center's Actions) or a Cloudflare
  secret (if it runs as a Worker Cron Trigger) — either way, new credentials;
  introduces a staleness window between syncs.

Neither option is recommended here — both require the same underlying
GitHub-auth decision, and (b) additionally requires new Cloudflare
infrastructure. This is deliberately left for the owner + architect planning
chat, per this session's brief.

---

## GitHub write-credential decision — self-extension Issue-filing (blocks TODO-001, TODO-002)

`worker.js`'s system prompt (lines 297-306) already instructs Claude to emit
`CAPABILITY_SUGGESTION: {...}` and `LEARNED_SOURCE: {...}` blocks. Building the
client-side parser/UI for these (TODO-001) doesn't need new credentials, but
actually **filing** a GitHub Issue or **appending a row to
`flagged/pending-review.md`** (TODO-002) does — per CLAUDE.md, "Issue filing
must go through a server-side component (the Worker never gets GitHub write
access)". Concretely this means deciding: does the Worker get a narrowly
scoped (Issues:write only, or repo-contents:write only for pending-review.md)
GitHub PAT as a new Cloudflare secret, or does a separate small serverless
function/GitHub Action handle it instead? This is a new credential either way
and needs explicit sign-off before TODO-001/TODO-002 can be finished
end-to-end (the parser/UI half of TODO-001 can still be built and shipped
without this decision — see that TODO's notes).

---

## 2026-07-20 — TODO-003 branch left for manual review (Auditor Run 2) — RESOLVED

**Branch:** `dc-auto-2026-07-20_125410` (pushed to origin, NOT merged to
`master`). **TODO item:** TODO-003 — copy-to-clipboard buttons on
command-card usage rows.

**Push-Authorization Checklist result:** independently re-verified all 5
items on the checklist in `automation/instructions_auditor.txt` §Push-
Authorization Checklist. Item **(a) FAILED**; items (b), (c), (d), (e) all
passed. Per the checklist ("ALL must hold... any single failure means do
not merge"), the branch was left untouched and unmerged.

**Item (a) — files touched must match TODO-003's own "Files/areas" field
(`automation/TODO_LIST.md`), nothing outside stated scope:**
TODO-003's stated scope is `index.html` only. The branch's actual diff
against `master` (`git diff master...dc-auto-2026-07-20_125410 --stat`)
touches 5 files, not 1:

- `index.html` — in scope, and the change itself is clean (see below).
- `automation/DATA_CENTER_RUN_LOG.md`, `automation/state/dc_automation_state.json`
  — standard per-run bookkeeping the Builder is separately instructed to
  produce (spec §5/§8); not treated as a scope violation on its own.
- `automation/NEEDS_YOUR_REVIEW.md` (+21 lines) and `automation/TODO_LIST.md`
  (+11 lines) — **not** bookkeeping. These add the TODO-005–011
  Notebook-X-pause note and the `## Completed` section scaffold required by
  `DATA_CENTER_AUTOMATION_SPEC.md` §10. The Builder's own commit message
  (`4db1415`, "carry forward pre-existing pause note + Completed section")
  says explicitly these were *pre-existing uncommitted edits from the
  automation-setup session*, unrelated to TODO-003, folded into this
  branch because they happened to be sitting in the working tree when the
  Builder run started. That is real scope creep under the checklist's
  literal wording, regardless of the content being otherwise legitimate
  and spec-mandated — it doesn't belong bundled into a TODO-003
  push-authorization decision.

**What was NOT wrong** (checked in full, for the record — items (b)-(e) all
passed independently):
- (b) Zero `source_url` values anywhere in the diff (grepped directly).
- (c) No `data/*.json` touched, no schema/workflow/`wrangler.toml`/
  credential-adjacent changes.
- (d) `node .github/scripts/validate-json.js` passes clean on a fresh
  checkout of the branch (all 7 JSON files valid); `health-check.js` not
  required since no `data/*.json` changed.
- (e) The `index.html` diff itself matches TODO-003's Definition of Done: a
  real `<button class="usage-copy-btn">` per usage row (not a styled
  `div`), a `copyUsageCmd()` function reusing `copyAiCode()`'s
  clipboard-write + flash-text pattern, bilingual label, 44px mobile
  touch-target rule, and it lives inside `.card-body` so it doesn't
  interfere with `toggleCard()`'s header click handler. This part looks
  ready to ship as-is.

**Recommended next step for the owner:** the `index.html` change and the
`automation/NEEDS_YOUR_REVIEW.md` / `automation/TODO_LIST.md` scaffolding
are both individually fine — they just shouldn't have shipped as one
push-authorization unit. Either (i) manually merge this branch (owner
judgment, not an autonomous decision) since the bundled content is legitimate,
or (ii) ask a future Builder run to split them: commit the setup-scaffolding
docs on `master` directly (outside any TODO branch) and keep TODO-003
branches to `index.html` only going forward.

**State/log follow-up:** `automation/state/dc_automation_state.json` and
`automation/DATA_CENTER_RUN_LOG.md` did not exist on `master` before this
run (they were only ever created on the Builder's branch, since Run 1 never
pushes to `master`). This Auditor run created both fresh on `master`,
carrying forward the Builder's original `TODO-003: done` entry plus a new
`TODO-003: needs-review` entry, and wrote a matching run-log entry — but
per the hard constraint that only `automation/DATA_CENTER_AUDIT.md` (and a
successful STEP-1 merge's doc/state files) may be pushed directly to
`master`, these are left as **uncommitted working-tree changes**, not
pushed and not even committed, pending owner review/commit.

**Resolution (2026-07-20, owner-directed manual merge):** rather than
merging the branch as a whole (which would have reintroduced the stale
`automation/NEEDS_YOUR_REVIEW.md`/`TODO_LIST.md` edits this note flags —
now doubly stale after several more automation runs landed on `master`
since this note was written), only the `index.html` change was extracted:
`git diff master...dc-auto-2026-07-20_125410 -- index.html` was applied as
a patch (not a raw file checkout, since `master`'s `index.html` had since
gained the unrelated "My Bookmarks panel" feature (TODO-004) that a plain
`git checkout <branch> -- index.html` would have clobbered) onto a fresh
branch off current `master`, validated, and merged via
`b3451b1105de671b38b2f423d0e77a60b94555cb`. `dc-auto-2026-07-20_125410`
itself was never merged and remains as historical record per the branch-
retention rule. TODO-003 is now moved to `TODO_LIST.md`'s `## Completed`
section with the full explanation. No further action needed on this item.

---

## Standing reminders (not new findings, just carried forward from CLAUDE.md)

- No automation session may push to `master` — all sessions stop at a local
  commit and report back.
- No automation session may add a new `source_url` domain to the approved
  allowlist (CLAUDE.md Rule 7) without owner sign-off — `flagged/`'s
  quarantine flow governs specific URLs; a genuinely new *domain* is a bigger
  step than logging a URL as pending.
- `flagged/pending-review.md` is currently an empty table — nothing is
  awaiting review right now, so there's nothing actionable there this session.
