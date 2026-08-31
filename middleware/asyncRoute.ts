import { Request, Response, RequestHandler } from 'express'
import logger from '../config/logger'

/**
 * Centralizes the identical try/catch every route handler in this codebase
 * repeats: log a route-specific label + the error message, then respond with
 * the same generic {status:false, message} shape every route already used.
 * Replaces dozens of scattered copies of this block (CLAUDE.md: "One
 * centralized error handler, not scattered try/catch blocks") without
 * changing any route's response shape or log format — a pure refactor, not
 * a behavior change. `label` should match the original catch block's log
 * prefix verbatim (including trailing punctuation, e.g. 'Revenue list.' or
 * 'Update Category Error:') so log output is unchanged.
 */
export function asyncRoute(label: string, handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return async (req, res) => {
    try {
      await handler(req, res)
    } catch (err) {
      logger.error(`${label} ${err instanceof Error ? err.message : String(err)}`)
      res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
  }
}
