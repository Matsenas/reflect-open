import type { ReactElement } from 'react'
import {
  OPENAI_REGIONS,
  OPENAI_REGION_LABELS,
  openAiRegionLabel,
  openAiRegionSchema,
  type OpenAiRegion,
} from '@reflect/core'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx'

/** The picker's value for "no residency region" — never persisted. */
const GLOBAL_VALUE = 'global'

const REGION_ITEMS = [
  { value: GLOBAL_VALUE, label: openAiRegionLabel(undefined) },
  ...OPENAI_REGIONS.map((region) => ({ value: region, label: OPENAI_REGION_LABELS[region] })),
]

interface OpenAiRegionSelectProps {
  /** The selected region; undefined is the global endpoint. */
  value: OpenAiRegion | undefined
  onChange: (region: OpenAiRegion | undefined) => void
  ariaLabel?: string
  size?: 'default' | 'sm'
  className?: string
}

/**
 * Picks an OpenAI entry's data-residency region (Global or one of OpenAI's
 * regional endpoints), shared by the add-provider form, the mobile sheet,
 * and the provider rows.
 */
export function OpenAiRegionSelect({
  value,
  onChange,
  ariaLabel = 'Data residency',
  size = 'default',
  className = 'w-full',
}: OpenAiRegionSelectProps): ReactElement {
  return (
    <Select
      value={value ?? GLOBAL_VALUE}
      items={REGION_ITEMS}
      onValueChange={(next) => {
        const parsed = openAiRegionSchema.safeParse(next)
        onChange(parsed.success ? parsed.data : undefined)
      }}
    >
      <SelectTrigger aria-label={ariaLabel} size={size} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {REGION_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
