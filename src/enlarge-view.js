const KEYBOARD_SHRINK_PX = 80;

export function computeUniformScale({ availWidth, availHeight, contentWidth, contentHeight }) {
  if (!(availWidth > 0 && availHeight > 0 && contentWidth > 0 && contentHeight > 0)) {
    return 1;
  }
  return Math.min(availWidth / contentWidth, availHeight / contentHeight);
}

export function computeStretchScale({ availWidth, availHeight, contentWidth, contentHeight }) {
  return {
    scaleX: availWidth > 0 && contentWidth > 0 ? availWidth / contentWidth : 1,
    scaleY: availHeight > 0 && contentHeight > 0 ? availHeight / contentHeight : 1,
  };
}

export function planEnlargeLayout({
  active,
  keyboardOpen = false,
  previousScaleX = 1,
  previousScaleY = 1,
  availWidth,
  availHeight,
  contentWidth,
  contentHeight,
}) {
  if (!active) {
    return { scaleX: 1, scaleY: 1 };
  }

  if (keyboardOpen && previousScaleX > 0 && previousScaleY > 0) {
    return { scaleX: previousScaleX, scaleY: previousScaleY };
  }

  return computeStretchScale({ availWidth, availHeight, contentWidth, contentHeight });
}

export function clientRectToLocal(rect, ancestorClientRect, ancestorLayoutSize) {
  const layoutW = ancestorLayoutSize?.width ?? 0;
  const layoutH = ancestorLayoutSize?.height ?? 0;
  const sx = layoutW > 0 && ancestorClientRect.width > 0 ? ancestorClientRect.width / layoutW : 1;
  const sy = layoutH > 0 && ancestorClientRect.height > 0 ? ancestorClientRect.height / layoutH : 1;
  const left = (rect.left - ancestorClientRect.left) / sx;
  const top = (rect.top - ancestorClientRect.top) / sy;
  const width = (rect.width ?? rect.right - rect.left) / sx;
  const height = (rect.height ?? rect.bottom - rect.top) / sy;
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
}

export function isKeyboardResize({ inputFocused, viewportHeight, layoutHeight }) {
  if (!inputFocused) return false;
  if (!(viewportHeight > 0 && layoutHeight > 0)) return false;
  return viewportHeight < layoutHeight - KEYBOARD_SHRINK_PX;
}

function defaultGetViewport() {
  const vv = window.visualViewport;
  if (vv) {
    return {
      width: vv.width,
      height: vv.height,
      offsetTop: vv.offsetTop,
      offsetLeft: vv.offsetLeft,
    };
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    offsetTop: 0,
    offsetLeft: 0,
  };
}

export function createEnlargeView({
  root,
  invoice,
  stage,
  scaleHost,
  toggleButton,
  closeButton,
  isBlockingOverlayOpen = () => false,
  onLayoutChange = () => {},
  getViewport = defaultGetViewport,
  matchMedia: matchMediaFn = (query) => window.matchMedia(query),
  requestAnimationFrame: rafFn = (callback) => window.requestAnimationFrame(callback),
  isInputFocused = () => Boolean(document.activeElement?.matches?.('input, textarea')),
} = {}) {
  let active = false;
  let scaleX = 1;
  let scaleY = 1;
  let rafId = 0;
  let settleId = 0;
  let resizeObserver = null;
  let landscapeMq = null;
  const listeners = [];

  function setScaleVars(nextX, nextY) {
    if (!scaleHost) return;
    if (!active) {
      scaleHost.style.removeProperty('--enlarge-scale-x');
      scaleHost.style.removeProperty('--enlarge-scale-y');
      return;
    }
    scaleHost.style.setProperty('--enlarge-scale-x', String(nextX));
    scaleHost.style.setProperty('--enlarge-scale-y', String(nextY));
  }

  function apply() {
    root?.classList.toggle('enlarge-mode', active);
    root?.classList.toggle('is-invoice-editing', Boolean(active && isInputFocused()));
    toggleButton?.setAttribute('aria-expanded', String(active));

    if (!active) {
      scaleX = 1;
      scaleY = 1;
      setScaleVars(1, 1);
      onLayoutChange();
      return;
    }

    const viewport = getViewport();
    const keyboardOpen = isKeyboardResize({
      inputFocused: isInputFocused(),
      viewportHeight: viewport.height,
      layoutHeight: window.innerHeight,
    });
    const contentWidth = invoice?.offsetWidth || invoice?.scrollWidth || 0;
    const contentHeight = invoice?.offsetHeight || invoice?.scrollHeight || 0;
    const plan = planEnlargeLayout({
      active,
      keyboardOpen,
      previousScaleX: scaleX,
      previousScaleY: scaleY,
      availWidth: stage?.clientWidth ?? viewport.width,
      availHeight: stage?.clientHeight ?? viewport.height,
      contentWidth,
      contentHeight,
    });

    scaleX = plan.scaleX;
    scaleY = plan.scaleY;
    setScaleVars(plan.scaleX, plan.scaleY);
    onLayoutChange();
  }

  function scheduleApply() {
    if (rafId) {
      window.cancelAnimationFrame(rafId);
    }
    rafId = rafFn(() => {
      rafId = 0;
      apply();
      window.clearTimeout(settleId);
      settleId = window.setTimeout(() => {
        settleId = 0;
        apply();
      }, 120);
    });
  }

  function onViewportEvent() {
    if (active) {
      scheduleApply();
      return;
    }
    onLayoutChange();
  }

  function enter() {
    if (active) return;
    active = true;
    root?.classList.add('enlarge-mode');
    closeButton?.focus();
    scheduleApply();
  }

  function exit() {
    if (!active) return;
    active = false;
    root?.classList.remove('enlarge-mode');
    root?.classList.remove('is-invoice-editing');
    setScaleVars(1, 1);
    scaleX = 1;
    scaleY = 1;
    toggleButton?.setAttribute('aria-expanded', 'false');
    toggleButton?.focus();
    onLayoutChange();
    scheduleApply();
  }

  function onKeydown(event) {
    if (event.key !== 'Escape' || !active) return;
    if (isBlockingOverlayOpen()) return;
    event.preventDefault();
    exit();
  }

  function onFocusChange() {
    if (!active) return;
    if (isInputFocused()) {
      root?.classList.add('is-invoice-editing');
      document.activeElement?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      return;
    }
    root?.classList.remove('is-invoice-editing');
    scheduleApply();
  }

  function listen(target, type, handler, options) {
    if (!target) return;
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  }

  function init() {
    landscapeMq = matchMediaFn('(orientation: landscape)');
    toggleButton?.addEventListener('click', enter);
    closeButton?.addEventListener('click', exit);
    listen(document, 'keydown', onKeydown, true);
    listen(window, 'resize', onViewportEvent);
    listen(window, 'orientationchange', onViewportEvent);
    listen(window.visualViewport, 'resize', onViewportEvent);
    listen(document, 'focusin', onFocusChange);
    listen(document, 'focusout', onFocusChange);
    if (typeof landscapeMq.addEventListener === 'function') {
      landscapeMq.addEventListener('change', onViewportEvent);
    } else if (typeof landscapeMq.addListener === 'function') {
      landscapeMq.addListener(onViewportEvent);
    }
    if (typeof ResizeObserver === 'function' && stage) {
      resizeObserver = new ResizeObserver(() => onViewportEvent());
      resizeObserver.observe(stage);
      if (invoice) resizeObserver.observe(invoice);
    }
    apply();
  }

  function dispose() {
    toggleButton?.removeEventListener('click', enter);
    closeButton?.removeEventListener('click', exit);
    for (const unbind of listeners) unbind();
    listeners.length = 0;
    if (landscapeMq) {
      if (typeof landscapeMq.removeEventListener === 'function') {
        landscapeMq.removeEventListener('change', onViewportEvent);
      } else if (typeof landscapeMq.removeListener === 'function') {
        landscapeMq.removeListener(onViewportEvent);
      }
    }
    resizeObserver?.disconnect();
    resizeObserver = null;
    window.clearTimeout(settleId);
    if (rafId) window.cancelAnimationFrame(rafId);
  }

  return {
    init,
    enter,
    exit,
    relayout: () => {
      if (active) {
        scheduleApply();
        return;
      }
      onLayoutChange();
    },
    isActive: () => active,
    getScale: () => ({ scaleX, scaleY }),
    dispose,
  };
}
