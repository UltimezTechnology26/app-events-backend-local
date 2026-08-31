// modules/system_settings/system_settings.area_of_interests.queries.ts
//
// CRUD data-access for the Area of Interests category (`userLookingForM`)
// plus the FIX #2 usage-check filter against `professionalsM`. The list
// aggregation pipeline lives in system_settings.area_of_interests.list.queries.ts
// — split out purely to stay under the file-length limit.

const userLookingForM = require('../../../models/app/static/user_looking_forM')
const professionalsM = require('../../../models/app/professionalsM')

/**
 * FIX #2 (approved): delete guard filter. Reuses the exact join technique the
 * list aggregation already proves works against `cln_professionals` —
 * `$expr: { $in: ["$$lfId", { $ifNull: ["$looking_for_id", []] }] }` —
 * expressed here as a plain (non-aggregation) filter for use with
 * `professionalsM.findOne()`. A plain `$in` match against the array-typed
 * `looking_for_id` field is the non-aggregation equivalent of the `$ifNull`
 * guarded `$expr` (a missing/absent field simply fails to match either way).
 */
export function buildAreaOfInterestUsageCheckFilter(lookingForId: number): Record<string, unknown> {
  return { looking_for_id: { $in: [lookingForId] } }
}

export async function findAreaOfInterestByNormalizedName(normalizedName: string) {
  return userLookingForM.findOne({ $expr: { $eq: [{ $toLower: '$name' }, normalizedName] } })
}

export async function insertAreaOfInterest(name: string, dateNTime: string) {
  return new userLookingForM({ name, date_n_time: dateNTime }).save()
}

export async function findAreaOfInterestByNormalizedNameExcluding(requestRowId: number, normalizedName: string) {
  return userLookingForM.findOne({
    _id: { $ne: requestRowId },
    $expr: { $eq: [{ $toLower: '$name' }, normalizedName] },
  })
}

export async function updateAreaOfInterestName(requestRowId: number, name: unknown, dateNTime: string) {
  return userLookingForM.updateOne({ _id: requestRowId }, { $set: { name, date_n_time: dateNTime } })
}

export async function findAreaOfInterestByIdAndStatus(requestRowId: number, activeStatus: boolean) {
  return userLookingForM.findOne({ _id: requestRowId, active_status: activeStatus })
}

export async function updateAreaOfInterestStatus(requestRowId: number, activeStatus: boolean) {
  return userLookingForM.updateOne({ _id: requestRowId }, { $set: { active_status: activeStatus } })
}

export async function findAreaOfInterestById(requestRowId: number) {
  return userLookingForM.findOne({ _id: requestRowId })
}

export async function deleteAreaOfInterestById(requestRowId: number) {
  return userLookingForM.deleteOne({ _id: requestRowId })
}

export async function findProfessionalUsingLookingFor(usageFilter: Record<string, unknown>) {
  return professionalsM.findOne(usageFilter)
}
