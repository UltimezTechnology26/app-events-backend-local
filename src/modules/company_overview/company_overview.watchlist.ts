// modules/company_overview/company_overview.watchlist.ts
//
// Part 3 §7 Phase C step 6. Extracted verbatim from services/company/front_page.ts's overview()
// (the valuation_type===3 branch) — no logic change, just moved.
//
// Kept as its own file rather than folded into REPORT_TYPE_CONFIG: valuation_type===3
// (watchlist) doesn't branch on report_list_type at all — whatever report type the caller
// requests, the response only ever contains total_watchlist_valuation, so it doesn't fit the
// config-map shape the other 14 combinations share. Confirmed an unfinished feature, not the
// intended final scope (Part 1 §3) — full 7-report-type parity is tracked as its own future item
// (Part 3 §9), not built in this phase. This file computes only total_watchlist_valuation,
// matching current behavior exactly.
import type { IncomingHttpHeaders } from 'http'
import { aggregateWatchlistValuation } from './company_overview.queries'

const { checkUserLoginToken } = require('../../../middleware/authorization')

export async function getWatchlistValuation({ headers, searchQuery }: { headers: IncomingHttpHeaders; searchQuery: Record<string, unknown> }) {
  let user_row_id = 0
  const checkUserToken = checkUserLoginToken(headers)
  if (checkUserToken.status) {
    user_row_id = checkUserToken.message
  }

  const get_watchlist_valuation_query = await aggregateWatchlistValuation(user_row_id, searchQuery)

  let total_watchlist_valuation = 0
  if (get_watchlist_valuation_query[0]) {
    total_watchlist_valuation = get_watchlist_valuation_query[0].total_valuation ?? 0
  }
  return { total_watchlist_valuation }
}
