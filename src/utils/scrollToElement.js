function navbarOffset() {
  const nav = document.querySelector('.navbar-header')
  return (nav?.offsetHeight || 72) + 12
}

function pageY() {
  return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0
}

function setPageY(top) {
  const y = Math.max(0, top)
  window.scrollTo(0, y)
  document.documentElement.scrollTop = y
  document.body.scrollTop = y
}

function scrollOverflowAncestors(el, offset) {
  let parent = el.parentElement
  while (parent && parent !== document.documentElement) {
    if (parent.scrollHeight - parent.clientHeight > 1) {
      const top =
        el.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop - offset
      parent.scrollTop = Math.max(0, top)
    }
    parent = parent.parentElement
  }
}

function attemptScroll(el) {
  const offset = navbarOffset()
  const y = el.getBoundingClientRect().top + pageY() - offset

  try {
    el.scrollIntoView({ block: 'center', inline: 'nearest' })
  } catch {
    el.scrollIntoView(true)
  }

  setPageY(y)
  scrollOverflowAncestors(el, offset)

  if (typeof el.focus === 'function') {
    try {
      el.focus({ preventScroll: false })
    } catch {
      el.focus()
    }
  }
}

export function scrollToElement(el) {
  if (!el) return
  if (!el.hasAttribute('tabindex')) {
    el.setAttribute('tabindex', '-1')
  }
  attemptScroll(el)
  ;[50, 200, 500, 900].forEach((ms) => {
    window.setTimeout(() => attemptScroll(el), ms)
  })
}

export function waitForLayout() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.setTimeout(resolve, 150)
      })
    })
  })
}
