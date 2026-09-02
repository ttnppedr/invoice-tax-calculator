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

export const BROWSER_BAR_TIP_MS = 8000;

/**
 * 決定全螢幕對照要用哪種方式收掉瀏覽器 UI。
 * - fullscreen：瀏覽器支援 Fullscreen API（桌機、iPad、Android）。
 * - standalone：已從主畫面開啟（PWA），本來就沒有網址列。
 * - collapse-bars：iPhone Safari 沒有元素全螢幕，只能讓頁面可捲動，靠使用者上滑收合網址列。
 */
export function pickFullscreenStrategy({ fullscreenSupported, standalone }) {
  if (standalone) return 'standalone';
  if (fullscreenSupported) return 'fullscreen';
  return 'collapse-bars';
}

export function isStandaloneDisplay({ navigator: nav, matchMedia: mm } = {}) {
  if (nav?.standalone === true) return true;
  if (typeof mm !== 'function') return false;
  try {
    return Boolean(mm('(display-mode: standalone)').matches || mm('(display-mode: fullscreen)').matches);
  } catch {
    return false;
  }
}

function defaultIsStandalone() {
  return isStandaloneDisplay({
    navigator: globalThis.navigator,
    matchMedia: typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia.bind(window) : undefined,
  });
}

function defaultFullscreen(doc = globalThis.document) {
  if (!doc) return { supported: false, current: () => null };
  const el = doc.documentElement;
  const request = el?.requestFullscreen ?? el?.webkitRequestFullscreen;
  const exit = doc.exitFullscreen ?? doc.webkitExitFullscreen;
  return {
    supported: typeof request === 'function' && typeof exit === 'function',
    current: () => doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null,
    request: () => Promise.resolve(request.call(el, { navigationUI: 'hide' })),
    exit: () => Promise.resolve(exit.call(doc)),
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
  fullscreen = defaultFullscreen(),
  isStandalone = defaultIsStandalone,
  tipElement = null,
  tipDurationMs = BROWSER_BAR_TIP_MS,
} = {}) {
  let active = false;
  let scaleX = 1;
  let scaleY = 1;
  let rafId = 0;
  let settleId = 0;
  let tipId = 0;
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

  function requestFullscreen() {
    if (!fullscreen?.supported || fullscreen.current()) return;
    try {
      fullscreen.request().catch(() => {});
    } catch {
      // 瀏覽器拒絕時仍維持頁內放大。
    }
  }

  function leaveFullscreen() {
    if (!fullscreen?.supported || !fullscreen.current()) return;
    try {
      fullscreen.exit().catch(() => {});
    } catch {
      // ignore
    }
  }

  function hideTip() {
    window.clearTimeout(tipId);
    tipId = 0;
    if (tipElement) tipElement.hidden = true;
  }

  function showTip() {
    if (!tipElement) return;
    tipElement.hidden = false;
    window.clearTimeout(tipId);
    tipId = window.setTimeout(hideTip, tipDurationMs);
  }

  function currentStrategy() {
    return pickFullscreenStrategy({
      fullscreenSupported: Boolean(fullscreen?.supported),
      standalone: Boolean(isStandalone()),
    });
  }

  function enter() {
    if (active) return;
    active = true;
    root?.classList.add('enlarge-mode');
    const strategy = currentStrategy();
    root?.classList.toggle('enlarge-collapse-bars', strategy === 'collapse-bars');
    if (strategy === 'fullscreen') {
      requestFullscreen();
    } else if (strategy === 'collapse-bars') {
      // iPhone Safari：頁面留出網址列高度可捲動，使用者上滑即可收合網址列。
      window.scrollTo?.(0, 0);
      showTip();
    }
    closeButton?.focus();
    scheduleApply();
  }

  function exit() {
    if (!active) return;
    active = false;
    leaveFullscreen();
    hideTip();
    root?.classList.remove('enlarge-mode');
    root?.classList.remove('enlarge-collapse-bars');
    root?.classList.remove('is-invoice-editing');
    setScaleVars(1, 1);
    scaleX = 1;
    scaleY = 1;
    toggleButton?.setAttribute('aria-expanded', 'false');
    toggleButton?.focus();
    onLayoutChange();
    scheduleApply();
  }

  function onFullscreenChange() {
    if (active && fullscreen?.supported && !fullscreen.current()) {
      exit();
      return;
    }
    onViewportEvent();
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
    listen(document, 'fullscreenchange', onFullscreenChange);
    listen(document, 'webkitfullscreenchange', onFullscreenChange);
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
    window.clearTimeout(tipId);
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
