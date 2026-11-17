import type { ReactElement, ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { InlineAlert } from '@/components/inline-alert.tsx'
import { Button } from '@/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.tsx'
import { useAsyncAction } from '@/hooks/use-async-action.ts'
import { useAppServices } from '@/services/services-provider.tsx'
import { GoogleClientForm } from './google-client-form.tsx'
import type { GoogleOAuthClient } from './lib/google-oauth.ts'
import { useGoogleCalendarService, useGoogleCalendarState } from './use-google-calendar.ts'

interface GoogleCalendarDialogProps {
  /** The element that opens the dialog. */
  trigger: ReactElement
}

const CREDENTIALS_URL = 'https://console.cloud.google.com/apis/credentials'
const LINK_CLASS = 'font-medium text-text underline underline-offset-2'

/**
 * Connect, check, or disconnect the Google Calendar account whose events the
 * week planner shows. The sign-in itself happens in the system browser.
 */
export function GoogleCalendarDialog({ trigger }: GoogleCalendarDialogProps): ReactElement {
  const service = useGoogleCalendarService()
  const { status, email, hasClient, canWrite } = useGoogleCalendarState()
  const { opener } = useAppServices()
  const queryClient = useQueryClient()
  const action = useAsyncAction()

  const connect = (client?: GoogleOAuthClient): void => {
    void action.run(async () => {
      if (await service.connect(client)) {
        await queryClient.invalidateQueries({ queryKey: ['google-calendar'] })
      }
    })
  }

  let body: ReactNode
  if (status === 'loading') {
    body = <p className="text-xs text-text-muted">Checking the connection…</p>
  } else if (status === 'connecting') {
    body = (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-text-secondary">
          Finish signing in to Google in your browser, then come back here.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void service.cancelConnect()}
        >
          Cancel
        </Button>
      </div>
    )
  } else if (status === 'connected') {
    body = (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-text-secondary">
          Connected{email === null ? '' : ` as ${email}`}. The planner shows events from the
          calendars ticked in Google Calendar.
        </p>
        {canWrite ? null : (
          <InlineAlert tone="warning">
            This sign-in is read-only. Disconnect and connect again to create and move events.
          </InlineAlert>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={action.pending}
          onClick={() => void action.run(() => service.disconnect())}
        >
          Disconnect
        </Button>
      </div>
    )
  } else if (hasClient) {
    body = (
      <div className="flex flex-col items-start gap-3">
        <Button type="button" size="sm" disabled={action.pending} onClick={() => connect()}>
          Connect Google Calendar
        </Button>
        <button
          type="button"
          className="text-xs text-text-muted underline underline-offset-2"
          onClick={() => void action.run(() => service.forgetClient())}
        >
          Use a different OAuth client
        </button>
      </div>
    )
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <ol className="list-decimal space-y-1 pl-4 text-xs text-text-muted">
          <li>
            In{' '}
            <button
              type="button"
              className={LINK_CLASS}
              onClick={() => opener.openUrlSync(CREDENTIALS_URL)}
            >
              Google Cloud Console
            </button>
            , create a project and enable the Google Calendar API.
          </li>
          <li>Set up the OAuth consent screen and add your Google account as a user.</li>
          <li>Create an OAuth client ID of type “Desktop app” and paste it below.</li>
        </ol>
        <GoogleClientForm onSubmit={connect} disabled={action.pending} />
      </div>
    )
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          action.reset()
        }
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Google Calendar</DialogTitle>
          <DialogDescription>
            Reflect signs in with your own Google OAuth client and talks straight to Google. It
            reads your calendars and can create and move events; the keys stay in your keychain.
          </DialogDescription>
        </DialogHeader>
        {body}
        {action.error === null ? null : <InlineAlert tone="error">{action.error}</InlineAlert>}
      </DialogContent>
    </Dialog>
  )
}
