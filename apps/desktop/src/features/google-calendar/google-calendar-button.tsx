import type { ReactElement } from 'react'
import { CalendarCheck, CalendarPlus } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { GoogleCalendarDialog } from './google-calendar-dialog.tsx'
import { useGoogleCalendarState } from './use-google-calendar.ts'

/**
 * The planner header's Google Calendar control: shows whether an account is
 * connected and opens the connection dialog.
 */
export function GoogleCalendarButton(): ReactElement {
  const { status } = useGoogleCalendarState()
  const connected = status === 'connected'
  const label = connected ? 'Google Calendar connected' : 'Connect Google Calendar'
  return (
    <GoogleCalendarDialog
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          title={label}
          className="window-drag-control text-text-muted"
        >
          {connected ? (
            <CalendarCheck aria-hidden className="size-4" />
          ) : (
            <CalendarPlus aria-hidden className="size-4" />
          )}
        </Button>
      }
    />
  )
}
