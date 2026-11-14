# api

Serverless functions (Vercel-style `api/*.js`). Owned by the `ai` workstream. See `docs/contracts.md` for request and response shapes. The Gemini key comes from `GEMINI_API_KEY` in the host environment and never reaches the browser.

| File | What it is |
| --- | --- |
| `tutor.js` | `POST /api/tutor`. Reruns `simulate()` on the cleaned design, turns the log into facts in the world's words, asks Gemini for one hint, and checks the reply before returning `{ text, step }`. |
| `chaos/plan.js` | `POST /api/chaos/plan`. Runs the attack search on the cleaned design, lets Gemini pick the most realistic proven attack and write its story, and checks the story. Returns `{ attack, story, facts, source }`, or `{ attack: null, survived: true }`. Without a key it returns the mildest attack with a template story. |
| `_llm.js` | The shared Gemini `generateContent` call and JSON handler. Not a route. |
| `_dev.js` | Local server: the static app plus the API routes. Not deployed (leading underscore). |

## Run locally with the tutor

```
cp .env.example .env        # then set GEMINI_API_KEY; GEMINI_MODEL defaults to gemini-2.5-flash
                            # an AQ.… key goes to Vertex AI (Google Cloud billing), an AIza… key to AI Studio
node api/_dev.js            # http://localhost:5173
```

Without a key the endpoint answers 503 and the app shows the level's template hints.

## How the tutor stays honest

- The server ignores client-sent `events` and reruns the simulator, so the model reads the real log.
- Block names are cleaned (40 characters, no brackets or backticks) before they go into the prompt.
- The prompt lists only logged facts and names the blocks the reply must not mention.
- The reply is rejected (502) if it names a block outside the log, uses software words in the coffee shop, or is empty or too long.
- Gemini gets 3.5 s (thinking is turned off on Flash models to keep it fast); the client gives up at 4 s. Every failure means the template hint.

## How the chaos agent stays honest

- A deterministic search (`src/ai/attacks.js`) tries shock combinations within the budget (2 shocks, spikes up to 3× normal) and keeps only the ones `simulate()` says break the design: lost customers or long waits. Cost does not count, because an incident does not change the bill.
- The model only chooses among those and writes a story. It cannot set numbers; stories with digits, software words in the coffee shop, or the wrong length fall back to a template.
- `facts` states the incident from its real numbers, so show it next to the story.
- The browser loop (`src/ai/chaos.js`) re-simulates every attack before showing it, retries up to five times, and runs the same search locally if the endpoint is unreachable.

## POST /api/audit/note

The auditor's note under the audit card. Body: `{ world, level, design }`. The server reruns the whole audit
(`src/levels/audit.js`) from the design alone, then asks Gemini to explain in up to three sentences why the
mornings matching the failure rule break the design, using the log of the mildest failing morning. The reply
passes the same check as the tutor's (`rejectReason`).

- 200 `{ text, survived }`, where `text` is `null` when nothing broke (no model call is made).
- 400 bad input, 503 no key, 502 model error or failed check, 504 timeout. The card then shows no note.
