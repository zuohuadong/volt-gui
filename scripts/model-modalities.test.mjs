import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const dshRequire = createRequire(require.resolve("@deepseek-ai/dsh/package.json"));
const { loadOverlayPatches } = await import(pathToFileURL(dshRequire.resolve("@deepseek-ai/dsh-app-boot")).href);
const profilePath = fileURLToPath(new URL("../profiles/anyong.yml", import.meta.url));

function gatewayModels(override) {
  const saved = process.env.ANYONG_MODEL_INPUT_OVERRIDES_JSON;
  try {
    if (override === undefined) delete process.env.ANYONG_MODEL_INPUT_OVERRIDES_JSON;
    else process.env.ANYONG_MODEL_INPUT_OVERRIDES_JSON = override;
    const patches = loadOverlayPatches("model-modalities-test", profilePath);
    const route = patches.find((patch) => patch.id === "llm-pi-ai");
    assert.ok(route, "llm-pi-ai profile entry must exist");
    return route.config.providers["xg-gomodel"].models.map((model) => ({
      ...model,
      input: model.input && typeof model.input.__jsExpr === "string"
        ? new Function("process", `return (${model.input.__jsExpr});`)(process)
        : model.input,
    }));
  } finally {
    if (saved === undefined) delete process.env.ANYONG_MODEL_INPUT_OVERRIDES_JSON;
    else process.env.ANYONG_MODEL_INPUT_OVERRIDES_JSON = saved;
  }
}

test("all bundled internal gateway aliases declare text and image input", () => {
  const models = gatewayModels();
  assert.deepEqual(models.map((model) => model.id), ["vlm", "deepseek-v4-flash", "qwen3.8-flash-next"]);
  for (const model of models) assert.deepEqual(model.input, ["text", "image"]);
  assert.deepEqual(models.map((model) => model.contextWindow), [300000, 1048576, 1048576]);
  for (const model of models) assert.equal(model.maxTokens, 32768);
});

test("a deployment can override each model without changing the others", () => {
  for (const modelId of ["vlm", "deepseek-v4-flash", "qwen3.8-flash-next"]) {
    const models = gatewayModels(JSON.stringify({ [modelId]: ["text"] }));
    for (const model of models) {
      assert.deepEqual(model.input, model.id === modelId ? ["text"] : ["text", "image"]);
    }
  }
});

test("invalid declarations fall back without breaking official profile loading", () => {
  for (const override of [
    "{not json", "null", "[]", "false",
    ...[[], "image", [123], ["text", null], ["typo"], ["text", "typo"], {}].map((input) => JSON.stringify({
      vlm: input, "deepseek-v4-flash": input, "qwen3.8-flash-next": input,
    })),
  ]) {
    for (const model of gatewayModels(override)) assert.deepEqual(model.input, ["text", "image"]);
  }
});
