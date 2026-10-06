import { describe, expect, it } from 'vitest'
import {
  OPENAI_GLOBAL_BASE_URL,
  OPENAI_REGIONS,
  OPENAI_REGION_LABELS,
  openAiBaseUrl,
  openAiRegionLabel,
} from './openai-region.ts'

describe('openAiBaseUrl', () => {
  it('uses the global endpoint when no region is set', () => {
    expect(openAiBaseUrl(undefined)).toBe(OPENAI_GLOBAL_BASE_URL)
    expect(OPENAI_GLOBAL_BASE_URL).toBe('https://api.openai.com/v1')
  })

  it('prefixes the domain with the residency region', () => {
    expect(openAiBaseUrl('eu')).toBe('https://eu.api.openai.com/v1')
    expect(openAiBaseUrl('us')).toBe('https://us.api.openai.com/v1')
  })
})

describe('openAiRegionLabel', () => {
  it('names the global endpoint and every region', () => {
    expect(openAiRegionLabel(undefined)).toBe('Global')
    expect(openAiRegionLabel('eu')).toBe('Europe (EEA + Switzerland)')
    for (const region of OPENAI_REGIONS) {
      expect(OPENAI_REGION_LABELS[region]).not.toBe('')
    }
  })
})
