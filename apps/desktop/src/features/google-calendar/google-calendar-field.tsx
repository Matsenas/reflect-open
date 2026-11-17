import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { GoogleCalendarDialog } from './google-calendar-dialog.tsx'
import { useGoogleCalendarState } from './use-google-calendar.ts'

/**
 * The Google Calendar row of Settings → Integrations: the connection at a
 * glance, and the dialog that changes it.
 */
export function GoogleCalendarField(): ReactElement {
  const { status, email } = useGoogleCalendarState()
  const connected = status === 'connected'
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <div className="text-sm font-medium text-text">Google Calendar</div>
        <p className="mt-0.5 text-xs text-text-muted">
          {connected
            ? `Connected${email === null ? '' : ` as ${email}`}. Events show in the task planner.`
            : 'Sign in with Google to show your meetings in the task planner.'}
        </p>
      </div>
      <GoogleCalendarDialog
        trigger={
          <Button type="button" variant="outline" size="sm" className="shrink-0">
            {connected ? 'Manage…' : 'Connect…'}
          </Button>
        }
      />
    </div>
  )
}
