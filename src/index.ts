import { createApp, type EnvBindings } from './app';
import { runIngestionPipeline } from './ingestion';
import { sendIngestionAlerts } from './ingestion-alerts';
import { runScheduledEnrichment } from './ingestion-enrichment';
import { servePublicPage } from './public-cache';
import { runNewsletterJobs } from './newsletter-delivery';

const app = createApp();

export default {
  async fetch(request: Request, env: EnvBindings, ctx: ExecutionContext) {
    const cache = await caches.open('radar-public-v2').catch(() => undefined);
    if (!cache) return app.fetch(request, env, ctx);
    return servePublicPage(request, async () => app.fetch(request, env, ctx), cache,
      (promise) => ctx.waitUntil(promise));
  },
  async scheduled(controller: ScheduledController, env: EnvBindings, ctx: Pick<ExecutionContext, 'waitUntil'>) {
    if (controller.cron === '*/5 * * * *') {
      ctx.waitUntil(runNewsletterJobs(env));
      return;
    }
    if (controller.cron === '15 * * * *') {
      ctx.waitUntil(runScheduledEnrichment(env));
      return;
    }
    ctx.waitUntil(runIngestionPipeline(env, fetch, { mode: 'cron', runId: `cron-${Date.now()}` })
      .then(() => sendIngestionAlerts(env)));
  },
};
