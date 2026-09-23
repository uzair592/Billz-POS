// Browser smoke test and screenshots. Creates clearly labelled local TEST data.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
async function main() {
  const profile = fs.mkdtempSync(
    path.join(os.tmpdir(), "cafe-phase1-browser-"),
  );
  const browser = spawn(
    process.env.CHROME_PATH ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    [
      "--headless",
      "--disable-gpu",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
  );
  let socket;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(
        () => reject(new Error("Chrome startup timeout")),
        20000,
      );
      browser.on("error", reject);
      browser.stderr.on("data", (chunk) => {
        output += chunk;
        const found = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (found) {
          clearTimeout(timer);
          resolve(found[1]);
        }
      });
    });
    const pages = await (
      await fetch(`http://${new URL(endpoint).host}/json/list`)
    ).json();
    socket = new WebSocket(
      pages.find((p) => p.type === "page").webSocketDebuggerUrl,
    );
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });
    let sequence = 0;
    const pending = new Map();
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      const call = pending.get(message.id);
      if (call) {
        pending.delete(message.id);
        clearTimeout(call.timer);
        message.error
          ? call.reject(message.error)
          : call.resolve(message.result);
      }
    };
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(
          () => reject(new Error(`${method} timed out`)),
          60000,
        );
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    const evaluate = async (expression) => {
      const result = await send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails)
        throw new Error(
          result.exceptionDetails.text +
            ": " +
            result.exceptionDetails.exception?.description,
        );
      return result.result.value;
    };
    const waitFor = async (expression) => {
      for (let i = 0; i < 100; i++) {
        if (await evaluate(expression)) return;
        await new Promise((r) => setTimeout(r, 300));
      }
      throw new Error("Browser condition timed out: " + expression);
    };
    await send("Page.enable");
    await send("Page.navigate", {
      url: "http://localhost:3000/platform/login",
    });
    await waitFor('Boolean(document.querySelector("form"))');
    const credentials = {
      email: process.env.SEED_ADMIN_EMAIL,
      password: process.env.SEED_ADMIN_PASSWORD,
    };
    await evaluate(
      `(async()=>{const response=await fetch('/api/v1/platform/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(${JSON.stringify(credentials)})});const data=await response.json();if(!response.ok)throw new Error(data.message);sessionStorage.setItem('platform_csrf',data.csrfToken);})()`,
    );
    const result = await evaluate(`(async()=>{
   const call=async(path,body)=>{const response=await fetch('/api/v1'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-csrf-token':sessionStorage.getItem('platform_csrf')},body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw new Error(data.message);return data;};
   const catalog=await call('/platform/catalog');const plan=catalog.plans[0];const suffix=crypto.randomUUID().slice(0,8);const password='Browser-Fixture-2026!';
   const org=await call('/platform/organizations',{name:'TEST Browser Café '+suffix,businessType:'CAFE',email:'browser-'+suffix+'@example.test',phone:'03001234567',ownerName:'Browser Test Owner',ownerUsername:'browser-'+suffix,temporaryPassword:password,planId:plan.id,moduleIds:[]});
   const version=await call('/platform/billing/plans',{planId:plan.id,name:'TEST Monthly '+suffix,currency:'PKR',monthlyMinor:99000,maxBranches:3,maxUsers:10,maxDevices:3,graceDays:3});
   const invoice=await call('/platform/billing/'+org.id+'/invoices',{commandId:crypto.randomUUID(),planVersionId:version.id});
   await call('/platform/billing/'+org.id+'/invoices/'+invoice.id+'/settlements',{commandId:crypto.randomUUID(),kind:'PAYMENT',amountMinor:30000,method:'BANK_TRANSFER',reference:'TEST-DEMO-TRANSFER',reason:'Browser acceptance fixture'});
   return {organizationId:org.id,identifier:'browser-'+suffix,password};
  })()`);
    const output = path.join(process.cwd(), "docs", "phase-1", "screenshots");
    fs.mkdirSync(output, { recursive: true });
    for (const [name, width, height] of [
      ["desktop", 1366, 768],
      ["tablet", 1024, 768],
      ["mobile", 390, 844],
    ]) {
      await send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      for (const [screen, url, ready] of [
        [
          "account",
          `/platform/organizations/${result.organizationId}`,
          'document.body.innerText.includes("TEST Browser Café")',
        ],
        [
          "plans",
          "/platform/plans",
          'document.body.innerText.includes("TEST Monthly")',
        ],
      ]) {
        await send("Page.navigate", { url: "http://localhost:3000" + url });
        await waitFor(`Boolean(document.body) && (${ready})`);
        const dimensions = await evaluate(
          '({width:innerWidth,content:document.documentElement.scrollWidth,wide:[...document.querySelectorAll("body *")].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,10).map(e=>({tag:e.tagName,class:e.className,width:e.getBoundingClientRect().width}))})',
        );
        if (dimensions.content > dimensions.width + 1)
          throw new Error(
            `${name} ${screen} overflows: ${JSON.stringify(dimensions)}`,
          );
        const shot = await send("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: false,
        });
        fs.writeFileSync(
          path.join(output, `${name}-${screen}.png`),
          Buffer.from(shot.data, "base64"),
        );
        console.log(`${name} ${screen}: no horizontal overflow`);
      }
    }
    await evaluate(
      `(async()=>{const call=async(path,body)=>{const r=await fetch('/api/v1'+path,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':sessionStorage.getItem('csrf')||''},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.message);return d;};let login=await call('/auth/login',{identifier:${JSON.stringify(result.identifier)},password:${JSON.stringify(result.password)}});sessionStorage.setItem('csrf',login.csrfToken);await call('/auth/change-temporary-password',{currentPassword:${JSON.stringify(result.password)},newPassword:${JSON.stringify(result.password + "New")}});login=await call('/auth/login',{identifier:${JSON.stringify(result.identifier)},password:${JSON.stringify(result.password + "New")}});sessionStorage.setItem('csrf',login.csrfToken);})()`,
    );
    for (const [name, width, height] of [
      ["desktop", 1366, 768],
      ["tablet", 1024, 768],
      ["mobile", 390, 844],
    ]) {
      await send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await send("Page.navigate", {
        url: "http://localhost:3000/workspace/billing",
      });
      await waitFor(
        'Boolean(document.body) && document.body.innerText.includes("TEST-DEMO-TRANSFER")',
      );
      const d = await evaluate(
        "({width:innerWidth,content:document.documentElement.scrollWidth})",
      );
      if (d.content > d.width + 1) throw new Error("Owner billing overflows");
      const shot = await send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      fs.writeFileSync(
        path.join(output, `${name}-owner-billing.png`),
        Buffer.from(shot.data, "base64"),
      );
      console.log(
        `${name} owner billing: persisted invoice and receipt visible`,
      );
    }
    console.log(
      "Browser smoke PASS; labelled fixture organization: " +
        result.organizationId,
    );
  } finally {
    socket?.close();
    browser.kill();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
