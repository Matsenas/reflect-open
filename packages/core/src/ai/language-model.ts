import type { LanguageModel } from '@reflect/modules/ai'
import type { AiProviderConfig } from '../settings/schema.ts'
import { anthropicDirectBrowserAccessHeaders } from './anthropic-headers.ts'
import { APP_REVIEW_STUB_KEY, createDemoModel } from './app-review-demo.ts'
import { OPENAI_COMPATIBLE_PROVIDER_ID } from './openai-compatible.ts'
import { openAiBaseUrl } from './openai-region.ts'
import { OPENROUTER_BASE_URL, openRouterAttributionHeaders } from './openrouter.ts'

/**
 * Build the AI SDK model instance for a configured BYOK entry — the one place
 * provider ids map to SDK factories. Shared by the chat engine
 * (`chat/stream-chat`) and one-shot calls like the link-capture page
 * description (`describe-page`).
 */
export async function languageModel(
  config: AiProviderConfig,
  apiKey: string,
  fetchFn: typeof fetch,
): Promise<LanguageModel> {
  // App Review demo mode: a local model regardless of the configured
  // provider, since the reviewer may have picked any of them.
  if (apiKey === APP_REVIEW_STUB_KEY) {
    return createDemoModel()
  }
  switch (config.provider) {
    case 'openai': {
      const { createOpenAI } = await import('@reflect/modules/ai-sdk/openai')
      const model = createOpenAI({
        apiKey,
        fetch: fetchFn,
        baseURL: openAiBaseUrl(config.region),
      })(config.model)
      if (config.region === undefined) {
        return model
      }
      // Data-residency projects reject stored responses ("Cannot set
      // store=true in non-US regions"), and the Responses API stores by
      // default, so regional entries opt out for every call.
      const { defaultSettingsMiddleware, wrapLanguageModel } = await import('@reflect/modules/ai')
      return wrapLanguageModel({
        model,
        middleware: defaultSettingsMiddleware({
          settings: { providerOptions: { openai: { store: false } } },
        }),
      })
    }
    case 'anthropic': {
      const { createAnthropic } = await import('@reflect/modules/ai-sdk/anthropic')
      return createAnthropic({
        apiKey,
        fetch: fetchFn,
        headers: anthropicDirectBrowserAccessHeaders(),
      })(config.model)
    }
    case 'google': {
      const { createGoogle } = await import('@reflect/modules/ai-sdk/google')
      return createGoogle({ apiKey, fetch: fetchFn })(config.model)
    }
    case 'openrouter': {
      const { createOpenAI } = await import('@reflect/modules/ai-sdk/openai')
      return createOpenAI({
        apiKey,
        fetch: fetchFn,
        baseURL: OPENROUTER_BASE_URL,
        headers: openRouterAttributionHeaders(),
        name: 'openrouter',
      }).chat(config.model)
    }
    case 'openai-compatible': {
      const { createOpenAICompatible } = await import('@reflect/modules/ai-sdk/openai-compatible')
      return createOpenAICompatible({
        name: OPENAI_COMPATIBLE_PROVIDER_ID,
        baseURL: config.baseUrl,
        fetch: fetchFn,
        includeUsage: true,
        ...(apiKey.trim() === '' ? {} : { apiKey }),
      }).chatModel(config.model)
    }
  }
}
