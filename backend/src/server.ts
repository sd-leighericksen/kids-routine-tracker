import 'dotenv/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { db, dbFilePath } from './db.js';
import { runMigrations } from './migrations.js';
import { assignmentsRoutes } from './routes/assignments.js';
import { authRoutes } from './routes/auth.js';
import { blocksRoutes } from './routes/blocks.js';
import { childrenRoutes } from './routes/children.js';
import { giphyRoutes } from './routes/giphy.js';
import { logsRoutes } from './routes/logs.js';
import { reportsRoutes } from './routes/reports.js';
import { startScheduler, stopScheduler } from './scheduler.js';
import { settingsRoutes } from './routes/settings.js';
import { tasksRoutes } from './routes/tasks.js';
import { startTimeSync, stopTimeSync } from './time.js';
import { todayRoutes } from './routes/today.js';
import { uploadsDir, uploadsRoutes } from './routes/uploads.js';

const here = dirname(fileURLToPath(import.meta.url));

const fastify = Fastify({ logger: true });

runMigrations();

await fastify.register(fastifyMultipart, {
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

await fastify.register(fastifyStatic, {
  root: uploadsDir,
  prefix: '/uploads/',
  decorateReply: false,
});

fastify.get('/api/hello', async () => ({ message: 'hello world' }));

await fastify.register(authRoutes);
await fastify.register(settingsRoutes);
await fastify.register(childrenRoutes);
await fastify.register(blocksRoutes);
await fastify.register(tasksRoutes);
await fastify.register(assignmentsRoutes);
await fastify.register(todayRoutes);
await fastify.register(logsRoutes);
await fastify.register(giphyRoutes);
await fastify.register(reportsRoutes);
await fastify.register(uploadsRoutes);

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';

try {
  await fastify.listen({ port, host });
  fastify.log.info({ dbFilePath, uploadsDir }, 'SQLite + uploads ready');
  startTimeSync();
  startScheduler();
  void db;
  void here;
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

const shutdown = async (signal: string) => {
  fastify.log.info({ signal }, 'shutting down');
  stopScheduler();
  stopTimeSync();
  try {
    await fastify.close();
  } finally {
    process.exit(0);
  }
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
