import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const exePath = path.join(repoRoot, "apps/desktop-electron/dist-package/win-unpacked/Anyong.exe");
const screenshotDir = path.join(repoRoot, "test-screenshots");
const screenshotFile = path.join(screenshotDir, "chat-verified.png");

if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

console.log("正在启动 Anyong 进行真实 UI 对话及截图实测...");
const child = spawn(exePath, ["--remote-debugging-port=9222"], {
  stdio: "inherit",
  detached: false,
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCDP(maxRetries = 40) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9222/json/list");
      if (res.ok) {
        const list = await res.json();
        const page = list.find((item) => item.type === "page" && item.url.includes("index.html"));
        if (page && page.webSocketDebuggerUrl) {
          return page.webSocketDebuggerUrl;
        }
      }
    } catch {}
    await sleep(1000);
  }
  throw new Error("超时未能连接到 Anyong 调试端口 (9222)");
}

class SimpleCDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const cb = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) cb.reject(msg.error);
          else cb.resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result?.value;
  }

  close() {
    try { this.ws.close(); } catch {}
  }
}

async function run() {
  try {
    console.log("等待应用启动并开启 DevTools...");
    const wsUrl = await waitForCDP();
    console.log("✓ 已连接到 Anyong 渲染页面 WebSocket:", wsUrl);

    const cdp = new SimpleCDP(wsUrl);
    await cdp.connect();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    console.log("等待前端界面完成初始化渲染...");
    let ready = false;
    for (let i = 0; i < 30; i++) {
      const hasInput = await cdp.evaluate(`!!document.querySelector("textarea")`);
      if (hasInput) {
        ready = true;
        break;
      }
      await sleep(1000);
    }

    if (!ready) {
      throw new Error("超时未能检测到前端对话输入区域");
    }
    console.log("✓ 前端界面初始化完成，已检测到对话输入框！");

    // 检查当前选中的模型
    const selectedModel = await cdp.evaluate(`
      (() => {
        const badge = document.querySelector(".model-picker-trigger, [title*='模型'], .model-picker");
        return badge ? badge.innerText : "默认模型";
      })()
    `);
    console.log(`当前界面模型状态: ${selectedModel}`);

    // 输入测试提示词并发送
    const prompt = "你好！请用一句话介绍你自己，并说明当前使用的语言模型。";
    console.log(`正在输入测试提示词: "${prompt}" ...`);

    await cdp.evaluate(`
      (() => {
        const textarea = document.querySelector("textarea");
        if (!textarea) throw new Error("未找到输入框");
        textarea.focus();
        textarea.value = ${JSON.stringify(prompt)};
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      })()
    `);

    await sleep(500);

    // 点击发送
    console.log("点击发送消息按钮...");
    await cdp.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const sendBtn = buttons.find(b => b.title?.includes("发送") || b.getAttribute("aria-label")?.includes("发送") || b.innerHTML.includes("ArrowUp") || b.innerHTML.includes("Send") || b.classList.contains("composer-send-btn"));
        if (sendBtn) {
          sendBtn.click();
        } else {
          // 模拟回车
          const textarea = document.querySelector("textarea");
          textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
        }
      })()
    `);

    console.log("等待智能体回复完成 (最多等待 45 秒)...");
    let completed = false;
    let assistantReply = "";

    for (let i = 0; i < 45; i++) {
      await sleep(1000);
      const result = await cdp.evaluate(`
        (() => {
          const messages = Array.from(document.querySelectorAll(".message-row, .chat-message, [class*='assistant']"));
          const assistant = messages.filter(m => !m.classList.contains("user") && !m.classList.contains("human")).pop();
          const isRunning = !!document.querySelector(".running, .spinner, [aria-label*='生成中']");
          return {
            hasAssistant: !!assistant,
            text: assistant ? assistant.innerText : "",
            isRunning,
          };
        })()
      `);

      if (result && result.hasAssistant && result.text.length > 5 && !result.isRunning) {
        completed = true;
        assistantReply = result.text;
        break;
      }
    }

    if (!completed) {
      console.warn("未能等到完全空闲，截取当前实际界面状态...");
    } else {
      console.log("✓ 智能体回复生成完成！");
      console.log("--- 智能体回复摘录 ---");
      console.log(assistantReply.slice(0, 150) + "...");
      console.log("-----------------------");
    }

    // 截屏
    console.log("正在通过 CDP 截取全尺寸高清界面截图...");
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" });
    const buffer = Buffer.from(screenshot.data, "base64");
    fs.writeFileSync(screenshotFile, buffer);
    console.log(`✓ 截图已成功保存至: ${screenshotFile} (大小: ${Math.round(buffer.length / 1024)} KB)`);

    cdp.close();
  } finally {
    console.log("正在关闭测试应用程序...");
    try {
      child.kill();
    } catch {}
  }
}

run().catch((err) => {
  console.error("UI 对话测试失败:", err);
  try { child.kill(); } catch {}
  process.exit(1);
});
