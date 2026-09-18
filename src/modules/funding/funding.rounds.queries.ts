// modules/funding/funding.rounds.queries.ts
//
// CRUD data-access for Funding Rounds. List/aggregation data-access lives
// in funding.rounds.list.queries.ts / funding.rounds.list.counts.ts — split
// out purely to stay under the file-length limit. `funding.rounds.service.ts`
// orchestrates business logic and calls these instead of talking to the
// model directly.
const funding_roundsM = require('../../../models/app/static/funding_roundsM')

export async function findFundingRoundById(categoryRowId: number) {
  return funding_roundsM.findOne({ _id: categoryRowId })
}

export async function findFundingRoundByNormalizedName(normalizedName: string) {
  return funding_roundsM.findOne({
    $expr: {
      $eq: [{ $toLower: '$category_name' }, normalizedName],
    },
  })
}

export async function updateFundingRoundName(categoryRowId: number, categoryName: string) {
  return funding_roundsM.updateOne({ _id: categoryRowId }, { $set: { category_name: categoryName } })
}

export async function insertFundingRound(categoryName: string, dateNTime: string) {
  return new funding_roundsM({
    category_name: categoryName,
    active_status: true,
    date_n_time: dateNTime,
  }).save()
}
