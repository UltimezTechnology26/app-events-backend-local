// modules/work-experience/work-experience.positions.queries.ts
//
// CRUD data-access for Positions plus the FIX #2 usage-check filter. The
// list aggregation pipeline lives in work-experience.positions.list.queries.ts
// — split out purely to stay under the file-length limit.
const professionalPositionsM = require('../../../models/app/static/professional_positionsM')
const professionalsWorkExperienceM = require('../../../models/app/professionals_work_experienceM')

/**
 * FIX #2 (approved): delete guard filter. `position_row_id` on
 * `cln_professionals_work_experiences` (models/app/professionals_work_experienceM.js,
 * lines ~35-38) is a scalar `Number` field (indexed, not an array), matching
 * exactly how the legacy list aggregation joins it via
 * `foreignField: 'position_row_id'` in a plain (non-array) `$lookup`. A
 * scalar equality `findOne` is therefore the correct non-aggregation
 * equivalent — unlike the array-typed `$in`-based guards built for
 * event_tags/area_of_interests/user_expertise.
 */
export function buildPositionUsageCheckFilter(positionRowId: number): Record<string, unknown> {
  return { position_row_id: positionRowId }
}

export async function findPositionById(positionRowId: number | string) {
  return professionalPositionsM.findOne({ _id: positionRowId }, { _id: 1 })
}

export async function findDuplicatePositionName(positionRowId: number | string, positionName: string) {
  return professionalPositionsM
    .findOne({ _id: { $ne: positionRowId }, position_name: positionName }, { _id: 1 })
    .collation({ locale: 'en', strength: 2 })
}

export async function updatePosition(positionRowId: number | string, updateFields: Record<string, unknown>) {
  return professionalPositionsM.updateOne({ _id: positionRowId }, { $set: updateFields })
}

export async function insertPosition(insertFields: Record<string, unknown>) {
  return new professionalPositionsM(insertFields).save()
}

export async function findPositionByIdAndActiveStatus(positionRowId: number, activeStatus: boolean) {
  return professionalPositionsM.findOne({ _id: positionRowId, active_status: activeStatus })
}

export async function findPositionByIdOnly(positionRowId: number) {
  return professionalPositionsM.findOne({ _id: positionRowId })
}

export async function deletePositionById(positionRowId: number) {
  return professionalPositionsM.deleteOne({ _id: positionRowId })
}

export async function findWorkExperienceUsingPosition(positionRowId: number) {
  return professionalsWorkExperienceM.findOne(buildPositionUsageCheckFilter(positionRowId))
}
