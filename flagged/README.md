# Source Flagging System

Tracks candidate documentation sources before they're added as `source_url`
values in `data/*.json`.

## Workflow

1. **Pending** — when researching a new or updated entry, add a row to
   [`pending-review.md`](./pending-review.md) for any source you haven't yet
   checked against CLAUDE.md Rules 7-8.
2. **Approved** — once verified (approved domain, reachable, relevant), move
   the row to [`approved-sources.md`](./approved-sources.md) and use the URL
   as the entry's `source_url`.
3. **Rejected** — if the domain is on the CLAUDE.md Rule 8 blocklist or the
   content isn't suitable, move the row to
   [`rejected-sources.md`](./rejected-sources.md) with a reason.

The `monthly-review.yml` workflow opens a reminder issue on the 1st of each
month if `pending-review.md` has unreviewed entries.

See `CLAUDE.md` Rules 7-8 for the canonical approved/blocked domain lists —
they are not duplicated here.
