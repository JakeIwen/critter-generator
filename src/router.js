import { formatPagePath, parsePagePath } from '../shared/page-routes.mjs';

export function mountRouter(byId, { getSpecimens, specimenView, showCollection, settingsPage, toast }) {
  const labTitle = document.title;
  let owner = null, ready = false;
  const pages = {
    lab: { section: 'laboratory', title: labTitle, show: showLab },
    collection: { section: 'collection', title: 'Collection · Critter Generator', show: showCollection },
    settings: { section: 'settings', title: 'Settings · Critter Generator', show: () => void settingsPage.show() },
  };
  function write(route, replace) {
    const pathname = formatPagePath(route);
    if (location.pathname !== pathname || location.search || location.hash) {
      history[replace ? 'replaceState' : 'pushState'](null, '', pathname);
    }
  }
  function showLab(route, resetPortrait) {
    if (!ready) return;
    const specimens = getSpecimens();
    const specimen = route.specimenId ? specimens.find(item => item.id === route.specimenId) : specimens[0];
    if (route.specimenId && !specimen) {
      toast('Specimen not found'); navigate({ page: 'lab' }, true); return;
    }
    if (specimen) {
      document.title = route.specimenId ? `${specimen.englishName} · Critter Generator` : labTitle;
      return specimenView[resetPortrait ? 'selectPortrait' : 'select'](specimen, specimens);
    }
  }
  function render(resetPortrait = false) {
    let route = parsePagePath(location.pathname);
    if (!route || !pages[route.page]) { route = { page: 'lab' }; write(route, true); }
    if (route.page === 'settings' && owner === false) { route = { page: 'lab' }; write(route, true); }
    const waitingForOwner = route.page === 'settings' && owner === null;
    for (const [page, config] of Object.entries(pages)) byId(config.section).classList.toggle('hidden', waitingForOwner || page !== route.page);
    document.querySelectorAll('nav [data-page]').forEach(link => {
      link.classList.toggle('active', !waitingForOwner && link.dataset.page === route.page);
      if (link.dataset.page === route.page && !waitingForOwner) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.title = waitingForOwner ? labTitle : pages[route.page].title;
    if (!waitingForOwner) return pages[route.page].show(route, resetPortrait);
  }
  function navigate(route, replace = false) { write(route, replace); render(true); }
  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-page], a[data-specimen]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download')) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin) return;
    const route = parsePagePath(url.pathname);
    if (!route || !pages[route.page]) return;
    event.preventDefault(); navigate(route);
  });
  window.addEventListener('popstate', () => render(true));
  // Canonicalization belongs to the existing entry, never an extra Back-button step.
  write(parsePagePath(location.pathname) ?? { page: 'lab' }, true);
  render();
  return {
    navigate,
    // Owner status only gates the Settings page; re-rendering other pages would redraw the specimen.
    setOwner(value) { if (owner === value) return; owner = value; if (parsePagePath(location.pathname)?.page === 'settings') render(); },
    async refresh(specimenId) {
      ready = true;
      if (specimenId) {
        if (parsePagePath(location.pathname)?.page === 'lab') write({ page: 'lab', specimenId }, true);
        else {
          const specimen = getSpecimens().find(item => item.id === specimenId);
          if (specimen) await specimenView.select(specimen, getSpecimens());
        }
      }
      return render();
    },
  };
}
