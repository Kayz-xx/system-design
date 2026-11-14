# Backlog

Each item becomes a GitHub issue with its workstream as a label. The order is priority within each workstream. The hackathon deadline is 8 am Sunday, November 15, 2026.

## ai

1. **OpenAI tutor endpoint.** `api/tutor.js` per `docs/contracts.md`, with a 4 s timeout and the template fallback in the client. Done when a failed run shows a worded hint that mentions only logged events, and pulling the key still shows the template.
2. **Chaos agent loop.** `api/chaos/plan.js` plus `src/ai/chaos.js`. The loop is plan, simulate, retry up to five times, and show only a confirmed attack with its story in the world's words. Done when a passing Level 1 coffee shop gets broken by a realistic incident, and a design that survives every attempt is told so.
3. **Attack search to back the agent.** A deterministic search over shock combinations within the budget, listing the attacks that break the design. The agent picks the most realistic one and tells its story. This answers "why not brute force".

## sim

1. **Queue and workers block (Level 4).** New type `queue` with `workers`, `workerRate` and `queueLimit`; server → queue → database for writes. Tests for backlog growth and drain.
2. **Slow-database shock.** `slowDb: { t, dur, factor }` halves capacity. Tests.
3. **Merge attack shocks.** Allow more than one spike and more than one server failure in a scenario, so chaos attacks can stack. Keep the old single-shock shape working.

## levels

1. **Level 4, mobile orders.** Coffee shop then software, same answer, with tests in `sim.test.js`.
2. **Real numbers for Level 1.** If the team consults a real café (see the pitch backlog), replace the Level 1 coffee shop numbers with theirs and credit them.
3. **Copy pass.** Read every brief, hint and tutor line aloud. Cut anything a first-year student would not follow.

## ui-board

1. **Customers that look like people.** Small figures in the coffee shop, packets in software. Keep one dot per 50 requests.
2. **Transform animation.** Morph each block's icon and label in place, instead of fading the board.
3. **Chaos attack on the board.** Show the incident as it happens, for example a bus icon arriving at the door.

## ui-panels

1. **Live tutor in the coach column.** Call `/api/tutor`, show a loading state, and fall back to the templates.
2. **Chaos panel.** A "Try to break my design" button after a pass, the agent's attempts, and the confirmed incident report.
3. **Stars summary.** End-of-level card with the three stars and what each means.

## ui-shell

1. **Phone layout check.** The board scrolls inside its frame and nothing else scrolls sideways at 400 px.
2. **Keyboard path.** Adding blocks, wiring and running without a mouse.

## pitch

1. **Peri Forward Deployed Challenge decision.** It requires consulting a real business during the hackathon, with the person's name and role and one piece of evidence. Go to a Princeton café early, ask about the morning rush and staffing, and record their numbers and a quote.
2. **Evidence for the FDE hiring claim.** Primary sources only, or drop the claim.
3. **Demo script, two minutes.** Problem, coffee shop, transform, software fix, chaos agent, close.
4. **Devpost text and README polish.** Include the team's Discord usernames.
5. **Backup video**, recorded by hour 22.
