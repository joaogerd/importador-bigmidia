(() => {
  'use strict';

  const ROOT_ID = 'ykl-root';
  let observer = null;
  let resizeTimer = null;
  let responsiveTimer = null;

  function root() {
    return document.getElementById(ROOT_ID);
  }

  function measureBodyOverflow(panel) {
    const body = panel?.querySelector('.ykl-body');
    const dock = panel?.querySelector('.ykl-action-dock');
    if (!body || !dock) return false;

    // Mede o conteúdo sem o dock absoluto para evitar que a própria correção
    // altere o resultado e fique alternando entre ligado/desligado.
    const wasDocked = panel.classList.contains('ykl-action-docked');
    if (wasDocked) panel.classList.remove('ykl-action-docked');
    const overflows = body.scrollHeight > body.clientHeight + 20;
    if (wasDocked) panel.classList.add('ykl-action-docked');
    return overflows;
  }

  function updateResponsiveMode() {
    const panel = root();
    if (!panel) return;

    const hasDock = Boolean(panel.querySelector('.ykl-action-dock'));
    const lowViewport = window.innerHeight <= 1000;
    const compactViewport = window.innerHeight <= 900;
    const veryCompactViewport = window.innerHeight <= 760;
    const contentNeedsScroll = hasDock && measureBodyOverflow(panel);

    panel.classList.toggle('ykl-compact-height', compactViewport);
    panel.classList.toggle('ykl-very-compact-height', veryCompactViewport);

    // Regra de UX: ações críticas do cadastro ficam sempre acessíveis quando
    // falta altura útil, independentemente da resolução nominal da tela.
    panel.classList.toggle('ykl-action-docked', hasDock && (lowViewport || contentNeedsScroll));
  }

  function scheduleResponsiveUpdate(delay = 0) {
    clearTimeout(responsiveTimer);
    responsiveTimer = setTimeout(updateResponsiveMode, delay);
  }

  function installActionDock() {
    const panel = root();
    if (!panel) return false;

    if (panel.querySelector('.ykl-action-dock')) {
      scheduleResponsiveUpdate();
      return true;
    }

    const fill = panel.querySelector('#ykl-fill');
    const abort = panel.querySelector('#ykl-abort');
    const done = panel.querySelector('#ykl-done-next');
    const prev = panel.querySelector('#ykl-prev');
    const next = panel.querySelector('#ykl-next');
    if (!fill || !abort || !done || !prev || !next) {
      scheduleResponsiveUpdate();
      return false;
    }

    const actionRow = abort.closest('.ykl-row');
    const navRow = prev.closest('.ykl-row');
    if (!actionRow || !navRow) return false;

    const dock = document.createElement('div');
    dock.className = 'ykl-action-dock';
    fill.parentNode.insertBefore(dock, fill);
    dock.append(fill, actionRow, navRow);
    scheduleResponsiveUpdate();
    return true;
  }

  function init() {
    installActionDock();

    observer = new MutationObserver(() => {
      if (!root()) return;
      installActionDock();
      scheduleResponsiveUpdate(30);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(updateResponsiveMode, 120);
    });

    window.addEventListener('orientationchange', () => scheduleResponsiveUpdate(180));
    scheduleResponsiveUpdate(80);
  }

  init();
})();
