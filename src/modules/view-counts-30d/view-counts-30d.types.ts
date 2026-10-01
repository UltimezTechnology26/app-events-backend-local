export type ViewCountEntityType = 'company' | 'professional' | 'event'

export interface ViewCountBigQueryRow {
  kind: 'company' | 'root' | 'event'
  key: string | null
  views: string | number
}
