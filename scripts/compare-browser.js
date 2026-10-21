async page => {
  page.setDefaultTimeout(8000);
  page.setDefaultNavigationTimeout(8000);
  const origins = { baseline: 'http://127.0.0.1:58101', candidate: 'http://127.0.0.1:58102' };
  const viewports = { desktop: { width: 1440, height: 1000 }, phone: { width: 390, height: 844 } };
  const results = {};
  await page.addInitScript(() => { try { sessionStorage.clear(); } catch {} });
  const capture = async (origin, viewport, state) => {
    const events = [];
    let jobPolls = 0;
    let completeJob = false;
    await page.goto("about:blank");
    await page.setViewportSize(viewport);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const jobState = ['job', 'collectionPolling', 'modelCompletion', 'restoredJob'].includes(state);
    await page.route(`${origin}/api/status`, route => {
      events.push('status');
      return route.fulfill({ json: { connected: false, reason: 'Fixture connection', activeJob: jobState ? 'fixture-job' : null } });
    });
    if (jobState) {
      await page.route(`${origin}/api/jobs/fixture-job`, route => {
        jobPolls++;
        const complete = state === 'modelCompletion' && completeJob;
        return route.fulfill({ json: { id: 'fixture-job', status: complete ? 'done' : 'running', stage: complete ? 'done' : 'model', message: complete ? 'Fixture complete.' : 'Building the safe fixture sculpture.', specimenId: state === 'modelCompletion' ? 'example-lantern' : undefined } });
      });
    }
    if (state === 'restoredJob') {
      await page.route(`${origin}/api/specimens`, async route => {
        events.push('specimens:start');
        const response = await route.fetch();
        events.push('specimens');
        await route.fulfill({ response });
      });
    }
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#connection span')?.textContent === 'Codex offline · Retry');
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    if (['job', 'collectionPolling', 'restoredJob'].includes(state)) await page.waitForSelector('#pending-visual');
    else await page.waitForSelector('#field-notes h2');
    if (state === 'collection') await page.getByRole('button', { name: /Collection/ }).click();
    if (state === 'model') await page.getByRole('tab', { name: '3D print' }).click();
    if (state === 'form') await page.getByRole('button', { name: /Nature’s mistake/ }).click();
    if (state === 'model') await page.waitForSelector('#model-viewer canvas');
    if (state === 'collectionPolling') {
      await page.getByRole('button', { name: /Collection/ }).click();
      const response = await page.waitForResponse(response => response.url() === `${origin}/api/jobs/fixture-job`);
      await response.finished();
      await page.waitForTimeout(50);
    }
    if (state === 'modelCompletion') {
      await page.getByRole('tab', { name: '3D print' }).click();
      await page.waitForSelector('#model-viewer canvas');
      completeJob = true;
      await page.waitForFunction(() => document.querySelector('#status-box')?.classList.contains('hidden'));
    }
    const result = await page.evaluate(async () => {
      const hash = async value => {
        const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
        return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      };
      const styles = [...document.querySelectorAll('*')].map((element, index) => {
        const computed = getComputedStyle(element);
        return [index, element.tagName, [...computed].map(name => [name, computed.getPropertyValue(name)])];
      });
      const canvases = [...document.querySelectorAll('canvas')].map(canvas => ({ width: canvas.width, height: canvas.height, clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight }));
      return { dom: await hash(document.querySelector('#app').outerHTML), styles: await hash(JSON.stringify(styles)), canvases,
        page: document.querySelector('#collection').classList.contains('hidden') ? 'lab' : 'collection',
        tab: document.querySelector('#portrait-tab').getAttribute('aria-selected') === 'true' ? 'portrait' : 'model' };
    });
    result.events = events;
    return result;
  };
  for (const [viewportName, viewport] of Object.entries(viewports)) {
    for (const state of ['studio', 'collection', 'model', 'form', 'job', 'collectionPolling', 'modelCompletion', 'restoredJob']) {
      const baseline = await capture(origins.baseline, viewport, state);
      const candidate = await capture(origins.candidate, viewport, state);
      const key = `${viewportName}/${state}`;
      results[key] = {
        dom: baseline.dom === candidate.dom,
        styles: baseline.styles === candidate.styles,
        canvasDimensions: JSON.stringify(baseline.canvases) === JSON.stringify(candidate.canvases),
        baselineHashes: { dom: baseline.dom, styles: baseline.styles },
        candidateHashes: { dom: candidate.dom, styles: candidate.styles },
        canvasCount: baseline.canvases.length,
        behavior: {
          baselinePage: baseline.page, candidatePage: candidate.page,
          baselineTab: baseline.tab, candidateTab: candidate.tab,
          baselineEvents: baseline.events, candidateEvents: candidate.events,
        },
      };
      if (!results[key].dom || !results[key].styles || !results[key].canvasDimensions) throw new Error(`${key}: rendering differs`);
      if (baseline.page !== candidate.page || baseline.tab !== candidate.tab || JSON.stringify(baseline.events) !== JSON.stringify(candidate.events)) throw new Error(`${key}: lifecycle differs`);
      if (state === 'collectionPolling' && candidate.page !== 'collection') throw new Error(`${key}: polling changed the selected page`);
      if (state === 'modelCompletion' && candidate.tab !== 'portrait') throw new Error(`${key}: completed job did not select portrait`);
      if (state === 'restoredJob' && (candidate.events.indexOf('specimens') < 0 || candidate.events.indexOf('status') < 0 || candidate.events.indexOf('specimens') > candidate.events.indexOf('status'))) throw new Error(`${key}: restored job started before specimens loaded`);
    }
  }
  return results;
}
