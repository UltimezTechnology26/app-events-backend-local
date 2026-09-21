/**
 * One-off, idempotent backfill of cln_entity_lifecycle and cln_change_logs from the
 * company fields this work supersedes (reason_rejected, rejected_date_n_time,
 * disable_reason, disabled_date_n_time, approval_sub_admin_row_id, updated_by).
 *
 * Historical actors that were never recorded cannot be recovered. No module has ever
 * stored an approver, so backfilled approvals are attributed to 'system' with a reason
 * note — never guessed.
 *
 * Run: node scripts/migrations/backfill-company-lifecycle.js
 */
const companyM = require('../../models/app/company/companyM')
const {
    toActor,
    writeStamp,
    writeLogOnce,
    SYSTEM_ACTOR,
    BACKFILL_NOTE
} = require('./lib/company-lifecycle-backfill.helpers')

const DEFAULT_BATCH_SIZE = 500
const APPROVAL_STATUS_APPROVED = 1
const APPROVAL_STATUS_REJECTED = 2
const ACTIVE_STATUS_DISABLED = 0

const BACKFILL_PROJECTION = {
    _id: 1,
    approval_status: 1,
    active_status: 1,
    approval_sub_admin_row_id: 1,
    reason_rejected: 1,
    rejected_date_n_time: 1,
    disable_reason: 1,
    disabled_date_n_time: 1,
    updated_by: 1,
    updated_by_row_id: 1,
    updated_date_n_time: 1
}

async function backfillOne(company, counters) {
    if (company.updated_date_n_time || company.updated_by) {
        await writeStamp(company._id, 'last_updated', {
            by: toActor(company.updated_by, company.updated_by_row_id),
            at: company.updated_date_n_time || null,
            reason: null
        })
        counters.lifecycleRows += 1
    }

    if (company.approval_status === APPROVAL_STATUS_APPROVED) {
        await writeStamp(company._id, 'last_approved', { by: SYSTEM_ACTOR, at: null, reason: BACKFILL_NOTE })
        counters.lifecycleRows += 1
        if (await writeLogOnce(company._id, 'approve', SYSTEM_ACTOR, BACKFILL_NOTE, null)) {
            counters.logRows += 1
        }
    }

    if (company.approval_status === APPROVAL_STATUS_REJECTED) {
        const actor = toActor('subadmin', company.approval_sub_admin_row_id)
        await writeStamp(company._id, 'last_rejected', {
            by: actor,
            at: company.rejected_date_n_time || null,
            reason: company.reason_rejected || null
        })
        counters.lifecycleRows += 1
        if (await writeLogOnce(company._id, 'reject', actor, company.reason_rejected || BACKFILL_NOTE, company.rejected_date_n_time)) {
            counters.logRows += 1
        }
    }

    if (company.active_status === ACTIVE_STATUS_DISABLED) {
        await writeStamp(company._id, 'last_disabled', {
            by: SYSTEM_ACTOR,
            at: company.disabled_date_n_time || null,
            reason: company.disable_reason || null
        })
        counters.lifecycleRows += 1
        if (await writeLogOnce(company._id, 'disable', SYSTEM_ACTOR, company.disable_reason || BACKFILL_NOTE, company.disabled_date_n_time)) {
            counters.logRows += 1
        }
    }
}

async function backfillCompanyLifecycle({ batchSize = DEFAULT_BATCH_SIZE } = {}) {
    const counters = { scanned: 0, lifecycleRows: 0, logRows: 0 }
    let skip = 0

    for (;;) {
        const batch = await companyM
            .find({}, BACKFILL_PROJECTION)
            .sort({ _id: 1 })
            .skip(skip)
            .limit(batchSize)
            .lean()

        if (!batch || batch.length === 0) {
            break
        }

        for (const company of batch) {
            await backfillOne(company, counters)
            counters.scanned += 1
        }

        skip += batchSize
    }

    return counters
}

module.exports = { backfillCompanyLifecycle }

if (require.main === module) {
    require('../../config/database')
    backfillCompanyLifecycle({})
        .then((result) => {
            process.stdout.write(`${JSON.stringify(result)}\n`)
            process.exit(0)
        })
        .catch((err) => {
            process.stderr.write(`backfill failed: ${err.message}\n`)
            process.exit(1)
        })
}
