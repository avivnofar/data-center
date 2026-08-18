# Data Center — Current Technical Specification

*Comprehensive feature audit 2026-07-19 (27 items, code-verified). Source
of truth for architecture and feature status. Rules and standards live in
`CLAUDE.md`; this file records what actually exists and works today.*

## Scope

General IT support knowledge base and AI assistant for IT professionals
(sysadmins, DevOps, helpdesk, students), bilingual Hebrew/English with
Hebrew-first RTL. Expanding toward cybersecurity content (a `security`
module is registered `coming-soon`). Vendor PBX modules (1COM, MirtaPBX)
remain as ordinary specialty content modules — the project is not scoped
to any one company. AI backend model: **`claude-sonnet-5`**.

## Architecture

- **Frontend**: `index.html` (~3,440 lines) — entire app in one file, no
  build step, no dependencies. Tabs are data-driven from
  `data/modules.json`; `init()` loads all data files via
  `Promise.all(fetch(...))`. Navigation is a fixed, collapsible 200px
  left sidebar (`#tab-nav`); AI Search is the default tab and the chat
  fills the main content area.
- **AI backend**: `cloudflare-worker/worker.js` (~500 lines) — the
  `data-center-api` Cloudflare Worker, a secure proxy holding the
  Anthropic API key as a Worker secret. Streams SSE responses
  (`streamAnthropicResponse()` re-streams Anthropic deltas), enforces an
  origin allowlist and 20 req/min/IP rate limit.
- **AI Search flow**: the app builds a small `db_context` from locally
  matched knowledge-base entries, plus a `notebook_context` from the
  Notebook-X mirror (see next bullet), and sends
  `{messages, mode, language, db_context, notebook_context, cli_mode, images,
  allow_web_search}` to `/api/chat`; the Worker assembles a bilingual system
  prompt (appending both context strings, `notebook_context` capped
  server-side at 20 KB) and calls Claude, attaching the `web_search` tool
  (`max_uses: 2`) **only when `allow_web_search` is true** — see
  "Conditional web search" below.
  `buildDbContext()` tokenizes the query with the same stopword list +
  3-char minimum `matchNotebooks()` uses (2026-08-18 fix — previously an
  unfiltered `split(/\s+/)`, so short common words like "a"/"is" scored
  nearly every DB entry and produced 100%-irrelevant matches on
  plain-English queries; see `.github/scripts/test-builddbcontext.js`), and
  since the same day matches on **word boundaries over a bilingual
  haystack** rather than `haystack.includes()` — see "Hebrew query
  matching" below.
- **Request history cap (2026-08-18)** — `trimMessagesForRequest()` bounds how
  many prior turns go into the `/api/chat` **request body**. It trims the
  payload only: the chat area still renders the whole thread, `dc-sessions`
  still stores it, and the sidebar still restores it. Display and payload are
  separate; conflating them would be data loss and this is not that.
  The reason to cap is that the conversation is stateless server-side, so
  prior turns are re-sent as *uncached* input on every request — they land
  after the cached prefix and are billed in full each time (11,431 uncached
  input tokens measured on one question over a 26-message thread).
  - **`search` — 6 user turns** (the current question plus the 5 before it).
    Free Search questions are largely self-contained, and `db_context` /
    `notebook_context` are rebuilt from the *current* query on every request,
    so grounding does not depend on old turns.
  - **`diagnose` — 40 user turns**, i.e. no cap at real usage; it is a runaway
    guard, not a working limit (the guided flow is ~5 steps). The diagnostic
    thread IS the product: the model needs the symptom from turn one and every
    command output pasted since, so trimming here would break the feature
    rather than save money. The asymmetry is deliberate.
  - **CLI Mode gets no cap of its own, by design.** It does reach the Worker,
    but only for input CommandFlow did not recognise (recognised commands
    render client-side and `sendAiMessage()` returns before any fetch), and
    those requests go out as backend mode `search` — modes are a strict radio
    and `getAiBackendMode()` only ever returns `'search'` or `'diagnose'`. So
    CLI inherits the search cap by construction.
  - **Never cuts mid-exchange**: the cut lands on a user message, so the
    payload always begins with a `user` role and never carries an assistant
    turn whose question was trimmed away. Pinned by
    `.github/scripts/test-requesthistory.js`, which sweeps every thread length
    0–30 in both modes for that invariant rather than spot-checking, and by
    the `request-history-capped` drift claim — which asserts the cap is
    *applied at the call site*, not merely defined.
- **Prompt caching (active since 2026-08-04)**: `systemBlocks()` returns the
  system prompt as an *array* of content blocks ordered static → dynamic,
  because Anthropic's cache is a prefix match. Two `cache_control: ephemeral`
  breakpoints: one after the universal base prompt (~1.9k tokens, static per
  language), one after the mode/CLI/CAPABILITIES section. `db_context` and
  `notebook_context` are the last block and are deliberately **not** cached —
  they change every request, so anything cached after them would be
  invalidated every time. The `tools` array renders before `system`, so it is
  covered by the first breakpoint for free — which is also why conditional web
  search (above) forks the cached prefix into **two shapes**, with-tools and
  without-tools, i.e. two cache entries rather than one. That is the accepted
  cost of not paying for the tool definition on requests that will never
  search; the entries do not compete, each is read by the requests that share
  its shape. Whether it is actually engaging is
  observable, not assumed: `cache_creation_input_tokens` /
  `cache_read_input_tokens` on the `claude_api_usage` log line (see
  `cloudflare-worker/README.md`). Both zero across repeated identical-prefix
  requests means a silent invalidator crept in.
- **Conditional web search (2026-08-18)**: the client decides per request
  whether Anthropic's server-side `web_search` tool is worth offering and sends
  the decision as `allow_web_search`; the Worker omits the tool from the
  request entirely when false. This removes two costs at once — the $10/1,000
  per-search charge, and the tool definition's contribution to the cached
  prefix (~7,257 of the measured 9,812 tokens), which was previously billed on
  every request including ones that never searched. The rule
  (`shouldAllowWebSearch()` in `index.html`) is two OR'd signals: local
  context under `SEARCH_THIN_CONTEXT_CHARS` (300 — the size of a lone
  `db_context` entry; `notebook_context`, when it attaches, is 792–14,737
  chars and always clears it), or a recency keyword in the query
  (latest/newest/current/version/CVE/release/changelog/still/2026 and Hebrew
  equivalents, matched on the raw query in **both** languages since Hebrew
  questions routinely carry English technical terms). `LANG` is not consulted:
  it sets the response language only. The rule applies identically in both
  languages: the Hebrew carve-out that used to sit in `shouldAllowWebSearch()`
  — skip the thin-context signal when the query yields zero tokens — was
  **removed 2026-08-18** once the matchers learned Hebrew, because zero
  context in Hebrew now means "nothing matched", not "the matcher could not
  look". The 300-char threshold was re-checked against the post-fix Hebrew
  measurements and kept: covered Hebrew questions measure 366-414 chars,
  uncovered ones 0-240, so the threshold sits inside the gap that separates
  them. The Worker fails closed: anything other than
  a literal `true` means no tool, so an older cached client gets the cheap
  path. When the tool is absent the system prompt says so explicitly and
  forbids claiming a search happened (see `systemBlocks()`). Pinned by
  `.github/scripts/test-searchdecision.js` (23 query cases against the real
  `data/` files, English and Hebrew).
- **Notebook-X integration (repo mirror, decided + implemented 2026-07-21)**:
  `.github/workflows/notebook-sync.yml` mirrors the Notebook-X public index
  + all 12 notebooks verbatim into `data/notebooks/` weekly (read-only
  fine-grained PAT, `NOTEBOOKX_READ_TOKEN` secret). `index.html` loads the
  mirrored index into `DB.notebookIndex` at `init()`; `matchNotebooks()`
  scores it against the user's query (word-boundary matching + stopword
  filter, min relevance threshold — no match beats a wrong match) and
  `buildNotebookContext()` fetches up to 2 matched notebooks, selects only
  sections matching a majority of the query's significant words (2026-08-18
  fix — previously any single shared token qualified a section, so
  topically-adjacent notebooks with generic word overlap — e.g. a VPN query
  pulling in an unrelated remote-desktop-tools notebook via "remote"/
  "access" — over-attached; see `.github/scripts/test-notebookcontext.js`),
  and caps content at ~15 KB, truncating at section boundaries. The Worker
  is a dumb proxy for this — no fetching, no KV, no
  GitHub credentials on the Worker side.
  - **Per-notebook retrieval gate (2026-08-18)**. `NOTEBOOKS_ENABLED` in
    `index.html` lists the notebooks that may attach to a request;
    `matchNotebooks()` filters against it *before* scoring, so a disabled
    notebook never wins a slot off an enabled one. Enabled: **`kb-vpn`,
    `kb-firewall`, `kb-cybersecurity`, `kb-cloud-devops`** — the other eight
    are disabled. The reasoning is the desk-check 2×2, not a sample size:
    content that is public *and* stable is redundant by construction because
    the model already holds it, and content that is public *and* fast-moving
    is worse than redundant once it goes stale, since it reaches the model as
    reference material with authority attached. Two notebooks labelled
    private were measured to hold nothing private. The full measurement —
    per-question costs, answers and the desk-check table — lives in
    `audits/NOTEBOOK-VALUE-TEST.md`, which is **local and gitignored**
    (`.gitignore`: `audits/`) and is deliberately not reproduced here.
    **This gates retrieval, not the mirror**: `notebook-sync.yml` keeps
    syncing all 12 notebooks into `data/notebooks/` and nothing should be
    deleted to match the enabled list. Measured offline across a 16-query
    spread (the five from the value test plus realistic English and Hebrew
    questions): mean attached context **4,533 → 1,385 chars**, and 9 of 16
    queries attached something before versus 3 of 16 after. No query dropped
    below `SEARCH_THIN_CONTEXT_CHARS` as a result, so nothing flipped onto
    the paid `web_search` path — checked explicitly, since that would have
    turned a token saving into a $0.01-per-question charge. The set is pinned
    by `.github/scripts/test-notebookcontext.js`, which fails if it changes.
  - **Freshness dates travel with the content (2026-08-18)**. Every emitted
    heading carries the date the material was last revised at the source:
    `### Name (domain) [updated YYYY-MM-DD, web-verified YYYY-MM-DD]` per
    notebook (`lastWebVerified` only when present and different — 4 of 12
    notebooks have it), `#### Title [YYYY-MM-DD]` per section from
    `lastUpdated` (present on 130/130 sections today; the notebook-level date
    is the fallback). Dates are read from the **notebook file, never from
    `_index-public.json`** — the index lags, dating `kb-firewall` 2026-07-17
    where the file says 2026-08-17. Cost, measured across the five queries in
    `audits/NOTEBOOK-VALUE-TEST.md`: **+852 chars over 34,442, +2.47%** (dates
    +34 to +132 per request; the reworded header accounts for a further +91,
    once per request). Pinned by
    `.github/scripts/test-notebookdates.js` and the `notebook-context-dated`
    drift claim, which asserts the suffix is *emitted*, not merely defined.
  - **The header no longer claims "may be up to a week old"** (both the client
    header and the Worker's wrapper). That figure came from the weekly sync
    cadence, which bounds the age of the *copy*, not of the *content* — real
    section dates in the mirror run back to 2026-06-30, a 7-week spread. It
    was an unearned freshness guarantee handed to the model; the dates replace
    it with the actual quantity. Supersedes the old
  `getNotebookXContext()` (confirmed silent no-op — unauthenticated fetch
  against the private repo always 404ed; deleted, not fixed).
- **Hebrew query matching (2026-08-18)**: Hebrew is the app's default
  language, and until this date a query written in it reached **nothing**.
  `notebookQueryTokens()` stripped every character outside `[a-z0-9_-]`, so a
  Hebrew query tokenized to `[]`, and both `buildDbContext()` and
  `matchNotebooks()` return early at their `!words.length` guard — measured
  at 0 chars of `db_context` and 0 of `notebook_context` across a set of
  realistic Hebrew questions. Partly a regression: before `455a2e3`
  `buildDbContext()` split on whitespace with no character filter, so Hebrew
  tokens survived and matched the Hebrew keywords `data/*.json` carries
  inside `tags` (that path was narrow — tags only — and noisy: the 2-letter
  "מה" substring-matched inside "חסימה"). The notebook mirror was never
  reachable in Hebrew; its tokenizer has been ASCII-only since `a745a75`
  introduced it. The fix, entirely client-side:
  - **Unicode-aware tokenizer** — `[^\p{L}\p{N}_-]`, keeping letters/digits in
    any script. `NOTEBOOK_STOPWORDS_HE` sits alongside the English set.
  - **One matcher, word-boundary, in both functions** — `buildDbContext()`
    now calls `notebookWordMatch()` instead of `haystack.includes()`. `\b` is
    useless for Hebrew (it keys off `[A-Za-z0-9_]` and never fires between two
    Hebrew letters), so a Hebrew token matches on a **Hebrew-letter boundary**
    with the one-letter particles ו/ה/ב/ל/מ/כ/ש allowed on either side —
    "ברשת" and "רשת" are the same content word, while "רשת" correctly does
    *not* match inside "הדורשת" and "שירות" not inside "ישירות".
  - **Bilingual haystack, no translation layer** — `buildDbContext()` searches
    `desc_he`/`scenarios_he` alongside the English fields. Hebrew and Latin
    script don't overlap, so one combined haystack is enough: Hebrew tokens
    can only hit Hebrew text, Latin tokens only English text.
    `tokensUsableAgainst()` computes the section-majority threshold over the
    tokens that can actually match a given haystack, so a mixed query like
    "שירות systemd לא עולה" isn't sunk by Hebrew tokens that could never match
    English prose.

  **Documented limits**, all deliberate:
  - **Suffixes are not stemmed.** Hebrew plural "פורטים" does not reach the
    singular "פורט", nor construct "בדיקת" the base "בדיקה". A plural/construct
    variant was trialled against the real data and measurably *worsened*
    ranking (it pushed `nmap` out of the top 3 for "איך בודקים פורטים פתוחים"
    in favour of `ping`/`strace`), so it was rejected on evidence rather than
    left undone.
  - **Prefix stripping is ambiguous in principle** — "בדיקה" is one word, not
    ב+דיקה — which is why the original form is always tried and the stripped
    form only added as an extra alternative. One measured consequence in the
    current data: a query for "פורט" (port) also matches "מפורט" ("detailed"),
    in one entry.
  - **The notebook mirror is unreachable from pure Hebrew.** It is Notebook-X's
    content mirrored verbatim and is English prose — 0 Hebrew characters across
    all 12 notebooks and the index. A Hebrew query reaches it only through the
    Latin tokens it carries (product names, commands, flags — which Hebrew
    speakers type in English anyway); with no Latin token it attaches nothing.
    Closing that needs translation, which was explicitly out of scope.
    `.github/scripts/test-notebookcontext.js` re-checks the English-only
    assumption on every run and prints a notice if the mirror ever gains
    Hebrew.
  - `quick_flags` are not in `buildDbContext()`'s haystack, and 2-character
    tokens are filtered, so "מה עושה הדגל -n" attaches nothing and falls to
    the thin-context branch. Untouched here; noted so it isn't rediscovered
    as a surprise.
- **Conversation lifecycle (2026-08-18)** — a page load opens a **fresh, empty
  conversation**. Until this date `loadAiIntoPanel()` restored the most recent
  session, so a single thread accumulated across visits with no reset, and
  every turn re-sent the whole accumulated history as uncached input: the
  conditional-search session the same day found its first cost measurement
  polluted by a 26-message, ~20 KB thread from 29 days earlier carrying 11,431
  uncached input tokens. A long thread was also observed degrading answer
  formatting (one run-on paragraph, ``` fences rendered as literal text) where
  a short thread rendered correctly.
  - **Nothing is deleted and nothing becomes unreachable.** The sessions
    sidebar still lists every past conversation and `switchSession()` still
    restores any of them in full — messages, mode and language. Only the
    *default* open conversation changed. Pinned by
    `.github/scripts/test-sessionlifecycle.js`.
  - **Creation is lazy, and that is the load-bearing part.** No record is
    written on page load or on "+ New"; `loadAiIntoPanel()` and
    `startNewAiSession()` only drop the `dc-current-session` pointer, and
    `ensureCurrentSession()` (called from `addMessageToSession()`) creates the
    record on the first message actually sent. Eager creation would have been
    the obvious implementation and would have silently destroyed history:
    `createNewSession()` unshifts then slices to `CONFIG.MAX_HISTORY_SESSIONS`
    (50), evicting from the oldest end, so one empty record per page load
    pushes 50 visits' worth of real conversations off the tail. The test
    asserts 50 consecutive loads write nothing and evict nothing, and
    separately re-asserts that the cap does still evict — so the rationale
    cannot quietly become folklore.
  - **`pruneEmptySessions()`** runs once per load and drops zero-message
    records — the shells the old eager path left behind, which still counted
    against the cap. Sessions with any message are never touched.
- **Gap log (2026-08-18)** — when a query produces **zero `db_context` and
  zero `notebook_context`**, neither the command DB nor the notebook mirror
  covered it, and that is the most direct signal available of what this
  knowledge base is missing. `recordGap()` appends
  `{query, lang, mode, ts}` to `localStorage` key **`dc-gaps`**, capped at
  **200 entries, oldest evicted first**. `mode` is the *user-facing* mode
  (`search`/`diagnose`/`cli`), not `getAiBackendMode()`'s collapsed value, so
  a gap reached through CLI Mode's fall-through stays distinguishable.
  - **Deliberately no UI.** This is diagnostic plumbing, not a feature. The
    entire read/export/clear surface is one console-callable function:

    | Call | Does |
    |---|---|
    | `dcGaps()` | returns the entries, oldest first |
    | `dcGaps('json')` | the same array as a JSON string, ready to paste |
    | `dcGaps('clear')` | empties the log, returns how many were removed |

  - **Plain JSON, no derived fields** — no scores, no token counts, no
    normalised query, no counters. The intended consumer is Notebook-X's own
    gap list, which is maintained by hand today; automation there is an open
    owner decision. Deriving anything now would be guessing at a consumer that
    does not exist, so the log stays trivially exportable and lets whatever
    reads it derive its own.
  - **Fails silently by design** — `localStorage` throws in private mode and
    on quota, and a diagnostic log must never break sending a message. A
    corrupt or non-array stored value reads as an empty log rather than
    throwing. Pinned by `.github/scripts/test-gaplog.js` and the
    `gap-log-recorded` drift claim, which asserts the guarded call exists at
    the call site — a log that is defined but never written would otherwise
    pass every identifier check.
- **Three AI modes** — strict radio, exactly one active
  (`AI_MODE_VALUES = ['search', 'diagnose', 'cli']`, stored in
  `localStorage` `dc-modes`): Free Search, Solve a Case, CLI Mode.
- **CLI Mode / CommandFlow**: `tools/commandflow/` — standalone "Terminal
  Academy" simulator (registered in `data/tools.json`, linked from the
  topbar) whose engine (`commandflow-core.js` + `commands.json`, 7
  platforms) also powers in-app CLI Mode at zero API cost, with
  fall-through to Claude for unmatched input.
- **Workflows tab**: self-hosted (2026-07-20) — renders bilingual workflow
  markdown from this repo's own `workflows/` folder, registered in
  `data/workflows.json` (loaded into `DB.workflows`, same pattern as
  `data/modules.json`). No external repo dependency. The print-based PDF
  export that used to sit on this view was **removed 2026-08-18** — see
  feature #21 under Removed. `data-center-archive` (the former source) was
  retired — it was never actually pushed to GitHub, only a local scratch
  folder.
- **Zero office-simulation coupling** since 2026-07-19 — the former
  Office/Admin UI was fully removed.

> **A note on references in this document.** Claims here point at *symbol
> names* (`copyUsageCmd()`, `parseSuggestionBlocks()`), never at line numbers.
> Line numbers were removed on 2026-07-26 because they had already rotted —
> `index.html:1480` and `index.html:2963` were both off by well over a hundred
> lines, silently, since any edit above them shifts every reference below. A
> reference that quietly becomes wrong is the exact failure mode this document
> is supposed to prevent. Symbol names survive edits and are greppable.
>
> The mechanically checkable claims below are verified on every push by
> `.github/scripts/spec-drift-check.js`. That script's registry and this file
> must be updated together.

## Verified Feature Status (comprehensive audit, 2026-07-19)

All 27 ever-requested features were checked against the actual code.
"Code-verified" means the full request/response path was read; no live
paid API calls were made.

### ✅ Fully Working (19)

| # | Feature | Evidence |
|---|---|---|
| 1 | Claude streaming AI search | `worker.js`: `stream: true`, `streamAnthropicResponse()` re-streams SSE as `{"delta"}` events; client renders via the streaming bubble path. |
| 2 | Three mutually exclusive AI modes | `AI_MODE_VALUES`; `setAiMode()` sets `AI_MODES = [mode]`; `loadAiModes()` sanitizes stored state to one valid mode. |
| 3 | Solve a Case guided controls | `#diagnose-controls`: platform/severity chips (`selectDiagnoseChip()` → `DIAGNOSE_PLATFORM/SEVERITY`) + 5 action buttons wired to `diagnoseAction()` — `start` prefills the input with chip context; next/resolved/escalate/guide call `sendAiMessage()`. |
| 4 | CLI Mode terminal-in-chat | `tryRunCliCommand()` → `CommandFlow.loadDb()/run()`; `clear`/`cls` handled; unmatched input falls through to Claude. |
| 5 | Image paste + upload + vision | Attach button `#ai-attach-btn` and document-level paste handler → `handleImageAttachment()` → `pendingImages` (base64, previews, removable) → `images` in the request body; Worker injects `type:'image'` blocks (max 3). |
| 6 | Web search tool for Claude | `worker.js`: `tools: [{type:'web_search_20260209', name:'web_search', max_uses:1}]` — yes, actually added, but **attached conditionally** since 2026-08-18 (only when the client sends `allow_web_search: true`; see "Conditional web search" above), and the system prompt's CAPABILITIES section is conditional with it so Claude cannot claim a search it had no tool for. `max_uses` **stays at 2**: lowering it to 1 was tried on 2026-08-18 and reverted the same session on live evidence — see "max_uses: 1 was tried and reverted" in Recently Completed. Earlier: `max_uses` lowered 3 → 2 on 2026-08-04: web search bills $10/1,000 searches on top of tokens, making it the largest per-request cost multiplier a caller controls. Upgraded from `web_search_20250305` on 2026-08-01 for **dynamic filtering** (Claude filters results via code execution before they reach the context window, reducing input tokens on search-heavy answers). `allowed_callers` is left at its `_20260209` default of `["code_execution_20260120"]`; `code_execution` is deliberately *not* declared separately. A newer `web_search_20260318` exists, adding only `response_inclusion` (an output-token optimisation for agents that don't echo search content back) — not adopted, since this app streams answers to a browser. |
| 11 | Hebrew default + English toggle | `LANG = localStorage.getItem('dc-lang') \|\| 'he'`; `applyLang()` flips `document.documentElement.dir` and re-renders. |
| 12 | RTL/LTR mixed rendering | `wrapLtrTerms()` intact after the Office-UI removal; applied in `renderMarkdown()` outside code spans; all modes render through it. Since 2026-08-18 the **guides** view additionally opts into `renderMarkdown(md, { allowInlineHtml: true })`, which honours the CLAUDE.md rule-6 inline allowlist (`span.ltr-term`, `b`, `code`) authored in `workflows/*.md` instead of escaping it into visible text; escaping is **not** loosened anywhere else and the AI chat path is unchanged. Pinned by `.github/scripts/test-guidemarkdown.js`. |
| 13 | Collapsible left sidebar nav | `#tab-nav` fixed left column (200px, index.html); `toggleSidebarCollapse()` + persisted collapsed state + mobile off-canvas mode. |
| 14 | Chat as dominant UI | `init()` ends with `switchTab('ai')` — AI Search is the default tab; the chat panel fills the entire main content area beside the 200px sidebar. |
| 15 | Hover tooltips on commands | `showTooltip()` — 200ms delay, viewport-aware positioning, flag list from `data-flags`, keyboard focus support. |
| 17 | Mobile responsiveness | ≤768px: 44px touch targets (`.tab-btn/.filter-btn/.faq-pill`, `.copy-btn`), 16px inputs (iOS zoom fix), off-canvas sidebars; ≤480px adjustments. |
| 18 | FAQ pills row | `FAQ_PILLS` (7 per language) rendered into `#faq-pills`; `useFaqPill()` fills the input; auto-hidden once a conversation is active. |
| 19 | Session history sidebar | `dc-sessions` in localStorage (max 50), `renderSessionList()`, `switchSession()`, per-session mode/language, auto-summary from first user message. Since 2026-08-18 a page load opens a fresh empty conversation instead of restoring the last one, and records are created lazily on first message (`ensureCurrentSession()`, `pruneEmptySessions()`) — the sidebar remains the full, unchanged path back to every past conversation. See "Conversation lifecycle" above. |
| 20 | Bookmark system | Save/Dismiss genuinely persist (`dc-bookmarks` with `dateAdded`, `dc-dismissed-bookmarks`; saved state survives re-renders). Full browse/remove UI added: `#bookmarks-btn` topbar button → `openBookmarksPanel()` opens `#bookmarks-modal` (`renderBookmarksList()`, index.html), listing domain + date per saved URL with a per-row Remove button (`removeBookmark()`) and a bilingual empty state; Escape/click-outside/close-button all dismiss, focus is managed. No new localStorage keys; client-side only, no tokens. |
| 24 | Core knowledge modules | linux 42, cmd 25, network 30, troubleshoot 23 entries; schema + Hebrew-QA validators pass. |
| 25 | 1COM + MirtaPBX modules | Present and active (17 + 11 entries), rendered as normal tabs. Now specialty/vendor content within general-IT scope, not the defining boundary. |
| 26 | CommandFlow integration | Re-verified post-cleanup: `<script src="tools/commandflow/commandflow-core.js">`, `data/tools.json` registry, topbar link, CLI Mode path all intact. |
| 27 | Data validation scripts | `validate-json.js` (schema, bilingual pairs, approved/blocked domain enforcement) + `health-check.js` (Hebrew QA) — both pass as of this audit. |

### 🔶 Partially Built / Needs Finishing (5)

| # | Feature | What exists | What's missing |
|---|---|---|---|
| 7 | Self-education (LEARNED_SOURCE) | Worker system prompt (worker.js) instructs Claude to append a plain-text `LEARNED_SOURCE: {...}` line after `---` for good web-search sources, restricted to approved domains. **Client-side parsing now exists** (TODO-001, merge `d37943d`, 2026-07-24): `parseSuggestionBlocks()` strips the block out of the rendered body and `renderSuggestionCards()` renders it as a dismissible card with a "File this" action. | The "File this" action only copies the JSON to the clipboard — no GitHub Issue is created and nothing is written to `flagged/pending-review.md`. The filing half remains blocked on the GitHub write-credential decision in `NEEDS_YOUR_REVIEW.md`. |
| 8 | Very-high source scrutiny | Approved/blocked domain allowlists enforced in code (`validate-json.js:18-85`, runs in CI on every push); `flagged/` pending→approved/rejected files exist; worker prompt instructs verification caution. | The quarantine flow is a documented **manual process** — `flagged/pending-review.md` is an empty table, and nothing automatically routes AI-suggested URLs into it. |
| 9 | Auto-update KB via GitHub Issue | Prompt-side plus client-side rendering: `CAPABILITY_SUGGESTION` blocks are parsed and shown as cards (see #7). | No code path creates an Issue anywhere in this repo. Blocked on the same GitHub write-credential decision. |
| 10 | Self-extending capability | `CAPABILITY_SUGGESTION: {...}` block spec in the system prompt, now detected and surfaced in the UI (see #7). | No Issue filing, so a suggestion still requires the owner to act on it manually. Aspirational beyond surfacing. |
| 16 | Expandable cards + copy buttons | Expand/collapse fully works (`toggleCard()`, `aria-expanded`, keyboard support via `handleExpandKeydown`). Copy-to-clipboard now exists on both AI-chat code blocks (`copyAiCode()`) **and** command-card `usage-cmd` rows (`copyUsageCmd()`, index.html + 2684) — shipped by TODO-003, merge `b3451b1`, 2026-07-20. | Nothing outstanding — this row is retained for audit-trail continuity and should move to "Fully Working" at the next full re-audit. |

### 🗑 Removed (1)

| # | Feature | Why |
|---|---|---|
| 21 | PDF export (workflows) | Removed 2026-08-18. The "צור PDF" FAB opened print mode with nothing usable to print, and the earlier hypothesis — that the 2026-07-20 self-hosting refactor had dropped the `.print-target` marker — is **wrong**: `openWorkflow()` was applying it correctly to an element holding 6,248px of rendered guide content. The print CSS itself was broken in two independent ways, both measured in the live DOM before removal. **(1) Specificity**: `.print-target { background:#fff; color:#000 }` (0,1,0) lost to `#workflow-detail-content { background: var(--surface) }` (1,0,0), so the block kept its dark background, and `h3` / `code` kept their light accent colours from ID rules that also outranked it — browsers drop backgrounds when printing but keep text colour, so the page came out near-white on white. **(2) Geometry**: `position:absolute; inset:0` locks the box to its containing block's height — measured **799px against 6,248px of content** — so everything past the first page overflowed an out-of-flow box Chrome does not fragment across pages. Guides are deprioritised by owner decision, so this was removed rather than repaired; the FAB, its CSS, `generatePdf()`/`showPdfFab()`/`hidePdfFab()`, the `@media print` block and the `.print-target` marker are all gone, with a tombstone comment in `index.html` recording both defects for anyone who reinstates it. |

### ❌ Requested But Never Built (2)

| # | Feature | Evidence |
|---|---|---|
| 22 | Presentation/slide generation | Zero matches for presentation/slide/pptx/jsPDF repo-wide. Candidate for future work, not a phantom regression. |
| 23 | Workflow document *generation* | Definitive: workflow *viewing* works (fetch + render from this repo's own `workflows/` folder), but nothing generates workflow documents — they are authored manually. |

## File Structure (post-cleanup)

```
data-center/
├── index.html              # entire app (~3,440 lines)
├── data/
│   ├── modules.json        # 13 modules: 6 active, 7 coming-soon
│   ├── linux.json          # 42 entries
│   ├── cmd.json            # 25 entries
│   ├── network.json        # 30 entries
│   ├── 1com.json           # 17 entries
│   ├── mirtapbx.json       # 11 entries
│   ├── troubleshoot.json   # 23 scenarios
│   ├── tools.json          # 1 tool (CommandFlow)
│   ├── workflows.json      # 3 workflow guides (self-hosted, Workflows tab)
│   └── notebooks/          # Notebook-X mirror: index + 12 notebooks (weekly sync)
├── workflows/              # workflow markdown files (linux/, networking/)
├── tools/commandflow/      # standalone simulator + shared CLI engine
├── cloudflare-worker/      # worker.js, wrangler.toml, README.md (deploy guide)
├── flagged/                # source flagging system
├── .github/scripts/        # validate-json.js, health-check.js, check-links.js, sync-notebooks.js
├── .github/workflows/      # validate, health, link-check, monthly-review, notebook-sync, changelog
├── CLAUDE.md               # rules & standards
├── CURRENT-SPEC.md         # this file
├── TOKEN-BUDGET.md         # session history log
├── CHANGELOG.md            # auto-generated
└── README.md               # public landing page
```

Active modules: `linux`, `cmd`, `network`, `1com`, `mirtapbx`,
`troubleshoot`. Coming-soon: `powershell`, `cloud`, `security`, `docker`,
`cicd`, `casestudies`, `cli`.

## Data Schema

Full field-by-field schemas live in `CLAUDE.md` ("Bilingual Schema").
Summary: every entry is bilingual (`*_he` / `*_en` pairs that must
differ), commands/flags are Hebrew-free LTR, `source_url` must be on the
approved-domain allowlist and pass the `flagged/` review flow. New modules
are registered in `data/modules.json` (data-driven tabs — no code change
needed) and validated by `.github/scripts/validate-json.js`.

## Known Issues / Open Items

- **`&quot;` / `&amp;` render literally in Hebrew — root-caused 2026-08-18,
  NOT fixed.** `wrapLtrTerms()` runs after `escHtml()` and, in Hebrew only,
  wraps the entity *name* out of `&quot;` / `&amp;` / `&lt;` / `&gt;` in its
  own LTR-isolate span, separating the `&` from the rest so the browser can no
  longer decode it. Any plain `"` or `&` in a Hebrew answer or guide hits
  this; English is unaffected, which is why it looked intermittent. It is
  **not** un-decoded `web_search` content — that hypothesis is corrected in
  `automation/NEEDS_YOUR_REVIEW.md`. Left unfixed because `wrapLtrTerms()` is
  shared with the AI chat rendering path and the 2026-08-18 session was
  scoped to the guides renderer. Candidate fix and the test coverage it needs
  are recorded in `NEEDS_YOUR_REVIEW.md`.

- The partially-built AI self-improvement items (#7-#10 above) now share a
  narrower root gap: as of TODO-001 (2026-07-24) the suggestion blocks ARE
  parsed client-side and rendered as dismissible cards, so they no longer
  leak as plain text into answers. What is still missing is the filing half
  — nothing writes to `flagged/pending-review.md` or opens an Issue — which
  stays blocked on the GitHub write-credential decision in
  `automation/NEEDS_YOUR_REVIEW.md`.
- (Resolved 2026-07-20: command-card usage rows now have copy buttons —
  TODO-003. Saved-bookmarks browsing UI, formerly #20 here, also shipped —
  see Recently Completed.)
- No functional bugs currently flagged. (The 2026-07-19 audit's three
  open items — Office/Admin UI, `notebooks/`, `data/resources and
  links.txt` — were all removed per owner decision on the same date.)

## Recently Completed

- **Eight of twelve notebooks disabled for retrieval — 2026-08-18.** Acting on
  the value measurement below: `NOTEBOOKS_ENABLED` gates which mirrored
  notebooks may be attached to a request. Design, enabled set and the
  before/after numbers are under "Notebook-X integration" above. The mirror is
  untouched — all 12 notebooks keep syncing; only what gets paid for as
  context changed.

- **PDF export removed, and the standing diagnosis corrected — 2026-08-18.**
  The `.print-target` marker was never missing; the print CSS lost a
  specificity fight and locked itself to one page height. Both defects are
  recorded in feature #21 under Removed and in a tombstone comment in
  `index.html`.

- **Guides stopped showing their own markup as text — 2026-08-18.**
  `workflows/*.md` legitimately contains `<span class="ltr-term">` per
  CLAUDE.md rule 4, and `renderMarkdown()` escaped it, so the guide body
  rendered `&lt;span class=&quot;ltr-term&quot;&gt;` as visible text — in
  Hebrew, worse, because `wrapLtrTerms()` then split each escaped entity into
  its own LTR span. `renderMarkdown(text, { allowInlineHtml: true })`, opted
  into only by `openWorkflow()`, lifts the rule-6 inline allowlist out before
  `escHtml()` (into `String.fromCharCode(1)`-delimited sentinels, which none
  of `wrapLtrTerms()`'s patterns can match) and restores it last. Escaping is
  not loosened globally; the AI chat path is untouched. This **supersedes**
  the entry in `automation/NEEDS_YOUR_REVIEW.md` that blamed un-decoded
  entities in `web_search` content — corrected in place there.
  `.github/scripts/test-guidemarkdown.js` pins both halves: guide mode renders
  all 182 authored spans across the three guide files, and default mode still
  escapes everything.

- **Notebook value measured, and it mostly did not show — 2026-08-18.** A paid
  live A/B against the deployed Worker: 5 questions × 2 runs, identical
  question text and `db_context`, fresh conversation each time, the only
  variable being whether `notebook_context` was attached. `allow_web_search`
  was pinned to the same value on both arms (naturally `false` on all ten, so
  production behaviour was not overridden) and `web_search_requests = 0`
  everywhere, so no search charge confounds the result. Full answers, per-run
  costs and the per-question comparison table are in
  **`audits/NOTEBOOK-VALUE-TEST.md`** (gitignored, local only). Total spend
  **$0.136710**.

  | | Verdict |
  |---|---|
  | Linux | context NEUTRAL — the *no-context* answer contributed the OOM-killer check the with-context one omitted |
  | Networking | context DEGRADED (causation unsure, single pair) — the with-context answer was a strict coverage subset, losing Windows and MTU material |
  | VPN | context **ADDED** — FortiClient/Check Point specifics and the Phase 1→2→MTU→routing→capture ladder, both traceable to attached sections |
  | Cybersecurity | context NEUTRAL — real IR-discipline additions, matched by equally valuable additions on the no-context side |
  | 1COM/MirtaPBX | context NEUTRAL — **and this is the finding** |

  **The private-knowledge control is the result that matters.** 1COM/MirtaPBX
  was chosen to be the case notebooks should win most decisively, and it drew.
  Reading `kb-1com` explains why: across 12,157 attached chars there is no
  admin-portal URL, no FQDN or SRV convention, no device model number, no
  default port or credential convention, no customer dial plan — its "Cloud PBX
  Platform" section defines *extension*, *trunk* and *IVR* in generic terms any
  frontier model already holds. The notebook is labelled private; its content is
  not. Retrieval worked correctly and delivered material with nothing private in
  it. The no-context arm reproduced the same answer from general knowledge plus
  the word "1COM" in the question.

  **Cost.** +13,379 uncached input tokens across five questions, **+2,676 per
  question**, **+$0.005352 per question** — roughly doubling the cost of a warm,
  non-searching KB question. Small in absolute terms; the point is that on four
  of five questions it bought nothing measurable.

  **What the test does not establish.** One run per arm, English only, `search`
  mode only, no repeats — so run-to-run variance is unmeasured and the
  Networking verdict rests on a single pair. More importantly, **none of these
  five questions touched the stale quadrant** (`kb-ai-tools`, or the
  version-pinned sections of `kb-vpn`/`kb-firewall`/`kb-cybersecurity`). Zero
  staleness was observed because the test did not go near where staleness
  lives. The desk-check in the same document flags `kb-ai-tools` (32 days old,
  all 14 sections a point-in-time comparison of AI models and tools) and
  `kb-remote-access` (32 days) as the actively harmful cases; measuring them is
  future work.

- **Freshness dates on notebook context + a dating instruction in the prompt —
  2026-08-18.** Design and measured cost are under "Notebook-X integration" in
  Architecture above. `worker.js` gained a `DATING YOUR CLAIMS` paragraph in the
  **cached base block** (block 0, so it is paid for once per prefix, not per
  request) telling the model to hedge in a clause — not a disclaimer paragraph —
  when answering from dated reference material or from training knowledge in a
  fast-moving area, and explicitly *not* to hedge stable material like command
  syntax or RFC behaviour. This addresses the *harm* half of the stale quadrant;
  it does nothing about the redundancy half, since a fresh date on content the
  model already knows still buys nothing. New test:
  `.github/scripts/test-notebookdates.js`. New drift claim:
  `notebook-context-dated`.

  **Live-verified on production after deploy** (Worker version
  `9cdc463c`), two requests with `wrangler tail` open:

  | Probe | db / notebook | cache | cost | Result |
  |---|---|---|---|---|
  | Site-to-site vs remote-access VPN (stable material, dated 2026-07-04/08-10) | 565 / 9,230 | write 3,806 | $0.026471 | No hedge — correct, the instruction excludes stable material |
  | TeamViewer/AnyDesk/RustDesk (fast-moving material, dated 2026-07-17) | 440 / 9,742 | read 3,806 | $0.016447 | Hedged, in one clause: *"This reference material is dated 2026-07-17 in the source notebook — worth double-checking current pricing/tiers against each vendor's site before committing, since licensing terms shift."* |

  That is the intended behaviour on both sides: the model hedged old
  fast-moving content and did not hedge stable protocol material. Streaming is
  intact (20 and 18 delta events, `done: true`, `web_search_requests = 0`), and
  **prompt caching still engages** — the prefix re-formed at 3,806 tokens
  (3,628 before, so `DATING YOUR CLAIMS` costs 178 tokens in the cached block),
  written on the first request and read on the second.

  One unrelated observation, seen here and in several of the A/B runs: an
  English-language response can still emit its closing commands line in Hebrew
  ("פקודות רלוונטיות לבדיקה:"). It predates this change, appears on requests
  with and without notebook context, and is not caused by it — recorded so it
  is not rediscovered as a regression of this work.

- **Gap log — 2026-08-18.** Client-only; see "Gap log" in Architecture above for
  the storage shape and the console entry point. New test:
  `.github/scripts/test-gaplog.js`. New drift claim: `gap-log-recorded`.

- **Grok/xAI residue check — 2026-08-18, nothing found.** Working tree and full
  git history (`git log --all -S`) searched for `grok`, `xai`, `x.ai`,
  `GROK_API_KEY`, `XAI_API_KEY`: **zero hits**. The three commits `-S'xai'`
  reports are all `vertexaisearch.cloud.google.com` grounding URLs inside the
  Notebook-X mirror — Google Vertex AI Search, not xAI. (An unescaped `x.ai`
  pattern matches `verte**xais**earch`, which is what makes this look like a hit
  at first glance; recorded so the next person does not re-derive it.) Live
  secrets at the time of the check — GitHub Actions: `BRAIN_READ_TOKEN`,
  `NOTEBOOKX_READ_TOKEN`. Cloudflare Worker: `ANTHROPIC_API_KEY`, `LOG_SALT`.
  No second AI provider was ever configured. Nothing was deleted.

- **Fresh conversation on every page load — 2026-08-18.** Client-only change
  to `index.html`; the Worker was not touched. Design, rationale and the
  eviction hazard that shaped it are under "Conversation lifecycle" in
  Architecture above. New regression test:
  `.github/scripts/test-sessionlifecycle.js` (22 assertions across five
  groups). New `spec-drift-check.js` claim `fresh-conversation-per-load`,
  which asserts both halves — the fresh start *and* the absence of
  `createNewSession()` in `loadAiIntoPanel()` — because a check on the first
  half alone would go green on exactly the version that destroys history.

- **Hebrew knowledge-base matching fixed — 2026-08-18** (commits `ec03f58`,
  `3cd4bae`). The full design, rationale and limits are under "Hebrew query
  matching" in Architecture above. Headline measurements, taken against the
  real `data/*.json` and `data/notebooks/` mirror through the exact browser
  code path:

  | Hebrew query | db_context before | after | notebook_context |
  |---|---|---|---|
  | איך בודקים איזה פורט תפוס | 0 | 414 | 0 |
  | בעיות חיבור ברשת פרטית וירטואלית | 0 | 366 | 0 |
  | איך מגדירים חומת אש בלינוקס | 0 | 410 | 0 |
  | השרת שלי איטי מה כדאי לבדוק | 0 | 407 | 0 |
  | שירות systemd לא עולה (mixed) | 0 | 401 | 13,873 |
  | מה עושה הדגל -n | 0 | 0 | 0 |

  English queries were checked for regression at the same time and every
  difference was an improvement: "how do I check open ports with netstat"
  swapped `nmap` for `ss`, "listening on port 443" swapped `top/htop` for
  `lsof`, and "explain the CAP theorem" went from three unrelated entries to
  none. `cloudflare-worker/worker.js` was not touched — the whole fix is
  client-side, so no Worker deploy was needed.

  **Live-verified on production**, GitHub Pages client against the deployed
  Worker with `wrangler tail` open:

  | # | Query | db / notebook chars | searches | est_cost_usd |
  |---|---|---|---|---|
  | 1 | איך מאבחנים שירות systemd שלא עולה? (mixed) | 401 / 13,873 | 0 | $0.031366 |
  | 2 | איך בודקים איזה פורט תפוס בלינוקס? (pure Hebrew) | 414 / 0 | 0 | $0.007754 |
  | 3 | how do I check which port is in use on linux? (English control) | 363 / 14,547 | 0 | $0.015560 |
  | 4 | מה הגרסה היציבה האחרונה של nginx נכון להיום? (Hebrew recency) | 395 / 0 | 2 | $0.074026 |

  Query 2 is the one that matters: pre-fix it sent 0 chars of both contexts,
  and it now answers from the DB with `netstat`/`ss`/`lsof` and surfaces
  `netstat` / `netstat (Windows)` / `sip-registration-troubleshoot` as source
  chips. Query 3 confirms no English regression. Query 4 confirms the recency
  branch still fires in Hebrew.

  **One caveat on query 4, unrelated to this change.** Its first run reported
  `web_search_requests: 2` but the model answered that the search tool's usage
  limit was hit and fell back to stale training data (nginx 1.26.x) — the exact
  failure mode documented above for `max_uses: 1`, now observed once at
  `max_uses: 2`. An immediate English control ($0.045872) and an immediate
  re-run of the same Hebrew query ($0.047472) both searched successfully and
  returned the current release (1.30.4, with 2026 CVEs), in English and Hebrew
  respectively. So it is transient budget exhaustion in the dynamic-filtering
  path, not a Hebrew-specific or gating-related fault — but it means
  `max_uses: 2` is not a hard guarantee of one usable answer-bearing search,
  and a future `max_uses: 3` experiment has a live data point behind it.

- **Conversation lifecycle — live-verified on production, 2026-08-18.**
  Measured against the deployed GitHub Pages client with `wrangler tail` open.
  The owner's own browser state was the test fixture, including the very
  26-message thread that polluted the earlier cost measurement.
  - **Fresh start, nothing lost.** A page load rendered 0 message bubbles with
    `dc-current-session` unset and no record written, while the sidebar listed
    all 10 stored conversations and 0 empty shells (the pre-existing shells had
    been pruned). Invoking the sidebar's own handler on the 26-message thread
    restored all 26 bubbles and marked it active; "+ New" then returned to 0
    bubbles, null pointer, 10 sessions.
  - **Hebrew KB question**, fresh conversation, `db_context` 414 chars,
    `web_search_requests = 0` — the same query as Hebrew row 2 above
    ($0.007754 baseline). Cold prefix write: **$0.014991**
    (`cache_creation = 3,709`). Immediate warm repeat: **$0.005810**
    (`cache_read = 3,709`, `cache_creation = 0`), **25% under the baseline**.
    `input_tokens = 174` on both — that figure is the point: it is the
    uncached carry-in, and on a fresh conversation there is essentially none.
    The two runs differ in output length (537 vs 472 tokens), so read the
    baseline delta as an order of magnitude, not a controlled result.
  - **The controlled before/after is the long-thread A/B.** Same Hebrew
    question, same warm cache, same `db_context`, sent twice as raw requests
    over the real 26-message thread — once untrimmed (27 messages, as the app
    used to send) and once through `trimMessagesForRequest()` (11 messages,
    6 user turns):

    | | messages | uncached `input_tokens` | `est_cost_usd` |
    |---|---|---|---|
    | before (untrimmed) | 27 | 8,845 | $0.024742 |
    | after (capped) | 11 | 3,054 | $0.012050 |

    **51% cheaper on identical content**, uncached input down 65%, with
    `cache_read = 3,709` and `web_search_requests = 0` on both sides. Part A
    then removes the case entirely from ordinary use, since that thread is no
    longer the one a visit opens into.
  - **Solve a Case keeps its whole thread.** A 3-turn diagnose exchange, then
    a turn-3 question answerable only from turn 1: the model returned the
    hostname, the start time and the exact error string verbatim, and folded
    in turn 2's command output. `input_tokens` grew 249 → 462 → 604 across the
    three turns, i.e. nothing was trimmed — which is the intent.
  - **The formatting failure did not reproduce.** Across four fresh short
    threads (Hebrew search, English diagnose): zero literal ``` fences in the
    rendered output, code in real `<pre>` blocks with copy buttons (4 in one
    Hebrew answer), 22 line breaks of structure — no run-on paragraph. That is
    consistent with context length having been the cause, but the failure was
    *not* re-reproduced on a long thread to prove it, so treat causation as
    unconfirmed rather than established.

- **Mode-aware request history cap — 2026-08-18.** Client-only change to
  `index.html`; the Worker was not touched. Chosen numbers and their reasoning
  are under "Request history cap" in Architecture above: `search` 6 user turns,
  `diagnose` 40, CLI inherits `search`. New regression test:
  `.github/scripts/test-requesthistory.js` (25 assertions). New
  `spec-drift-check.js` claim `request-history-capped`.

- **Conditional web search — live-verified 2026-08-18.** Measured on
  production with `wrangler tail` open, against the deployed Worker and the
  live GitHub Pages client:
  - **KB question** ("systemd service failed to start how do I debug", fresh
    session, no conversation history): `web_search_requests = 0`,
    `cache_read_input_tokens = 3,628`, `cache_creation = 0`,
    **`est_cost_usd = $0.014004`**. Against the 2026-08-04 reference points
    that is 68% below the $0.0431 cold request and 35% below the $0.0216 warm
    one — but neither is a like-for-like control (different question,
    different history length, different answer length), so treat it as the
    right order of magnitude, not a controlled delta.
  - **The two prefix shapes both cache.** The no-tools prefix measured
    **3,628 tokens** — written on its first request, read on the next — so the
    `web_search_20260209` definition really was **6,184 tokens** of the old
    9,812-token prefix (the earlier ~7,257 figure was an inference from a
    chars/4 estimate of the prompt text; this measures it directly). Two
    shapes, two entries, both hitting. No cache regression.
  - **Honest accounting of where the saving comes from.** Dropping a *cached*
    tool definition is worth only ~$0.0012 per warm request (6,184 tokens at
    the $0.20/MTok cache-read rate). The money is in the searches not bought
    ($0.01 each) and in cold-prefix cache *writes* not paid (6,184 tokens at
    $2.50/MTok ≈ $0.0155 each). The prefix-size headline is real but is not
    the bulk of the saving.
  - **Recency question** ("what is the latest stable nginx version", fresh
    session): search fires as designed, `web_search_requests = 1`,
    `est_cost_usd = $0.05028` — which includes a one-time cold cache write of
    the with-tools prefix (`cache_creation = 10,744`); the immediate repeat
    ran at 0.97 cache hit ratio and $0.038938.

- **`max_uses: 1` was tried and reverted the same session (2026-08-18).** The
  cost case was sound on paper — halve the $10/1,000 search bill — but live
  testing showed it does not narrow the search path, it disables it. Both
  attempts at the nginx question came back with the model stating the search
  tool was exhausted ("search limit hit", "temporarily unavailable") and then
  answering from stale training data (1.26.x/1.27.x), where the same question
  at `max_uses: 2` had previously returned the actual current release with
  citations. The plausible mechanism is this tool version's dynamic filtering:
  it provisions code execution that can spend the budget before the
  answer-bearing query runs, so 1 is not "half of 2" — it is zero usable
  searches. Reverted to 2, with the finding recorded in `worker.js` next to
  the constant. **Conditional attachment (above) is unaffected and is where
  the saving actually lives**; this only concerns requests that already
  decided to search.

- **`buildDbContext()` stopword/length filter (2026-08-18)** — implements
  option A from the 2026-08-15 token-budget diagnostic's decision table
  (`automation/NEEDS_YOUR_REVIEW.md`). Now tokenizes with
  `matchNotebooks()`'s existing stopword list + 3-char minimum instead of
  an unfiltered word split — verified against real `data/*.json`: a
  stopword-only query ("what is a hypervisor") that previously matched 3
  unrelated DB entries now matches none, and the diagnosed "whoami" false
  positive on a netstat query no longer appears
  (`.github/scripts/test-builddbcontext.js`).

- **`buildNotebookContext()` majority-match section threshold (2026-08-18)**
  — implements option B from the same diagnostic. A section now must match
  a majority of the query's significant words instead of any single token
  — verified against the real `data/notebooks/` mirror (re-verified after
  rebasing onto the same-day `chore: weekly Notebook-X mirror sync`, which
  grew `kb-vpn.json` mid-session — figures below are post-sync): the
  diagnosed VPN-comparison query dropped from 14,841 to 9,007 attached
  chars (11 → 5 sections; a 39% reduction — will drift as the weekly sync
  grows/shrinks the underlying notebooks; re-run
  `.github/scripts/test-notebookcontext.js` for the current figure), fully
  excluding the previously over-attached TeamViewer/AnyDesk/RustDesk
  remote-desktop-tool sections while keeping the genuinely relevant "VPN
  Architectures" section
  (`.github/scripts/test-notebookcontext.js`). One known residual: one
  borderline section ("Azure Network Watcher") still ties the majority
  threshold on generic word overlap and remains attached — a real limit of
  token-overlap-only matching on this specific notebook pair, not a
  regression, left as-is per this session's small-fix scope.

- **Cost-optimization round on the Worker (2026-08-04)** — prompt caching,
  usage measurement, and a lower web-search cap. Verified live against
  production, not just code-read:
  - **Caching engages.** Two identical questions back to back:
    request 1 `cache_creation_input_tokens = 9,812`, `cache_read = 0`,
    **$0.0431**; request 2 `cache_creation = 0`, `cache_read = 9,812`,
    hit ratio **0.62**, **$0.0216** — a **50% drop**, despite request 2
    carrying a *larger* uncached portion (6,026 vs 5,205 input tokens, the
    conversation having grown by the previous answer).
  - **The cached prefix is 9,812 tokens**, considerably more than the ~2.5k
    the system text alone accounts for. `tools` renders before `system`, so
    the `web_search_20260209` tool definition — which provisions a
    code-execution environment for dynamic filtering — is inside the cached
    prefix and appears to dominate it. This is what makes caching pay here.
  - **Two breakpoints cost nothing extra.** A single-breakpoint build
    deployed as a control read the same 9,812 tokens, confirming the two
    nested breakpoints are not double-billed; the second one is kept because
    it lets the four mode/CLI variants share block 0.
  - **web_search cap holds** at `max_uses: 2` (`web_search_requests = 2` on a
    search-heavy question that previously could have run 3).
  - Zero errors across the run: 8 requests, all `200`/`204`, no exceptions.

- **Notebook-X integration: repo mirror + client-side selection (2026-07-21)**:
  resolves the architecture decision in `automation/NEEDS_YOUR_REVIEW.md`.
  `.github/workflows/notebook-sync.yml` + `.github/scripts/sync-notebooks.js`
  mirror the Notebook-X index + all 12 notebooks into `data/notebooks/`
  weekly via a read-only fine-grained PAT (`NOTEBOOKX_READ_TOKEN` secret).
  `index.html` adds `matchNotebooks()` (word-boundary + stopword-filtered
  scoring against name/domain/tags/summary) and `buildNotebookContext()`
  (fetches up to 2 matches, selects matching sections, caps at ~15 KB,
  truncates at section boundaries), wired into `sendAiMessage()` as a new
  `notebook_context` request field. `worker.js`'s old `getNotebookXContext()`
  (confirmed silent no-op) is deleted — the Worker now just appends the
  client-built context to the system prompt with a 20 KB server-side cap,
  no fetching/KV/credentials of its own. Verified against the real mirrored
  data via a Node harness reproducing the exact browser code path (Chrome
  browser automation was unavailable this session).
- **Workflows tab made self-hosted (2026-07-20)**: `data-center-archive` was
  confirmed retired — it was never pushed to GitHub, only a local scratch
  folder existed. Its 3 real workflow markdown files were migrated into this
  repo's own `workflows/` folder; the tab now reads a `data/workflows.json`
  registry (loaded into `DB.workflows`) instead of a hardcoded `WORKFLOWS`
  array, and `openWorkflow()` fetches same-origin instead of
  `raw.githubusercontent.com`. The old "archive not connected" fallback is
  gone (structurally unreachable now); an empty-`data/workflows.json` state
  shows a bilingual empty-state message instead.
- **My Bookmarks browsing/management panel** (TODO-004, merge commit
  `ab196ac2`): `#bookmarks-btn` topbar button opens a modal
  (`openBookmarksPanel()`/`renderBookmarksList()`/`removeBookmark()`,
  index.html) listing saved bookmarks with per-row Remove and a
  bilingual empty state — closes the gap noted in feature #20 above. Built
  and merged by the twice-daily unattended Builder/Auditor automation
  (`automation/DATA_CENTER_AUTOMATION_SPEC.md`), the first item it fully
  closed out end-to-end.
- **2026-07 (commit `f64eb30`)**: Worker upgraded to `claude-sonnet-5`;
  Hebrew/English RTL rendering fixed via `wrapLtrTerms()`; IT scope
  expanded beyond Netvill to general IT.
- **Notebook-X index injection** (commit `455a087`, superseded 2026-07-21):
  the original `getNotebookXContext()` listed available notebooks in the
  system prompt, but was a confirmed silent no-op in production (unauthenticated
  fetch against the private repo, always 404ing). Replaced by the repo-mirror
  design above — see that entry.
- **Usage logging** (commit `39e70f7`): request logging on
  `data-center-api` for spike visibility.
- **Audit & cleanup (2026-07-19, commits `d5331cd` + `153152f`)**:
  repo-wide audit; `CLAUDE.md` rewritten; `ROADMAP.md` folded in and
  removed; `README.md` refreshed; all office-simulation leftovers deleted
  (`tools/runbook/`, then per owner decision the in-app Office/Admin UI
  (~660 lines), `notebooks/`, and `data/resources and links.txt`) — zero
  office coupling remains. Followed by this comprehensive 27-item
  feature audit.

## Future Vision (Not Started)

**Notebook-X integration** is now implemented (repo mirror + client-side
section matching — see Recently Completed above); this unblocks, but does
not itself lift, the TODO-005–011 content-module pause (owner decision,
tracked in `automation/NEEDS_YOUR_REVIEW.md`). Content-module roadmap (from
the retired ROADMAP.md): activate the `powershell`, `cloud`, `security`,
`docker`, `cicd`, `casestudies`, and `cli` modules as content is authored;
longer-term ideas (PWA/offline, contribution guide) remain unscheduled.
Natural next steps surfaced by
this audit: a client-side parser + Issue-filing flow for the
`CAPABILITY_SUGGESTION`/`LEARNED_SOURCE` blocks, and copy buttons on
command cards (the saved-bookmarks browsing panel also on this list has
since shipped — see Recently Completed).
