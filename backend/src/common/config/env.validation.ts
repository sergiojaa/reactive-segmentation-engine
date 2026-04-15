import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().integer().min(0).default(0),
  RECALC_POLL_INTERVAL_MS: Joi.number().integer().positive().default(1500),
  RECALC_DEBOUNCE_WINDOW_MS: Joi.number().integer().positive().default(3000),
  RECALC_EVENT_CHUNK_SIZE: Joi.number().integer().positive().default(1000),
  RECALC_SEGMENT_CHUNK_SIZE: Joi.number().integer().positive().default(20),
  RECALC_LOCK_TTL_MS: Joi.number().integer().positive().default(30000),
  RABBITMQ_URL: Joi.string()
    .uri({ scheme: ['amqp', 'amqps'] })
    .default('amqp://guest:guest@localhost:5672'),
});
