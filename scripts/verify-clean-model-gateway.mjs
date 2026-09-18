import fs from "node:fs";

const credPath = process.argv[2];
if (!credPath || !fs.existsSync(credPath)) {
  console.error("错误: 未找到凭据文件:", credPath);
  process.exit(1);
}

const credContent = fs.readFileSync(credPath, "utf8");
const match = credContent.match(/XG_GOMODEL_API_KEY:\s*(\S+)/);
if (!match) {
  console.error("错误: 凭据文件中缺少 XG_GOMODEL_API_KEY");
  process.exit(1);
}

const apiKey = match[1].replace(/['"{}]+/g, "").trim();
const baseURL = "http://192.168.1.47:9010/v1";

async function verify() {
  console.log("正在连接西谷内网模型网关 (http://192.168.1.47:9010/v1)...");

  // 1. 获取网关模型列表
  const modelsRes = await fetch(`${baseURL}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!modelsRes.ok) {
    console.error(`错误: 获取网关模型列表失败, HTTP ${modelsRes.status}`);
    process.exit(1);
  }
  const modelsData = await modelsRes.json();
  const rawList = Array.isArray(modelsData.data) ? modelsData.data : [];
  console.log(`✓ 网关原始注册列表项: 共 ${rawList.length} 项`);

  // 2. 诊断网关模型构成
  const imageModels = [];
  const internalRouteModels = [];
  const textChatModels = [];

  for (const m of rawList) {
    const id = m.id || "";
    if (id.includes("/")) {
      internalRouteModels.push(id);
    } else if (id.startsWith("image-") || id === "qwen-image" || m.owned_by === "image-adapter") {
      imageModels.push(id);
    } else {
      textChatModels.push(id);
    }
  }

  console.log(`  - 可用于对话的常规模型别名: ${textChatModels.length} 个 (${textChatModels.join(", ")})`);
  console.log(`  - 图像专用适配器 (不支持对话): ${imageModels.length} 个 (${imageModels.join(", ")})`);
  console.log(`  - 网关内部中转路由: ${internalRouteModels.length} 个 (${internalRouteModels.join(", ")})`);

  // 3. 测试客户端内置推荐的 3 个核心模型
  const targetModels = ["vlm", "deepseek-v4-flash", "qwen3.8-flash-next"];
  console.log("\n正在对客户端内置预设核心模型进行真实对话调用验证 (Chat Completions)...");

  let allPassed = true;
  for (const modelId of targetModels) {
    try {
      const startTime = Date.now();
      const res = await fetch(`${baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: "请用一句话回答：你是谁？" }],
          max_tokens: 30,
        }),
      });

      const duration = Date.now() - startTime;
      if (!res.ok) {
        console.error(`  ✗ 模型 ${modelId} 调用失败, HTTP ${res.status}`);
        allPassed = false;
        continue;
      }

      const json = await res.json();
      const actualModel = json.model || modelId;
      const content = json.choices?.[0]?.message?.content?.trim()
        || json.choices?.[0]?.message?.reasoning_content?.trim()
        || "响应已生成";
      const cleanContent = content.replace(/\r?\n/g, " ").slice(0, 60);

      console.log(`  ✓ 模型 [${modelId}] 调用成功 (${duration}ms)`);
      console.log(`    - 网关映射底层物理模型: ${actualModel}`);
      console.log(`    - 模型真实回复摘录: "${cleanContent}..."`);
    } catch (err) {
      console.error(`  ✗ 模型 ${modelId} 网络或请求异常: ${err.message}`);
      allPassed = false;
    }
  }

  if (!allPassed) {
    console.error("\n核心模型真实对话验证未全部通过！");
    process.exit(1);
  }

  console.log("\n✓ 全部内置推荐模型均已通过真实对话生成验收！");
}

verify().catch((err) => {
  console.error("验证过程发生未捕获异常:", err);
  process.exit(1);
});
