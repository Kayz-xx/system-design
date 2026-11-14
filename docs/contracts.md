# Contracts

The shapes every part of the app agrees on. Change one only in a PR titled `contracts: …`, and update the code and tests on both sides in the same PR.

## Design

What the board edits and the simulator reads. Positions (`x`, `y`) are for the board only.

```json
{
  "traffic": { "x": 30, "y": 150 },
  "blocks": [
    { "id": "lb1", "type": "loadBalancer", "names": { "cafe": "Shared line", "software": "Load balancer" }, "x": 260, "y": 150 },
    { "id": "s1", "type": "server", "names": { "cafe": "Baristas", "software": "App servers" }, "capacity": 100, "copies": 3, "queueLimit": 200, "x": 500, "y": 150 },
    { "id": "c1", "type": "cache", "names": { "cafe": "Fridge", "software": "Cache" }, "size": "medium", "x": 460, "y": 50 },
    { "id": "db1", "type": "database", "names": { "cafe": "Espresso machine", "software": "Database" }, "readCapacity": 300, "writeCapacity": 100, "replicas": 0, "queueLimit": 2000, "x": 690, "y": 210 }
  ],
  "wires": [["traffic", "lb1"], ["lb1", "s1"]]
}
```

| Type | Fields | Units (software) |
| --- | --- | --- |
| `server` | `capacity`, `copies`, `queueLimit` | requests per second per copy; count; requests |
| `loadBalancer` | none | |
| `cache` | `size`: `small`, `medium` or `large` (80%, 90%, 95% hit rate) | |
| `database` | `readCapacity`, `writeCapacity`, `replicas`, `queueLimit` | requests per second; count (adds read capacity only); requests per side |

The UI stores `names` per world. `simDesign()` in `src/ui/state.js` adds the single `name` the simulator uses in its messages.

Allowed wires (enforced by `canWire()`): traffic → load balancer or server; load balancer → server; server → cache or database; cache → database.

## Scenario

```json
{
  "duration": 150,
  "base": { "reads": 60, "writes": 0 },
  "spike": { "t": 30, "dur": 20, "reads": 200, "writes": 0 },
  "serverFail": { "t": 40, "dur": 60 },
  "cacheFlush": { "t": 40, "warm": 30 },
  "latencyTargetMs": 200,
  "targets": { "errorRate": 0.01, "slowShare": 0.05, "cost": 0.25 }
}
```

`spike`, `serverFail` and `cacheFlush` are optional shocks. One tick is one second in software and one minute in the coffee shop. `cost` is in software dollars per hour; the coffee shop shows it × 200.

## Run log

`simulate(design, scenario)` returns:

```json
{
  "ticks": [
    { "t": 41, "traffic": { "reads": 1000, "writes": 0 }, "dropped": 0, "latencyMs": 2350, "queue": 700,
      "blocks": { "db1": { "load": 1000, "readLoad": 1000, "capacity": 400, "ratio": 3.33, "queue": 700, "dropped": 0, "latencyMs": 2343 } } }
  ],
  "events": [
    { "t": 40, "type": "shock", "shock": "cacheFlush", "block": "c1" },
    { "t": 40, "type": "saturated", "block": "db1", "side": "reads", "load": 1000, "capacity": 300 },
    { "t": 43, "type": "dropping", "block": "db1", "limit": 2000 },
    { "t": 75, "type": "recovered", "block": "db1" }
  ],
  "metrics": { "recoverySeconds": null, "peakErrorRate": 4.2, "dbReadLoadAfterFlush": 1000 },
  "result": {
    "errorRate": 0.031, "slowShare": 0.12, "costPerHour": 1.7, "passed": false,
    "checks": { "errors": false, "slow": false, "cost": true },
    "firstFailure": { "block": "db1", "t": 40, "load": 1000 }
  }
}
```

Event types: `shock` (`spike`, `spikeEnd`, `serverFail`, `serverBack`, `cacheFlush`), `down`, `saturated`, `dropping`, `recovered`.

## Level

See `src/levels/levels.js`. Each level has `id`, `n`, `name`, `concept`, `reading`, `translate` (coffee shop → software pairs), one starting `design`, and `scenes.cafe` and `scenes.software`, each with `title`, `brief`, `goal`, `predict` (`key` into `metrics`, `scale`, `question`, `unit`), three `hints` (question, idea, where to look) and a `scenario`.

## AI endpoints (to build)

Both are serverless functions under `api/` that hold `OPENAI_API_KEY`. The client must work when they fail or time out.

### `POST /api/tutor`

Request:

```json
{ "world": "cafe", "level": "l1", "design": {}, "scenario": {}, "events": [], "result": {}, "prediction": { "block": "s1", "value": 20, "actual": 50 }, "hintStep": 1 }
```

Response: `{ "text": "…", "step": 1 }`. The server ignores the client's `events` and reruns `simulate()` on the cleaned design, so the text may mention only events in that log; the reply is checked before it is returned. Errors: 400 bad request, 503 no key, 502 OpenAI failed or the reply failed the check, 504 timeout. The client gives up after 4 s. Hint steps: 1 asks a question, 2 names the concept, 3 points at a block. It never gives the finished design. On any failure the client shows the level's template hint instead.

### `POST /api/chaos/plan`

The chaos agent attacks a design that passed.

Request:

```json
{ "world": "cafe", "design": {}, "scenario": {}, "budget": { "shocks": 2, "maxSpikeMultiplier": 3 }, "previousAttempts": [ { "attack": {}, "result": {} } ] }
```

Response:

```json
{ "attack": { "spike": { "t": 50, "dur": 15, "reads": 180, "writes": 0 }, "serverFail": { "t": 55, "dur": 30 } },
  "story": "A tour bus pulls up outside. Then a barista burns their hand and goes home.",
  "facts": "From 8:20, 3.6 customers a minute arrive for 15 minutes. At 8:25, one of the Baristas is out for 30 minutes.",
  "source": "ai" }
```

`source` is `ai` (the model picked and told it), `ai-pick` (the model picked; its story failed the check, so a template story is used) or `search` (no model; the mildest attack the search found). `facts` states the attack from its numbers; show it next to `story`, which never contains numbers. When no attack within the budget breaks the design, the response is `{ "attack": null, "story": null, "survived": true }`.

The attack's numbers come from a deterministic search (`src/ai/attacks.js`) over shocks within the budget, never from the model. An attack "breaks" a design when the error or slow check fails; the cost check is not counted.

`attack` is merged into the scenario's shocks. The client runs `simulate()` with it. If the design still passes, it sends the result back as a previous attempt, up to five attempts. Only an attack the simulator confirms is shown to the learner.
