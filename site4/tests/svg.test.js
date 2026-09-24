const fs = require('fs'), path = require('path');
const { launch, check, SITE } = require('./cdp');
const only = process.argv[2]; // optional: pano | frame | ms
const specs = {
  pano:  [['img/pano.svg', '0 0 9600 2000', 350, []]],
  frame: [['img/frame.svg', '0 0 1920 1080', 120, []]],
  ms:    [['img/ms/sl01-front.svg', '0 0 800 1400', 120, ['head','chest','binder-l','binder-r','leg-l','leg-r']],
          ['img/ms/sl01-side.svg', '0 0 800 1400', 120, ['head','chest','backpack','rifle']],
          ['img/ms/sl01-back.svg', '0 0 800 1400', 120, ['head','backpack','binder-l','binder-r']],
          ['img/ms/decals.svg', null, 120, ['unit-mark','serial','caution-chevron','no-step']]]
};
(async () => {
  for (const [group, files] of Object.entries(specs)) {
    if (only && only !== group) continue;
    for (const [f, vb, kb, ids] of files) {
      const p = path.join(SITE, f); const exists = fs.existsSync(p);
      check(`${f} exists`, exists); if (!exists) continue;
      const s = fs.readFileSync(p, 'utf8'); const size = fs.statSync(p).size / 1024;
      check(`${f} <= ${kb}KB`, size <= kb, size.toFixed(0) + 'KB');
      if (vb) check(`${f} viewBox`, s.includes(`viewBox="${vb}"`));
      for (const id of ids) check(`${f} has #${id}`, new RegExp(`id="${id}"`).test(s));
      check(`${f} no Gundam/Minovsky text`, !/gundam|minovsky|newtype/i.test(s));
    }
  }
  const pano = path.join(SITE, 'img/pano.svg');
  if ((!only || only === 'pano') && fs.existsSync(pano)) {  // seam render: the wrap from x=9200..9600 then 0..400 must look continuous
    const page = await launch({ width: 800, height: 400 });
    const src = 'file:///' + pano.replace(/\\/g, '/').replace(/^\/+/, '');
    const html = `<body style="margin:0;display:flex;background:#000">`
      + `<div style="width:400px;height:400px;background:url(${src}) -9200px 0/9600px 2000px"></div>`
      + `<div style="width:400px;height:400px;background:url(${src}) 0 0/9600px 2000px"></div></body>`;
    fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, 'out/seam.html'), html);
    await page.goto('tests/out/seam.html', 1200);
    await page.shot(path.join(__dirname, 'out/pano-seam.png'), false);
    page.close(); console.log('seam render: tests/out/pano-seam.png (look at it)');
  }
})();
