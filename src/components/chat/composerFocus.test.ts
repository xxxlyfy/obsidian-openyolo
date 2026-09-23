/**
 * @jest-environment jsdom
 */
import {
  restoreComposerFocus,
  shouldRestoreComposerFocus,
} from './composerFocus'

function makeTextarea(): HTMLTextAreaElement {
  const textarea = document.createElement('textarea')
  document.body.appendChild(textarea)
  return textarea
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('composerFocus', () => {
  it('focuses a connected, enabled textarea when nothing else owns focus', () => {
    const textarea = makeTextarea()
    expect(restoreComposerFocus(textarea)).toBe(true)
    expect(document.activeElement).toBe(textarea)
  })

  it('reports focus as restored when the textarea already owns it', () => {
    const textarea = makeTextarea()
    textarea.focus()
    expect(shouldRestoreComposerFocus(textarea)).toBe(true)
    expect(restoreComposerFocus(textarea)).toBe(true)
    expect(document.activeElement).toBe(textarea)
  })

  it('does not steal focus from another element', () => {
    const textarea = makeTextarea()
    const other = document.createElement('button')
    document.body.appendChild(other)
    other.focus()

    expect(shouldRestoreComposerFocus(textarea)).toBe(false)
    expect(restoreComposerFocus(textarea)).toBe(false)
    expect(document.activeElement).toBe(other)
  })

  it('does not focus a disabled textarea', () => {
    const textarea = makeTextarea()
    textarea.disabled = true

    expect(shouldRestoreComposerFocus(textarea)).toBe(false)
    expect(restoreComposerFocus(textarea)).toBe(false)
    expect(document.activeElement).not.toBe(textarea)
  })

  it('does not focus a detached textarea', () => {
    const textarea = document.createElement('textarea')
    expect(shouldRestoreComposerFocus(textarea)).toBe(false)
    expect(restoreComposerFocus(textarea)).toBe(false)
  })

  it('handles a missing textarea', () => {
    expect(shouldRestoreComposerFocus(null)).toBe(false)
    expect(restoreComposerFocus(null)).toBe(false)
  })
})
