const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function handleTablistKeydown(event) {
  const vertical = event.currentTarget.getAttribute('aria-orientation') === 'vertical'
  const previousKey = vertical ? 'ArrowUp' : 'ArrowLeft'
  const nextKey = vertical ? 'ArrowDown' : 'ArrowRight'
  const keys = [previousKey, nextKey, 'Home', 'End']
  if (!keys.includes(event.key)) return

  const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')]
    .filter(tab => !tab.disabled && !tab.hidden)
  if (!tabs.length) return

  const currentIndex = tabs.indexOf(event.target.closest('[role="tab"]'))
  if (currentIndex < 0) return

  event.preventDefault()
  const direction = event.key === previousKey ? -1 : 1
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? tabs.length - 1
      : (currentIndex + direction + tabs.length) % tabs.length
  tabs[nextIndex].focus()
  tabs[nextIndex].click()
}

export function handleDialogKeydown(event, onEscape) {
  if (event.key === 'Escape') {
    event.preventDefault()
    onEscape()
    return
  }
  if (event.key !== 'Tab') return

  const dialog = event.currentTarget
  const focusable = [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)]
    .filter(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden')
  if (!focusable.length) {
    event.preventDefault()
    dialog.focus()
    return
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
    event.preventDefault()
    first.focus()
  }
}
