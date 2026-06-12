# Open Source + Commercial Direction

Aesthetic Function is released as an **open core system** under Apache-2.0.

The open tools work without us, forever, under Apache 2.0. AF is what happens when you want the loop run continuously and safely.

The goal is to:
- enable experimentation
- allow developers and teams to run AF locally and extend it

## What is Open Source

This repository includes:

- The full **deterministic reconciliation engine**
- The **Watcher / Server / Plugin architecture**
- CLI tooling and local workflows
- Reference adapters (read-only)
- Audit, artifact, and CI capabilities

You can:
- run AF locally
- integrate it into your workflow
- build adapters on top of it
- contribute improvements

---

## What May Evolve

As the project matures, additional capabilities may be offered separately, including:

- enterprise integrations and hosting
- team collaboration features
- advanced policy enforcement and governance
- managed reconciliation pipelines
- deeper AI-assisted workflows

These will **not change the core architecture or invariants** of AF.

---

## Contribution Philosophy

AF is an open system, but it is also a deterministic engine with strict architectural constraints.

To preserve correctness and long-term viability:

- Core reconciliation logic and runtime boundaries are tightly controlled
- Contributions that affect system invariants require discussion
- Adapters, tooling, and ecosystem extensions are strongly encouraged

---

## Why This Model

AF is not just a library. It is a **system and method** for maintaining alignment between code and design over time.

The open core allows:
- transparency
- trust
- experimentation

While a commercial layer enables:
- scalability
- reliability
- long-term support
