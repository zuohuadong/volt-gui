import assert from "node:assert/strict";
import test from "node:test";

import { withProviderActivity } from "./provider-activity.ts";

test("derives provider activity from the official routable catalog", () => {
  const providers = withProviderActivity([
    { provider: "deepseek-official", displayName: "DeepSeek" },
    { provider: "xg-gomodel", displayName: "XG GOModel", declared: true },
    { provider: "openai", displayName: "OpenAI", declared: false },
  ], {
    routableProviders: ["deepseek-official", "xg-gomodel"],
  });

  assert.deepEqual(providers.map(({ provider, active }) => ({ provider, active })), [
    { provider: "deepseek-official", active: true },
    { provider: "xg-gomodel", active: true },
    { provider: "openai", active: false },
  ]);
});

test("falls back to an explicit active flag when the catalog is unavailable", () => {
  assert.deepEqual(withProviderActivity([
    { provider: "ready", active: true },
    { provider: "inactive" },
  ], undefined).map(({ provider, active }) => ({ provider, active })), [
    { provider: "ready", active: true },
    { provider: "inactive", active: false },
  ]);
});
