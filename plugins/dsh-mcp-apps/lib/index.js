import { createHash, randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema, PromptListChangedNotificationSchema, ReadResourceResultSchema, ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { RESOURCE_MIME_TYPE, getToolUiResourceUri } from "@modelcontextprotocol/ext-apps/app-bridge";
import { createServer } from "node:http";
//#region src/prompt-injection.ts
const MAX_PROMPT_CHARS = 65536;
function textOf(content) {
	if (content.type === "text") return content.text;
	if (content.type === "resource" && "text" in content.resource) return `[${content.resource.uri}]\n${content.resource.text}`;
	throw new Error("auto-injected MCP prompt content must be text or an embedded text resource");
}
/** Render one explicitly allowlisted MCP prompt as a provenance-labelled system section. */
function renderInjectedPrompt(serverName, promptName, result) {
	if (result.messages.length === 0) throw new Error("auto-injected MCP prompt returned no messages");
	const parts = result.messages.map((message) => {
		if (message.role !== "user") throw new Error("auto-injected MCP prompt messages must use the user role");
		return textOf(message.content);
	});
	const text = [
		`Trusted MCP prompt ${JSON.stringify(promptName)} from server ${JSON.stringify(serverName)}.`,
		"The deployment explicitly allowlisted this workflow guidance.",
		"",
		parts.join("\n\n")
	].join("\n");
	if (text.length > MAX_PROMPT_CHARS) throw new Error("auto-injected MCP prompt is too large");
	return text;
}
//#endregion
//#region \0@oxc-project+runtime@0.144.0/helpers/esm/taggedTemplateLiteral.js
function _taggedTemplateLiteral(e, t) {
	return t || (t = e.slice(0)), Object.freeze(Object.defineProperties(e, { raw: { value: Object.freeze(t) } }));
}
//#endregion
//#region src/sandbox.ts
var _templateObject;
const FORBIDDEN_CSP_CHARS = /[\u0000-\u0020"'`;]/;
const WILDCARD_ORIGIN = /^(https?):\/\/\*\.([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)(?::([1-9]\d{0,4}))?$/;
function cspOrigin(value, protocols) {
	if (FORBIDDEN_CSP_CHARS.test(value)) throw new Error(`unsafe CSP source ${JSON.stringify(value)}`);
	const wildcard = WILDCARD_ORIGIN.exec(value);
	if (wildcard !== null) {
		const [, protocol, host, port] = wildcard;
		return `${protocol}://*.${host}${port === void 0 ? "" : `:${port}`}`;
	}
	const parsed = new URL(value);
	if (!protocols.includes(parsed.protocol)) throw new Error(`unsupported CSP protocol ${parsed.protocol}`);
	if (parsed.username !== "" || parsed.password !== "") throw new Error("CSP sources cannot contain credentials");
	if (parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "") throw new Error("CSP sources must be origins without paths, queries, or fragments");
	return parsed.origin;
}
function sources(values, protocols) {
	if (values === void 0) return [];
	if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) throw new Error("CSP domain lists must contain strings");
	return values.map((value) => cspOrigin(value, protocols));
}
/** Parse and normalize untrusted MCP resource CSP metadata. */
function normalizeCsp(value) {
	if (value === void 0) return void 0;
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("MCP App CSP must be an object");
	const input = value;
	const known = /* @__PURE__ */ new Set([
		"connectDomains",
		"resourceDomains",
		"frameDomains",
		"baseUriDomains"
	]);
	for (const key of Object.keys(input)) if (!known.has(key)) throw new Error(`unknown MCP App CSP field ${JSON.stringify(key)}`);
	return {
		...input.connectDomains === void 0 ? {} : { connectDomains: sources(input.connectDomains, [
			"http:",
			"https:",
			"ws:",
			"wss:"
		]) },
		...input.resourceDomains === void 0 ? {} : { resourceDomains: sources(input.resourceDomains, ["http:", "https:"]) },
		...input.frameDomains === void 0 ? {} : { frameDomains: sources(input.frameDomains, ["http:", "https:"]) },
		...input.baseUriDomains === void 0 ? {} : { baseUriDomains: sources(input.baseUriDomains, ["http:", "https:"]) }
	};
}
/** Build the enforced CSP header for the isolated Sandbox Proxy. */
function buildCspHeader(csp) {
	const resources = csp?.resourceDomains?.join(" ") ?? "";
	const connects = csp?.connectDomains?.join(" ") ?? "";
	const frames = csp?.frameDomains?.join(" ");
	const bases = csp?.baseUriDomains?.join(" ");
	return [
		"default-src 'none'",
		`script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: ${resources}`.trim(),
		`style-src 'self' 'unsafe-inline' ${resources}`.trim(),
		`img-src 'self' data: blob: ${resources}`.trim(),
		`font-src 'self' data: blob: ${resources}`.trim(),
		`media-src 'self' data: blob: ${resources}`.trim(),
		`connect-src 'self' ${connects}`.trim(),
		`worker-src 'self' blob: ${resources}`.trim(),
		`frame-src 'self'${frames === void 0 || frames === "" ? "" : ` ${frames}`}`,
		bases === void 0 || bases === "" ? "base-uri 'none'" : `base-uri ${bases}`,
		"object-src 'none'"
	].join("; ");
}
const SANDBOX_HTML = String.raw(_templateObject || (_templateObject = _taggedTemplateLiteral(["<!doctype html>\n<html>\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <style>html,body{margin:0;width:100%;height:100%;background:transparent}iframe{display:block;width:100%;height:100%;border:0}</style>\n</head>\n<body>\n<script>\n(() => {\n  if (window.self === window.top) throw new Error('sandbox proxy must run in an iframe')\n  if (!document.referrer) throw new Error('sandbox proxy requires an embedding referrer')\n  const expectedHostOrigin = new URL(document.referrer).origin\n  if (!/^http://(?:127.0.0.1|localhost)(?::d+)?$/.test(expectedHostOrigin)) {\n    throw new Error('sandbox proxy accepts only loopback hosts')\n  }\n  const ownOrigin = location.origin\n  try {\n    window.top.location.href\n    throw new Error('sandbox proxy is not cross-origin isolated')\n  } catch (error) {\n    if (error instanceof Error && error.message === 'sandbox proxy is not cross-origin isolated') throw error\n  }\n\n  const inner = document.createElement('iframe')\n  inner.setAttribute('sandbox', 'allow-scripts allow-same-origin')\n  document.body.append(inner)\n\n  const resourceReady = 'ui/notifications/sandbox-resource-ready'\n  window.addEventListener('message', (event) => {\n    if (event.source === window.parent) {\n      if (event.origin !== expectedHostOrigin) return\n      if (event.data && event.data.method === resourceReady) {\n        const html = event.data.params && event.data.params.html\n        if (typeof html !== 'string') return\n        const doc = inner.contentDocument || (inner.contentWindow && inner.contentWindow.document)\n        if (!doc) return\n        doc.open()\n        doc.write(html)\n        doc.close()\n        return\n      }\n      if (inner.contentWindow) inner.contentWindow.postMessage(event.data, ownOrigin)\n      return\n    }\n    if (event.source === inner.contentWindow && event.origin === ownOrigin) {\n      window.parent.postMessage(event.data, expectedHostOrigin)\n    }\n  })\n\n  window.parent.postMessage({\n    jsonrpc: '2.0',\n    method: 'ui/notifications/sandbox-proxy-ready',\n    params: {},\n  }, expectedHostOrigin)\n})()\n<\/script>\n</body>\n</html>"], ["<!doctype html>\n<html>\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <style>html,body{margin:0;width:100%;height:100%;background:transparent}iframe{display:block;width:100%;height:100%;border:0}</style>\n</head>\n<body>\n<script>\n(() => {\n  if (window.self === window.top) throw new Error('sandbox proxy must run in an iframe')\n  if (!document.referrer) throw new Error('sandbox proxy requires an embedding referrer')\n  const expectedHostOrigin = new URL(document.referrer).origin\n  if (!/^http:\\/\\/(?:127\\.0\\.0\\.1|localhost)(?::\\d+)?$/.test(expectedHostOrigin)) {\n    throw new Error('sandbox proxy accepts only loopback hosts')\n  }\n  const ownOrigin = location.origin\n  try {\n    window.top.location.href\n    throw new Error('sandbox proxy is not cross-origin isolated')\n  } catch (error) {\n    if (error instanceof Error && error.message === 'sandbox proxy is not cross-origin isolated') throw error\n  }\n\n  const inner = document.createElement('iframe')\n  inner.setAttribute('sandbox', 'allow-scripts allow-same-origin')\n  document.body.append(inner)\n\n  const resourceReady = 'ui/notifications/sandbox-resource-ready'\n  window.addEventListener('message', (event) => {\n    if (event.source === window.parent) {\n      if (event.origin !== expectedHostOrigin) return\n      if (event.data && event.data.method === resourceReady) {\n        const html = event.data.params && event.data.params.html\n        if (typeof html !== 'string') return\n        const doc = inner.contentDocument || (inner.contentWindow && inner.contentWindow.document)\n        if (!doc) return\n        doc.open()\n        doc.write(html)\n        doc.close()\n        return\n      }\n      if (inner.contentWindow) inner.contentWindow.postMessage(event.data, ownOrigin)\n      return\n    }\n    if (event.source === inner.contentWindow && event.origin === ownOrigin) {\n      window.parent.postMessage(event.data, expectedHostOrigin)\n    }\n  })\n\n  window.parent.postMessage({\n    jsonrpc: '2.0',\n    method: 'ui/notifications/sandbox-proxy-ready',\n    params: {},\n  }, expectedHostOrigin)\n})()\n<\/script>\n</body>\n</html>"])));
/** Start the loopback-only Sandbox Proxy on an OS-assigned port. */
async function startSandboxServer() {
	const server = createServer((req, res) => {
		let url;
		try {
			url = new URL(req.url ?? "/", "http://sandbox.invalid");
		} catch {
			res.writeHead(400).end();
			return;
		}
		if (req.method !== "GET" || url.pathname !== "/" && url.pathname !== "/sandbox.html") {
			res.writeHead(404).end();
			return;
		}
		try {
			const encoded = url.searchParams.get("csp");
			if (encoded !== null && encoded.length > 8192) throw new Error("CSP query is too large");
			const csp = encoded === null ? void 0 : normalizeCsp(JSON.parse(encoded));
			res.writeHead(200, {
				"Cache-Control": "no-store",
				"Content-Security-Policy": buildCspHeader(csp),
				"Content-Type": "text/html; charset=utf-8",
				"Referrer-Policy": "origin",
				"X-Content-Type-Options": "nosniff"
			});
			const sandboxHtml = SANDBOX_HTML
				.replace(
					"  if (!document.referrer) throw new Error('sandbox proxy requires an embedding referrer')\n  const expectedHostOrigin = new URL(document.referrer).origin",
					"  const expectedHostOrigin = document.referrer ? new URL(document.referrer).origin : 'null'"
				)
				.replace(
					/  if \(!\/\^http:[\s\S]{0,180}?test\(expectedHostOrigin\)\) \{\n    throw new Error\('sandbox proxy accepts only loopback hosts'\)\n  \}/,
					"  if (expectedHostOrigin !== 'null' && !/^http:\\/\\/(?:127\\.0\\.0\\.1|localhost)(?::\\d+)?$/.test(expectedHostOrigin)) {\n    throw new Error('sandbox proxy accepts only loopback hosts')\n  }"
				);
			res.end(sandboxHtml);
		} catch (error) {
			res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
			res.end(error instanceof Error ? error.message : "invalid CSP");
		}
	});
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			server.off("error", reject);
			resolve();
		});
	});
	const address = server.address();
	return {
		origin: `http://127.0.0.1:${String(address.port)}`,
		close: () => new Promise((resolve, reject) => {
			server.close((error) => error === void 0 ? resolve() : reject(error));
			server.closeAllConnections();
		})
	};
}
//#endregion
//#region src/host.ts
const API_PREFIX = "/api/mcp-apps";
const DEFAULT_TOOL_TIMEOUT_MS = 6e4;
const DEFAULT_MAX_BODY_BYTES = 524288;
const DEFAULT_MAX_RESULT_META_BYTES = 262144;
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const MAX_PUBLIC_NAME_LENGTH = 64;
const INVALID_NAME_CHARS = /[^A-Za-z0-9_-]/g;
const HASH_LENGTH = 12;
const DSH_WORKSPACE_META_KEY = "ai.deepseek.dsh/workspace";
const DSH_SESSION_META_KEY = "ai.deepseek.dsh/session";
const IMAGE_MEDIA_TYPES = /* @__PURE__ */ new Set([
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif"
]);
const CANONICAL_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
function positiveInteger(value, fallback, name) {
	const resolved = value ?? fallback;
	if (!Number.isSafeInteger(resolved) || resolved < 1) throw new Error(`mcp-apps: ${name} must be a positive safe integer`);
	return resolved;
}
function resolveConfig(config) {
	const servers = config?.servers ?? [];
	const names = /* @__PURE__ */ new Set();
	for (const server of servers) {
		if (!SERVER_NAME_PATTERN.test(server.serverName)) throw new Error(`mcp-apps: invalid serverName ${JSON.stringify(server.serverName)}`);
		if (names.has(server.serverName)) throw new Error(`mcp-apps: duplicate serverName ${JSON.stringify(server.serverName)}`);
		names.add(server.serverName);
		if (server.transport === "stdio" && server.command === "") throw new Error(`mcp-apps(${server.serverName}): command is required`);
		if (server.transport === "streamable-http") {
			const url = new URL(server.url);
			if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`mcp-apps(${server.serverName}): URL must use http or https`);
		}
	}
	const promptInjections = config?.prompts?.autoInject ?? [];
	const promptKeys = /* @__PURE__ */ new Set();
	for (const injection of promptInjections) {
		if (typeof injection.serverName !== "string" || typeof injection.name !== "string") throw new Error("mcp-apps: auto-injected prompt serverName and name must be strings");
		if (!names.has(injection.serverName)) throw new Error(`mcp-apps: auto-injected prompt references unknown server ${JSON.stringify(injection.serverName)}`);
		if (injection.name === "" || injection.name.length > 128) throw new Error("mcp-apps: auto-injected prompt name must contain 1-128 characters");
		const key = `${injection.serverName}\0${injection.name}`;
		if (promptKeys.has(key)) throw new Error(`mcp-apps: duplicate auto-injected prompt ${JSON.stringify(injection.name)}`);
		promptKeys.add(key);
		if (injection.arguments !== void 0 && (injection.arguments === null || typeof injection.arguments !== "object" || Array.isArray(injection.arguments))) throw new Error("mcp-apps: auto-injected prompt arguments must be an object");
		for (const [name, value] of Object.entries(injection.arguments ?? {})) if (name === "" || typeof value !== "string") throw new Error("mcp-apps: auto-injected prompt arguments must be named strings");
	}
	return {
		servers,
		toolCallTimeoutMs: positiveInteger(config?.toolCallTimeoutMs, DEFAULT_TOOL_TIMEOUT_MS, "toolCallTimeoutMs"),
		maxBodyBytes: positiveInteger(config?.maxBodyBytes, DEFAULT_MAX_BODY_BYTES, "maxBodyBytes"),
		maxResultMetaBytes: positiveInteger(config?.maxResultMetaBytes, DEFAULT_MAX_RESULT_META_BYTES, "maxResultMetaBytes"),
		promptInjections
	};
}
/** Stable Harness-facing name for one MCP tool identity. */
function publicToolName(serverName, rawName) {
	const joined = `mcp__${serverName}__${rawName}`;
	const normalized = joined.replace(INVALID_NAME_CHARS, "_");
	if (normalized === joined && normalized.length <= MAX_PUBLIC_NAME_LENGTH) return normalized;
	const hash = createHash("sha256").update(`${serverName}\0${rawName}`).digest("hex").slice(0, HASH_LENGTH);
	return `${normalized.slice(0, 51)}_${hash}`;
}
function visibilityOf(tool) {
	const ui = tool._meta?.ui;
	if (ui === void 0 || ui === null || typeof ui !== "object" || Array.isArray(ui)) return {
		app: true,
		model: true
	};
	const visibility = ui.visibility;
	if (visibility === void 0) return {
		app: true,
		model: true
	};
	if (!Array.isArray(visibility) || visibility.length === 0 || visibility.some((value) => value !== "app" && value !== "model")) throw new Error(`tool ${JSON.stringify(tool.name)} has invalid _meta.ui.visibility`);
	return {
		app: visibility.includes("app"),
		model: visibility.includes("model")
	};
}
function jsonValue(value, label) {
	const encoded = JSON.stringify(value);
	if (encoded === void 0) throw new Error(`${label} is not JSON`);
	return JSON.parse(encoded);
}
function resultValue(result) {
	if (!Array.isArray(result.content)) throw new Error("MCP tool result content must be an array");
	return {
		content: jsonValue(result.content, "MCP tool result content"),
		...result.structuredContent === void 0 ? {} : { structuredContent: jsonValue(result.structuredContent, "MCP structuredContent") },
		...result._meta === void 0 ? {} : { _meta: jsonValue(result._meta, "MCP result _meta") }
	};
}
function resultText(result, rawName) {
	const parts = [];
	for (const block of result.content) if (block !== null && typeof block === "object" && !Array.isArray(block) && block.type === "text" && typeof block.text === "string") parts.push(block.text);
	return parts.length > 0 ? parts.join("\n") : `Tool "${rawName}" completed without text output.`;
}
function attachmentWriter(ctx) {
	const service = ctx.get("attachments");
	return service !== null && typeof service === "object" && "saveImages" in service && typeof service.saveImages === "function" ? service : void 0;
}
function modelResolver(ctx) {
	const service = ctx.get("llm");
	return service !== null && typeof service === "object" && "resolveModelInfo" in service && typeof service.resolveModelInfo === "function" ? service : void 0;
}
function imageUnavailable(mediaType, reason) {
	return {
		type: "text",
		text: `[image unavailable: ${mediaType}; ${reason}; raw image data remains available to programmatic callers]`
	};
}
async function modelContent(ctx, result, rawName, exec) {
	const content = [];
	const images = [];
	let invalidImage = false;
	for (const block of result.content) if (block.type === "text") content.push({
		type: "text",
		text: block.text
	});
	else if (block.type === "image") {
		if (!IMAGE_MEDIA_TYPES.has(block.mimeType) || !CANONICAL_BASE64.test(block.data)) {
			invalidImage = true;
			content.push(imageUnavailable(block.mimeType, "invalid image content"));
			continue;
		}
		const data = Buffer.from(block.data, "base64");
		if (data.toString("base64") !== block.data) {
			invalidImage = true;
			content.push(imageUnavailable(block.mimeType, "invalid image content"));
			continue;
		}
		images.push({
			index: content.length,
			data,
			mediaType: block.mimeType
		});
		content.push(null);
	} else if (block.type === "resource" && "text" in block.resource) content.push({
		type: "text",
		text: `[${block.resource.uri}]\n${block.resource.text}`
	});
	else content.push({
		type: "text",
		text: `MCP content retained in the tool result: ${JSON.stringify(block)}`
	});
	if (images.length > 0) {
		const writer = attachmentWriter(ctx);
		const routed = exec.agent?.session.requestHeader()?.config;
		const provider = routed?.provider ?? exec.agent?.options.provider;
		const model = routed?.model ?? exec.agent?.options.model;
		const llm = modelResolver(ctx);
		let reason;
		if (invalidImage) reason = "another image in the same result was invalid";
		else if (writer === void 0) reason = "no attachment store is mounted";
		else if (provider === void 0 || model === void 0 || llm === void 0) reason = "the current model route could not be resolved";
		else try {
			if ((await llm.resolveModelInfo(provider, model, exec.signal)).inputModalities?.includes("image") !== true) reason = `model "${model}" does not declare image input`;
		} catch {
			reason = "the current model route could not be verified";
		}
		exec.signal.throwIfAborted();
		if (reason === void 0 && writer !== void 0) try {
			const refs = await writer.saveImages(images.map((image) => ({
				data: image.data,
				mediaType: image.mediaType
			})));
			for (const [offset, image] of images.entries()) content[image.index] = {
				type: "image",
				attachment: refs[offset]
			};
		} catch {
			reason = "durable image storage rejected the result";
		}
		if (reason !== void 0) for (const image of images) content[image.index] = imageUnavailable(image.mediaType, reason);
	}
	if (content.length === 0) content.push({
		type: "text",
		text: `Tool "${rawName}" completed without content output.`
	});
	return content;
}
function createTransport(config) {
	if (config.transport === "stdio") return new StdioClientTransport({
		command: config.command,
		args: config.args ?? [],
		...config.cwd === void 0 || config.cwd === "" ? {} : { cwd: config.cwd },
		...config.env === void 0 ? {} : { env: config.env }
	});
	return new StreamableHTTPClientTransport(new URL(config.url), { requestInit: { headers: config.headers } });
}
var ServerState = class {
	ctx;
	config;
	host;
	resolved;
	client;
	tools = /* @__PURE__ */ new Map();
	_connectionGeneration = randomUUID();
	toolDisposers = /* @__PURE__ */ new Map();
	promptSections = /* @__PURE__ */ new Map();
	viewIds = /* @__PURE__ */ new Set();
	reconnectTimer;
	reconnecting = false;
	disposed = false;
	reconnectDelayMs = 250;
	constructor(ctx, config, host, resolved) {
		this.ctx = ctx;
		this.config = config;
		this.host = host;
		this.resolved = resolved;
		this.client = this.createClient();
	}
	get connectionGeneration() {
		return this._connectionGeneration;
	}
	createClient() {
		const client = new Client({
			name: "dsh-uni-editor",
			version: "0.3.3"
		}, { capabilities: { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: [RESOURCE_MIME_TYPE] } } } });
		client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
			try {
				await this.sync();
			} catch (error) {
				this.ctx.logger.error(`mcp-apps(${this.config.serverName}): tool re-sync failed: ${String(error)}`);
			}
		});
		client.setNotificationHandler(PromptListChangedNotificationSchema, async () => {
			try {
				await this.syncPrompts();
			} catch (error) {
				this.ctx.logger.error(`mcp-apps(${this.config.serverName}): prompt re-sync failed: ${String(error)}`);
			}
		});
		client.onerror = (error) => {
			this.ctx.logger.error(`mcp-apps(${this.config.serverName}): MCP transport error: ${String(error)}`);
		};
		client.onclose = () => {
			if (client === this.client && !this.disposed) this.scheduleReconnect();
		};
		return client;
	}
	async connect(client) {
		await client.connect(createTransport(this.config));
		if (client !== this.client || this.disposed) {
			await client.close();
			return;
		}
		this._connectionGeneration = randomUUID();
		await Promise.all([this.sync(), this.syncPrompts()]);
		this.reconnectDelayMs = 250;
	}
	scheduleReconnect() {
		if (this.disposed || this.reconnecting || this.reconnectTimer !== void 0) return;
		const delay = this.reconnectDelayMs;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = void 0;
			this.reconnect();
		}, delay);
	}
	async reconnect() {
		if (this.disposed || this.reconnecting) return;
		this.reconnecting = true;
		const client = this.createClient();
		this.client = client;
		let connected = false;
		try {
			await this.connect(client);
			connected = true;
		} catch (error) {
			this.ctx.logger.error(`mcp-apps(${this.config.serverName}): reconnect failed: ${String(error)}`);
			this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 5e3);
			await client.close().catch(() => {});
		} finally {
			this.reconnecting = false;
			if (!connected) this.scheduleReconnect();
		}
	}
	async start() {
		await this.connect(this.client);
	}
	async listTools() {
		if (this.client.getServerCapabilities()?.tools === void 0) return [];
		const tools = [];
		let cursor;
		do {
			const page = await this.client.listTools(cursor === void 0 ? {} : { cursor });
			tools.push(...page.tools);
			cursor = page.nextCursor;
		} while (cursor !== void 0);
		return tools;
	}
	async listPrompts() {
		if (this.client.getServerCapabilities()?.prompts === void 0) return [];
		const prompts = [];
		let cursor;
		do {
			const page = await this.client.listPrompts(cursor === void 0 ? {} : { cursor });
			prompts.push(...page.prompts);
			cursor = page.nextCursor;
		} while (cursor !== void 0);
		return prompts;
	}
	async syncPrompts() {
		const injections = this.resolved.promptInjections.filter((injection) => injection.serverName === this.config.serverName);
		if (injections.length === 0) return;
		if (this.client.getServerCapabilities()?.prompts === void 0) throw new Error(`mcp-apps(${this.config.serverName}): configured autoInject prompts but server has no prompts capability`);
		const available = new Set((await this.listPrompts()).map((prompt) => prompt.name));
		const remaining = injections.filter((injection) => available.has(injection.name));
		const active = new Set(remaining.map((injection) => `${this.config.serverName}\0${injection.name}`));
		for (const [key, current] of this.promptSections) {
			if (active.has(key)) continue;
			current.dispose();
			this.promptSections.delete(key);
		}
		const sections = await Promise.all(remaining.map(async (injection) => {
			const result = await this.client.getPrompt({
				name: injection.name,
				...injection.arguments === void 0 ? {} : { arguments: injection.arguments }
			}, { timeout: this.resolved.toolCallTimeoutMs });
			const text = renderInjectedPrompt(this.config.serverName, injection.name, result);
			return {
				key: `${this.config.serverName}\0${injection.name}`,
				name: `mcp-prompt:${this.config.serverName}:${injection.name}`,
				order: 130,
				text,
				hash: createHash("sha256").update(text).digest("hex")
			};
		}));
		for (const section of sections) {
			const current = this.promptSections.get(section.key);
			if (current?.hash === section.hash) continue;
			current?.dispose();
			this.promptSections.delete(section.key);
			const dispose = this.ctx.systemPrompt.section({
				name: section.name,
				order: section.order,
				text: section.text
			});
			this.promptSections.set(section.key, {
				hash: section.hash,
				dispose
			});
		}
		const unavailable = injections.find((injection) => !available.has(injection.name));
		if (unavailable !== void 0) throw new Error(`mcp-apps(${this.config.serverName}): auto-injected prompt ${JSON.stringify(unavailable.name)} is unavailable`);
	}
	output(rawName, view) {
		return {
			schema: {
				type: "object",
				properties: {
					content: {
						type: "array",
						items: {}
					},
					structuredContent: {},
					_meta: {},
					modelContent: {
						type: "array",
						items: {}
					},
					uiSessionId: { type: "string" }
				},
				required: ["content"],
				additionalProperties: false
			},
			render(_args, value) {
				const result = value;
				return result.modelContent ?? [{
					type: "text",
					text: resultText(result, rawName)
				}];
			},
			...view === void 0 ? {} : { presentationMeta: (_args, value) => {
				const result = value;
				const resultMeta = result._meta !== null && typeof result._meta === "object" && !Array.isArray(result._meta) ? result._meta : {};
				const meta = {
					kind: "dsh/mcp-app",
					version: 1,
					serverName: this.config.serverName,
					connectionGeneration: view.connectionGeneration,
					...typeof result.uiSessionId === "string" ? { sessionId: result.uiSessionId } : {},
					viewId: view.viewId,
					publicToolName: view.publicToolName,
					resourceUri: view.resourceUri,
					sandboxOrigin: view.sandboxOrigin,
					...typeof result.structuredContent === "object" && result.structuredContent !== null && !Array.isArray(result.structuredContent) && typeof result.structuredContent.projectId === "string" ? {
						projectId: result.structuredContent.projectId,
						...typeof result.structuredContent.revision === "string" ? { revision: result.structuredContent.revision } : {}
					} : {},
					result: {
						content: result.content,
						...result.structuredContent === void 0 ? {} : { structuredContent: result.structuredContent },
						...result.uiSessionId === void 0 && result._meta === void 0 ? {} : { _meta: {
							...resultMeta,
							...result.uiSessionId === void 0 ? {} : { "ai.deepseek.dsh/app-instance": {
								sessionId: result.uiSessionId,
								serverName: this.config.serverName
							} }
						} }
					}
				};
				if (Buffer.byteLength(JSON.stringify(meta), "utf8") > this.resolved.maxResultMetaBytes) return {
					kind: "dsh/mcp-app-result-too-large",
					version: 1,
					publicToolName: view.publicToolName
				};
				return meta;
			} }
		};
	}
	executor(rawName, view) {
		return async (args, exec) => {
			const cwd = this.config.transport === "stdio" && this.config.forwardWorkspace === true ? exec.agent?.session.header.cwd : void 0;
			const input = typeof args === "object" && args !== null ? args : {};
			const result = await this.call(rawName, input, exec.signal, {
				...cwd === void 0 ? {} : { [DSH_WORKSPACE_META_KEY]: { cwd } },
				[DSH_SESSION_META_KEY]: {
					sessionId: exec.agent?.session.header.id,
					connectionGeneration: this.connectionGeneration
				}
			});
			const value = {
				...resultValue(result),
				modelContent: await modelContent(this.ctx, result, rawName, exec),
				...exec.agent?.session.header.id === void 0 ? {} : { uiSessionId: exec.agent.session.header.id }
			};
			if (result.isError === true) throw new Error(resultText(value, rawName));
			const sessionId = exec.agent?.session.header.id;
			if (view !== void 0 && sessionId !== void 0) this.host.bindViewSession(view.viewId, sessionId, view.connectionGeneration);
			return value;
		};
	}
	async sync() {
		const listed = await this.listTools();
		const definitions = /* @__PURE__ */ new Map();
		const nextTools = /* @__PURE__ */ new Map();
		const views = [];
		for (const tool of listed) {
			if (nextTools.has(tool.name)) throw new Error(`server listed tool ${JSON.stringify(tool.name)} more than once`);
			const visibility = visibilityOf(tool);
			nextTools.set(tool.name, {
				tool,
				visibility
			});
			if (!visibility.model) continue;
			const publicName = publicToolName(this.config.serverName, tool.name);
			if (definitions.has(publicName)) throw new Error(`tool name collision at ${JSON.stringify(publicName)}`);
			const resourceUri = getToolUiResourceUri(tool);
			const view = resourceUri === void 0 ? void 0 : {
				serverName: this.config.serverName,
				connectionGeneration: this.connectionGeneration,
				publicToolName: publicName,
				resourceUri,
				sandboxOrigin: this.host.sandboxOrigin,
				viewId: randomUUID()
			};
			if (view !== void 0) views.push({
				item: view,
				rawToolName: tool.name,
				state: this
			});
			definitions.set(publicName, {
				name: publicName,
				description: tool.description ?? "",
				parameters: tool.inputSchema,
				output: this.output(tool.name, view),
				execute: this.executor(tool.name, view)
			});
		}
		for (const dispose of this.toolDisposers.values()) dispose();
		const previousViewSessions = this.host.removeViews(this.viewIds);
		this.viewIds.clear();
		const nextDisposers = /* @__PURE__ */ new Map();
		try {
			for (const [name, definition] of definitions) nextDisposers.set(name, this.ctx.tools.register(definition));
			this.tools.clear();
			for (const [name, value] of nextTools) this.tools.set(name, value);
			for (const view of views) {
				this.host.addView(view, previousViewSessions.get(view.rawToolName));
				this.viewIds.add(view.item.viewId);
			}
			this.toolDisposers = nextDisposers;
		} catch (error) {
			for (const dispose of nextDisposers.values()) dispose();
			this.toolDisposers = /* @__PURE__ */ new Map();
			throw error;
		}
	}
	async call(rawName, args, signal, meta) {
		return this.client.request({
			method: "tools/call",
			params: {
				name: rawName,
				arguments: args,
				...meta === void 0 ? {} : { _meta: meta }
			}
		}, CallToolResultSchema, {
			signal,
			timeout: this.resolved.toolCallTimeoutMs
		});
	}
	async readResource(uri, signal) {
		return this.client.request({
			method: "resources/read",
			params: { uri }
		}, ReadResourceResultSchema, {
			signal,
			timeout: this.resolved.toolCallTimeoutMs
		});
	}
	async resourceMeta(uri) {
		let cursor;
		do {
			const page = await this.client.listResources(cursor === void 0 ? {} : { cursor });
			const resource = page.resources.find((candidate) => candidate.uri === uri);
			if (resource !== void 0) return resource._meta;
			cursor = page.nextCursor;
		} while (cursor !== void 0);
	}
	async dispose() {
		this.disposed = true;
		if (this.reconnectTimer !== void 0) clearTimeout(this.reconnectTimer);
		this.reconnectTimer = void 0;
		for (const dispose of this.toolDisposers.values()) dispose();
		this.toolDisposers.clear();
		for (const section of this.promptSections.values()) section.dispose();
		this.promptSections.clear();
		this.host.removeViews(this.viewIds);
		this.viewIds.clear();
		await this.client.close();
	}
};
var McpAppsHost = class {
	sandboxOrigin;
	maxBodyBytes;
	views = /* @__PURE__ */ new Map();
	viewSessions = /* @__PURE__ */ new Map();
	modelContexts = /* @__PURE__ */ new Map();
	constructor(sandboxOrigin, maxBodyBytes) {
		this.sandboxOrigin = sandboxOrigin;
		this.maxBodyBytes = maxBodyBytes;
	}
	addView(binding, sessions) {
		this.views.set(binding.item.viewId, binding);
		if (sessions !== void 0 && sessions.size > 0) this.viewSessions.set(binding.item.viewId, new Set(sessions));
	}
	removeViews(ids) {
		const sessionsByTool = /* @__PURE__ */ new Map();
		for (const id of ids) {
			const binding = this.views.get(id);
			const sessions = this.viewSessions.get(id);
			if (binding !== void 0 && sessions !== void 0) sessionsByTool.set(binding.rawToolName, new Set(sessions));
			this.views.delete(id);
			this.viewSessions.delete(id);
			for (const [key, context] of this.modelContexts) if (context.viewId === id) this.modelContexts.delete(key);
		}
		return sessionsByTool;
	}
	catalog() {
		return [...this.views.values()].map((binding) => binding.item).sort((left, right) => left.publicToolName.localeCompare(right.publicToolName));
	}
	binding(viewId) {
		if (typeof viewId !== "string") throw new Error("viewId must be a string");
		const binding = this.views.get(viewId);
		if (binding === void 0) throw new Error("MCP App View is unavailable");
		return binding;
	}
	bindViewSession(viewId, sessionId, connectionGeneration) {
		if (this.binding(viewId).item.connectionGeneration !== connectionGeneration) return;
		const sessions = this.viewSessions.get(viewId) ?? /* @__PURE__ */ new Set();
		sessions.add(sessionId);
		this.viewSessions.set(viewId, sessions);
	}
	updateModelContext(viewId, sessionId, connectionGeneration, params) {
		const binding = this.binding(viewId);
		if (typeof sessionId !== "string" || sessionId === "" || sessionId.length > 256) throw new Error("Harness Session identity is required");
		if (connectionGeneration !== binding.item.connectionGeneration) throw new Error("MCP Server connection generation changed");
		if (this.viewSessions.get(binding.item.viewId)?.has(sessionId) !== true) throw new Error("MCP App View does not belong to this Harness Session");
		const content = params.content ?? [];
		if (!Array.isArray(content) || content.some((block) => block === null || typeof block !== "object" || Array.isArray(block) || block.type !== "text" || typeof block.text !== "string")) throw new Error("MCP App model context only supports text content");
		const structured = params.structuredContent;
		if (structured !== void 0 && (structured === null || typeof structured !== "object" || Array.isArray(structured))) throw new Error("MCP App structured model context must be an object");
		const parts = content.map((block) => block.text);
		if (structured !== void 0) parts.push(`Structured context:\n${JSON.stringify(structured)}`);
		const key = `${binding.item.viewId}\0${sessionId}\0${binding.item.connectionGeneration}`;
		const text = parts.filter((part) => part !== "").join("\n\n");
		if (text === "") this.modelContexts.delete(key);
		else this.modelContexts.set(key, {
			viewId: binding.item.viewId,
			sessionId,
			connectionGeneration: binding.item.connectionGeneration,
			text: `MCP App context from "${binding.item.publicToolName}":\n${text}`
		});
	}
	modelContext(sessionId) {
		if (sessionId === void 0) return "";
		return [...this.modelContexts.values()].filter((context) => context.sessionId === sessionId && this.views.get(context.viewId)?.item.connectionGeneration === context.connectionGeneration).sort((left, right) => left.viewId.localeCompare(right.viewId)).map((context) => context.text).join("\n\n");
	}
	async readView(viewId) {
		const binding = this.binding(viewId);
		const resource = await binding.state.readResource(binding.item.resourceUri);
		if (resource.contents.length !== 1) throw new Error("MCP App resource must contain exactly one content item");
		const [content] = resource.contents;
		if (content === void 0 || content.mimeType !== RESOURCE_MIME_TYPE) throw new Error(`MCP App resource must use ${RESOURCE_MIME_TYPE}`);
		const html = "text" in content ? content.text : Buffer.from(content.blob, "base64").toString("utf8");
		if (Buffer.byteLength(html, "utf8") > this.maxBodyBytes) throw new Error("MCP App resource is too large");
		const contentMeta = content._meta;
		const listingMeta = contentMeta === void 0 ? await binding.state.resourceMeta(binding.item.resourceUri) : void 0;
		const csp = normalizeCsp((contentMeta?.ui ?? listingMeta?.ui)?.csp);
		return {
			html,
			...csp === void 0 ? {} : { csp }
		};
	}
	async callTool(viewId, name, args, sessionId, connectionGeneration) {
		const binding = this.binding(viewId);
		if (typeof name !== "string") throw new Error("tool name must be a string");
		const hasOwner = sessionId !== void 0 || connectionGeneration !== void 0;
		if (hasOwner && (typeof sessionId !== "string" || sessionId === "")) throw new Error("Harness Session identity is required");
		if (hasOwner && connectionGeneration !== binding.item.connectionGeneration) throw new Error("MCP Server connection generation changed");
		const listed = binding.state.tools.get(name);
		if (listed === void 0 || !listed.visibility.app) throw new Error("tool is not visible to this MCP App");
		const input = typeof args === "object" && args !== null ? args : {};
		const result = await binding.state.call(name, input, void 0, hasOwner ? { [DSH_SESSION_META_KEY]: {
			sessionId,
			connectionGeneration
		} } : void 0);
		if (hasOwner) this.bindViewSession(binding.item.viewId, sessionId, connectionGeneration);
		return result;
	}
	async readResource(viewId, uri) {
		const binding = this.binding(viewId);
		if (typeof uri !== "string" || uri === "") throw new Error("resource URI must be a non-empty string");
		return binding.state.readResource(uri);
	}
};
async function readJson(request, maxBytes) {
	if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json") throw new Error("Content-Type must be application/json");
	const declaredLength = request.headers.get("content-length");
	if (declaredLength !== null && Number(declaredLength) > maxBytes) throw new Error("request body is too large");
	const bytes = Buffer.from(await request.arrayBuffer());
	if (bytes.byteLength > maxBytes) throw new Error("request body is too large");
	const value = JSON.parse(bytes.toString("utf8"));
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("request body must be a JSON object");
	return value;
}
function jsonResponse(status, value) {
	return new Response(JSON.stringify(value), {
		status,
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "application/json; charset=utf-8",
			"X-Content-Type-Options": "nosniff"
		}
	});
}
function sameOrigin(request) {
	const origin = request.headers.get("origin");
	if (origin === null) return true;
	const host = request.headers.get("host");
	return host !== null && origin === `http://${host}`;
}
function apiFetchHandler(host, maxBodyBytes) {
	return async (request) => {
		if (!sameOrigin(request)) return jsonResponse(403, { error: "cross-origin request rejected" });
		const path = new URL(request.url).pathname;
		try {
			if (request.method === "GET" && path === `${API_PREFIX}/catalog`) {
				return jsonResponse(200, { items: host.catalog() });
			}
			if (request.method !== "POST") return jsonResponse(404, { error: "not found" });
			const body = await readJson(request, maxBodyBytes);
			if (path === `${API_PREFIX}/view`) {
				return jsonResponse(200, await host.readView(body.viewId));
			}
			if (path === `${API_PREFIX}/tool`) {
				return jsonResponse(200, await host.callTool(body.viewId, body.name, body.arguments, body.sessionId, body.connectionGeneration));
			}
			if (path === `${API_PREFIX}/model-context`) {
				host.updateModelContext(body.viewId, body.sessionId, body.connectionGeneration, {
					...body.content === void 0 ? {} : { content: body.content },
					...body.structuredContent === void 0 ? {} : { structuredContent: body.structuredContent }
				});
				return jsonResponse(200, {});
			}
			if (path === `${API_PREFIX}/resource`) {
				return jsonResponse(200, await host.readResource(body.viewId, body.uri));
			}
			return jsonResponse(404, { error: "not found" });
		} catch (error) {
			return jsonResponse(400, { error: error instanceof Error ? error.message : String(error) });
		}
	};
}
/** Mount the standalone MCP Apps Host into the current Cordis composition. */
async function applyHost(ctx, config) {
	const resolved = resolveConfig(config);
	if (ctx.webServer.host !== "127.0.0.1") throw new Error("mcp-apps: v1 requires the Web Host to bind 127.0.0.1");
	await ctx.effect(async () => {
		const sandbox = await startSandboxServer();
		const host = new McpAppsHost(sandbox.origin, resolved.maxBodyBytes);
		const disposeModelContext = ctx.systemPrompt.context({
			name: "mcp-apps:view-context",
			order: 140,
			text: (context) => host.modelContext(context.agent?.session.header.id)
		});
		const routePaths = [
			`${API_PREFIX}/catalog`,
			`${API_PREFIX}/view`,
			`${API_PREFIX}/tool`,
			`${API_PREFIX}/model-context`,
			`${API_PREFIX}/resource`
		];
		const routeDisposers = routePaths.map((path) => ctx.connection.fetch.register({
			path,
			methods: path.endsWith("/catalog") ? ["GET"] : ["POST"],
			requestBody: "buffered",
			fetch: apiFetchHandler(host, resolved.maxBodyBytes)
		}));
		const states = [];
		try {
			for (const server of resolved.servers) {
				const state = new ServerState(ctx, server, host, resolved);
				states.push(state);
				await state.start();
			}
		} catch (error) {
			for (const state of states.reverse()) await state.dispose();
			for (const disposeRoute of routeDisposers) await disposeRoute();
			disposeModelContext();
			await sandbox.close();
			throw error;
		}
		return async () => {
			for (const disposeRoute of routeDisposers.reverse()) await disposeRoute();
			for (const state of states.reverse()) await state.dispose();
			disposeModelContext();
			await sandbox.close();
		};
	}, "mcp-apps.host");
}
//#endregion
//#region src/index.ts
/** Cordis plugin name used by Loader diagnostics. */
const name = "mcp-apps";
/** Stable MCP Apps specification implemented by this package. */
const MCP_APPS_SPEC_VERSION = "2026-01-26";
/** Required Harness services. */
const inject = [
	"tools",
	"webServer",
	"connection",
	"systemPrompt"
];
/** Mount MCP connections, tool registrations, Host API, and the isolated Sandbox Proxy. */
async function apply(ctx, config) {
	await applyHost(ctx, config);
}
//#endregion
export { MCP_APPS_SPEC_VERSION, apply, buildCspHeader, inject, name, normalizeCsp, publicToolName };
