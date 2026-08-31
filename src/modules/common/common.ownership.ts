import companyM from '../../../models/app/company/companyM'

interface CheckCompanyOwnershipInput {
  user_row_id?: number
  company_row_id?: number
}

export async function checkCompanyOwnership({ user_row_id, company_row_id }: CheckCompanyOwnershipInput) {
  if (!company_row_id && !user_row_id) {
    return { status: false, message: { alert_message: 'Either company_row_id or user_row_id is required.' } }
  }

  const company: any = company_row_id
    ? await companyM.findOne({ _id: company_row_id, active_status: 1 })
    : await companyM.findOne({ user_row_id, active_status: 1 })

  if (!company) {
    return { status: false, message: { alert_message: 'The company row id field is invalid.' } }
  }

  if (company.approval_status !== 1) {
    return { status: false, message: { alert_message: 'This company is not yet approved.' } }
  }

  if (company_row_id && user_row_id && company.user_row_id && user_row_id !== company.user_row_id) {
    return { status: false, message: { alert_message: 'The company row id field is invalid.' } }
  }

  return {
    status: true,
    message: {
      company_row_id: company._id,
      company_name: company.company_name,
    },
  }
}
