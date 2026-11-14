# Working in this repo

Several agents and people work here at once. These rules keep them out of each other's way.

Read first: `docs/SPEC.md` (what we are building and why), then `docs/contracts.md` (the shapes every part agrees on).

## Commands

| Task | Command |
| --- | --- |
| Run the app | `npm run dev`, then open http://localhost:5173 (ES modules need a server; `file://` will not work) |
| Test | `npm test` (Node 20 or newer, no install step) |

There is no build step and no dependencies. Do not add a framework or a bundler without agreeing it in an issue first.

## Who owns what

Each workstream owns a set of paths. Change only the paths your task's workstream owns. If you need a change elsewhere, say so in your PR description or open an issue for that owner.

| Workstream | Owns | Does |
| --- | --- | --- |
| `sim` | `src/sim/` | The simulator, wiring rules, validation, and their tests |
| `levels` | `src/levels/` | Level data: both scenes, briefs, hints, targets, translation pairs |
| `ui-board` | `src/ui/board.js`, `src/ui/fx.js`, `src/ui/worlds.js` | Blocks, wires, the moving dots, world words and icons |
| `ui-panels` | `src/ui/run-panel.js`, `src/ui/coach.js` | Charts, prediction, result, tutor column |
| `ui-shell` | `index.html`, `styles/`, `src/ui/main.js`, `src/ui/state.js` | Layout, tokens, input handling, app state |
| `ai` | `api/`, `src/ai/` | OpenAI tutor and chaos agent (serverless functions plus their client code) |
| `pitch` | `docs/pitch/` | Demo script, slides, Devpost text, video plan |

Shared files, change only through a PR that says so in its title: `docs/contracts.md`, `docs/SPEC.md`, `package.json`, this file.

## How to take and finish a task

1. Pick an open issue with your workstream's label, and assign it or comment that you are on it.
2. Work on a branch named `<workstream>/<short-slug>`, for example `sim/queue-block`. With several local agents, use one git worktree per agent: `git worktree add ../sds-<slug> -b <workstream>/<slug>`.
3. Keep the change to one task. Rebase on `main` before opening the PR.
4. `npm test` passes. If you changed what the simulator returns, add or update a test.
5. Open a PR that closes the issue. Describe what changed, what you checked, and anything you could not check (for example, "not viewed in a browser").

## Rules that protect the product

- **The simulator decides.** Pass and fail, failure points and every number shown come from `simulate()`. AI writes words and proposes attacks; it never grades.
- **The simulator stays pure.** No DOM, no randomness, no clock. The same design and scenario always give the same log.
- **No unchecked AI output reaches the learner.** A chaos-agent attack is shown only after the simulator confirms that it breaks the design. A tutor message may mention only events in the run log.
- **Both scenes, same answer.** A level's coffee shop and software scenes must give the same predicted number (the simulator runs in software units; the coffee shop divides by `SCALE`). Tests in `src/sim/sim.test.js` check this; extend them when you add or change a level.
- **The learner predicts before every run.** Never cut or bypass the prediction step.
- **Secrets stay server-side.** The OpenAI key lives only in the serverless function's environment (`OPENAI_API_KEY`). Never put it in client code or commit it.

## Style

- Plain JavaScript ES modules, two-space indent, single quotes.
- UI copy: short, plain sentences in the learner's words. Coffee shop text uses coffee shop words; software text uses software words.
- Colors only through the CSS tokens in `styles/app.css`. Each world (`data-world="cafe"` and `"software"`) defines the full token set.
