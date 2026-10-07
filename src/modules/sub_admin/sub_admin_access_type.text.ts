// The AI-generated Manager Roles text stored on a cln_sub_admin_access_type
// record - one validate + save path shared by this backend's own refresh and
// by markets-backend-local's refresh, which saves through the
// POST /sub_admin_v2/update_access_type/:id endpoint instead of writing to
// this service's database directly.
const sanitize = require('mongo-sanitize')
const sub_admin_access_typeM = require('../../../models/admin_panel/app/sub_admin_access_typeM')

export interface AccessTypeText {
  description: string
  responsibilities: string[]
  can_extra: string[]
  cant_extra: string[]
  restricted_access: string[]
  full_access: string[]
}

const LIST_FIELDS = ['responsibilities', 'can_extra', 'cant_extra', 'restricted_access', 'full_access'] as const

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

/** Returns the field errors for a text payload (empty object when valid). */
export function validateAccessTypeText(body: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {}
  if (typeof body.description !== 'string') errors['description'] = 'The description field must be a string.'
  for (const field of LIST_FIELDS) {
    if (!isStringList(body[field])) errors[field] = `The ${field} field must be a list of strings.`
  }
  return errors
}

export function writeAccessTypeText(accessTypeId: number, text: AccessTypeText) {
  return sub_admin_access_typeM.updateOne(
    { _id: accessTypeId },
    {
      $set: {
        description: sanitize(text.description),
        responsibilities: sanitize(text.responsibilities),
        can_extra: sanitize(text.can_extra),
        cant_extra: sanitize(text.cant_extra),
        restricted_access: sanitize(text.restricted_access),
        full_access: sanitize(text.full_access),
      },
    },
  )
}
