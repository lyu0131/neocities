// resume.pdf from resume.html: headless Chrome prints the page with its print stylesheet (css/resume.css),
// so the PDF is exactly what a visitor gets from File > Print. Run from site4/ after changing the résumé:
//   node tools/gen_resume_pdf.js
const fs = require('fs'), path = require('path');
const { launch, SITE } = require('../tests/cdp');
(async () => {
  const p = await launch({ width: 1200, height: 900, reduce: true });
  await p.goto('resume.html', 2000);   // fonts in
  const r = await p.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, paperWidth: 8.5, paperHeight: 11 });
  fs.writeFileSync(path.join(SITE, 'resume.pdf'), Buffer.from(r.data, 'base64'));
  console.log('wrote resume.pdf', Math.round(Buffer.from(r.data, 'base64').length / 1024) + ' KB');
  p.close();
})();
