// Real browser acceptance flow: visible login, menu forms, POS checkout and receipt reprint.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  for (let i = 0; i < 80; i++) {
    try {
      const health = await fetch("http://localhost:4000/api/v1/health");
      if (health.ok) break;
    } catch {}
    await sleep(250);
  }
  const profile = fs.mkdtempSync(
    path.join(os.tmpdir(), "cafe-phase3-browser-"),
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
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(
        () => reject(new Error("Chrome startup timeout")),
        20000,
      );
      browser.on("error", reject);
      browser.stderr.on("data", (c) => {
        output += c;
        const m = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (m) {
          clearTimeout(timer);
          resolve(m[1]);
        }
      });
    });
    const pages = await (
      await fetch(`http://${new URL(endpoint).host}/json/list`)
    ).json();
    const socket = new WebSocket(
      pages.find((p) => p.type === "page").webSocketDebuggerUrl,
    );
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });
    let sequence = 0;
    const pending = new Map();
    socket.onmessage = ({ data }) => {
      const m = JSON.parse(data);
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      m.error ? p.reject(m.error) : p.resolve(m.result);
    };
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(
          () => reject(new Error(`${method} timed out`)),
          60000,
        );
        pending.set(id, {
          resolve: (v) => {
            clearTimeout(timer);
            resolve(v);
          },
          reject,
        });
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
          result.exceptionDetails.exception?.description ||
            result.exceptionDetails.text,
        );
      return result.result?.value;
    };
    const waitFor = async (expression) => {
      for (let i = 0; i < 160; i++) {
        if (await evaluate(expression)) return;
        await sleep(250);
      }
      throw new Error(`Browser condition timed out: ${expression}`);
    };
    const setValue = async (label, value) => {
      await evaluate(
        `(()=>{const l=[...document.querySelectorAll('label')].find(x=>x.innerText.trim().startsWith(${JSON.stringify(label)}));if(!l)throw Error('Missing visible field: '+${JSON.stringify(label)});const i=l.querySelector('input');i.focus();i.select();})()`,
      );
      await evaluate(
        `(()=>{const l=[...document.querySelectorAll('label')].find(x=>x.innerText.trim().startsWith(${JSON.stringify(label)}));const i=l.querySelector('input');i._valueTracker?.setValue('');const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(i,${JSON.stringify(value)});i.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:${JSON.stringify(value)}}));i.dispatchEvent(new Event('change',{bubbles:true}));})()`,
      );
    };
    const click = async (text) => {
      const rect = await evaluate(
        `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing visible control: '+${JSON.stringify(text)});const r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`,
      );
      await send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: rect.x,
        y: rect.y,
        button: "left",
        clickCount: 1,
      });
      await send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: rect.x,
        y: rect.y,
        button: "left",
        clickCount: 1,
      });
      await evaluate(
        `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()===${JSON.stringify(text)});b?.focus()})()`,
      );
      await send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Enter",
        code: "Enter",
      });
      await send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Enter",
        code: "Enter",
      });
    };
    const selectValue = (index, value) =>
      evaluate(
        `(()=>{const s=document.querySelectorAll('select')[${index}];if(!s)throw Error('Missing select');const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;set.call(s,${JSON.stringify(value)});s.dispatchEvent(new Event('change',{bubbles:true}));})()`,
      );
    const assertScreen = async (text) => {
      await waitFor(
        `Boolean(document.body)&&document.body.innerText.includes(${JSON.stringify(text)})`,
      );
      const bad = await evaluate(
        `(()=>{const t=document.body?.innerText||'';return /Loading branches…|Loading branches\.\.\.|Loading catalog…|Loading catalog\.\.\.|Application error|Unhandled|\bError\b/i.test(t)||!t.trim()})()`,
      );
      if (bad)
        throw new Error(`Invalid browser screen while waiting for ${text}`);
    };
    await send("Page.enable");
    await send("Page.navigate", { url: "http://localhost:3000/login" });
    await assertScreen("Business sign in");
    // Platform setup is only fixture provisioning; all business actions below use visible UI controls.
    const fixture = await evaluate(
      `(async()=>{const call=async(path,body,csrf,platform=false)=>{const r=await fetch('/api/v1'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(csrf?{'x-csrf-token':csrf}:{})},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(JSON.stringify(d));return d;};const p=await call('/platform/auth/login',{email:${JSON.stringify(process.env.SEED_ADMIN_EMAIL || "admin@example.test")},password:${JSON.stringify(process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!")}});const c=await call('/platform/catalog',null,p.csrfToken,true);const s=crypto.randomUUID().slice(0,8);const password='Browser-Phase3-2026!';await call('/platform/organizations',{name:'Phase 3 UI Cafe '+s,businessType:'CAFE',email:'phase3-ui-'+s+'@example.test',phone:'03001234567',ownerName:'UI Owner',ownerUsername:'phase3-ui-'+s,temporaryPassword:password,planId:c.plans[0].id,initialBranchName:'Main Branch',timezone:'Asia/Karachi',currencyCode:'PKR',graceDays:0,moduleIds:[]},p.csrfToken,true);return {username:'phase3-ui-'+s,password};})()`,
    );
    await setValue("Username or email", fixture.username);
    await setValue("Password", fixture.password);
    await click("Sign in");
    await assertScreen("Choose a permanent password");
    await setValue("Current temporary password", fixture.password);
    await setValue("New password", fixture.password + "New");
    await click("Change password");
    await assertScreen("Business sign in");
    await setValue("Username or email", fixture.username);
    await setValue("Password", fixture.password + "New");
    await click("Sign in");
    await waitFor(
      `Boolean(document.body)&&(/Finish setting up|live business workspace/i.test(document.body.innerText))`,
    );
    await evaluate(
      `(()=>{const original=window.fetch.bind(window);window.__lastOrderId=null;window.fetch=(input,init)=>{const p=original(input,init);if(String(input).includes('/pos/orders')&&init?.method==='POST')p.then(r=>r.clone().json().then(x=>{window.__lastOrderId=x.id}).catch(()=>{}));return p}})()`,
    );
    await send("Page.navigate", {
      url: "http://localhost:3000/workspace/menu",
    });
    await assertScreen("Menu management");
    await waitFor(
      `Boolean(document.querySelector('button')&&[...document.querySelectorAll('button')].some(x=>x.innerText.trim()==='Create category'&&!x.disabled))`,
    );
    await sleep(3000);
    await setValue("Category name", "UI Drinks");
    await click("Create category");
    await waitFor(
      `Boolean(document.body)&&(/Category created\\.|role="alert"/.test(document.body.innerHTML))`,
    );
    if (
      !(await evaluate(`document.body.innerText.includes("Category created.")`))
    ) {
      throw new Error(
        `Visible category form error: ${await evaluate("document.body.innerText")}`,
      );
    }
    await setValue("Product name", "UI Latte");
    await setValue("Branch price (PKR)", "10");
    await setValue("Tax rate (basis points)", "1000");
    await setValue("Modifier name (optional)", "Oat milk");
    await setValue("Modifier price (PKR)", "1");
    await setValue("Variant name (optional)", "Large");
    await setValue("Variant price (PKR)", "12");
    await click("Create product");
    await waitFor(
      `Boolean(document.body)&&document.body.innerText.includes("Product created")`,
    );
    const branchId = await evaluate(
      `document.querySelectorAll('select')[0]?.options[1]?.value`,
    );
    await send("Page.navigate", { url: "http://localhost:3000/workspace/pos" });
    await assertScreen("Point of sale");
    await selectValue(0, branchId);
    await waitFor(
      `Boolean(document.body)&&document.body.innerText.includes("UI Latte")`,
    );
    const productButton = `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes('UI Latte'));if(!b)throw Error('Product card missing');b.click()})()`;
    await evaluate(productButton);
    await waitFor(
      `Boolean(document.body)&&document.body.innerText.includes("Oat milk")`,
    );
    await evaluate(
      `(()=>{const s=document.querySelector('select[aria-label="UI Latte variant"]');const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;set.call(s,s.options[1].value);s.dispatchEvent(new Event('change',{bubbles:true}));const c=[...document.querySelectorAll('input[type=checkbox]')].find(x=>x.parentElement.innerText.includes('Oat milk'));c.click()})()`,
    );
    await waitFor(
      `Boolean(document.body)&&document.body.innerText.includes("PKR")`,
    );
    await setValue("Opening float (PKR)", "10");
    await click("Open register");
    await waitFor(
      `Boolean(document.body)&&document.body.innerText.includes("Open shift selected")`,
    );
    await setValue("Card tender (PKR)", "0");
    await click("Complete sale");
    await waitFor(
      `Boolean(document.body)&&document.body.innerText.includes("Sale completed")`,
    );
    const orderId = await evaluate("window.__lastOrderId");
    if (!orderId) throw Error("UI checkout did not return an order id");
    const output = path.join(process.cwd(), "docs", "phase-3", "screenshots");
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
      await send("Page.navigate", {
        url: "http://localhost:3000/workspace/menu",
      });
      await assertScreen("Menu management");
      const menu = await send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(
        path.join(output, `${name}-menu.png`),
        Buffer.from(menu.data, "base64"),
      );
      await send("Page.navigate", {
        url: "http://localhost:3000/workspace/pos",
      });
      await assertScreen("Point of sale");
      const pos = await send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(
        path.join(output, `${name}-pos.png`),
        Buffer.from(pos.data, "base64"),
      );
      console.log(`${name}: visible UI workflow rendered`);
    }
    await send("Page.navigate", {
      url: `http://localhost:3000/api/v1/pos/orders/${orderId}/receipt`,
    });
    await assertScreen("UI Latte");
    const receipt = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      path.join(output, "desktop-receipt.png"),
      Buffer.from(receipt.data, "base64"),
    );
    console.log("receipt: reprint rendered");
    socket.close();
  } finally {
    browser.kill();
  }
}
main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
