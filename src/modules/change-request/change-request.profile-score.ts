import logger from '../../../config/logger'
import { AUDIT_MODULE_COMPANY, AUDIT_MODULE_EVENTS, AUDIT_MODULE_PROFESSIONALS } from '../../common/status-audit/status-audit.registry'
import {
  SECTION_SEO,
  SECTION_SOCIAL_MEDIA,
  SECTION_FAQ,
  SECTION_HOLDING_CRYPTO,
  SECTION_OWNED_PRODUCTS,
  SECTION_REVENUE,
  SECTION_INVESTMENT,
  SECTION_TEAM_MEMBERS,
  SECTION_JOBS,
  SECTION_FUNDING_ROUND,
  SECTION_PROFESSIONAL_SEO,
  SECTION_PROFESSIONAL_SOCIAL_MEDIA,
  SECTION_PROFESSIONAL_DETAILS,
  SECTION_PROFESSIONAL_INVESTMENT,
  SECTION_PROFESSIONAL_AWARDS,
  SECTION_PROFESSIONAL_FAQ,
  SECTION_EVENT_BASIC_DETAILS,
  SECTION_EVENT_SEO,
  SECTION_EVENT_TICKET,
  SECTION_EVENT_COUPON,
  SECTION_EVENT_FAQ,
  SECTION_EVENT_CONTACT,
  SECTION_EVENT_SPEAKER,
  SECTION_EVENT_SPONSOR_PARTNER,
  SECTION_EVENT_ATTENDEE,
} from './change-request.registry'

// Which score parts each section feeds, per module - the same keys the owner's own direct-write routes pass to
// calculateCompanyProfileScore / calculateUserProfileScore / calculateEventScore (utils/helpers/app_helper.js).
// Basic Details (Company and Professional) is deliberately absent: their own side-effect functions
// already recalculate it. Sections with no score part (Acquisitions, Event Settings) are absent too.
const COMPANY_SCORE_KEYS: Record<string, string[]> = {
  [SECTION_SEO]: ['basic'],
  [SECTION_SOCIAL_MEDIA]: ['social_media'],
  [SECTION_FAQ]: ['faq'],
  [SECTION_HOLDING_CRYPTO]: ['holding_crypto'],
  [SECTION_OWNED_PRODUCTS]: ['owned_product'],
  [SECTION_REVENUE]: ['revenue'],
  [SECTION_INVESTMENT]: ['investment', 'funding'],
  [SECTION_TEAM_MEMBERS]: ['team_detail'],
  [SECTION_JOBS]: ['job_opening'],
  [SECTION_FUNDING_ROUND]: ['funding', 'investment'],
}

const PROFESSIONAL_SCORE_KEYS: Record<string, string[]> = {
  [SECTION_PROFESSIONAL_SEO]: ['professional_profile'],
  [SECTION_PROFESSIONAL_SOCIAL_MEDIA]: ['social_media'],
  [SECTION_PROFESSIONAL_DETAILS]: ['professional_detail'],
  [SECTION_PROFESSIONAL_INVESTMENT]: ['investment', 'funding'],
  [SECTION_PROFESSIONAL_AWARDS]: ['award'],
  [SECTION_PROFESSIONAL_FAQ]: ['faq'],
}

const EVENT_SCORE_KEYS: Record<string, string[]> = {
  [SECTION_EVENT_BASIC_DETAILS]: ['build_event_page'],
  [SECTION_EVENT_SEO]: ['build_event_page'],
  [SECTION_EVENT_TICKET]: ['tickets_coupons'],
  [SECTION_EVENT_COUPON]: ['tickets_coupons'],
  [SECTION_EVENT_FAQ]: ['faq'],
  [SECTION_EVENT_CONTACT]: ['contact_details'],
  [SECTION_EVENT_SPEAKER]: ['speakers'],
  [SECTION_EVENT_SPONSOR_PARTNER]: ['sponsors_partners'],
  [SECTION_EVENT_ATTENDEE]: ['attendees'],
}

const INVESTOR_TYPE_PROFESSIONAL = 1

interface InvestorRef {
  investor_type?: number
  investor_row_id?: number
}

/**
 * Refreshes the owning Company's / Professional's / Event's profile score ("Profile Strength") after a
 * section's data actually changed - used right after a change request is PUBLISHED and right after a
 * pending record's edit is saved DIRECTLY. Before this, a staged edit's score was only recalculated at
 * submit time (when nothing was live yet) and a publish never recalculated anything except Basic Details,
 * so the score stayed stale after approve-and-publish. Best-effort, like the other post-commit steps: a
 * failure is logged and never undoes the write.
 */
export async function recalculateProfileScoreAfterChange({
  module,
  section,
  rootDocumentId,
  payload,
}: {
  module: string
  section: string
  rootDocumentId: number
  payload?: Record<string, unknown> | null
}): Promise<void> {
  try {
    const helper = require('../../../utils/helpers/app_helper')

    if (module === AUDIT_MODULE_COMPANY && COMPANY_SCORE_KEYS[section]) {
      await helper.calculateCompanyProfileScore(rootDocumentId, COMPANY_SCORE_KEYS[section])
      // A funding round also counts toward each investor's own score.
      if (section === SECTION_FUNDING_ROUND) {
        const investors = (payload?.['investors'] ?? []) as InvestorRef[]
        for (const investor of investors) {
          if (!investor.investor_row_id) continue
          if (investor.investor_type === INVESTOR_TYPE_PROFESSIONAL) await helper.calculateUserProfileScore(investor.investor_row_id, ['investment', 'funding'])
          else await helper.calculateCompanyProfileScore(investor.investor_row_id, ['investment', 'funding'])
        }
      }
    } else if (module === AUDIT_MODULE_PROFESSIONALS && PROFESSIONAL_SCORE_KEYS[section]) {
      await helper.calculateUserProfileScore(rootDocumentId, PROFESSIONAL_SCORE_KEYS[section])
    } else if (module === AUDIT_MODULE_EVENTS && EVENT_SCORE_KEYS[section]) {
      await helper.calculateEventScore(rootDocumentId, EVENT_SCORE_KEYS[section])
    }
  } catch (err) {
    logger.error({ err, module, section, rootDocumentId }, 'change-request: profile score recalculation failed')
  }
}
