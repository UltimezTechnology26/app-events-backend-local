// modules/professionals-academy/professionals-academy.controller.ts
//
// Phase J of the Professionals migration (see plan doc). Ports controllers/main/users.js's
// /certificate_list, /save_n_update_visibility, /certificate_visible/:user_row_id,
// /save_certificate_urls (~844-1166) out of the legacy `/main/users` router into a dedicated
// professionals-academy module, since Academy is a real, distinct professionals domain, not a
// sub-feature of core professionals or a generic self-service concern.
//
// Mounted at a temporary `_v2` prefix (routes/main.js: '/academy_v2') parallel to the untouched
// legacy '/users' mount, per this migration's confirmed cutover strategy — legacy stays live and
// unmodified until this module is verified via the characterization capture/compare cycle and
// real frontend testing, matching Phase A's professionals.controller.ts precedent.
//
// NOT PORTED HERE (out of this module's scope, stays in legacy controllers/main/users.js for now):
// /user_page_track (GET+POST) is generic page-view analytics, not academy/course-specific —
// courtesy flag only, not a silent scope decision.
import express, { Router, Request, Response } from 'express'
const { checkUserLoginToken, checkAllLoginToken } = require('../../../middleware/authorization')
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { resolveUserRowId, getCertificateList, saveNUpdateVisibility, getCertificateVisible, saveCertificateUrls } from './professionals-academy.service'
import { UserAuthResult } from './professionals-academy.types'

export const professionalsAcademyRouter: Router = express.Router()

professionalsAcademyRouter.get(
  '/certificate_list',
  asyncRoute('Certificate list.', async (req: Request, res: Response) => {
    const auth: UserAuthResult = await checkAllLoginToken(req.headers, [1])
    if (!auth.status) return res.json({ status: false, message: 'Unauthorized' })

    const userRowId = resolveUserRowId(auth, req.query.user_row_id)
    res.json(await getCertificateList(userRowId))
  }),
)

professionalsAcademyRouter.post(
  '/save_n_update_visibility',
  writeEndpointRateLimiter,
  asyncRoute('Save/update certificate visibility.', async (req: Request, res: Response) => {
    const auth: UserAuthResult = await checkAllLoginToken(req.headers, [1])
    // FLAGGED, NOT FIXED: legacy user.js returns this same misleading "certificate not found"
    // message on an AUTH failure too (falls through to its one shared return statement), instead
    // of surfacing the real auth error. Ported as-is to keep the response identical — a real
    // response-shape/message change here needs explicit sign-off first.
    if (!auth.status) return res.json({ status: false, message: 'Certificate not found for the given user and course.' })

    const userRowId = resolveUserRowId(auth, req.query.user_row_id)
    const { course_row_id, certificate_public } = req.body
    res.json(await saveNUpdateVisibility(userRowId, course_row_id, certificate_public))
  }),
)

professionalsAcademyRouter.get(
  '/certificate_visible/:user_row_id',
  asyncRoute('Public certificate list.', async (req: Request, res: Response) => {
    const userRowId = Number.parseInt(req.params.user_row_id as string)
    if (Number.isNaN(userRowId)) return res.json({ status: false, message: 'Invalid user_row_id' })
    res.json(await getCertificateVisible(userRowId))
  }),
)

professionalsAcademyRouter.post(
  '/save_certificate_urls',
  writeEndpointRateLimiter,
  asyncRoute('Save certificate urls.', async (req: Request, res: Response) => {
    const checkToken = checkUserLoginToken(req.headers)
    if (!checkToken.status) return res.json(checkToken)

    const userRowId = checkToken.message
    const { course_row_id, certificate_pdf_url, certificate_image_url } = req.body
    res.json(await saveCertificateUrls(userRowId, course_row_id, certificate_pdf_url, certificate_image_url))
  }),
)
