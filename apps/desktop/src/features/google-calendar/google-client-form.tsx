import type { ReactElement } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import type { GoogleOAuthClient } from './lib/google-oauth.ts'

interface GoogleClientFormProps {
  /** Start the sign-in with the entered OAuth client. */
  onSubmit: (client: GoogleOAuthClient) => void
  disabled?: boolean
}

interface GoogleClientValues {
  clientId: string
  clientSecret: string
}

const FIELD_LABEL_CLASS = 'text-xs font-medium text-text-secondary'
const FIELD_ERROR_CLASS = 'text-xs text-red-600 dark:text-red-400'

/**
 * The two values of the user's own Google OAuth client. They go to the
 * keychain, never to settings or the graph.
 */
export function GoogleClientForm({
  onSubmit,
  disabled = false,
}: GoogleClientFormProps): ReactElement {
  const { register, handleSubmit, formState } = useForm<GoogleClientValues>({
    defaultValues: { clientId: '', clientSecret: '' },
  })
  const submitForm = handleSubmit((values) => {
    onSubmit({ clientId: values.clientId.trim(), clientSecret: values.clientSecret.trim() })
  })
  return (
    <form
      onSubmit={(event) => {
        void submitForm(event)
      }}
      className="flex flex-col gap-3"
    >
      <label className="flex flex-col gap-1">
        <span className={FIELD_LABEL_CLASS}>Client ID</span>
        <Input
          autoComplete="off"
          spellCheck={false}
          placeholder="…apps.googleusercontent.com"
          aria-invalid={formState.errors.clientId !== undefined}
          {...register('clientId', {
            validate: (value) => value.trim() !== '' || 'Enter the client ID.',
          })}
        />
        {formState.errors.clientId ? (
          <span role="alert" className={FIELD_ERROR_CLASS}>
            {formState.errors.clientId.message}
          </span>
        ) : null}
      </label>
      <label className="flex flex-col gap-1">
        <span className={FIELD_LABEL_CLASS}>Client secret</span>
        <Input
          type="password"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={formState.errors.clientSecret !== undefined}
          {...register('clientSecret', {
            validate: (value) => value.trim() !== '' || 'Enter the client secret.',
          })}
        />
        {formState.errors.clientSecret ? (
          <span role="alert" className={FIELD_ERROR_CLASS}>
            {formState.errors.clientSecret.message}
          </span>
        ) : null}
      </label>
      <div>
        <Button type="submit" size="sm" disabled={disabled}>
          Connect Google Calendar
        </Button>
      </div>
    </form>
  )
}
