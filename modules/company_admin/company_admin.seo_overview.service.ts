// modules/company_admin/company_admin.seo_overview.service.ts
const seo_change_logsM = require('../../models/seo_change_logsM')
const company_seo_detailsM = require('../../models/app/company/company_seo_detailsM')
const seo_static_urlsM = require('../../models/seo_static_urlsM')
import {
  buildRecentSeoChangesPipeline,
  buildCompanySeoStatsPipeline,
  buildStaticUrlSeoStatsPipeline,
  buildStaticUrlsPipeline,
  extractFacetCount,
} from './company_admin.seo_overview.queries'

/**
 * Ports company.js's GET /seo_overview (Part 3 §7 Phase H step 7) — the admin dashboard's SEO
 * health widget (recent changes, title-length issues, heading-structure issues, across both
 * companies and static app URLs). See company_admin.seo_overview.queries.ts's
 * buildCompanySeoStatsPipeline for the confirmed ReferenceError crash fix
 * (`company_other_detailsM` → `company_seo_detailsM`).
 */
export async function getSeoOverview() {
  const [recentChanges, companyStats, staticStats, staticUrls] = await Promise.all([
    seo_change_logsM.aggregate(buildRecentSeoChangesPipeline()),
    company_seo_detailsM.aggregate(buildCompanySeoStatsPipeline()),
    seo_static_urlsM.aggregate(buildStaticUrlSeoStatsPipeline()),
    seo_static_urlsM.aggregate(buildStaticUrlsPipeline()),
  ])

  const sum = (key: string) => extractFacetCount(companyStats, key) + extractFacetCount(staticStats, key)

  return {
    recent_changes: recentChanges,
    static_urls: staticUrls,
    total_urls: sum('total'),
    h1_missing: sum('h1_missing'),
    h2_missing: sum('h2_missing'),
    multiple_h1: sum('h1_multi'),
    bad_heading_sequence: sum('bad_seq'),
    title_length_issues: {
      title_above_60_to_70: sum('title_warn'),
      title_above_70: sum('title_err'),
    },
  }
}
