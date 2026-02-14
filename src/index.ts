import { createApp, type EnvBindings } from './app';
import { runIngestionPipeline } from './ingestion';

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: EnvBindings, ctx: ExecutionContext) {
    ctx.waitUntil(runIngestionPipeline(env));
  },
};
