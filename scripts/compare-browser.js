async page => {
  const origins = { baseline: 'http://127.0.0.1:58101', candidate: 'http://127.0.0.1:58102' };
  const viewports = { desktop: { width: 1440, height: 1000 }, phone: { width: 390, height: 844 } };
  const results = {};
  await page.addInitScript(() => sessionStorage.clear());
  const capture = async (origin, viewport, state) => {
    const events = [];
    let jobPolls = 0;
    await page.setViewportSize(viewport);
    await page.unrouteAll({ behavior: 'wait' });
    if (['job', 'collectionPolling', 'modelCompletion', 'restoredJob'].includes(state)) {
      await page.route(`${origin}/api/status`, route => {
        events.push('status');
        return route.fulfill({ json: { connected: false, activeJob: 'fixture-job' } });
      });
      await page.route(`${origin}/api/jobs/fixture-job`, route => {
        jobPolls++;
        const complete = state === 'modelCompletion' && jobPolls > 1;
        return route.fulfill({ json: { id: 'fixture-job', status: complete ? 'done' : 'running', stage: complete ? 'done' : 'model', message: complete ? 'Fixture complete.' : 'Building the safe fixture sculpture.', specimenId: state === 'modelCompletion' ? 'example-lantern' : undefined } });
      });
    }
    if (state === 'restoredJob') {
      await page.route(`${origin}/api/specimens`, async route => {
        events.push('specimens');
        await route.fulfill({ response: await route.fetch() });
      });
    }
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    if (['job', 'collectionPolling', 'restoredJob'].includes(state)) await page.waitForSelector('#pending-visual');
    else await page.waitForSelector('#field-notes h2');
    if (state === 'collection') await page.getByRole('button', { name: /Collection/ }).click();
    if (state === 'model') await page.getByRole('tab', { name: '3D print' }).click();
    if (state === 'form') await page.getByRole('button', { name: /Nature’s mistake/ }).click();
    if (state === 'model') await page.waitForSelector('#model-viewer canvas');
    if (state === 'collectionPolling') {
      await page.getByRole('button', { name: /Collection/ }).click();
      await page.waitForTimeout(2100);
    }
    if (state === 'modelCompletion') {
      await page.getByRole('tab', { name: '3D print' }).click();
      await page.waitForSelector('#model-viewer canvas');
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
      if (state === 'collectionPolling' && candidate.page !== 'collection') throw new Error(`${key}: polling changed the selected page`);
      if (state === 'modelCompletion' && candidate.tab !== 'portrait') throw new Error(`${key}: completed job did not select portrait`);
      if (state === 'restoredJob' && candidate.events.indexOf('specimens') > candidate.events.indexOf('status')) throw new Error(`${key}: restored job started before specimens loaded`);
    }
  }
  return results;
}
