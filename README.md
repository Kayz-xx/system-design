# System Design Sandbox

Learn to see the system inside a business. Start with a coffee shop.

Forward deployed engineers walk into a business, learn how it runs and design the system it needs. New engineers rarely get to practise that. In each level you run a coffee shop through a real problem: a morning rush, a barista off sick, the grab-and-go fridge selling out. You guess what will go wrong, watch it happen and fix it. Then the same diagram turns into software, with the same numbers, and you do it again.

- **Predict first.** You commit to a guess before every run.
- **A simulator decides.** It is deterministic and unit-tested; pass and fail never come from an AI.
- **AI explains and attacks.** A tutor explains what the run log shows, and a chaos agent tries to break a design that passed. The simulator checks every attack.

Levels follow the scaling path of the [System Design Primer](https://github.com/donnemartin/system-design-primer) by Donne Martin (CC BY 4.0).

## Run

```
npm run dev     # http://localhost:5173
npm test
```

No install step and no build. Node 20 or newer for the tests, plus Python 3 for the dev server (or any static server).

## Layout

| Path | What it is |
| --- | --- |
| `src/sim/` | The simulator: `simulate(design, scenario)` returns a per-tick run log |
| `src/levels/` | Levels, each with a coffee shop scene and a software scene |
| `src/ui/` | The interface: board, moving dots, charts and coach column |
| `api/` | Serverless functions for the Gemini tutor and chaos agent |
| `docs/SPEC.md` | The design and its decisions |
| `docs/contracts.md` | Data shapes every part agrees on |
| `docs/backlog.md` | Open work by workstream |

Contributing, including with coding agents: see `AGENTS.md`.

Built at HackPrinceton, November 2026.
