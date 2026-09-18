function navbarOffset() {
  const nav = document.querySelector('.navbar-header')
  return (nav?.offsetHeight || 72) + 12
}

function findScrollParent(el) {
  let parent = el.parentElement
  while (parent && parent !== document.body) {
    const style = getComputedStyle(parent)
    const overflowY = style.overflowY
    const overflowX = style.overflowX
    const scrollsY = parent.scrollHeight - parent.clientHeight > 1
    const explicit = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay'
    // overflow-x: hidden makes overflow-y compute to auto, so this ancestor
    // is often the real scroller on iOS even when window.scrollY stays 0.
    const hiddenXQuirk = overflowX !== 'visible' && overflowY === 'visible'
    if (scrollsY && (explicit || hiddenXQuirk)) {
      return parent
    }
    parent = parent.parentElement
  }
  return null
}

export function scrollToElement(el) {
  if (!el) return
  const offset = navbarOffset()
  const parent = findScrollParent(el)
  const top = parent
    ? el.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop - offset
    : el.getBoundingClientRect().top + (window.scrollY || window.pageYOffset) - offset
  const target = Math.max(0, top)
  const scroller = parent || window
  scroller.scrollTo({ top: target, behavior: 'smooth' })
  // iOS often ignores smooth scrollTo on overflow containers; jump if we didn't move.
  window.setTimeout(() => {
    const stillAbove = el.getBoundingClientRect().top > offset + 24
    const stillBelow = el.getBoundingClientRect().bottom < 0
    if (stillAbove || stillBelow) {
      scroller.scrollTo({ top: target, behavior: 'auto' })
    }
  }, 350)
}

export function waitForLayout() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.setTimeout(resolve, 80)
      })
    })
  })
}
