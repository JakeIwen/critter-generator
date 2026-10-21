async page => {
  const origins = { baseline: 'http://127.0.0.1:58101', candidate: 'http://127.0.0.1:58102' };
  const viewports = { desktop: { width: 1440, height: 1000 }, phone: { width: 390, height: 844 } };
  const results = {};
  await page.addInitScript(() => sessionStorage.clear());
  const capture = async (origin, viewport, state) => {
    await page.setViewportSize(viewport);
    await page.unrouteAll({ behavior: 'wait' });
    if (state === 'job') {
      await page.route(`${origin}/api/status`, route => route.fulfill({ json: { connected: false, activeJob: 'fixture-job' } }));
      await page.route(`${origin}/api/jobs/fixture-job`, route => route.fulfill({ json: { id: 'fixture-job', status: 'running', stage: 'model', message: 'Building the safe fixture sculpture.' } }));
    }
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    if (state === 'job') await page.waitForSelector('#pending-visual');
    else await page.waitForSelector('#field-notes h2');
    if (state === 'collection') await page.getByRole('button', { name: /Collection/ }).click();
    if (state === 'model') await page.getByRole('tab', { name: '3D print' }).click();
    if (state === 'form') await page.getByRole('button', { name: /Nature’s mistake/ }).click();
    if (state === 'model') await page.waitForSelector('#model-viewer canvas');
    return page.evaluate(async () => {
      const hash = async value => {
        const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
        return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      };
      const styles = [...document.querySelectorAll('*')].map((element, index) => {
        const computed = getComputedStyle(element);
        return [index, element.tagName, [...computed].map(name => [name, computed.getPropertyValue(name)])];
      });
      const canvases = [...document.querySelectorAll('canvas')].map(canvas => ({ width: canvas.width, height: canvas.height, clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight }));
      return { dom: await hash(document.querySelector('#app').outerHTML), styles: await hash(JSON.stringify(styles)), canvases };
    });
  };
  for (const [viewportName, viewport] of Object.entries(viewports)) {
    for (const state of ['studio', 'collection', 'model', 'form', 'job']) {
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
      };
    }
  }
  return results;
}
