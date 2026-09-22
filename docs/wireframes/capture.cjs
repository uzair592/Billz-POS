// Development artifact capture only. Requires local Chrome; no external packages.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-wireframes-'));
  const browser = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let socket;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Chrome startup timed out')), 20000);
      let output = '';
      browser.on('error', reject);
      browser.stderr.on('data', chunk => {
        output += chunk;
        const found = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (found) { clearTimeout(timer); resolve(found[1]); }
      });
    });
    const address = new URL(endpoint);
    const pages = await (await fetch(`http://${address.host}/json/list`)).json();
    socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let sequence = 0;
    const pending = new Map();
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      const call = pending.get(message.id);
      if (call) { pending.delete(message.id); clearTimeout(call.timer); message.error ? call.reject(message.error) : call.resolve(message.result); }
    };
    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out')); }, 15000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    }
    await send('Page.enable');
    const output = path.join(__dirname, 'screenshots');
    fs.mkdirSync(output, { recursive: true });
    for (const [name, width, height] of [['desktop', 1366, 768], ['tablet', 1024, 768], ['mobile', 390, 844]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await send('Page.navigate', { url: pathToFileURL(path.join(__dirname, 'index.html')).href });
      await new Promise(resolve => setTimeout(resolve, 500));
      for (const section of ['platform', 'owner', 'pos', 'waiter', 'kitchen']) {
        await send('Runtime.evaluate', { expression: `document.getElementById(${JSON.stringify(section)}).scrollIntoView()` });
        await new Promise(resolve => setTimeout(resolve, 100));
        const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        fs.writeFileSync(path.join(output, `${name}-${section}.png`), Buffer.from(shot.data, 'base64'));
      }
      const check = await send('Runtime.evaluate', { expression: 'JSON.stringify({width:innerWidth,content:document.documentElement.scrollWidth})', returnByValue: true });
      console.log(name, check.result.value);
    }
  } finally {
    socket?.close();
    browser.kill();
    // Keep the isolated OS temporary profile; never delete a broad computed path.
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
