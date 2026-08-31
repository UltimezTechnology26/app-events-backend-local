// modules/system_settings/system_settings.user_expertise.queries.ts
//
// CRUD data-access for the User Expertise category (`userDesignationsM`)
// plus the FIX #2 usage-check filter against `professionalsM`. The list
// aggregation pipeline lives in system_settings.user_expertise.list.queries.ts
// — split out purely to stay under the file-length limit.

const userDesignationsM = require('../../../models/app/static/user_designationsM')
const professionalsM = require('../../../models/app/professionalsM')

/**
 * FIX #2 (approved): delete guard filter. Reuses the exact join technique the
 * list aggregation already proves works against `cln_professionals` —
 * `$expr: { $in: ["$$designationId", { $ifNull: ["$designation_id", []] }] }`
 * — expressed here as a plain (non-aggregation) filter for use with
 * `professionalsM.findOne()`, the same technique used by
 * `buildAreaOfInterestUsageCheckFilter` (`designation_id` is, like
 * `looking_for_id`, stored untyped/array-shaped and queried via `$in`).
 */
export function buildUserExpertiseUsageCheckFilter(designationId: number): Record<string, unknown> {
  return { designation_id: { $in: [designationId] } }
}

export async function findUserExpertiseByNormalizedName(normalizedName: string) {
  return userDesignationsM.findOne({ $expr: { $eq: [{ $toLower: '$designation_name' }, normalizedName] } })
}

export async function insertUserExpertise(insertFields: Record<string, unknown>) {
  return new userDesignationsM(insertFields).save()
}

export async function findUserExpertiseByNormalizedNameExcluding(requestRowId: number, normalizedName: string) {
  return userDesignationsM.findOne({
    _id: { $ne: requestRowId },
    $expr: { $eq: [{ $toLower: '$designation_name' }, normalizedName] },
  })
}

export async function updateUserExpertiseFields(requestRowId: number, updateFields: Record<string, unknown>) {
  return userDesignationsM.updateOne({ _id: requestRowId }, { $set: updateFields })
}

export async function findUserExpertiseByIdAndStatus(requestRowId: number, activeStatus: boolean) {
  return userDesignationsM.findOne({ _id: requestRowId, active_status: activeStatus })
}

export async function updateUserExpertiseStatus(requestRowId: number, activeStatus: boolean) {
  return userDesignationsM.updateOne({ _id: requestRowId }, { $set: { active_status: activeStatus } })
}

export async function findUserExpertiseById(requestRowId: number) {
  return userDesignationsM.findOne({ _id: requestRowId })
}

export async function deleteUserExpertiseById(requestRowId: number) {
  return userDesignationsM.deleteOne({ _id: requestRowId })
}

export async function findProfessionalUsingDesignation(usageFilter: Record<string, unknown>) {
  return professionalsM.findOne(usageFilter)
}
