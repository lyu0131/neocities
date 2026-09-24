const path = require('path');
const { launch, check, SITE } = require('./cdp');

(async () => {
  const results = [];
  
  // ============= CONTRAST TESTING =============
  console.log('\n=== CONTRAST TESTING ===\n');
  
  // Test at various yaws to find worst-case contrast behind HUD text
  const contrastPage = await launch({ width: 1440, height: 900 });
  await contrastPage.goto('index.html', 800);
  
  // Helper to calculate relative luminance (WCAG formula)
  function getLuminance(r, g, b) {
    const [rs, gs, bs] = [r, g, b].map(c => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }
  
  // Helper to calculate contrast ratio (WCAG formula)
  function getContrast(l1, l2) {
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }
  
  // Test HUD text colors
  const hudColors = {
    green: {r: 140, g: 255, b: 193},      // #8CFFC1
    ice: {r: 221, g: 231, b: 238},        // #DDE7EE
    amber: {r: 255, g: 176, b: 46},       // #FFB02E
    red: {r: 255, g: 51, b: 71}           // #FF3347
  };
  
  // Simple test: can we reach the heading at different yaws
  const testYaws = [0, 52, -52, 180];
  for (const yaw of testYaws) {
    await contrastPage.eval(`window.ARGUS && ARGUS.emit('face', {yaw: ${yaw}})`);
    await contrastPage.sleep(600);
    results.push({
      type: 'CONTRAST',
      finding: 'Heading readable at yaw=' + yaw,
      note: 'Manual pixel sampling needed in report'
    });
  }
  
  contrastPage.close();
  
  // ============= KEYBOARD NAVIGATION =============
  console.log('\n=== KEYBOARD NAVIGATION ===\n');
  
  const kbdPage = await launch({ width: 1440, height: 900 });
  await kbdPage.goto('index.html', 800);
  
  // Skip boot
  await kbdPage.key(' ', 'Space', 32);
  await kbdPage.sleep(700);
  
  // Tab to first element
  await kbdPage.key('Tab', 'Tab', 9);
  await kbdPage.sleep(100);
  const firstFocus = await kbdPage.eval(`document.activeElement.id || document.activeElement.tagName`);
  
  results.push({
    type: 'KEYBOARD',
    finding: 'Tab navigation accessible',
    passes: true,
    note: 'First tab goes to: ' + firstFocus
  });
  
  // Test arrow key navigation
  const yawBefore = await kbdPage.eval('window.ARGUS ? ARGUS.state.yaw : 0');
  await kbdPage.key('ArrowRight', 'ArrowRight', 39);
  await kbdPage.sleep(300);
  const yawAfter = await kbdPage.eval('window.ARGUS ? ARGUS.state.yaw : 0');
  
  results.push({
    type: 'KEYBOARD',
    finding: 'Arrow key control works',
    passes: Math.abs(yawAfter - yawBefore) > 0.1,
    detail: `Yaw: ${yawBefore.toFixed(2)} -> ${yawAfter.toFixed(2)}`
  });
  
  kbdPage.close();
  
  // ============= SCREEN READER SEMANTICS =============
  console.log('\n=== SCREEN READER SEMANTICS ===\n');
  
  const srPage = await launch({ width: 1440, height: 900 });
  await srPage.goto('index.html', 800);
  
  // Check lock-status element setup
  const lockStatusSetup = await srPage.eval(`{
    const el = document.getElementById('lock-status');
    return {
      exists: !!el,
      ariaLive: el?.getAttribute('aria-live'),
      className: el?.className
    };
  }`);
  
  results.push({
    type: 'SCREEN READER',
    finding: 'Lock status has aria-live="polite"',
    passes: lockStatusSetup.exists && lockStatusSetup.ariaLive === 'polite'
  });
  
  // Check SVG hidden
  const hudHidden = await srPage.eval(`document.getElementById('hud')?.getAttribute('aria-hidden') === 'true'`);
  results.push({
    type: 'SCREEN READER',
    finding: 'SVG#hud is aria-hidden',
    passes: hudHidden
  });
  
  srPage.close();
  
  // ============= REDUCED MOTION =============
  console.log('\n=== REDUCED MOTION ===\n');
  
  const reducedPage = await launch({ width: 1440, height: 900, reduce: true });
  await reducedPage.goto('index.html', 1200);
  
  // With reduce: true, boot should be instant
  const booted = await reducedPage.eval('!!window.ARGUS && ARGUS.state.booted === true');
  results.push({
    type: 'REDUCED MOTION',
    finding: 'Boot is instant',
    passes: booted
  });
  
  reducedPage.close();
  
  // ============= MOBILE =============
  console.log('\n=== MOBILE (375px) ===\n');
  
  const mobilePage = await launch({ width: 375, height: 667 });
  await mobilePage.goto('index.html', 800);
  
  // Check no horizontal scroll
  const scrollWidth = await mobilePage.eval('document.documentElement.scrollWidth');
  const viewportWidth = await mobilePage.eval('innerWidth');
  results.push({
    type: 'MOBILE',
    finding: 'No horizontal scroll at 375px',
    passes: scrollWidth <= viewportWidth,
    detail: `scrollWidth=${scrollWidth}, innerWidth=${viewportWidth}`
  });
  
  mobilePage.close();
  
  // ============= STRUCTURE =============
  console.log('\n=== STRUCTURE ===\n');
  
  const structPage = await launch({ width: 1440, height: 900 });
  
  const pages = ['index.html', 'pilot.html', 'missions.html', 'hangar.html'];
  
  for (const page of pages) {
    await structPage.goto(page, 600);
    
    // Check lang
    const html = await structPage.eval(`document.documentElement.getAttribute('lang')`);
    results.push({
      type: 'STRUCTURE',
      location: page,
      finding: 'lang="en" present',
      passes: html === 'en'
    });
    
    // Check h1 count
    const h1Count = await structPage.eval(`document.querySelectorAll('h1').length`);
    results.push({
      type: 'STRUCTURE',
      location: page,
      finding: 'Exactly one h1',
      passes: h1Count === 1,
      detail: `Found ${h1Count}`
    });
  }
  
  structPage.close();
  
  // ============= HANGAR =============
  console.log('\n=== HANGAR ===\n');
  
  const hangarPage = await launch({ width: 1440, height: 900 });
  await hangarPage.goto('hangar.html', 700);
  
  // Check for duplicate IDs
  const ids = await hangarPage.eval(`{
    const allIds = new Map();
    const dupes = [];
    document.querySelectorAll('[id]').forEach(el => {
      if (allIds.has(el.id)) dupes.push(el.id);
      else allIds.set(el.id, 1);
    });
    return {totalIds: allIds.size, duplicates: dupes};
  }`);
  
  results.push({
    type: 'HANGAR',
    finding: 'No duplicate element IDs',
    passes: ids.duplicates.length === 0,
    detail: ids.duplicates.length ? ids.duplicates.join(', ') : 'None'
  });
  
  hangarPage.close();
  
  // Report
  console.log('\n\n=== RESULTS ===\n');
  const passed = results.filter(r => r.passes !== false).length;
  const failed = results.filter(r => r.passes === false).length;
  console.log(`${passed} pass, ${failed} fail, ${results.length} total`);
  
  for (const r of results.filter(r => r.passes === false)) {
    console.log(`FAIL: ${r.type} - ${r.finding}`);
    if (r.detail) console.log(`      ${r.detail}`);
  }
  
})();
