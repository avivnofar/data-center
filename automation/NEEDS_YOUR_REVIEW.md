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
| `cloudflare/workers-autoconfig` | *(none — not automation-created)* | **No** | 2 files, +20 | **DELETED 2026-08-01** (tip `4749560`) — owner-approved; `.dev.vars*` extracted to `.gitignore` first, `wrangler.jsonc` and the `.env.*`-dropping .gitignore rewrite deliberately discarded |
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

## Security audit 2026-08-01 — Anthropic key end-to-end + adjacent risks

Owner-directed preventive audit (no incident; console usage checked clean by
the owner). Scope: key storage, key transit, Worker abuse surface, notebook
mirror injection, repo settings. **Bottom line: the key cannot leak through
the Worker today** — but it exists in a second place nobody is using, and the
Worker's spend controls are weaker than their names suggest.

**Fixed immediately this session** (no owner sign-off needed, both trivial):

- `.dev.vars*` + `!.dev.vars.example` added to `.gitignore`. `.dev.vars` is how
  `wrangler dev` supplies Worker secrets locally and was **not** matched by the
  existing `.env.*` rule — a local `.dev.vars` holding the real key would have
  been committable. Verified both directions: a probe `cloudflare-worker/.dev.vars`
  is now ignored, and `.env.cloudflare` still is. No `.dev.vars` exists locally
  and none was ever committed (`git log --all --diff-filter=A` over
  `*.dev.vars*`: zero results).
- `cloudflare/workers-autoconfig` deleted after extracting that one line (tip
  recorded in the inventory table above). The rest of its `.gitignore` rewrite
  was deliberately discarded — it was based on a pre-`.env.*` version and would
  have **un-ignored `.env.cloudflare`**.

### SEC-01 — `ANTHROPIC_API_KEY` is a GitHub Actions secret with zero consumers — **HIGH**

`gh secret list` shows four repo secrets. Only `NOTEBOOKX_READ_TOKEN` is
referenced by any workflow (`notebook-sync.yml:53`); `ANTHROPIC_API_KEY`
(added 2026-06-16), `GOOGLE_AI_API_KEY`, and `GROQ_API_KEY` (both 2026-06-13)
are referenced **nowhere** in `.github/workflows/`. They are leftovers from the
retired `a779cdd` scheduled-Claude-automation era.

This directly contradicts `worker.js`'s own header comment ("This worker is the
ONLY place the Anthropic API key exists") and CLAUDE.md's AI Backend section.
On a **public** repo, any workflow added on any branch — by the owner, by an
automation run, or via a compromised token — can `echo` a secret into a log or
POST it outbound. Fork PRs don't receive secrets, which bounds this, but a push
to any branch does. The secret's value is invisible to me and to this audit;
whether it matches the live Worker secret is unknown.

**Concrete fix (owner action, ~2 minutes):**
```
gh secret delete ANTHROPIC_API_KEY
gh secret delete GOOGLE_AI_API_KEY
gh secret delete GROQ_API_KEY
```
Then rotate the Anthropic key in the Anthropic console and re-set it as a
Worker secret only (`wrangler secret put ANTHROPIC_API_KEY`) — deletion removes
future exposure but not past exposure, and the key has been sitting there since
June. Rotation is the part that actually closes it. Left undone here because
deleting repo secrets and rotating a production credential are both outside
what an unattended/assisted session should do unilaterally.

### SEC-02 — the "global" daily cap is per-isolate, so it is not a real ceiling — **MEDIUM** — *documentation half RESOLVED 2026-08-01*

> **Update 2026-08-01:** the two cheap riders recommended at the end of this
> document were applied during the `web_search_20260209` redeploy. The constant
> is now `DAILY_MAX_PER_ISOLATE = 300` (was `DAILY_GLOBAL_MAX = 1500`), the
> comment states the per-isolate limitation and points back here, and the log
> fields are `isolate_daily_count` / `isolate_total_calls` /
> `isolate_daily_cap_reached` / `cap_per_isolate`. The worst case is now
> `300 × (isolates reached)` instead of `1500 × (isolates reached)`.
> **Still open:** the structural fix (Durable Object or KV with TTL) and the
> Anthropic-console spend limit, which is still the highest value-per-effort
> item and is not a Worker change.

The finding as originally written (past tense — the naming half is now fixed):

The daily cap constant was named for a guarantee it did not provide, and was
enforced against `dailyCounts`, an **in-memory `Map` local to each Worker
isolate**. The `ipRequests` rate limiter (20/min/IP) carried an honest comment
about exactly this limitation; the daily counter was described as a "Global
circuit breaker" and did not. Cloudflare runs many isolates across many edge
locations, and each gets its own fresh counter (also wiped on cold start), so
the true ceiling was `cap × (isolates reached)`, never the bare cap.

**Concrete fix — still open.** The naming half is done (see the update above);
the structural half is not. Move both counters to a Durable Object
(single-instance counter, strongly consistent) or KV with TTL.
`cloudflare-worker/README.md` already names this as the fix for the rate
limiter. The rename lowers the cost of being wrong about this, but it does not
make the cap global — it only stops the code from claiming to be.

### SEC-03 — what a forged `Origin` actually buys an attacker, and at what cost — **MEDIUM**

Verified against code, not docs:

- **Origin check**: `request.headers.get('Origin') || ''`, then
  `ALLOWED_ORIGINS.includes(origin)`. A missing `Origin` becomes `''`, which is
  not in the list → **403**. So plain `curl` with no headers *is* blocked — that
  part is stronger than expected. But `curl -H "Origin: https://avivnofar.github.io"`
  passes. The header is trivially forgeable and is not authentication; the code
  says so itself.
- **Request size caps — the premise that only `notebook_context` is capped is
  outdated.** The Worker caps the whole body (6 MB), messages (40 turns, 12k
  chars each, 60k total), `db_context` (20k chars), `notebook_context` (20k),
  and images (3 max, 2 MB base64 each, media-type allowlisted). This surface is
  well covered.
- **Per-request model limits**: `MAX_TOKENS = 1536` output, `web_search` capped
  at `max_uses: 2` (lowered from 3 on 2026-08-04).
- **Turnstile**: implemented and fails closed, but **dormant unless
  `TURNSTILE_SECRET` is set**. I cannot see Cloudflare secrets from here —
  **owner should confirm whether it is set**. If it is, most of this finding
  collapses; if not, the Origin header is the only gate.

**Cost per hour, worst case.** Max-size request ≈ 45k input tokens (system
prompt + 20k-char `db_context` + 20k-char `notebook_context` + 60k chars of
messages + 3 high-res images) and 1536 output tokens.

**Recomputed 2026-08-04** after prompt caching + `max_uses: 3 → 2`. The cached
prefix size is **measured, not estimated**: production logs show
`cache_read_input_tokens = 9,812` on a warm request. At `claude-sonnet-5`
introductory pricing ($2/$10 per MTok through 2026-08-31; $0.20/MTok cache
read) plus web search at $10/1k searches:

| | before | after |
|---|---|---|
| uncached input | 45,000 × $2/MTok = $0.0900 | 35,188 × $2/MTok = $0.0704 |
| cached input | — | 9,812 × $0.20/MTok = $0.0020 |
| output | 1,536 × $10/MTok = $0.0154 | 1,536 × $10/MTok = $0.0154 |
| web search | 3 × $0.01 = $0.0300 | 2 × $0.01 = $0.0200 |
| **per request** | **≈ $0.135** | **≈ $0.108** |
| per hour, 20/min uncapped | ≈ $162 | **≈ $129** |
| per isolate per UTC day (300 cap) | ≈ $40.6 | **≈ $32.3** |

Once intro pricing ends (2026-09-01, $3/$15): $0.188 → **$0.152** per request,
≈ $45.5 per isolate-day.

**The honest read: caching helps less against an attacker than against normal
traffic, and the assumption that "attacker requests are cache-hits after the
first" is only ~22% true.** The cached prefix is 9,812 tokens — the `tools`
array plus the static system blocks — which is 21.8% of a 45k-token
max-payload request. Everything an attacker actually controls (`db_context`,
`notebook_context`, messages, images) sits *below* the breakpoint by design,
because that content changes every request and caching it would invalidate the
entry every time. So caching is worth **$0.0177/request** against a
max-payload caller, and dropping one web search another $0.010. Against
*normal* traffic the same 9,812 tokens are most of the prompt, which is why an
ordinary question halved in cost (see the measured figures in CURRENT-SPEC).

One second-order effect, for completeness: an attacker rotating
`mode`/`language`/`cli_mode` forces a cache *write* (1.25×) instead of a read
on the static prefix, which costs ~$0.0013/request **more** than no caching at
all. That is ~1% of request cost — noise, not a regression worth acting on,
but it means caching is not a strict improvement in the adversarial case.

The structural point is unchanged: a distributed caller rotating IPs across
edge locations multiplies the per-isolate figure by the isolate count
(SEC-02), so the real daily ceiling is still not bounded by anything
computable from the code. `TURNSTILE_SECRET` remains the fix that actually
closes this; the cost work narrows the blast radius, it does not gate access.

**Concrete fix, cheapest first:** (1) set `TURNSTILE_SECRET` — the code path
already exists and is dormant, so this is config, not code; (2) fix SEC-02 so
the daily cap is real; (3) consider trimming `MAX_IMAGES`/`MAX_IMAGE_B64_CHARS`,
which dominate the per-request input cost.

### SEC-04 — notebook mirror is unsanitized prompt input — **LOW (report only)**

`notebook_context` is appended to the system prompt under a plain-text header
(`NOTEBOOK-X REFERENCE CONTENT (mirrored, may be up to a week old): …`) with no
structural delimiter, no escaping, and no sanitization anywhere in the path —
not in `sync-notebooks.js`, not in `buildNotebookContext()`, not in the Worker.
The mirror auto-updates weekly by committing directly to master, so a malicious
or compromised notebook section could plausibly carry text that reads as
instructions and redirect the assistant's behaviour or its citations. Severity
is genuinely low today: the source repo is the owner's own private Notebook-X,
the sync token is read-only, and the Worker exposes no dangerous tools — the
worst realistic outcome is a wrong or attacker-chosen answer, not an action.
Worth revisiting only if the Worker ever gains tools with side effects, or if
notebook content ever comes from a third party. Cheap hardening if wanted:
wrap the block in explicit delimiters and state that its content is reference
data, never instructions.

### SEC-05 — repo settings pass (read-only) — **INFORMATIONAL**

- **Secret scanning: enabled. Push protection: enabled.** Good — this is the
  control that would have blocked an accidental key commit. (`validity_checks`
  and `non_provider_patterns` are off; `dependabot_security_updates` off, which
  is moot with zero dependencies.)
- **Actions are pinned to floating major tags**, not SHAs: `actions/checkout@v4`,
  `actions/setup-node@v4`, `actions/github-script@v7`. `sha_pinning_required`
  is `false` at the repo level. These are first-party GitHub actions, so the
  supply-chain risk is low, but a compromised tag would execute in a workflow
  that has `issues: write` (and `contents: write` on changelog/notebook-sync).
  SHA pinning is the standard hardening if the owner wants it.
- **Repo secrets**: see SEC-01. Only `NOTEBOOKX_READ_TOKEN` has a purpose
  (read-only fine-grained PAT for the weekly notebook mirror); the other three
  are orphaned.

### Verified clean

- **No `sk-ant-` key material anywhere.** Current tree: the only matches are a
  detector regex in `spec-drift-check.js`, a deliberately fake self-test string,
  a fake test key in the untracked `audits/` folder, and prior audit write-ups.
  History: `git log --all -S'sk-ant'` returns exactly one commit — `0d98ed8`,
  which *added the detector*. Confirms the earlier audits' "zero hits".
- **`.env.cloudflare` holds only `CLOUDFLARE_API_TOKEN=paste-token-here`** — a
  placeholder, not a real token, and not even the Anthropic key. Untracked and
  gitignored via `.env.*`.
- **The key cannot reach a response.** Read `worker.js` end-to-end for this
  specifically. `env.ANTHROPIC_API_KEY` is referenced exactly once, in the
  `x-api-key` request header to `api.anthropic.com`. Error paths checked
  individually: the `fetch` catch returns `err.message` (a Worker-side network
  error, never carries request headers); the `!ok` branch echoes
  `errBody.error.message` from Anthropic's response body, which does not contain
  the key, and 401 is replaced with the fixed string `'API key issue'` before
  reaching the client; `console.log` emits metadata only (salted SHA-256 IP
  digest, mode, language, counts) and no request headers or body content; CORS
  headers are a fixed set. There is no debug flag, no header pass-through, and
  no path that serializes `env`.

### Follow-up 2026-08-01 (read-only session) — LOG_SALT provenance, Turnstile scoping, SEC-02 verdict

Three owner questions answered from `worker.js` + git history. No code changed,
nothing pushed.

#### F-01 — `LOG_SALT`: what it is, and where it came from

**Confirmed as privacy-hashing for logs — but *only* logs, not rate limiting.**
The half of the owner's expectation that mentions rate-limiting is incorrect.

`LOG_SALT` is read in exactly one place: `worker.js` `hashIp(ip, env.LOG_SALT)`,
called once, to compute the `ip_hash` field of the `claude_api_call` log line.
`hashIp()` builds `SHA-256("<salt>:<ip>")` and keeps the first 6 bytes (12 hex
chars). The rate limiter never sees it — `isRateLimited(ip)` and the
`ipRequests` Map key on the **raw** `CF-Connecting-IP`, and the daily counter
keys on the date string. Nothing else in the file references the secret.

**If it were deleted: nothing breaks.** `hashIp()` falls back to the literal
default `'data-center'` (`${salt || 'data-center'}:${ip}`), so logging, rate
limiting, and the API call all continue unchanged. The only loss is
anonymisation strength: with a known constant salt, the IPv4 space (2^32) is
small enough to precompute and reverse the digest, which is exactly what the
salt exists to prevent. Historical `ip_hash` values also stop matching new ones
whenever the salt changes — cosmetic, since nothing correlates them across time.

**Origin — commit `47423a4`, 2026-07-27, "fix(worker): bound request cost and
add real input validation"** (the only commit in the repo that touches
`LOG_SALT` or `hashIp`; `git log --all -S` on both returns that one commit). It
replaced `ip_hash: btoa(ip).slice(0, 8)` from commit `39e70f7` (the usage-logging
commit) — Base64 is reversible with `atob()`, so a field named `ip_hash` was
providing no anonymisation at all.

The secret itself was set by the owner, not by any automation: the untracked
`audits/audit_26072026/` write-up that produced the `47423a4` patch ends with a
manual-step list containing `wrangler secret put LOG_SALT`, flagged there as
"recommended, optional" — and it explicitly notes that a secrets-adjacent
`worker.js` change is exactly the kind the unattended Auditor must refuse to
merge, so it had to be applied by hand. Same document explains the changed-salt
caveat above. Nothing mysterious: it is a self-inflicted, correct hardening step
from six days ago.

#### F-02 — Turnstile: what enabling it would actually take (scoping only, backlog)

Confirmed dormant — the owner verified `LOG_SALT` is the only Worker secret
besides the API key, and `verifyTurnstile()` returns `null` immediately when
`env.TURNSTILE_SECRET` is unset, so today it is a no-op. The **Worker side needs
no code change**: `verifyTurnstile()` is complete, fails closed on network
error, and is already wired in ahead of the daily counter. Everything left is
config plus frontend work.

End-to-end, enabling it means: (1) create a Turnstile widget in the Cloudflare
dashboard (Managed mode) and list **every** origin in `ALLOWED_ORIGINS`, not just
`avivnofar.github.io` — `localhost` and `127.0.0.1` too, or local development
breaks the moment the secret exists, because the check fails closed for
everyone; (2) `wrangler secret put TURNSTILE_SECRET` — this is the switch, and
it is instant and global, so it should be flipped only once the deployed
frontend already sends tokens; (3) `index.html` changes, which are the real
work: add the external `challenges.cloudflare.com/turnstile/v0/api.js` script
tag, a widget container, render the widget, and add `turnstile_token` to the
`sendAiMessage()` request body. The non-obvious part is that a Turnstile token
is **single-use and expires after ~300s**, while a chat session fires many
requests — so this is not "solve once at page load"; it needs an
execute/reset-per-request flow (invisible/pre-clearance widget) with the send
path awaiting a fresh token before each POST. (4) Client-side handling of the
new failure mode: the Worker answers `403 {error:'auth'}`, which the current
error path renders as a generic failure — it needs a bilingual "verification
failed, retry" state. (5) Docs: `worker.js` tells the reader to "See
`cloudflare-worker/README.md` for the two-step enablement" and **that section
does not exist** — the README has no Turnstile or `LOG_SALT` content at all
(dangling reference, worth fixing whenever this is picked up); `CURRENT-SPEC.md`
would also need the request-body field documented.

Two things to weigh before scheduling it. It introduces the project's first
runtime dependency on an external script in the critical request path, against
CLAUDE.md's zero-dependency stance — and because the gate fails closed, anything
that blocks that script (an ad blocker, a strict extension, a Cloudflare
hiccup) breaks AI Search entirely rather than degrading. For a fire-and-forget
personal site, that failure mode is more likely to bite the owner than the abuse
it prevents. It is genuinely the correct answer to "the Origin header is not
authentication" — it is just not obviously worth it at this traffic level.

#### F-03 — SEC-02 verdict: acceptable as-is; one optional one-line change

**Recommendation: leave the Worker alone. No Durable Object, no KV, no Turnstile
for now.** The honest risk picture: the endpoint is discoverable (the URL is
hardcoded in a public `index.html`), and a forged `Origin` header defeats the
allowlist in one `curl` flag — but a missing `Origin` is rejected, which
eliminates the broad automated scanning that finds open LLM proxies, and what
remains is someone who deliberately reads the site's JS to steal inference or
grief the owner. Against that single-source attacker the per-isolate cap is
roughly effective in practice, because one caller from one location reaches a
small number of colos and therefore a small number of counters; SEC-02's
`1500 × isolates` ceiling only fully materialises for a distributed, deliberate
campaign, which is a poor fit for a low-traffic personal knowledge base with no
payoff beyond wasted money. The input caps added in `47423a4` (6 MB body, 40
turns, 60k chars, 3 images, 20k each of `db_context`/`notebook_context`, 1536
output tokens, 3 web searches) are what actually bound the damage, and they are
solid. So: the current protection is acceptable, and the residual exposure is
"a bad week costs real money," not "a credential leaks."

What genuinely closes the remaining gap is **not a Worker change**: set a
monthly spend limit and a budget alert on the Anthropic key in the console.
That is fire-and-forget, bounds worst case absolutely regardless of how many
isolates exist, needs no redeploy, and is the single highest value-per-effort
item here. If a redeploy happens anyway for another reason, two cheap riders are
worth including: lower the daily cap from 1500 — personal usage is nowhere
near it, so cutting it to ~300 costs nothing real and reduces the worst case
about fivefold — and rename it to `DAILY_MAX_PER_ISOLATE` with a corrected
comment, which is SEC-02's documentation half and the part that stops the next
reader from trusting a cap that isn't one. Neither is urgent enough to justify a
deploy on its own.

**Both riders were applied 2026-08-01**, on exactly the occasion described here:
a redeploy that was happening anyway (the `web_search_20260209` tool upgrade).
The Anthropic-console spend limit above remains the open, higher-value item.

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
