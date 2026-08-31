// Replaces the ~22 hand-rolled "run the list query, then run a SEPARATE count
// query" implementations found across the Company domain (Part 1 §3 finding 3)
// with one $facet stage: list and count come from the same aggregation call,
// so they can't structurally drift apart the way two independent queries can.
export function buildPaginatedFacetStages({ skip, limit }: { skip: number; limit: number }) {
  return [
    {
      $facet: {
        data: [{ $skip: skip }, { $limit: limit }],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]
}

export function extractPaginatedResult(aggregateOutput: any[]) {
  const facetResult = aggregateOutput[0] || { data: [], totalCount: [] }
  return {
    data: facetResult.data,
    count: facetResult.totalCount[0]?.count ?? 0,
  }
}
