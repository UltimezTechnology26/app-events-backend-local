import OpenAI from 'openai';

interface OpenAIConfig {
    apiKey?: string;
    organization?: string;
    maxRetries: number;
    timeout: number;
}

const openaiConfig: OpenAIConfig = {
    apiKey: process.env.OPEN_AI_API_KEY,
    organization: process.env.OPENAI_ORGANIZATION_ID,
    maxRetries: 3,
    timeout: 30000,
};

const openai = new OpenAI(openaiConfig);

export { openai, openaiConfig };
