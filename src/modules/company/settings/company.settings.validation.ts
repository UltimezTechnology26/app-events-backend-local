// modules/company/company.settings.validation.ts
const { check } = require('express-validator')

export const updateBasicCompanyDetailsValidation = [
  check('company_name')
    .trim().not().isEmpty().withMessage('The Company Name field is required.')
    .isLength({ min: 4 }).withMessage('The Company Name field must be at least 4 characters.')
    .isLength({ max: 120 }).withMessage('The Company Name field must be less than 120 characters.'),
  check('company_id')
    .trim().not().isEmpty().withMessage('The Company Id field is required.')
    .isLength({ min: 4 }).withMessage('The Company Id field must be at least 4 characters.')
    .isLength({ max: 40 }).withMessage('The Company Id field must be less than 40 characters.')
    .matches(/^[a-zA-Z0-9-]+$/).withMessage('Company ID must contain only alphabets, numbers, and hyphen.'),
  check('describe_in_one_line')
    .trim().not().isEmpty().withMessage('The Describe in One Line field is required.')
    .isLength({ min: 4 }).withMessage('The Describe in One Line field must be at least 4 characters.')
    .isLength({ max: 120 }).withMessage('The Describe in One Line field must be less than 120 characters.'),
  check('business_model_id')
    .not().isEmpty().withMessage('The Business Model Id field is required.'),
  check('website_link')
    .trim().not().isEmpty().withMessage('The Website Link field is required.'),
]

export const updateNewBasicCompanyDetailsValidation = [
  check('company_name')
    .trim().not().isEmpty().withMessage('The Company Name field is required.')
    .isLength({ min: 4 }).withMessage('The Company Name field must be at least 4 characters.')
    .isLength({ max: 120 }).withMessage('The Company Name field must be less than 120 characters.'),
  check('company_id')
    .trim().not().isEmpty().withMessage('The Company Id field is required.')
    .isLength({ min: 4 }).withMessage('The Company Id field must be at least 4 characters.')
    .isLength({ max: 40 }).withMessage('The Company Id field must be less than 40 characters.')
    .matches(/^[a-zA-Z0-9-]+$/).withMessage('Company ID must contain only alphabets, numbers, and hyphen.'),
  check('user_row_id')
    .not().isEmpty().withMessage('The user row id field is required.'),
]

export const updateSocialDetailsValidation = [
  check('company_row_id')
    .trim().not().isEmpty().withMessage('The company row id field is required.'),
]

export const updateSocialMediaDetailsValidation = [
  check('company_row_id')
    .trim().not().isEmpty().withMessage('The company row id field is required.'),
  check('user_row_id')
    .trim().not().isEmpty().withMessage('The user row id field is required.'),
]

export const addCompanyWalletAddressValidation = [
  check('wallet_address')
    .not().isEmpty().withMessage('The Wallet Address field is required.')
    .isLength({ min: 25 }).withMessage('The Wallet Address field must be at least 25 characters in length.')
    .isLength({ max: 60 }).withMessage('The Wallet Address field must be less than 60 characters in length.'),
]

export const verifyCompanyEmailOtpValidation = [
  check('otp_number')
    .trim().not().isEmpty().withMessage('The otp number field is required.')
    .isLength({ min: 6 }).withMessage('The otp number field must be at least 6 characters in length.'),
]

export const updateCompanySeoValidation = [
  check('module_id').not().isEmpty().withMessage('The Company ID field is required.'),
  check('meta_title').not().isEmpty().withMessage('The Meta Title field is required.'),
  check('meta_description').not().isEmpty().withMessage('The Meta Description field is required.'),
  check('meta_keywords').not().isEmpty().withMessage('The Meta Keywords field is required.'),
]
