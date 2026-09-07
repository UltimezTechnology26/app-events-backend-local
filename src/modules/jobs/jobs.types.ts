export type JobActiveStatus = 'active' | 'inactive'

/** Raw `checkAllLoginToken(req.headers, [7])` result, threaded from controller into service exactly as every other company module does (see `company.settings.service.ts`'s own local `Actor` type). */
export interface ActorMessage {
  user_type: number
  user_row_id: number
}

export type Actor =
  | { status: true; message: ActorMessage }
  | { status: false; message: string | Record<string, unknown> }

/** Body shape `POST /job/add_n_update_details` accepts (confirmed against the legacy controller's express-validator chain) — a `job_id` present means update, absent means create. */
export interface SaveJobBody {
  job_id?: number | string
  company_row_id: number | string
  job_title: string
  experience_level: string | number
  job_type?: string
  work_location_type?: string
  country_id: string | number
  location?: string
  salary_from?: number | string
  salary_to?: number | string
  no_of_openings?: number | string
  application_deadline?: string | Date
  highest_education: number | string
  key_skills: number[]
  job_description: string
}

export interface JobActionResult {
  status: boolean
  message: unknown
  data?: unknown
  /** Present only when the write became a pending change request instead of writing live. */
  changeRequestId?: number
}
