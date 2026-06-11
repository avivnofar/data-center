# Changelog

## [2026-06-11 — 7bf3b1b] (master)

- docs(agents): document live per-block cron + DST caveat ([7bf3b1b](https://github.com/avivnofar/data-center/commit/7bf3b1b21eb36aa88a0f52c188076cf95a69882f))
- feat(agents): wire per-block cron dispatcher for office simulation ([f9a7166](https://github.com/avivnofar/data-center/commit/f9a71669534261e5a443c4f8f46500ad4de845d7))
- chore(agents): log second blocked day-launch attempt (Gemini quota) ([c80b557](https://github.com/avivnofar/data-center/commit/c80b5572374373019a6592055761f61a6656c047))


## [2026-06-11 — b9c467b] (master)

- docs: document daily automation, AI-tool coordination, and CLI stub plans ([b9c467b](https://github.com/avivnofar/data-center/commit/b9c467b0927f1cc1cd54244ed1f0ebf0a175d3a6))
- feat(agents): wire daily schedule + AI-tool config into runWorkDayCycle ([46ecc9e](https://github.com/avivnofar/data-center/commit/46ecc9e6951fa623eb9e58d149c52499d9f2a4f2))
- feat(agents): seed daily schedule, AI-tool coordination, and asset pipeline config ([53b258d](https://github.com/avivnofar/data-center/commit/53b258dcfd23af09c7985ac36c493b27f65b6ab9))
- docs(agents): stop month-1 simulation after day 1, add week-1 report ([a9984a5](https://github.com/avivnofar/data-center/commit/a9984a58c6b979805431ca575e9ed3ccb9bfc004))
- chore(agents): log month-1 day-1 launch attempt — blocked on Gemini quota ([18c7be2](https://github.com/avivnofar/data-center/commit/18c7be275a4d1acec68d1c23ceed5f38b497e793))


## [2026-06-11 — 027bbae] (master)

- chore(ui): drop dead AGENTS_SCHEDULER_BASE config; log readiness audit ([027bbae](https://github.com/avivnofar/data-center/commit/027bbae382c445b3170d1f0a37ad955d38db2b88))


## [2026-06-11 — 2409877] (master)

- fix(agents): use service binding for agent-runner -> data-center-api calls ([2409877](https://github.com/avivnofar/data-center/commit/2409877fc058c13ad9c8724168328d8f8f2efadd))


## [2026-06-11 — c9f2098] (master)

- docs: log agents docs/CI cleanup in session queue ([c9f2098](https://github.com/avivnofar/data-center/commit/c9f209806d665966ff30b47b18b65a3fe45a5e97))
- fix(ci): retarget weekly agent report at agent-runner.js ([4a2c01d](https://github.com/avivnofar/data-center/commit/4a2c01dc21ecb026623495e54973c3c414604bd3))
- docs(agents): rewrite README/AGENTS for single-Worker architecture ([48625fa](https://github.com/avivnofar/data-center/commit/48625fa6bf06ddb874a0538d1f29244832717665))


## [2026-06-11 — 27f4030] (master)

- docs: record launch-session progress and Cloudflare auth blocker ([27f4030](https://github.com/avivnofar/data-center/commit/27f4030d10f9a019fe01f5db3bae06254b711a49))
- feat(ui): brighten palette, enlarge AI chat, add CLI terminal look and Solve-a-Case controls ([bdffbdf](https://github.com/avivnofar/data-center/commit/bdffbdf86bc6a18ee7ffe10320ea409af977979d))
- docs: add Launch Decisions, Source Validation, and AI Capabilities sections ([d2a5be0](https://github.com/avivnofar/data-center/commit/d2a5be006d060c17b83baaaec3f40246392e9e53))
- feat(agents): add asset-generation pipeline for admin-tier agents ([770cf86](https://github.com/avivnofar/data-center/commit/770cf86f0d82c096abfec1ae0f272cce2e7f420c))
- feat(worker): add web_search tool and self-extension/learning hooks ([0be34ec](https://github.com/avivnofar/data-center/commit/0be34ec00003cc1749920510ac15fda95cccf12b))
- chore(agents): wire up agent-runner Worker for Cloudflare deploy ([9e20080](https://github.com/avivnofar/data-center/commit/9e200806614b8532de7f7f7129254710a20f807e))


## [2026-06-11 — 13a0844] (master)

- docs: confirm AI Search Worker redeploy resolved ([13a0844](https://github.com/avivnofar/data-center/commit/13a0844485c690e5b759d58ecb46e61fddade7f4))
- docs: update session queue — mobile pass and agent runtime consolidation done ([ffac48c](https://github.com/avivnofar/data-center/commit/ffac48c3a51905a889f1d3ded0abfda335a60183))
- fix(ui): enforce 44px minimum touch targets on mobile nav controls ([b03dc2b](https://github.com/avivnofar/data-center/commit/b03dc2bd7b20f3c5f5396b3d24bf475ff4845db6))


## [2026-06-11 — 13decd2] (master)

- fix(ui): prevent iOS auto-zoom on input focus; update queue status ([13decd2](https://github.com/avivnofar/data-center/commit/13decd273ba26300275a4f8a9479c7dc6b345d4f))


## [2026-06-11 — 1b71238] (master)

- fix(worker): update Claude model to claude-sonnet-4-6 ([1b71238](https://github.com/avivnofar/data-center/commit/1b71238ff9af075b6039fe66d021f449066bfbfa))


## [2026-06-11 — c36fd77] (master)

- docs: sync strategy - one Gemini engine plays all 11 personas, UI-first ([c36fd77](https://github.com/avivnofar/data-center/commit/c36fd77c67f8ef0280e2fbea01925fb19bbe180b))


## [2026-06-11 — 1547079] (master)

- feat(worker): support CLI Mode in AI chat system prompt ([1547079](https://github.com/avivnofar/data-center/commit/1547079eac549a1394a571462677eacd5789234c))
- feat(ui): v2.1 — terminal palette, AI Search first, 3-mode selector, Office lock ([43b341a](https://github.com/avivnofar/data-center/commit/43b341a920ae10c53f56ea907b4da1920dbbfefd))


## [2026-06-11 — 8c3a9f4] (master)

- fix(agents): wire admin dashboard to live trigger endpoints ([8c3a9f4](https://github.com/avivnofar/data-center/commit/8c3a9f45b4725fb176c88fe645c1085f993af85a))
- feat(agents): wire office simulation runtime into agent-runner ([b57fc99](https://github.com/avivnofar/data-center/commit/b57fc99356bc60459ba550fc4649c34c4a490f5e))
- feat(agents): add year-tracker config ([f85dd05](https://github.com/avivnofar/data-center/commit/f85dd05025ae8772c63cd4f919291ff8b35bb57f))
- feat(agents): add side-plot narrative config ([790249a](https://github.com/avivnofar/data-center/commit/790249a0ac9ec79c9c424722ec3543ca4846c2e2))
- feat(agents): add promotion and PIP track config ([1ee2724](https://github.com/avivnofar/data-center/commit/1ee272446546c956edb3aa8ae5372ded39e15cb0))
- feat(agents): add CRM case generation engine ([b7ad094](https://github.com/avivnofar/data-center/commit/b7ad094e55665bd239542be453ff46160efc949f))
- feat(agents): add meeting engine for office simulation ([ed8f801](https://github.com/avivnofar/data-center/commit/ed8f801580ae77795cf3d0f6c0fcb426d40a9869))
- feat(agents): add inter-agent relationships config ([aa6b7aa](https://github.com/avivnofar/data-center/commit/aa6b7aaf1dd5f560139697df1fdd12df89da6445))
- feat(agents): expand roster to full 11-agent character specs ([b74bdf4](https://github.com/avivnofar/data-center/commit/b74bdf49ece6388995c5e2051ef481bb4777e118))
- docs(agents): add agent-runner Cloudflare deployment quick-reference ([30c7a1b](https://github.com/avivnofar/data-center/commit/30c7a1b75036f0c1fe7ad3ff6ed3f7f13c49b84c))


## [2026-06-10 — 859dfba] (master)

- docs(agents): add agent simulation README, spec summary, and CLAUDE.md section ([859dfba](https://github.com/avivnofar/data-center/commit/859dfba4eeeb7165a40a6d6156aa5f1d3735530d))
- ci(agents): add weekly case batch and report workflows ([360263b](https://github.com/avivnofar/data-center/commit/360263bb6d9691afba74e18514af751e40e3322f))
- feat: add gated Admin tab for AI agent simulation dashboard ([a55928b](https://github.com/avivnofar/data-center/commit/a55928b58db3a6932a42a237afb60659cd88c3cc))
- feat(agents): add standalone admin dashboard and report templates ([de3ccab](https://github.com/avivnofar/data-center/commit/de3ccab6a5a631ff3f6bf25750685eaa4f9373a8))
- feat(agents): add agent-runner worker with admin API ([e2995a7](https://github.com/avivnofar/data-center/commit/e2995a741492093769fb3bacddc4cd0606cb8ee0))
- feat(agents): add case generator and scheduler worker ([2529493](https://github.com/avivnofar/data-center/commit/25294930ac802622e61459b5b9764e1987d55d17))
- feat(agents): implement Phase 1 agents 1-4 and stub template ([0832e24](https://github.com/avivnofar/data-center/commit/0832e2460064caa8c942050a5f48afe280af2472))
- feat(agents): add AgentBase, Gemini client, and state manager ([9eb1169](https://github.com/avivnofar/data-center/commit/9eb1169fdd038f479698ea1433dd1b458e47fc4c))
- feat(agents): add D1 schema and seed data for agent simulation ([6862326](https://github.com/avivnofar/data-center/commit/6862326b384c4c616d89e78e6e97207d51bac99e))
- feat(agents): add AI agent simulation config (Phase 1 draft) ([452c04e](https://github.com/avivnofar/data-center/commit/452c04e255f948344c1e3ce4e7164938a110c6b2))


## [2026-06-10 — 15ace88] (master)

- docs: document Workflows archive, PDF export, bookmarks, flagging, and brain rules ([15ace88](https://github.com/avivnofar/data-center/commit/15ace88038ff193b60233a975bd4106e74a9de1a))
- docs: add source flagging system (pending/approved/rejected) ([080b1da](https://github.com/avivnofar/data-center/commit/080b1daba242c16591251e3959c95b34bc076570))
- ci: add daily link-check and monthly source-review workflows ([2f799d5](https://github.com/avivnofar/data-center/commit/2f799d573a29845e6043264571ddfbd6c018f389))
- feat: add Workflows tab, print-based PDF export, AI bookmark bars, and diagnose progress indicator ([5bf2b37](https://github.com/avivnofar/data-center/commit/5bf2b374b56558a4061bd726a9bc9c0f606eb31c))


## [2026-06-10 — ff0bd31] (master)

- feat: extend knowledge base with 8 new entries ([ff0bd31](https://github.com/avivnofar/data-center/commit/ff0bd311e93da33a7b0ad15d59f2a0c100d006e4))


## [2026-06-10 — a15706c] (master)

- config: connect Cloudflare Worker API endpoint ([a15706c](https://github.com/avivnofar/data-center/commit/a15706ca6d364f9bc4966334526f7ebf28d769b2))


## [2026-06-10 — f0a6e52] (master)

- fix: remove nested data-center folder, clean node_modules from tracking ([f0a6e52](https://github.com/avivnofar/data-center/commit/f0a6e5278f0c74a76f884d2a5813b340b267dd28))


## [2026-06-10 — e1da738] (master)

- fix: trigger Pages redeploy ([e1da738](https://github.com/avivnofar/data-center/commit/e1da738b2b957a931347da28916b2f2c50c51d00))


## [2026-06-10 — 4c93a29] (master)

- fix: trigger GitHub Pages rebuild ([4c93a29](https://github.com/avivnofar/data-center/commit/4c93a2904c63f716d19fb6b4c6a9217e2c4de42c))


## [2026-06-10 — 7bd0b78] (master)

- docs: update CLAUDE.md with Phase 2 architecture and Cloudflare setup ([7bd0b78](https://github.com/avivnofar/data-center/commit/7bd0b78))
- feat: Phase 2 — AI search bar with streaming, modes, session memory ([c7f92c4](https://github.com/avivnofar/data-center/commit/c7f92c4))
- feat: add Cloudflare Worker API proxy for Anthropic ([51a18e8](https://github.com/avivnofar/data-center/commit/51a18e8))


## [2026-06-09 — 7c4b2f6] (master)

- docs: bilingual README, CLAUDE.md project bible, and updated ROADMAP ([7c4b2f6](https://github.com/avivnofar/data-center/commit/7c4b2f62c9f8e20941386a3d38be0f919273cf1b))
- feat: complete bilingual app with RTL support and hover tooltips ([27b8dc5](https://github.com/avivnofar/data-center/commit/27b8dc5a9dd8054bebe2bae8fc95274122b24ca6))
- ci: update validate, health scripts and health workflow for bilingual schema ([6f82740](https://github.com/avivnofar/data-center/commit/6f827404a65c18d299c44cfaddfd41de2c6c2b62))
- feat: initial bilingual database — Linux, CMD, Network, Troubleshoot ([ea1e811](https://github.com/avivnofar/data-center/commit/ea1e811f493d1ab94dab4b91d461ccac874b486b))
- feat: add extensible module registry with Hebrew labels ([96e6a6a](https://github.com/avivnofar/data-center/commit/96e6a6ac4a0eb9034500958d3d23f907414475d4))
- chore: add .nojekyll for GitHub Pages compatibility ([cd51e35](https://github.com/avivnofar/data-center/commit/cd51e3544d4f00b99dfc6e6d06da1bd24208c69f))


## [2026-06-09 — 4f38dc5] (master)

- feat: complete data-center foundation with extensible architecture ([4f38dc5](https://github.com/avivnofar/data-center/commit/4f38dc5ba04e9ffc9e9808419ad4bcca0551bc15))


## [2026-06-08 — 62dc3d2] (master)

- docs: add ROADMAP.md with Phase 2-4 milestones ([62dc3d2](https://github.com/avivnofar/data-center/commit/62dc3d236ea3efddb4748266c029e29653975c9b))
- chore: add .gitignore ([475c8ed](https://github.com/avivnofar/data-center/commit/475c8ed8f935a1139396dcf4cadba7ae17494f4b))
- ci: add auto-changelog workflow ([f21f640](https://github.com/avivnofar/data-center/commit/f21f6409fe5957f1bc54d6b1ab9dbab05e646e6c))
- ci: add JSON schema validation workflow ([4f2f3d5](https://github.com/avivnofar/data-center/commit/4f2f3d560cc98b798f739db4c42db0b1672a3aa4))
- docs: add CLAUDE.md with project structure and JSON schema reference ([c986820](https://github.com/avivnofar/data-center/commit/c9868204fd9f3a67bb8670cf9b2e034ed1306fee))
- refactor: load DB at runtime via fetch() instead of hardcoded inline ([dff71e1](https://github.com/avivnofar/data-center/commit/dff71e118bb877aeb2c46c411ba84ac5cc1de2fe))
- feat: extract all command data into separate JSON files ([2a3f6d0](https://github.com/avivnofar/data-center/commit/2a3f6d0151eba2fadaaf9813645c313e1d095d45))


All changes are auto-generated from commit messages on push to master.