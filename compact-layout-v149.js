(() => {
  'use strict';

  const ROOT_ID = 'ykl-root';
  let observer = null;
  let resizeTimer = null;

  function root() {
    return document.getElementById(ROOT_ID);
  }

  function updateCompactMode() {
    const panel = root();
    if (!panel) return;
    panel.classList.toggle('ykl-compact-height', window.innerHeight <= 900);
    panel.classList.toggle('ykl-very-compact-height', window.innerHeight <= 760);
  }

  function installActionDock() {
    const panel = root();
    if (!panel) return false;
    updateCompactMode();

    if (panel.querySelector('.ykl-action-dock')) return true;

    const fill = panel.querySelector('#ykl-fill');
    const abort = panel.querySelector('#ykl-abort');
    const done = panel.querySelector('#ykl-done-next');
    const prev = panel.querySelector('#ykl-prev');
    const next = panel.querySelector('#ykl-next');
    if (!fill || !abort || !done || !prev || !next) return false;

    const actionRow = abort.closest('.ykl-row');
    const navRow = prev.closest('.ykl-row');
    if (!actionRow || !navRow) return false;

    const dock = document.createElement('div');
    dock.className = 'ykl-action-dock';
    fill.parentNode.insertBefore(dock, fill);
    dock.append(fill, actionRow, navRow);
    return true;
  }

  function init() {
    installActionDock();

    observer = new MutationObserver(() => {
      if (!root()) return;
      installActionDock();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(updateCompactMode, 120);
    });
  }

  init();
})();
