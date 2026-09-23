/**
 * @jest-environment jsdom
 */
import React, { act } from 'react'
import type { Root } from 'react-dom/client'
import { createRoot } from 'react-dom/client'

import ChatInput from './ChatInput'
import type { SubmitResult } from './composer'

// Structural stand-in for the fields the composer reads off the active note.
// TFile is an Obsidian runtime class that jsdom cannot construct.
type FakeNote = { path: string; extension: string; basename: string }

let mockActiveFile: FakeNote | null = null
let mockAttachCurrentNote = false
let mockNoteToggle: ((file: FakeNote) => void) | null = null

jest.mock('../../contexts/language-context', () => ({
  useLanguage: () => ({
    language: 'en',
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}))
jest.mock('../../contexts/settings-context', () => ({
  useSettings: () => ({
    settings: { attachCurrentNote: mockAttachCurrentNote },
  }),
}))
jest.mock('../../contexts/input-history-context', () => ({
  useInputHistory: () => ({
    getEntries: () => [],
    append: () => Promise.resolve(),
  }),
}))
jest.mock('./useActiveFile', () => ({ useActiveFile: () => mockActiveFile }))
jest.mock('./NotePicker', () => ({
  NotePicker: (props: { onToggle: (file: FakeNote) => void }) => {
    mockNoteToggle = props.onToggle
    return null
  },
}))
jest.mock('./selects', () => ({
  ModeSelect: () => null,
  ConfigOptionSelect: () => null,
  EFFORT_ICON: null,
  findConfigOption: () => null,
}))

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

// Obsidian augments HTMLElement with setCssProps; jsdom has no such API.
if (
  typeof HTMLElement !== 'undefined' &&
  !('setCssProps' in HTMLElement.prototype)
) {
  Object.defineProperty(HTMLElement.prototype, 'setCssProps', {
    configurable: true,
    writable: true,
    value(this: HTMLElement, props: Record<string, string>) {
      for (const [key, value] of Object.entries(props)) {
        this.style.setProperty(
          key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
          value,
        )
      }
    },
  })
}

type Props = React.ComponentProps<typeof ChatInput>

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function resolvedSubmit(): Props['onSubmit'] {
  return jest.fn(async () => 'accepted')
}

function baseProps(overrides: Partial<Props> = {}): Props {
  return {
    running: false,
    disabled: false,
    commands: [],
    mode: null,
    configOptions: [],
    onModeChange: jest.fn(),
    onConfigOptionChange: jest.fn(),
    onSubmit: resolvedSubmit(),
    onCancel: jest.fn(),
    ...overrides,
  }
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  mockActiveFile = null
  mockAttachCurrentNote = false
  mockNoteToggle = null
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
  document.body.innerHTML = ''
})

function render(props: Props) {
  act(() => {
    root.render(<ChatInput {...props} />)
  })
}

function getTextarea(): HTMLTextAreaElement {
  const textarea = container.querySelector('textarea')
  if (!textarea) throw new Error('textarea was not rendered')
  return textarea
}

function typeText(textarea: HTMLTextAreaElement, value: string) {
  // React's controlled-input value tracker ignores a plain `textarea.value`
  // assignment, so set the value through the native prototype setter before
  // dispatching the input event.
  // eslint-disable-next-line @typescript-eslint/unbound-method -- the prototype setter is invoked with an explicit receiver below
  const setValue = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value',
  )?.set
  setValue?.call(textarea, value)
  act(() => {
    textarea.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
}

function pressEnter(
  textarea: HTMLTextAreaElement,
  init: KeyboardEventInit = {},
) {
  act(() => {
    textarea.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        ...init,
      }),
    )
  })
}

/**
 * Emulates the browser moving focus to <body> when the focused textarea gets
 * disabled. jsdom ignores blur() on a disabled element, so focus a throwaway
 * element and remove it to trigger the same focus fixup.
 */
function emulateBrowserBlur() {
  const scratch = document.createElement('button')
  document.body.appendChild(scratch)
  scratch.focus()
  scratch.remove()
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function note(path: string): FakeNote {
  const basename = path.replace(/\.md$/, '').split('/').pop() ?? path
  return { path, extension: 'md', basename }
}

function chipFor(path: string): Element | null {
  return container.querySelector(`.yolo-acp-note-chip[title="${path}"]`)
}

function currentNoteChip(): Element | null {
  return container.querySelector('.yolo-acp-note-chip.is-current')
}

function clickRemoveCurrentNote() {
  const button = currentNoteChip()?.querySelector('.yolo-acp-note-chip__remove')
  if (!button) throw new Error('current note remove button was not rendered')
  act(() => {
    button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  })
}

async function sendText(textarea: HTMLTextAreaElement, value: string) {
  typeText(textarea, value)
  pressEnter(textarea)
  await flush()
}

describe('ChatInput submit focus', () => {
  it('restores focus to the emptied composer after Enter sends', async () => {
    const submit = deferred<SubmitResult>()
    const onSubmit = jest.fn(() => submit.promise)
    render(baseProps({ onSubmit }))
    const textarea = getTextarea()
    typeText(textarea, 'hello')
    textarea.focus()
    expect(document.activeElement).toBe(textarea)

    pressEnter(textarea)
    // Browsers blur a focused element when it becomes disabled. jsdom keeps
    // focus, so emulate the browser here to reproduce the production bug.
    emulateBrowserBlur()
    expect(textarea.disabled).toBe(true)
    expect(document.activeElement).not.toBe(textarea)

    await act(async () => {
      submit.resolve('accepted')
      await submit.promise
    })
    await flush()

    expect(onSubmit).toHaveBeenCalledWith('hello', [], [])
    expect(textarea.value).toBe('')
    expect(textarea.disabled).toBe(false)
    expect(document.activeElement).toBe(textarea)
  })

  it('keeps multiline behavior: Shift+Enter does not submit and keeps focus', () => {
    const onSubmit = resolvedSubmit()
    render(baseProps({ onSubmit }))
    const textarea = getTextarea()
    typeText(textarea, 'line one')
    textarea.focus()

    pressEnter(textarea, { shiftKey: true })

    expect(onSubmit).not.toHaveBeenCalled()
    expect(textarea.value).toBe('line one')
    expect(document.activeElement).toBe(textarea)
  })

  it('does not focus on mount and never focuses during streaming re-renders', () => {
    const onSubmit = resolvedSubmit()
    render(baseProps({ onSubmit }))
    const textarea = getTextarea()
    expect(document.activeElement).not.toBe(textarea)

    // Streaming chunks, message list and session state updates re-render the
    // parent; the composer must not grab focus.
    act(() => {
      root.render(
        <ChatInput
          {...baseProps({
            onSubmit,
            running: true,
            mode: { current: 'build', available: [] },
          })}
        />,
      )
    })
    expect(document.activeElement).not.toBe(textarea)

    act(() => {
      root.render(
        <ChatInput
          {...baseProps({
            onSubmit,
            running: true,
            mode: { current: 'plan', available: [] },
          })}
        />,
      )
    })
    expect(document.activeElement).not.toBe(textarea)
  })

  it('does not steal focus when the user moved elsewhere during submit', async () => {
    const submit = deferred<SubmitResult>()
    const onSubmit = jest.fn(() => submit.promise)
    render(baseProps({ onSubmit }))
    const textarea = getTextarea()
    typeText(textarea, 'hello')
    textarea.focus()

    pressEnter(textarea)
    emulateBrowserBlur()
    const other = document.createElement('button')
    document.body.appendChild(other)
    other.focus()

    await act(async () => {
      submit.resolve('accepted')
      await submit.promise
    })
    await flush()

    expect(document.activeElement).toBe(other)
  })

  it('leaves focus inside a dialog when one takes focus during submit', async () => {
    const submit = deferred<SubmitResult>()
    const onSubmit = jest.fn(() => submit.promise)
    render(baseProps({ onSubmit }))
    const textarea = getTextarea()
    typeText(textarea, 'hello')
    textarea.focus()

    pressEnter(textarea)
    emulateBrowserBlur()
    const modal = document.createElement('div')
    modal.className = 'modal-container'
    const modalButton = document.createElement('button')
    modal.appendChild(modalButton)
    document.body.appendChild(modal)
    modalButton.focus()

    await act(async () => {
      submit.resolve('accepted')
      await submit.promise
    })
    await flush()

    expect(document.activeElement).toBe(modalButton)
  })

  it('ignores re-entry while a submission is pending and restores once', async () => {
    const submit = deferred<SubmitResult>()
    const onSubmit = jest.fn(() => submit.promise)
    render(baseProps({ onSubmit }))
    const textarea = getTextarea()
    typeText(textarea, 'hello')
    textarea.focus()

    pressEnter(textarea)
    emulateBrowserBlur()
    pressEnter(textarea)

    expect(onSubmit).toHaveBeenCalledTimes(1)

    await act(async () => {
      submit.resolve('accepted')
      await submit.promise
    })
    await flush()

    expect(document.activeElement).toBe(textarea)
  })

  it('does not auto-focus after the composer remounts', () => {
    render(baseProps())
    expect(document.activeElement).not.toBe(getTextarea())

    act(() => {
      root.unmount()
    })
    root = createRoot(container)
    render(baseProps())

    expect(document.activeElement).not.toBe(getTextarea())
  })
})

describe('ChatInput current-note auto attach', () => {
  function autoAttachProps(): Props {
    return baseProps({ onSubmit: resolvedSubmit() })
  }

  it('auto-attaches the active note by default', () => {
    mockAttachCurrentNote = true
    mockActiveFile = note('A.md')

    render(autoAttachProps())

    expect(chipFor('A.md')).not.toBeNull()
    expect(currentNoteChip()).not.toBeNull()
  })

  it('keeps the active note detached after X, across several sends', async () => {
    mockAttachCurrentNote = true
    mockActiveFile = note('A.md')
    render(autoAttachProps())
    const textarea = getTextarea()
    expect(chipFor('A.md')).not.toBeNull()

    clickRemoveCurrentNote()
    expect(chipFor('A.md')).toBeNull()

    await sendText(textarea, 'one')
    expect(chipFor('A.md')).toBeNull()
    await sendText(textarea, 'two')
    expect(chipFor('A.md')).toBeNull()
    await sendText(textarea, 'three')
    expect(chipFor('A.md')).toBeNull()
  })

  it('re-enables auto attach when the active note changes', async () => {
    mockAttachCurrentNote = true
    mockActiveFile = note('A.md')
    render(autoAttachProps())
    clickRemoveCurrentNote()
    await sendText(getTextarea(), 'one')
    expect(chipFor('A.md')).toBeNull()

    mockActiveFile = note('B.md')
    render(autoAttachProps())

    expect(chipFor('A.md')).toBeNull()
    expect(chipFor('B.md')).not.toBeNull()
  })

  it('suppresses the new note again and resets on the next one', async () => {
    mockAttachCurrentNote = true
    mockActiveFile = note('A.md')
    render(autoAttachProps())
    clickRemoveCurrentNote()

    mockActiveFile = note('B.md')
    render(autoAttachProps())
    expect(chipFor('B.md')).not.toBeNull()
    clickRemoveCurrentNote()
    await sendText(getTextarea(), 'one')
    expect(chipFor('B.md')).toBeNull()

    mockActiveFile = note('C.md')
    render(autoAttachProps())

    expect(chipFor('B.md')).toBeNull()
    expect(chipFor('C.md')).not.toBeNull()
  })

  it('never auto attaches while the setting is disabled', () => {
    mockAttachCurrentNote = false
    mockActiveFile = note('A.md')
    render(autoAttachProps())
    expect(chipFor('A.md')).toBeNull()

    mockActiveFile = note('B.md')
    render(autoAttachProps())
    expect(chipFor('B.md')).toBeNull()
  })

  it('still attaches notes when the user adds them manually after X', () => {
    mockAttachCurrentNote = true
    mockActiveFile = note('A.md')
    render(autoAttachProps())
    clickRemoveCurrentNote()
    expect(chipFor('A.md')).toBeNull()

    // A different note is always a manual attachment, regardless of suppression.
    act(() => {
      mockNoteToggle?.(note('B.md'))
    })
    expect(chipFor('B.md')).not.toBeNull()

    // The current note can still be added back by hand.
    act(() => {
      mockNoteToggle?.(note('A.md'))
    })
    expect(chipFor('A.md')).not.toBeNull()
  })

  it('isolates suppression between composer instances', () => {
    mockAttachCurrentNote = true
    mockActiveFile = note('A.md')
    render(autoAttachProps())

    const secondContainer = document.createElement('div')
    document.body.appendChild(secondContainer)
    const secondRoot = createRoot(secondContainer)
    act(() => {
      secondRoot.render(<ChatInput {...autoAttachProps()} />)
    })

    clickRemoveCurrentNote()
    expect(chipFor('A.md')).toBeNull()
    expect(
      secondContainer.querySelector('.yolo-acp-note-chip[title="A.md"]'),
    ).not.toBeNull()

    act(() => {
      secondRoot.unmount()
    })
    secondContainer.remove()
  })

  it('ends on the final active note after rapid switching', async () => {
    mockAttachCurrentNote = true
    mockActiveFile = note('A.md')
    render(autoAttachProps())
    clickRemoveCurrentNote()
    await sendText(getTextarea(), 'one')

    mockActiveFile = note('B.md')
    render(autoAttachProps())
    mockActiveFile = note('C.md')
    render(autoAttachProps())

    expect(chipFor('A.md')).toBeNull()
    expect(chipFor('B.md')).toBeNull()
    expect(chipFor('C.md')).not.toBeNull()
  })
})
