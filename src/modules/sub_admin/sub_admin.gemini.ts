// One Gemini client + JSON-call helper for this module's AI-generated
// Manager Roles text (per-module role cards and the overall type guide).
// Separate from services/ai_agents/geminiService.js on purpose - that file
// also wires up Pinecone/BigQuery clients this feature has no use for.
import { GoogleGenerativeAI } from '@google/generative-ai'

const GEMINI_MODEL = 'gemini-2.5-flash'
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string)

/** Sends a prompt that asks for ONLY a JSON object and parses the reply (stripping fences, repairing trailing commas). */
export async function generateJson<T>(prompt: string): Promise<T> {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })
  const result = await model.generateContent(prompt)
  const raw = result.response.text().replace(/```json|```/g, '').trim()

  try {
    return JSON.parse(raw) as T
  } catch {
    const repaired = raw.replace(/,(\s*[}\]])/g, '$1')
    return JSON.parse(repaired) as T
  }
}
