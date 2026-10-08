// Runs every site4 test file in sequence; exits non-zero if any check failed.
const { spawnSync } = require('child_process');
const path = require('path');
let failed = false;
for (const f of ['svg.test.js', 'hub.test.js', 'layout.test.js', 'pages.test.js', 'manual.test.js', 'resume.test.js']) {
  console.log('\n== ' + f);
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' });
  if (r.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
