/**
 * Focus helpers for the chat composer.
 *
 * The composer textarea is disabled while a submission is in flight. Browsers
 * move focus away from a focused element when it becomes disabled, so the
 * composer loses focus on every send. Once the submission settled we restore
 * focus, but only when the user has not moved on to another UI surface in the
 * meantime (history popover, modal, settings, command palette, ...).
 */

export function shouldRestoreComposerFocus(
  textarea: HTMLTextAreaElement | null,
): boolean {
  if (!textarea || textarea.disabled || !textarea.isConnected) return false
  const ownerDocument = textarea.ownerDocument
  const active = ownerDocument.activeElement
  // While the textarea was disabled the browser blurred it to <body>. If focus
  // landed anywhere else (or stayed on the textarea because the environment did
  // not blur it) we may (re)claim it; if another element owns focus the user
  // deliberately left the composer and we must not steal it back.
  return active === null || active === ownerDocument.body || active === textarea
}

/**
 * Focuses the composer textarea when it is safe to do so. Returns whether the
 * textarea ends up focused, so callers/tests can reason about the outcome.
 */
export function restoreComposerFocus(
  textarea: HTMLTextAreaElement | null,
): boolean {
  if (!textarea || !shouldRestoreComposerFocus(textarea)) return false
  textarea.focus()
  return textarea.ownerDocument.activeElement === textarea
}
