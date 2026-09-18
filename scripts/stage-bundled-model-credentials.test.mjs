import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseModelBuildVariables, resolveBundledModelCredentialInputs } from "./stage-bundled-model-credentials.mjs";

test("parses quoted YAML credentials and excludes inline comments", () => {
  const variables = parseModelBuildVariables(`
XG_GOMODEL_API_KEY: 'synthetic:value#fragment' # deployment comment
XG_GOMODEL_ENDPOINT: https://example.invalid/v1 # gateway
`);
  assert.equal(variables.XG_GOMODEL_API_KEY, "synthetic:value#fragment");
  assert.equal(variables.XG_GOMODEL_ENDPOINT, "https://example.invalid/v1");
});

test("rejects invalid YAML without logging credential text", () => {
  assert.throws(
    () => parseModelBuildVariables('XG_GOMODEL_API_KEY: "synthetic-private-value\n'),
    (error) => {
      assert.match(error.message, /YAML/);
      assert.doesNotMatch(error.message, /synthetic-private-value/);
      return true;
    },
  );
  assert.throws(() => parseModelBuildVariables("- not-a-mapping\n"), /YAML/);
});

test("bundled credentials come only from process environment", () => {
  const source = readFileSync(new URL("./stage-bundled-model-credentials.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\.cnb\/envs\.yml/);
  assert.doesNotMatch(source, /cnbEnvs/);
  const resolved = resolveBundledModelCredentialInputs({
    XG_GOMODEL_API_KEY: "from-env",
    XG_GOMODEL_ENDPOINT: "https://gateway.example/v1",
  });
  assert.equal(resolved.rawApiKey, "from-env");
  assert.equal(resolved.rawBaseURL, "https://gateway.example/v1");
  assert.equal(resolveBundledModelCredentialInputs({}).rawApiKey, "");
});
