# Token Budget — Session Queue

Tracks the next planned Claude Code sessions for this project and their
rough scope, so each session can pick up the next item without re-deriving
priorities. See `CLAUDE.md`'s "Current Strategy (authoritative)" section and
`agents/STRATEGY.md` for the framing behind this order.

## Queue

1. **UI polish + verify AI Search end-to-end** — confirm the AI Search
   tab's streaming chat (`sendAiMessage` / `streamFromWorker`, 3-mode
   selector, CLI mode) works against the live `data-center-api` Worker;
   review the relationship between the top `#search-input` (local DB only)
   and the AI Search tab.
2. **Mobile responsiveness + design optimization** — review `index.html`
   layout/CSS on small viewports, tighten the v2.1 terminal-palette UI for
   phone-sized screens.
3. **Consolidate agent runtime into one Gemini engine** — re-architect
   `agents/workers/agent-runner.js` so a single Worker role-plays all 11
   personas from `agents/config/agents-config.json`, instead of assuming
   11 independent Workers/Durable Objects. No deletions — existing configs
   become the engine's input data.
4. **Test the single Gemini agent against the live app** — run it through
   `data-center-api`'s `/api/chat`, verify mood/state transitions and
   reports per `agents-config.json`.
5. **Full 1-year office simulation run** — once items 1-4 are solid.

## Notes

- Each session should aim to stay within roughly 5,500 tokens of work
  before committing and pausing for review.
- Per `CLAUDE.md`'s Autonomous Brain Rules: commit locally, summarize what
  changed, and wait for explicit confirmation before `git push` to
  `master`.
