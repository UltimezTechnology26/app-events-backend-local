// modules/company_overview/company_overview.stages.ts
//
// Part 3 §7 Phase C step 3. buildProfessionalEnrichmentStages() didn't need re-exporting here —
// services/company/front_page.ts's overview() now imports it directly from
// modules/common/common.enrichment.ts (already promoted there before this build, see that
// file's own header comment), replacing all 35 in-scope copies inside overview() plus 8 more
// found in companyList's and 17 more in getPartnerListDetails's own report_list_type branches
// (beyond the 3 originally documented in Part 1 §3 — same exact byte-for-byte duplicate shape,
// confirmed via characterization: 36/36 unchanged after replacing all of them).
//
// PARTNER_FILTER_STAGE stays here, genuinely local to /overview's company/partner split (Part 1
// §3): the 17-line $lookup-into-cln_company_added_to_partners + $unwind block. NOT shared with
// companyList's/getPartnerListDetails' own 13 separate copies of a similarly-shaped block —
// those are a different, pre-existing duplication instance out of this step's scope.
//
// Not fully uniform across all 18 occurrences: 15 look up by the current document's own `_id`
// (when the pipeline is rooted directly on a company document), but 3 (the event-organizer
// partner branch) look up by a `company_row_id` field instead, since that stage's document is
// a joined event/organizer sub-record whose own `_id` isn't the company's — confirmed via a
// characterization regression caught while doing this extraction (partner_event_organizers'
// total_organizer_count/total_event_sponsor_count both changed when this was hardcoded to
// `_id`). Parametrized here rather than silently normalized to one shape.
export function PARTNER_FILTER_STAGE(localField: '_id' | 'company_row_id' = '_id') {
  return [
    {
      $lookup: {
        from: 'cln_company_added_to_partners',
        localField,
        foreignField: 'company_row_id',
        as: 'info_parnters',
        pipeline: [{ $project: { _id: 1 } }]
      }
    },
    { $unwind: { path: '$info_parnters' } }
  ]
}
