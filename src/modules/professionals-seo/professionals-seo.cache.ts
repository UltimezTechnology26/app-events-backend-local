// modules/professionals-seo/professionals-seo.cache.ts
import { deleteKeysByPattern } from '@ultimez-interview/coinpedia-backend-library/cache'

export async function invalidateAfterSeoUpdate(): Promise<void> {
  await Promise.all([
    deleteKeysByPattern('user_detail*'),
    deleteKeysByPattern('app_user_detail_*'),
    deleteKeysByPattern('app_user_other_details_*'),
  ])
}
