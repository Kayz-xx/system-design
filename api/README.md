# api

Serverless functions (Vercel-style `api/*.js`). Owned by the `ai` workstream. See `docs/contracts.md` for request and response shapes. The OpenAI key comes from `OPENAI_API_KEY` in the host environment and never reaches the browser.

| File | What it is |
| --- | --- |
| `tutor.js` | `POST /api/tutor`. Reruns `simulate()` on the cleaned design, turns the log into facts in the world's words, asks OpenAI for one hint, and checks the reply before returning `{ text, step }`. |
| `_dev.js` | Local server: the static app plus the API routes. Not deployed (leading underscore). |

## Run locally with the tutor

```
cp .env.example .env        # then set OPENAI_API_KEY; OPENAI_MODEL defaults to gpt-4.1-mini
node api/_dev.js            # http://localhost:5173
```

Without a key the endpoint answers 503 and the app shows the level's template hints.

## How the tutor stays honest

- The server ignores client-sent `events` and reruns the simulator, so the model reads the real log.
- Block names are cleaned (40 characters, no brackets or backticks) before they go into the prompt.
- The prompt lists only logged facts and names the blocks the reply must not mention.
- The reply is rejected (502) if it names a block outside the log, uses software words in the coffee shop, or is empty or too long.
- OpenAI gets 3.5 s; the client gives up at 4 s. Every failure means the template hint.
