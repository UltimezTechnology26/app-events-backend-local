// modules/events/events.types.ts
export interface GetEventsListParams {
  activeStatusRaw: string
  skipRaw: string
  limitRaw: string
  ticket?: string
  search?: string
  employeeIdRaw?: string
  eventTypeRaw?: string
  startDate?: string
  endDate?: string
  eventStatusRaw?: string
  eventTag?: string
  location?: string
  createdType?: string
  profileScoreRange?: string
  tagStatusRaw?: string
  sortBy?: string
  sortOrderRaw?: string
}

export interface AdminAuthFailure {
  status: false
  message: unknown
}
