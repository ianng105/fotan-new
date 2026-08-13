// Start the wrangler dev server (Pages Functions)
const { spawn } = require('child_process');

const wrangler = spawn('npx', ['wrangler', 'pages', 'dev', '.', '--port', '8787'], {
  stdio: 'inherit',
  shell: true
});

function cleanup() {
  console.log('\n🛑 Shutting down...');
  wrangler.kill();
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

wrangler.on('exit', (code) => {
  console.log('wrangler exited with code', code);
  process.exit(code);
});
