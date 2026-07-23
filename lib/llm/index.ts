import type { LLMService } from "./types";
import { claudeService } from "./claude";
import { stubService } from "./stub";

export const isStubMode = () => !process.env.ANTHROPIC_API_KEY;

export function getLLMService(): LLMService {
  return isStubMode() ? stubService : claudeService;
}

export * from "./types";
