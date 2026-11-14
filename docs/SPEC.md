# System Design Sandbox — Design

Nov 14, 2026 · @Kayden · revision 2 (decisions applied)

## Revision 3: coffee shop first, then software

These decisions replace the parts of revision 2 below that contradict them.

| Decision | Result |
| --- | --- |
| Audience: new engineers aiming at forward deployed (FDE) roles | Pitch: an FDE walks into a business and has to see the system in it. Start with a coffee shop. |
| Each level has two scenes on one simulator | Scene 1 is a coffee shop; scene 2 is the same diagram as software. The same numbers give the same answers: 50 minutes, then 50 seconds. |
| The transform is the demo's main moment | Passing the coffee shop turns the board into software, with a card that maps barista to server, line to queue, and so on |
| Visual: customers and packets drawn as dots | One dot is one customer, or 50 requests. The line grows as dots past the counter; walk-outs drift away in red. |
| Gamified lightly | Three stars per level: coffee shop passed, software passed, and the first software prediction within 15% (the coffee shop carried over) |
| Cut from the demo | The critique round and the progress chart. The chaos agent replaces the critique as the AI feature. |
| LLM provider | Gemini (`gemini-2.5-flash` by default), behind one serverless function |
| Inspiration | Chinilla for interaction (flowing packets, per-block health, a bottleneck callout); not its look or branding |

| Level | Coffee shop | Software | Answer both times |
| --- | --- | --- | --- |
| 1 Saturation | A train arrives at 8:00; one barista | A post goes viral; one server | 50 minutes / 50 seconds to clear |
| 2 Redundancy | One of three baristas goes home sick | One of three copies crashes | 16.7% lost at the worst moment |
| 3 Caching | The grab-and-go fridge sells out | The cache restarts empty | 20 customers a minute / 1,000 reads a second on the slow path |

Unit rule: the simulator runs in software units. The coffee shop shows them divided by 50, and reads one tick as a minute instead of a second. Coffee shop cost is software cost × 200, shown as wages and machines per hour. Wait targets differ (5 minutes against 200 ms), so a fix can pass one scene and not the other.

Open, from this revision:

- [ ] Peri's Forward Deployed Challenge requires consulting a real business during the hackathon, with the person's name and role and one piece of evidence. Interviewing a real Princeton café and using their rush numbers for Level 1 would qualify the project and make the level real. Decide early, because it means someone has to go out.
- [ ] Evidence for "companies struggle to hire FDEs who understand systems", before it goes on a slide.

## What changed from the build plan

| Decision | Result |
| --- | --- |
| The demo rests on predict, break, fix | Levels 1 to 3 are the product. Level 4 is a Should, Level 5 a stretch. |
| Prediction is a per-level question | Every level asks "which block fails first" plus one number that is hard to guess on that level. |
| Canvas allows valid wires only | Blocks go anywhere; only the connections in the wiring table snap. The simulator never sees a malformed design. |
| About 24 hours, not 16 | The extra 8 hours go to polishing the core loop, not to more levels. |
| LLM is from a non-Anthropic provider | All LLM calls sit behind one function, so the provider is a one-file choice. Templates ship first. |
| Handbook read | Education is the required track, and it has no AI requirement. Amazon's Practical AI track is an optional second entry; live critique is the piece built for it and now ranks ahead of Level 4. |

## Summary

System Design Sandbox teaches the system design that CS degrees skip. A student builds a system from five blocks, predicts how it will fail, watches a simulator break it, and fixes it.

It makes the scaling path of the [System Design Primer](https://github.com/donnemartin/system-design-primer) runnable. The simulator decides what is right. AI writes flawed designs for the learner to critique and explains what the simulator already showed.

## Tracks and rubric

HackPrinceton, submission due 8 am Sunday, November 15, 2026. This is a hard deadline.

| Entry | Track | Why |
| --- | --- | --- |
| Required | Education | "Projects that make learning more interactive, accessible, or personalized" |
| Optional | Best Practical AI Innovation (Amazon) | Its example list includes "an agentic AI sandbox or learning environment where AI collaborates with you interactively" |
| Automatic | Best Overall Hack | Every submission is considered |

Main-track judges score four things. Each maps to one part of the build:

| Criterion | What the judges ask | What answers it |
| --- | --- | --- |
| Creativity | What is the "ah-ha" moment? | The prediction gap: the learner guesses 20 seconds, the simulator shows 50 |
| Utility | Does it function, and how deep is it? | Levels 1 to 3 working end to end, with a simulator that is unit-tested |
| Charity | Does it address a specific societal need? | Students learn system design on the job, at companies with scale. This is free, runs in a browser with no cloud account, and builds on an open resource. |
| Avidity | Polish, Devpost description, future plans | A polished core loop; Levels 4 and 5 shown as the roadmap |

Amazon scores creativity, usefulness, technical implementation and user experience at 25% each, and asks for agentic and adaptive behavior. Live critique (below) is what earns that.

Submission needs:

- A public GitHub repository created between November 13 and 15
- A Devpost entry with the team's Discord usernames
- A README (Amazon asks for basic documentation, a clear use case and a target user)
- A demo video of at most 2 minutes (optional, recommended)
- An in-person presentation of at most 2 minutes that states the problem, then walks through the tool

## Scope

| Component | Status |
| --- | --- |
| Simulator: server, load balancer, cache, database; spike, server failure and cache flush shocks | Must |
| Canvas with valid wires only, live coloring during a run | Must |
| Levels 1 to 3, each with a prediction before every run | Must |
| Prediction scoring and the prediction-error chart | Must |
| One critique round after Level 3, from a library of three validated designs | Must |
| Tutor from templates built on the run log | Must |
| Public repository, README, Devpost entry | Must |
| Tutor through an LLM, with the templates as fallback | Should |
| Live critique: the LLM writes a flawed design, the simulator confirms the flaw, and the flaw type follows the learner's weakest prediction | Should (first) |
| 2-minute demo video | Should |
| Queue and workers block, Level 4, slow-database shock | Should (last) |
| Level 5 capstone | Stretch |
| Accounts, saved progress, a level editor, multiplayer | Out |

## The learning loop

1. Read the scenario brief and its targets.
2. Build or change the design on the canvas.
3. Predict: which block fails first, and the level's number.
4. Run. The simulator plays the scenario and colors each block by load.
5. Compare the prediction with the result. The tutor explains from the run log.
6. Fix the design, predict again, rerun.

The learner predicts before every run, including reruns. That gives a like-for-like comparison inside each level: the first guess against the guess after the fix.

## Prediction

| Level | Number to predict | Worked example (starting values, to tune) |
| --- | --- | --- |
| 1 | Seconds to recover after the spike ends | Capacity 100/s, baseline 60/s, spike 200/s for 20 s. Backlog grows 100/s to 2,000. It drains at 40/s, so recovery takes 50 s. |
| 2 | Peak error rate while one server is down | 3 servers at 100/s, traffic 240/s. One dies, capacity is 200/s, and 40 of 240 requests drop: 16.7%. With 4 servers it is 0%. |
| 3 | Read load on the database in the second after the flush | 1,000 reads/s at a 90% hit rate puts 100/s on a database that handles 300/s. After the flush it gets 1,000/s, 3.3 times its capacity. |

Scoring has two parts, shown separately:

- **Block:** right or wrong.
- **Number:** error = |guess − actual| ÷ actual, capped at 100%.

The closing chart plots number error per level, first attempt against the attempt after the fix. The questions differ between levels, so the chart compares attempts within a level and the caption says so.

The worked examples double as the simulator's first unit tests.

## Building blocks

| Block | What the learner sets | How it fails |
| --- | --- | --- |
| Server | Capacity per second; copies | Past capacity its queue grows, latency climbs, then requests drop |
| Load balancer | Nothing; it spreads load across the server copies behind it | With one copy behind it, a single failure still takes the system down |
| Cache | Size, which sets the hit rate | A flush drops the hit rate to zero and every read lands on the database |
| Database | Read capacity, write capacity, read replicas | Saturates under reads or writes; replicas help reads only |
| Queue and workers (Should) | Worker count, queue limit | Backlog grows when workers are slower than arrivals; a full queue drops requests |

Every block has a cost per hour, and cost is one of the pass targets.

### Wiring rules

Traffic is a fixed source placed by the scenario. Only these connections snap:

| From | To |
| --- | --- |
| Traffic | Load balancer, or a server with one copy |
| Load balancer | Server |
| Server | Cache, database, queue |
| Cache | Database |
| Queue | Workers |
| Workers | Database |

- A server with more than one copy needs a load balancer in front; the interface says why.
- A server sends reads to the cache if one is wired, otherwise to the database.
- A server sends writes to the queue if one is wired, otherwise to the database.
- A design runs once traffic reaches a server. Loops cannot be drawn.

## Simulator

A deterministic pure function: `simulate(design, scenario) → runLog`. One tick is one simulated second.

1. The scenario emits this second's reads and writes.
2. Requests flow along the wires in order from the traffic source.
3. Each block serves up to its capacity; the rest wait in its queue.
4. Requests beyond a block's queue limit are dropped and counted as errors.
5. Latency is each block's base latency plus queue length ÷ capacity, summed along the path.
6. The run logs load, served, queue, dropped and latency for every block.

A run passes when error rate, share of slow requests and cost per hour all meet the scenario's targets.

The model counts requests per second and does not follow single requests. Latency stays flat until a block saturates, which real systems do not do. The interface states that it teaches intuition, not capacity planning.

### The two shared shapes

Agreed in the first hour; everything else builds against them.

```json
{
  "blocks": [
    { "id": "lb1", "type": "loadBalancer" },
    { "id": "s1", "type": "server", "capacity": 100, "copies": 3, "queueLimit": 500 },
    { "id": "c1", "type": "cache", "size": 2000 },
    { "id": "db1", "type": "database", "readCapacity": 300, "writeCapacity": 100, "replicas": 0 }
  ],
  "wires": [["traffic", "lb1"], ["lb1", "s1"], ["s1", "c1"], ["c1", "db1"]]
}
```

```json
{
  "ticks": [
    { "t": 41, "traffic": { "reads": 1000, "writes": 50 },
      "blocks": { "db1": { "load": 1000, "served": 300, "queue": 700, "dropped": 0, "latencyMs": 2350 } } }
  ],
  "events": [
    { "t": 40, "type": "shock", "shock": "cacheFlush" },
    { "t": 41, "type": "saturated", "block": "db1", "load": 1000, "capacity": 300 },
    { "t": 43, "type": "dropping", "block": "db1" }
  ],
  "result": {
    "errorRate": 0.12, "slowShare": 0.31, "costPerHour": 4.2, "passed": false,
    "firstFailure": { "block": "db1", "t": 41, "load": 1000 }
  }
}
```

The canvas colors blocks from `ticks`. The tutor and the prediction score read only `events` and `result`.

## Levels

| Level | Status | Scenario | Failure to see | Primer reading |
| --- | --- | --- | --- | --- |
| 1 | Must | One server; steady traffic, then a short spike | A 20-second spike takes far longer than 20 seconds to clear | [Latency vs throughput](https://github.com/donnemartin/system-design-primer#latency-vs-throughput) |
| 2 | Must | One server dies mid-run; add a load balancer and copies | One copy is a single point of failure; surviving a failure needs one spare | [Load balancer](https://github.com/donnemartin/system-design-primer#load-balancer), [Availability patterns](https://github.com/donnemartin/system-design-primer#availability-patterns) |
| 3 | Must | Read-heavy traffic on a small database; cache flush mid-run | The flush sends every read to the database at once | [Cache](https://github.com/donnemartin/system-design-primer#cache) |
| 4 | Should | A burst of writes | Without a queue writes drop; with one, backlog grows until workers catch up | [Asynchronism](https://github.com/donnemartin/system-design-primer#asynchronism) |
| 5 | Stretch | The primer's reference design on a cost budget, hit by a spike and a slow database | Fixing one bottleneck moves it to the next block | [Scaling to millions of users](https://github.com/donnemartin/system-design-primer/blob/master/solutions/system_design/scaling_aws/README.md) |

Level 1 changed from the build plan. "Traffic doubles until it breaks" made the prediction equal to the capacity the learner had typed. A spike that ends gives a number worth guessing.

The primer is by Donne Martin and licensed CC BY 4.0. The app credits it on every level and does not reuse its diagrams.

## Where AI sits

AI never grades, never decides pass or fail, and never produces the fix.

**Critique round.** The learner sees a design labeled as AI-generated with one flaw, clicks the block they think is wrong and says why. The simulator then runs it and shows the failure.

The library is built before the demo: generate designs with the LLM, plant one flaw in each, run each through the simulator, and keep only those where the flaw causes a measurable failure. Three designs are the Must, one per level:

- A single point of failure (Level 2)
- A database too small to survive a cold cache (Level 3)
- Too little headroom to clear a spike inside the latency target (Level 1)

**Tutor.** Templates first: each event type in the log has a written explanation with the run's numbers filled in. The LLM version receives the same events plus the learner's prediction and follows these rules:

- It explains only events that appear in the log.
- It hints in three steps: a question, then the concept, then the specific block.
- It never hands over the finished design.
- If the call fails or is slow, the template answer is shown.

All LLM use goes through one function behind a small serverless endpoint that holds the key, so the provider can change without touching the app.

**Live critique (Should, for the Amazon track).** The Education track does not require AI, so the three pre-built designs are enough there. Amazon asks for AI that plans, acts and adapts, and this loop is the answer:

1. Pick the flaw type from the level where the learner's prediction error was highest.
2. The LLM writes a design with that flaw, as design JSON.
3. The simulator runs it. If the flaw does not cause a measurable failure, the LLM gets the run result and tries again, up to three times.
4. If no attempt passes, a pre-built design of that flaw type is shown.

The learner only ever sees a design the simulator has confirmed. This is about four hours of work and is built before Level 4.

## Screen and demo

| Area | Shows |
| --- | --- |
| Palette (left) | The blocks, each with its cost per hour |
| Canvas (center) | The design; during a run each block colors by load and shows its queue filling |
| Run panel (bottom) | Traffic, latency and errors over time, with shocks marked |
| Side panel (right) | Scenario brief, prediction form, tutor |

Demo, two minutes at most (the handbook's limit):

1. State the problem: students read about scaling but never watch a system fail. This tool makes the primer's scaling path runnable.
2. Level 1: predict the recovery time, run it, watch the server turn red and the queue take 50 seconds to clear.
3. Add a load balancer and copies, predict again, rerun, pass.
4. Level 3: the cache flush fires, the database collapses, and the tutor explains it from the log.
5. Critique round: find the flaw in an AI-generated design, then let the simulator confirm it.
6. Close on the prediction-error chart: first guesses against guesses after the fix.

## Team and timeline

| Workstream | Builds | Done when |
| --- | --- | --- |
| Simulator | Tick engine, shocks, pass targets, prediction scoring, unit tests | The three worked examples pass as tests |
| Canvas | Drag, valid wiring, block settings, live coloring | A drawn design exports the design JSON |
| Levels and critique | Three scenarios with targets, prediction form, three validated flawed designs | Every level is beatable and every planted flaw fails in the simulator |
| Tutor and pitch | Templates, LLM endpoint, error chart, slides, demo script | A failed run is explained using only the log |

With three people, the levels owner also takes the tutor.

| Hour | Gate |
| --- | --- |
| 0 | Public GitHub repository created. Both JSON shapes agreed, one hand-written fixture of each. |
| 7 | Level 1 playable end to end: build, predict, run, score, fix. |
| 12 | Cache, load balancer and shocks in. Levels 1 to 3 match the hand-computed examples. |
| 16 | Critique round with three validated designs. Templated tutor. Prediction-error chart. |
| 20 | Core loop polished. LLM tutor behind the templates. Live critique only if the hour-16 gate was met on time. README written and a first Devpost entry submitted. |
| 22 | Numbers tuned, demo script done, 2-minute video recorded and uploaded. |
| 24 | Rehearsed. Final Devpost entry in before 8 am Sunday. |

The hours count from now and must end before the 8 am Sunday deadline. If fewer than 24 remain, the gates at 16 and 20 move earlier, not the submission.

Tech, to swap freely: TypeScript and React, React Flow for the canvas, a chart library for the run panel, one serverless function for the LLM. The simulator runs in the browser.

If time runs short, cut in this order: Level 4 with the queue block, live critique (the Amazon entry then rests on the tutor and the pre-built designs), the LLM tutor (keep the templates), the critique library down to one design. Never cut the Level 1 loop with its prediction step.

## Risks

| Risk | Mitigation |
| --- | --- |
| The simulator takes the whole day | Shapes fixed at hour 0; three blocks first; tests from the worked examples |
| The model looks too simple | The interface says it teaches intuition and names what it leaves out |
| Canvas wiring bugs | Valid wires only, enforced by the graph library |
| The tutor says something the run did not show | Events-only input, templates as fallback |
| Learners win by adding servers | Cost per hour is a pass target |
| The live demo breaks | Deterministic scenarios and a backup recording |
| Amazon judges find the AI too thin | Live critique, where the LLM's output is tested by the simulator before the learner sees it |
| The submission misses the 8 am deadline | First Devpost entry at hour 20, edited afterwards |
| The "societal need" claim is unsupported | Check the degree-requirement and star-count numbers before they go on a slide; drop any that cannot be sourced |

## Open questions

- [ ] Enter the Amazon track as well as Education? This design assumes yes.
- [ ] Which LLM provider is the key for?
- [ ] Who owns each workstream, and does anyone know React Flow?
- [ ] Has the primer's star count been checked at GitHub on the day?
- [ ] What does Virginia Tech's CS degree require? That count backs the "missing semester" claim.
- [ ] What is the tool called?
