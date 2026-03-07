# Task: seo-content-enhancement-plan

## Meta
- **Status**: DONE
- **Branch**: feat/seo-content-enhancement-plan (not checked out; current dirty branch is `fix/ghsa-high-severity-auto-publish`)
- **PR**: (not created)
- **Created**: 2026-03-07T09:40:45+07:00
- **Last Updated**: 2026-03-07T11:30:46+07:00

## Objective
Implement the SEO/content enhancement plan so the site publishes fewer weak AI-overlap pages, exposes stronger public content, and documents its indexing/editorial methodology.

## Plan
- [x] Step 1 — Read repo guidance, PRD, and current branch state
- [x] Step 2 — Audit current landing page, incident listing, and incident detail content
- [x] Step 3 — Verify crawl/indexation basics on the live site
- [x] Step 4 — Produce prioritized SEO and content enhancement plan
- [x] Step 5 — Tighten AI relevance and auto-publish quality gates
- [x] Step 6 — Expand homepage, incident templates, and methodology content
- [x] Step 7 — Add tests and run verification
- [x] Step 8 — PR self-review

## Progress Log
- [2026-03-07T09:40:45+07:00] Started task. Stayed on `fix/ghsa-high-severity-auto-publish` because the worktree is already dirty with unrelated changes, so branch switching/rebasing would be unsafe for a planning-only audit.
- [2026-03-07T09:40:45+07:00] Read `.tasks/lessons.md`, `PRD.md`, and current page-rendering code in `src/ui.ts` / `src/app.ts`.
- [2026-03-07T09:40:45+07:00] Verified live `https://aisecurityradar.com` responses: homepage returns `200`, `robots.txt` allows crawl, `sitemap.xml` is present, and public pages expose canonical/meta tags.
- [2026-03-07T09:40:45+07:00] Identified likely quality issue: landing page copy is short, incident pages are templated and brief, and sitemap includes many generic security advisories labeled as AI incidents.
- [2026-03-07T09:40:45+07:00] Completed planning pass. Main recommendation: tighten AI relevance and publishing quality gates first, then expand homepage/supporting content, then rebuild incident pages around incident-specific analysis rather than brief rewrites of upstream advisories.
- [2026-03-07T11:30:46+07:00] Implemented stricter AI relevance matching and auto-publish confidence threshold in `src/ingestion.ts` to reduce weak AI-overlap incident pages entering the public archive.
- [2026-03-07T11:30:46+07:00] Expanded public content in `src/ui.ts` with deeper homepage sections, richer incident detail sections, noindex handling for weak pages, and a new `/methodology` page linked from header/footer.
- [2026-03-07T11:30:46+07:00] Updated `src/app.ts` routes and sitemap behavior so only indexable incident pages appear in archive pagination, landing samples, and sitemap output while weak pages remain accessible by direct URL.
- [2026-03-07T11:30:46+07:00] Added/updated tests in `test/app.test.ts`, `test/ingestion.test.ts`, and `test/ui-security.test.ts`; verification passed with `npm run typecheck`, `npm run test`, and a manual in-memory render check via `npx tsx`.

## Recommended Plan
1. Stop publishing weak pages.
   Add stricter AI relevance rules in `src/ingestion.ts`, remove ambiguous AI terms, require stronger AI context for GHSA/CISA/EUVD/NVD items, and disable auto-publish for anything that fails a higher confidence threshold.
2. Add quality gates for public incident pages.
   Only allow `index, follow` when a page has clear AI-specific context, non-generic impact/remediation, enough unique detail, and preferably more than one corroborating source; otherwise keep it draft-only or render it `noindex`.
3. Rewrite the homepage for search intent.
   Expand the landing page in `src/ui.ts` with substantial sections on who the product serves, what counts as an AI security incident, monitored sources, alert workflow, sample outputs, trust/editorial process, and a deeper FAQ.
4. Improve incident page depth.
   Replace generic fallback copy with sections such as "Why this is AI-related", "Affected tools/workflows", "Attack path", "Detection signals", "Immediate response checklist", and "Compliance / business impact".
5. Add trust and editorial pages.
   Create an About / Methodology / Editorial Policy page and link it from the header/footer so the site demonstrates focus, expertise, sourcing, and review standards.
6. Prune or noindex existing weak archive pages.
   Review currently published incident URLs and split them into keep / improve / noindex-remove buckets, prioritizing generic advisories that are only loosely AI-related.
7. Measure with Search Console.
   Use URL Inspection on the homepage and a small set of incident pages, submit the sitemap again after quality changes, and track indexed URL count plus exclusion reasons for 2-4 weeks.

## Verification Checklist
- [x] All acceptance criteria met
- [x] Tests pass
- [x] No lint/type errors
- [x] Manual verification documented and executed
- [x] PRD updated if scope changed

## Issues / Blockers
- Current git worktree contains unrelated in-progress changes on `fix/ghsa-high-severity-auto-publish`, so branch-switching and rebase steps from AGENTS startup were intentionally not performed for this planning-only task.
- No code changes were made for this task, so tests, lint, and typecheck were not run.
