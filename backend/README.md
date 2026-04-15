# Customer Segmentation Backend

NestJS backend foundation for a modular monolith customer segmentation platform.

This stage includes infrastructure and project skeleton only:

- global config module with environment validation
- Prisma runtime module/service (PostgreSQL)
- Redis connection module/service
- RabbitMQ connection abstraction
- health endpoints
- module skeletons for main domains
- Docker Compose stack for local development

## Tech Stack

- NestJS
- PostgreSQL
- Prisma
- Redis
- RabbitMQ
- Docker Compose

## Folder Structure

```text
src/
  common/
    config/
    health/
    logging/
    rabbitmq/
    redis/
  modules/
    customers/
    transactions/
    segments/
    segment-evaluation/
    events/
    simulations/
  prisma/
```

## Prerequisites

- Node.js 20+
- npm 10+
- Docker + Docker Compose

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create local env file:

```bash
cp .env.example .env
```

3. From repository root, start infrastructure services:

```bash
docker compose up -d postgres redis rabbitmq
```

4. Run Prisma migration/generation:

```bash
npm run prisma:generate
npm run prisma:migrate:dev
```

5. Start the API:

```bash
npm run start:dev
```

## Health Endpoints

With default prefix `api`:

- `GET /api/health/live`
- `GET /api/health/ready`

## Docker Compose (Full Stack)

From repository root:

```bash
docker compose up --build
```

This starts:

- `postgres` on `5433` (container `5432`)
- `redis` on `6379`
- `rabbitmq` on `5672` (management UI on `15672`)
- `backend` on `3000`
