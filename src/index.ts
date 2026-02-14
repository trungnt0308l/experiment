import { createApp, type EnvBindings } from './app';
import { resolveScheduledSources, runIngestionPipeline } from './ingestion';

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: EnvBindings, ctx: ExecutionContext) {
    const splitEnabled = (env.CRON_SOURCE_SPLIT_ENABLED ?? 'true').toLowerCase() === 'true';
    const enableHn = (env.ENABLE_HN_SOURCE ?? 'true').toLowerCase() === 'true';
    const sourceAllowlist = resolveScheduledSources(controller.scheduledTime, splitEnabled, enableHn);
    ctx.waitUntil(runIngestionPipeline(env, fetch, { sourceAllowlist }));
  },
};
