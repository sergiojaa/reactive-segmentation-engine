# Customer Segmentation Engine (Backend)

This backend is a modular monolith (NestJS) for **dynamic and static customer segments**.
It persists segment membership + delta history, batches dynamic recomputation with debounce, and includes a demo-friendly delta stream and controllable simulation time.

The goal is practical, interview-friendly behavior: keep the pipeline explicit and easy to explain.

## Task Summary (Practical)

Whenever you write data (create/update customer, create transaction, advance simulation time):

1. We record a `DataChangeEvent` in Postgres.
2. A recalculation worker (using Redis-based debounce) batches those events.
3. The worker evaluates **all dynamic segments** and persists membership + deltas.
4. If a membership delta occurred, we emit a "segment delta signal" (in-process) so the demo UI can react.

When you want something deterministic for a demo:

- You can **force direct evaluation** for a single dynamic segment.
- You can **manually refresh a static segment** (static segments are intentionally protected from auto recomputation).

## Tech Stack

- NestJS
- PostgreSQL (Prisma)
- Redis
- RabbitMQ (connection abstraction exists; not used for delta publishing in this phase to keep the demo simple and observable)
- Docker Compose

Note: delta signals are published in-process (SSE + recent buffer) so an interviewer can instantly observe results without waiting for an external broker consumer.

## Project Structure (Modular Monolith)

```text
src/
  common/
    config/            env validation
    health/           liveness/readiness
    logging/          http request logging
    redis/            redis client + service wrapper
    rabbitmq/         rabbitmq client + service wrapper
  modules/
    customers/        write APIs + customer change events
    transactions/     write API + transaction change events
    segments/         segment CRUD + dependency extraction
    segment-evaluation/
      - SegmentEvaluationService
      - SegmentRecalculationProcessorService (batch/debounce worker)
      - snapshot/delta endpoints
    events/           DataChangeEvent recording
    simulations/      simulation clock + simulate endpoints
    segment-delta-signals/
      - SSE stream + in-memory recent buffer
      - background consumer (demo logs)
```

API is mounted under the `api` prefix.

## Architecture Decisions

### 1. Layered NestJS + explicit services

The code is organized by domain module, with controllers calling services directly. Key pipeline steps are isolated in dedicated services:

- `EventsService`: records `DataChangeEvent` rows
- `SegmentRecalculationProcessorService`: debounced batching worker
- `SegmentEvaluationService`: evaluates segments + writes membership/deltas
- `SegmentDeltaSignalBridgeService`: emits delta signals (demo)

### 2. Membership is persisted; "deltas" are persisted and signaled

We persist:

- `segment_membership` (current membership state per segment/customer)
- `segment_membership_deltas` (history of changes per evaluation run)
- `segment_evaluation_runs` (audit of evaluations)

And we also emit an in-process delta signal:

- `GET /api/events/segment-deltas/stream` (SSE)
- `GET /api/events/segment-deltas/recent` (in-memory buffer for quick demo)

### 3. Dynamic evaluation uses direct rule types

For clarity, dynamic segments use a compact `definitionJson` with a `ruleType` and numeric parameters. Direct dynamic evaluation supports these rule types:

- `ACTIVE_BUYERS`
- `VIP_CUSTOMERS`
- `RISK_GROUP`

If a dynamic segment declares dependencies (via the `segment_dependencies` relation), those dependencies act both as **cascade triggers** and as **filters**: after evaluating the base rule, only customers that are ACTIVE members of all dependent segments are kept.

## Tradeoffs & Simplifications (Call these out in an interview)

1. Batch worker evaluates **all dynamic segments** for each batch. Tradeoff: simpler to reason about and easy to demo; cost: less efficient than fully incremental recomputation.
2. Segment delta "signals" are in-process. Tradeoff: easiest demo (SSE + recent buffer) without wiring infrastructure messaging.
3. Dependency cascade re-evaluates dependent segments when membership changes. Tradeoff: keeps logic explicit and interviewable; avoids complicated diff routing.
4. Static segments are protected by design (manual refresh only). Tradeoff: predictable for demos; avoids surprise recomputation of "frozen" lists.

## Batch / Debounce (How Recalculation Works)

Dynamic segment recomputation is triggered indirectly:

1. A write API records a `DataChangeEvent` row with status `PENDING`.
2. After recording, we call `SegmentRecalculationProcessorService.notifyDataChangeRecorded()`.
3. That function schedules a future run in Redis using a single key:
   - `segment-recalc:next-run-at-ms`
   - with a time window (`RECALC_DEBOUNCE_WINDOW_MS`, default `3000ms`)
4. A timer loop runs every `RECALC_POLL_INTERVAL_MS` (default `1500ms`):
   - it checks whether `Date.now()` is past the scheduled run time
   - it acquires a Redis lock to prevent concurrent workers
5. When due, the worker:
   - pulls up to `RECALC_EVENT_CHUNK_SIZE` pending `DataChangeEvent` rows (default `1000`)
   - evaluates dynamic segments in chunks of `RECALC_SEGMENT_CHUNK_SIZE` (default `20`)
   - persists membership + deltas
   - marks processed events as `PROCESSED`
   - if the chunk was full, it schedules another run immediately

If Redis is unavailable, it falls back to an in-memory "next run at" timestamp.

## Cascading Recalculation (Dependent Segments)

Dependencies are stored in `segment_dependencies` based on what's referenced inside the segment `rules` JSON.

The cascade happens inside `SegmentEvaluationService`:

1. After a segment evaluation finishes, we compare membership before/after.
2. If membership changed, we look up dependent segments from `segment_dependencies` and cascade only into **dynamic dependents**.
3. For each dependent we run a direct evaluation with `triggerType = DEPENDENCY_CHANGE` and we keep `visitedSegmentIds` to avoid cycles.

This means you can demonstrate dependency behavior clearly by:

- forcing direct evaluation on the "parent" dynamic segment
- then showing the dependent segment membership updates immediately

## Static Segment Protection (Manual Refresh Only)

Static segments are intentionally excluded from the auto recomputation pipeline:

- The batch worker (`SegmentRecalculationProcessorService`) fetches only `SegmentType.DYNAMIC`.
- Direct dynamic evaluation explicitly rejects static segments.
- The only way to update static membership is the manual endpoint `POST /api/segment-evaluation/:id/refresh-static`.

So in a demo, static segment membership can stay empty (or stale) until you manually refresh it.

## Simulation (Controllable Time)

Time control is done via a single `SimulationClock` row (`key = global`).

1. `GET effectiveNow` returns `simulationClock.currentTime` if the clock exists, otherwise it falls back to `new Date()`.
2. `POST /api/simulations/time/advance`:
   - advances `SimulationClock.currentTime`
   - records a `DataChangeEvent` with `source = simulation.clock.advance`
   - which triggers the same debounced recalculation pipeline as other writes
3. `POST /api/simulations/transactions`:
   - creates a transaction using simulation time by default
   - so lookback/inactivity calculations stay consistent with what you show in the demo

## Local Run (Delivery Setup)

### Prerequisites

- Node.js 20+
- npm 10+
- Docker + Docker Compose

### Start dependencies

From repo root:

```bash
docker compose up -d postgres redis rabbitmq
```

### Backend setup (host)

From `backend/`:

```bash
npm install
cp .env.example .env
```

Then run:

```bash
npm run prisma:generate
npm run prisma:migrate:dev
npm run start:dev
```

API:

- `http://localhost:3000/api`
- Swagger docs: `http://localhost:3000/api/docs`

### Full stack (including backend in Docker)

From repo root:

```bash
docker compose up --build
```

Ports:

- Postgres: `5433` (container `5432`)
- Redis: `6379`
- RabbitMQ: `5672` (+ management UI on `15672`)
- Backend: `3000`

## API / Demo Notes (What to Use in an Interview)

Health:

- `GET /api/health/live`
- `GET /api/health/ready`

Segment CRUD:

- `POST /api/segments`
- `GET /api/segments`
- `PATCH /api/segments/:id`
- `DELETE /api/segments/:id`

Customer writes:

- `POST /api/customers`
- `PATCH /api/customers/:id`

Transaction write (demo-friendly because it uses simulation time):

- `POST /api/simulations/transactions`

Simulation time:

- `POST /api/simulations/time/advance`

Forcing evaluation and inspection:

- `POST /api/segment-evaluation/:id/evaluate` (dynamic segments only)
- `POST /api/segment-evaluation/:id/refresh-static` (static segments only)
- `GET /api/segment-evaluation/:id/membership` (current membership)
- `GET /api/segment-evaluation/:id/deltas?limit=20` (delta history)

Delta signals (for live "something changed"):

- `GET /api/events/segment-deltas/recent?limit=20` (quick demo)
- `GET /api/events/segment-deltas/stream` (SSE; open in browser)

Important demo detail:

- `SegmentDeltaSignalBridgeService` keeps only the most recent signals in memory (default cap `50`).
- For correctness history, always use `GET /api/segment-evaluation/:id/deltas`.

## Mermaid Diagrams

### Components Overview

At a high level, the system is split into:

- **HTTP/API layer**
  - `SegmentsController` for segment CRUD.
  - `CustomersController` for customer write APIs.
  - `TransactionsController` for transaction writes.
  - `SimulationsController` for simulation time and simulated transactions.
  - `SegmentEvaluationController` for forcing evaluations and inspecting membership/deltas.
  - `SegmentDeltaSignalsController` for exposing delta signals over SSE and a recent buffer.
- **Core pipeline**
  - `EventsService` records `DataChangeEvent` rows in Postgres.
  - `SegmentRecalculationProcessorService` is the Redis-backed batch/debounce worker.
  - `SegmentEvaluationService` evaluates segments and persists membership + delta history to Postgres (via Prisma).
  - Redis is used for debounce scheduling and worker locking.
- **Demo signal layer**
  - `SegmentDeltaSignalBridgeService` is an in-process pub/sub bridge that turns evaluation deltas into demo-friendly signals.
  - `SegmentDeltaBackgroundConsumer` consumes those signals for background/demo logging.

The main data flow is:

- API controllers receive HTTP requests.
- Write APIs call `EventsService` or Prisma directly (for pure CRUD).
- `EventsService` persists `DataChangeEvent` rows to Postgres.
- The batch worker (`SegmentRecalculationProcessorService`) uses Redis to coordinate when to run and to avoid concurrent workers.
- When a run executes, `SegmentEvaluationService` reads from Postgres, evaluates segments, writes updated membership/deltas, and then hands off to `SegmentDeltaSignalBridgeService`.
- The bridge exposes recent deltas via the SSE stream and recent-buffer endpoints and also feeds the background consumer.

### Signal Flow (Membership Delta Emission)

The membership delta signal pipeline works as follows:

1. **Write APIs** (customer updates, transactions, simulation time changes) are called.
2. These APIs record a `DataChangeEvent` with status `PENDING` via `EventsService` and schedule a debounced recalculation.
3. `DataChangeEvent` rows are stored in **Postgres**.
4. The recalculation worker (or a direct evaluation endpoint) picks up pending events and invokes `SegmentEvaluationService`.
5. `SegmentEvaluationService`:
   - Computes membership diffs for all relevant segments.
   - Persists updated membership and delta rows back to Postgres.
6. For each change in membership, `SegmentEvaluationService` notifies `SegmentDeltaSignalBridgeService`.
7. The bridge:
   - Pushes events into an in-memory recent buffer exposed at `GET /api/events/segment-deltas/recent`.
   - Streams live updates over SSE at `GET /api/events/segment-deltas/stream`.

This gives you both a **correctness trail** (via persisted deltas) and a **live signal surface** (via SSE/recent endpoints) for interviews and demos.

### Batch / Debounce / Recalculation Flow

The batch/ debounce worker behaves like a simple scheduled job:

1. A **write API call** creates a `DataChangeEvent` row with status `PENDING`.
2. After inserting the event, the code calls `notifyDataChangeRecorded()`.
3. `notifyDataChangeRecorded()` sets a Redis key (for example `segment-recalc:next-run-at-ms`) to `now + debounceWindow`.
4. A background **worker tick loop** runs every `RECALC_POLL_INTERVAL_MS` and:
   - Reads the `next-run-at` value from Redis.
   - Checks whether the current time is past that value.
5. If it is **not yet due**, the worker simply waits for the next tick.
6. If it **is due**, the worker:
   - Acquires a Redis lock to ensure only one worker runs at a time.
   - Fetches a chunk of `PENDING` `DataChangeEvent` rows (up to `eventChunkSize`).
   - Evaluates all dynamic segments, in chunks of `segmentChunkSize`, using `SegmentEvaluationService`.
   - Persists updated membership and delta rows.
   - Marks the processed events as `PROCESSED`.
7. If the event chunk was full (indicating more work remains), the worker schedules another run immediately; otherwise, it waits for future writes and debounce scheduling.

This keeps the **public write APIs fast**, while giving you a clear, interview-friendly explanation of how debounced, batched recomputation happens in the background.

## Exact Interview Demo Flow (Step-by-Step)

This flow is designed so you can show, in order:

- Active buyers
- VIP customers
- Risk group
- Dependent segment updates (cascade)
- Static segment manual refresh

### Assumptions for the demo setup

- Use the simulation-aware transaction endpoint so lookback/inactivity calculations match what you show.
- Use the "forced evaluation" endpoints for deterministic demo timing.

### Step 0: Start the backend + open Swagger

1. Start dependencies:

   ```bash
   docker compose up -d postgres redis rabbitmq
   ```

2. Start backend (in `backend/`):

   ```bash
   npm run start:dev
   ```

3. Open:

   - `http://localhost:3000/api/docs`

### Step 1: Create customers

Create 3 customers and capture their ids as `ANN_ID`, `BEN_ID`, `CARA_ID`.

Example:

```bash
curl -s -X POST http://localhost:3000/api/customers \
  -H 'Content-Type: application/json' \
  -d '{ "externalId":"ann_001", "email":"ann@example.com", "firstName":"Ann", "lastName":"A" }'
```

Repeat for `Ben` and `Cara`.

### Step 2: Create dynamic segments (Active buyers, VIP customers, Risk group)

Create:

1. `ACTIVE_BUYERS` segment (capture id as `ACTIVE_BUYERS_ID`)
2. `VIP_CUSTOMERS` segment (capture id as `VIP_CUSTOMERS_ID`)
3. `RISK_GROUP` segment (capture id as `RISK_GROUP_ID`)

Payload for `ACTIVE_BUYERS_ID`:

```json
{
  "name": "Active buyers",
  "type": "DYNAMIC",
  "status": "ACTIVE",
  "rules": {
    "ruleType": "ACTIVE_BUYERS",
    "lookbackDays": 3,
    "minTransactions": 2
  }
}
```

Payload for `VIP_CUSTOMERS_ID`:

```json
{
  "name": "VIP customers",
  "type": "DYNAMIC",
  "status": "ACTIVE",
  "rules": {
    "ruleType": "VIP_CUSTOMERS",
    "lookbackDays": 3,
    "minTotalAmount": 1000
  }
}
```

Payload for `RISK_GROUP_ID`:

```json
{
  "name": "Risk group",
  "type": "DYNAMIC",
  "status": "ACTIVE",
  "rules": {
    "ruleType": "RISK_GROUP",
    "inactivityDays": 5
  }
}
```

### Step 3: Create dependent segment (cascade demo)

Create a dependent segment that uses the VIP rule, but includes a `segmentId` reference to the Active buyers segment so the dependency graph knows the relationship.

Capture its id as `DEPENDENT_VIP_ID`.

Payload:

```json
{
  "name": "VIP (depends on Active buyers)",
  "type": "DYNAMIC",
  "status": "ACTIVE",
  "rules": {
    "ruleType": "VIP_CUSTOMERS",
    "lookbackDays": 3,
    "minTotalAmount": 1000,
    "segmentId": "<ACTIVE_BUYERS_ID>"
  }
}
```

### Step 4: Create static segment (manual refresh demo)

Create a static segment and capture its id as `STATIC_ID`.

Payload:

```json
{
  "name": "Static list (manual)",
  "type": "STATIC",
  "status": "ACTIVE",
  "rules": {
    "customerIds": ["<ANN_ID>", "<BEN_ID>"]
  }
}
```

Demo check (should be empty before manual refresh):

1. `GET /api/segment-evaluation/<STATIC_ID>/membership`
2. You should see `activeCount: 0` and `customerIds: []` because static segments are not auto recomputed.

### Step 5: Advance simulation time once (recommended for deterministic behavior)

1. Call:

   `POST /api/simulations/time/advance`

2. Payload:

```json
{ "seconds": 86400, "reason": "Demo baseline" }
```

### Step 6: Seed transactions (setup: define who qualifies)

Create transactions using simulation time endpoint `POST /api/simulations/transactions`.

Important: omit `occurredAt` so the endpoint uses the current simulation clock time.

Initial transaction set:

1. Ann: 2 transactions (so she is an Active buyer)
2. Cara: 2 transactions (so she is an Active buyer, but keep her total below VIP threshold)
3. Ben: 1 transaction (so she is not yet an Active buyer, and not VIP)

Transactions:

Ann #1:

```json
{ "customerId":"<ANN_ID>", "type":"PURCHASE", "amount":"600.00", "currency":"USD" }
```

Ann #2:

```json
{ "customerId":"<ANN_ID>", "type":"PURCHASE", "amount":"600.00", "currency":"USD" }
```

Ben #1:

```json
{ "customerId":"<BEN_ID>", "type":"PURCHASE", "amount":"200.00", "currency":"USD" }
```

Cara #1:

```json
{ "customerId":"<CARA_ID>", "type":"PURCHASE", "amount":"100.00", "currency":"USD" }
```

Cara #2:

```json
{ "customerId":"<CARA_ID>", "type":"PURCHASE", "amount":"200.00", "currency":"USD" }
```

### Step 7: Force initial evaluation (show current state)

Evaluate the three main dynamic segments:

1. `POST /api/segment-evaluation/<ACTIVE_BUYERS_ID>/evaluate`
2. `POST /api/segment-evaluation/<VIP_CUSTOMERS_ID>/evaluate`
3. `POST /api/segment-evaluation/<RISK_GROUP_ID>/evaluate`

Then show:

- Active buyers: `GET /api/segment-evaluation/<ACTIVE_BUYERS_ID>/membership` (expected: `Ann` and `Cara`)
- VIP customers: `GET /api/segment-evaluation/<VIP_CUSTOMERS_ID>/membership` (expected: `Ann` only)
- Risk group: `GET /api/segment-evaluation/<RISK_GROUP_ID>/membership` (expected: typically empty right after recent activity)

Optional "live" confirmation:

- `GET /api/events/segment-deltas/recent?limit=20`

### Step 8: Trigger cascade (dependent segment updates)

Add Ben's second transaction so Ben:

He becomes an Active buyer (now has 2 transactions in lookback window) and VIP (now total spend exceeds `minTotalAmount`).

Ben #2:

```json
{ "customerId":"<BEN_ID>", "type":"PURCHASE", "amount":"900.00", "currency":"USD" }
```

Immediately force evaluation of the ACTIVE BUYERS parent segment:

- `POST /api/segment-evaluation/<ACTIVE_BUYERS_ID>/evaluate`

Now show that the dependent segment updated via cascade:

- `GET /api/segment-evaluation/<DEPENDENT_VIP_ID>/membership` (expected: `Ann` and `Ben`)

Also show the base VIP segment (so VIP is explained directly too):

- `POST /api/segment-evaluation/<VIP_CUSTOMERS_ID>/evaluate`
- `GET /api/segment-evaluation/<VIP_CUSTOMERS_ID>/membership` (expected: `Ann` and `Ben`)

Optional live confirmation:

- `GET /api/events/segment-deltas/recent?limit=20`

### Step 9: Advance time (show Risk group)

Advance simulation time past inactivity window:

1. Call:
   - `POST /api/simulations/time/advance`
2. Payload:

```json
{ "seconds": 518400, "reason": "Trigger inactivity demo" }
```

`518400` is `(inactivityDays + 1) * 86400` for `inactivityDays = 5`.

Now to keep Ann out of Risk:

- create one new transaction for Ann at the new simulation time:

```json
{ "customerId":"<ANN_ID>", "type":"PURCHASE", "amount":"150.00", "currency":"USD" }
```

Then force evaluation:

1. `POST /api/segment-evaluation/<RISK_GROUP_ID>/evaluate`
2. `GET /api/segment-evaluation/<RISK_GROUP_ID>/membership`

Expected:

- Risk group includes customers without recent activity: `Ben` and `Cara`
- Risk group excludes `Ann` because she just got a recent transaction

### Step 10: Manual refresh (static segment protection demo)

Before refresh:

- `GET /api/segment-evaluation/<STATIC_ID>/membership` (expected: still `activeCount: 0`)

Manual refresh:

- `POST /api/segment-evaluation/<STATIC_ID>/refresh-static`

After refresh:

- `GET /api/segment-evaluation/<STATIC_ID>/membership` (expected: `Ann` and `Ben`)

Optional:

- `GET /api/segment-evaluation/<STATIC_ID>/deltas?limit=20`

