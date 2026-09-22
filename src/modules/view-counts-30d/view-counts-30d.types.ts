export type ViewCountEntityType = 'company' | 'professional'

export interface ViewCountBigQueryRow {
  kind: 'company' | 'root'
  key: string | null
  views: string | number
}
