export interface AcquisitionInput {
  acquirer_registered_type: number
  acquirer_company_row_id: number
  acquired_registered_type: number
  acquired_company_row_id: number
  acquisition_date: string
  acquisition_price?: number
  facilitators?: string
  stake_acquired_percent: number
  acquisition_multiple?: number
}

export function validateAcquisitionInput(input: AcquisitionInput): { valid: boolean; errObj: Record<string, string> } {
  const errObj: Record<string, string> = {}

  const sameCompany =
    input.acquirer_registered_type === input.acquired_registered_type &&
    input.acquirer_company_row_id === input.acquired_company_row_id

  if (sameCompany) {
    errObj['acquired_company_row_id'] = 'A company cannot acquire itself.'
  }

  if (!input.acquisition_date) {
    errObj['acquisition_date'] = 'Acquisition date is required.'
  }

  if (
    typeof input.stake_acquired_percent !== 'number' ||
    input.stake_acquired_percent <= 0 ||
    input.stake_acquired_percent > 100
  ) {
    errObj['stake_acquired_percent'] = 'Stake acquired must be greater than 0 and at most 100.'
  }

  return { valid: Object.keys(errObj).length === 0, errObj }
}
