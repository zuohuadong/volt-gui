import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const docsSource = () => readFile(new URL("../pages/docs.astro", import.meta.url), "utf8");
const stylesSource = () => readFile(new URL("../styles/global.css", import.meta.url), "utf8");

test("copyable documentation code blocks keep their controls inside the pre element", async () => {
  const page = await docsSource();

  assert.match(page, /<pre class="codeblock"><button data-copy=/);
});

test("copyable documentation code blocks keep their controls clear of code", async () => {
  const styles = await stylesSource();

  assert.match(styles, /\.codeblock button\s*\{[^}]*position:\s*absolute/);
  assert.match(styles, /\.codeblock:has\(button\)\s*\{\s*padding-top:\s*52px\s*\}/);
});

test("the npm install comment and command remain separate source lines", async () => {
  const page = await docsSource();

  assert.match(
    page,
    /# npm \(Go 1\.x · recommended · 推荐\)<\/span>\nnpm i -g voltui@next/,
  );
});

test("the quick-start directory and launch commands remain separate source lines", async () => {
  const page = await docsSource();

  assert.match(page, /data-copy="cd your-project && voltui code">Copy<\/button>cd your-project\nvoltui code/);
});
