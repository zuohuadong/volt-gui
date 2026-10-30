import assert from "node:assert/strict";
import test from "node:test";
import { fileUploadRequest } from "./file-upload-request.ts";

test("maps only official upload fields and preserves exact PDF bytes", () => {
  const data = Buffer.from("%PDF-1.4\nfixture").toString("base64");
  assert.deepEqual(fileUploadRequest({ agentId: "s1", request: { data, name: "测试.pdf", path: "ignored" } }), {
    endpoint: "fileUploads/upload",
    args: { agentId: "s1", request: { data, name: "测试.pdf" } },
  });
  assert.equal(fileUploadRequest({ agentId: "s1", request: { data: "" } }).args.request.data, "");
});

test("rejects malformed and unbounded uploads before forwarding", () => {
  for (const payload of [
    {}, { agentId: 1, request: { data: "" } }, { agentId: "s1", request: { data: "%%%" } },
    { agentId: "s1", request: { data: "YQ" } }, { agentId: "s1", request: { data: "", name: 1 } },
    { agentId: "s1", request: { data: "", name: "x".repeat(1025) } },
    { agentId: "s1", request: { data: "A".repeat(44 * 1024 * 1024) } },
  ]) assert.throws(() => fileUploadRequest(payload));
});

test("accepts a valid upload at the 32 MB boundary", () => {
  const bytes = Buffer.alloc(32 * 1024 * 1024, 0x61);
  const data = bytes.toString("base64");

  assert.equal(fileUploadRequest({ agentId: "s1", request: { data } }).args.request.data, data);
});
