// modules/company/company.regulatory_details.queries.ts
//
// Data-access layer for both regulatory sub-resources (Types + Bodies,
// see company.regulatory_details.service.ts's file header for why they
// share one module). The only place these 4 models are touched directly —
// the service orchestrates business logic and calls these instead.

const company_exchanges_countriesM = require('../../../models/app/company/company_exchanges_countriesM')
const company_regulatory_typesM = require('../../../models/app/company/company_regulatory_typesM')
const companyM = require('../../../models/app/company/companyM')
const company_exchanges_bodiesM = require('../../../models/app/company/company_exchanges_bodiesM')

// ==== Regulatory Types ====

export async function findRegulatoryTypeById(categoryRowId: number) {
  return company_regulatory_typesM.findOne({ _id: categoryRowId })
}

export async function findDuplicateRegulatoryTypeName(categoryRowId: number, regulatorTypeName: string) {
  return company_regulatory_typesM
    .findOne({ _id: { $ne: categoryRowId }, regulator_type_name: regulatorTypeName }, { _id: 1 })
    .collation({ locale: 'en', strength: 2 })
}

export async function updateRegulatoryTypeName(categoryRowId: number, regulatorTypeName: string) {
  return company_regulatory_typesM.updateOne({ _id: categoryRowId }, { $set: { regulator_type_name: regulatorTypeName } })
}

export async function insertRegulatoryType(regulatorTypeName: string, dateNTime: string) {
  return new company_regulatory_typesM({ regulator_type_name: regulatorTypeName, date_n_time: dateNTime }).save()
}

export async function deleteRegulatoryTypeById(categoryRowId: number) {
  return company_regulatory_typesM.deleteOne({ _id: categoryRowId })
}

export async function findBodiesUsingRegulatoryType(categoryRowId: number) {
  return company_exchanges_bodiesM.findOne({ regulatory_type_id: categoryRowId })
}

// ==== Regulatory Bodies ====

export async function findRegulatoryBodyById(categoryRowId: number) {
  return company_exchanges_bodiesM.findOne({ _id: categoryRowId })
}

export async function findCountryByCountryId(countryId: number) {
  return company_exchanges_countriesM.findOne({ country_id: countryId })
}

export async function insertCountry(countryId: number) {
  return new company_exchanges_countriesM({ country_id: countryId }).save()
}

export async function findDuplicateRegulatoryBody(duplicateQuery: Record<string, unknown>) {
  return company_exchanges_bodiesM.findOne(duplicateQuery)
}

export async function updateRegulatoryBody(categoryRowId: number, updateFields: Record<string, unknown>) {
  return company_exchanges_bodiesM.updateOne({ _id: categoryRowId }, { $set: updateFields })
}

export async function insertRegulatoryBody(insertFields: Record<string, unknown>) {
  return new company_exchanges_bodiesM(insertFields).save()
}

export async function findCompanyUsingRegulatoryBody(categoryRowId: number) {
  return companyM.findOne({ 'regularities_details.regulatory_bodies_ids': categoryRowId })
}

export async function deleteRegulatoryBodyById(categoryRowId: number) {
  return company_exchanges_bodiesM.deleteOne({ _id: categoryRowId })
}

export async function countRegulatoryBodiesForCountry(countryId: unknown) {
  return company_exchanges_bodiesM.countDocuments({ country_id: countryId })
}

export async function deleteCountryByCountryId(countryId: number) {
  return company_exchanges_countriesM.deleteOne({ country_id: countryId })
}
