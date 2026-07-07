
const indentity_counterM = require('../../models/indentity_counterM')
const market_indentity_counterM = require('../../models/market_indentity_counterM')

export async function getCollectionID(counterName) {
  const result = await indentity_counterM.findOneAndUpdate(
    { model: counterName },
    { $inc: { count: 1 } },
    { upsert: true, new: true }
  )
  return result.count
}
export const marketDbIncrement = async (counterName) => {
  const result = await market_indentity_counterM.findOneAndUpdate(
    { model: counterName },
    { $inc: { count: 1 } },
    { upsert: true, new: true }
  )
  return result.count
}