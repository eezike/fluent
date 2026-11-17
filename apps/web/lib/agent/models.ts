import { createProviderRegistry, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { HttpError } from "../http";

/**
 * Model-agnostic: set FLUENT_MODEL to "<provider>:<model id>", e.g.
 *   anthropic:claude-sonnet-5-5
 *   openai:gpt-5.5
 *   google:gemini-3-pro
 * Add a provider by installing its @ai-sdk package and registering it below.
 */
export const DEFAULT_MODEL = "anthropic:claude-sonnet-5-5";

function registry() {
  const providers: Record<string, any> = {};
  if (process.env.ANTHROPIC_API_KEY) providers.anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  if (process.env.OPENAI_API_KEY) providers.openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY)
    providers.google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });
  return providers;
}

export function getModel(id = process.env.FLUENT_MODEL || DEFAULT_MODEL): LanguageModel {
  const providers = registry();
  const provider = id.split(":")[0];
  if (!providers[provider]) {
    throw new HttpError(
      500,
      `No API key for "${provider}". Set the matching key (ANTHROPIC_API_KEY, OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY) or change FLUENT_MODEL.`,
    );
  }
  return createProviderRegistry(providers).languageModel(id as never) as LanguageModel;
}
