// modules/community-posts/community-posts.rewrite.service.ts
// Ports controllers/main/community/posts.js's POST /rewrite (~line 325-377) - the OpenAI call
// itself. Validation, auth, and error-status handling stay in the controller, matching legacy's
// own structure (this route needs specific 400/500 status codes on failure, unlike every other
// route in this module, so it isn't wrapped in the generic asyncRoute helper).
import { openai } from '../../../config/openai'

const REWRITE_MODEL = 'gpt-4o-mini'
const REWRITE_TEMPERATURE = 0.5
const REWRITE_MAX_OUTPUT_TOKENS = 60
const REWRITE_SYSTEM_PROMPT =
  'Rewrite the following post with correct grammar, spelling, and punctuation. Improve clarity, sentence structure, and overall flow while preserving the original meaning and tone. Make it sound natural and professional, but still engaging. Ensure the result is under 200 characters.'

export async function rewritePostContent(content: string) {
  const response = await openai.responses.create({
    model: REWRITE_MODEL,
    temperature: REWRITE_TEMPERATURE,
    max_output_tokens: REWRITE_MAX_OUTPUT_TOKENS,
    input: [
      { role: 'system', content: REWRITE_SYSTEM_PROMPT },
      { role: 'user', content },
    ],
  })

  return { content, rewrite: response.output_text?.trim() }
}
