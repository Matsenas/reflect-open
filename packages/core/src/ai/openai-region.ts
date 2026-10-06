import { z } from 'zod'

/**
 * OpenAI data residency. A project created in a residency region only accepts
 * requests on that region's domain (`eu.api.openai.com`, …); calling the
 * global `api.openai.com` with its key fails with "Attempted to access
 * resource from outside project geography". An OpenAI entry without a region
 * uses the global endpoint.
 *
 * https://developers.openai.com/api/docs/guides/your-data
 */
export const OPENAI_REGIONS = ['us', 'eu', 'au', 'ca', 'jp', 'in', 'sg', 'kr', 'gb', 'ae'] as const

/** A data-residency region id, also the region's domain prefix. */
export type OpenAiRegion = (typeof OPENAI_REGIONS)[number]

export const openAiRegionSchema = z.enum(OPENAI_REGIONS)

/** Display names for the region picker, matching OpenAI's region list. */
export const OPENAI_REGION_LABELS: Readonly<Record<OpenAiRegion, string>> = {
  us: 'United States',
  eu: 'Europe (EEA + Switzerland)',
  au: 'Australia',
  ca: 'Canada',
  jp: 'Japan',
  in: 'India',
  sg: 'Singapore',
  kr: 'South Korea',
  gb: 'United Kingdom',
  ae: 'United Arab Emirates',
}

/** The label for an entry's region; `undefined` is the global endpoint. */
export function openAiRegionLabel(region: OpenAiRegion | undefined): string {
  return region === undefined ? 'Global' : OPENAI_REGION_LABELS[region]
}

export const OPENAI_GLOBAL_BASE_URL = 'https://api.openai.com/v1'

/** The OpenAI API base URL (with `/v1`) for an entry's region. */
export function openAiBaseUrl(region: OpenAiRegion | undefined): string {
  return region === undefined ? OPENAI_GLOBAL_BASE_URL : `https://${region}.api.openai.com/v1`
}
