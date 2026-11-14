# src/ai

Client code for the tutor and chaos agent, plus the pure helpers the endpoints share. Owned by the `ai` workstream.

| File | What it is |
| --- | --- |
| `tutor.js` | Browser client. `askTutor(tutorRequest({...}), { fallback })` returns `{ text, source: 'ai' | 'template' }`; it never throws and gives up after 4 s. |
| `chaos.js` | Browser loop. `breakDesign({ world, level, design, scenario })` returns `{ broken, attack, story, facts, log }` or `{ survived }`. Works offline. |
| `attacks.js` | Pure: attack budget check, the deterministic attack search, plain facts and template stories. |
| `facts.js` | Pure: cleans a design and scenario, turns a run log into facts, builds the prompt and checks the reply. Used by `api/tutor.js`. |
| `tutor.test.js`, `chaos.test.js` | Tests with fake `fetch`. No network. |

Wiring it into the coach column is the `ui-panels` task "Live tutor in the coach column": call `askTutor` when a hint is requested, show a loading state, and escape `text` before rendering.

The chaos panel is the `ui-panels` task "Chaos panel": after a pass, call `breakDesign`, then show `story`, `facts` and replay `log` on the board.
