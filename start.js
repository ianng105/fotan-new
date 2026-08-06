// Start both wrangler dev server and pdf-worker simultaneously
const { spawn } = require('child_process');

const wrangler = spawn('npx', ['wrangler', 'pages', 'dev', '.', '--port', '8787'], {
  stdio: 'inherit',
  shell: true
});

const pdfWorker = spawn('node', ['pdf-worker.js'], {
  stdio: 'inherit',
  shell: true
});

function cleanup() {
  console.log('\n🛑 Shutting down...');
  wrangler.kill();
  pdfWorker.kill();
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

wrangler.on('exit', (code) => {
  console.log('wrangler exited with code', code);
  pdfWorker.kill();
  process.exit(code);
});

pdfWorker.on('exit', (code) => {
  console.log('pdf-worker exited with code', code);
  wrangler.kill();
  process.exit(code);
});
