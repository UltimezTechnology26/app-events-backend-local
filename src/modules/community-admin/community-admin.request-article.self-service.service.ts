// modules/community-admin/community-admin.request-article.self-service.service.ts
//
// Ports controllers/main/community/request_articles.js's POST /publish_request (the professional's
// own "request to publish an article" submission) verbatim. Same model as the admin-side list/
// change_status routes (community-admin.request-article.service.ts) - see that file's own doc
// comment for why the model isn't colocated.
const community_article_requestsM = require('../../../models/main/community/community_article_requestsM')
const { getPresentDateTime } = require('../../../utils/helpers/helper')
import { PublishArticleRequestParams } from './community-admin.request-article.types'

export async function submitArticlePublishRequest({ userRowId, topic, documentLink, articleContent }: PublishArticleRequestParams) {
  if (!documentLink?.trim() && !articleContent?.trim()) {
    return { status: false, message: { alert_message: 'Please provide either a document link or article content.' } }
  }

  const newRequest = new community_article_requestsM({
    user_row_id: userRowId,
    topic,
    document_link: documentLink || '',
    article_content: articleContent || '',
    status: 'pending',
    date_n_time: getPresentDateTime(),
  })

  await newRequest.save()

  return { status: true, message: { alert_message: 'Publish Article successfully requested.' } }
}
