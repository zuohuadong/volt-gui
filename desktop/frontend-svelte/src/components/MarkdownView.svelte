<script lang="ts">
  import CodeBlock from "./CodeBlock.svelte";

  type InlinePart =
    | { id: string; kind: "text"; text: string }
    | { id: string; kind: "strong"; text: string }
    | { id: string; kind: "em"; text: string }
    | { id: string; kind: "code"; text: string }
    | { id: string; kind: "del"; text: string }
    | { id: string; kind: "math"; text: string }
    | { id: string; kind: "link"; text: string; href: string };

  type TableCell = { id: string; content: InlinePart[] };
  type TableRow = { id: string; cells: TableCell[] };

  type MarkdownBlock =
    | { id: string; kind: "heading"; level: number; content: InlinePart[] }
    | { id: string; kind: "paragraph"; content: InlinePart[] }
    | { id: string; kind: "code"; language?: string; code: string }
    | { id: string; kind: "list"; ordered: boolean; items: Array<{ id: string; content: InlinePart[]; checked?: boolean }> }
    | { id: string; kind: "quote"; content: InlinePart[] }
    | { id: string; kind: "table"; headers: TableCell[]; rows: TableRow[] }
    | { id: string; kind: "math"; body: string };

  let { text }: { text: string } = $props();

  const blocks = $derived(parseMarkdown(normalizeMath(text)));

  function normalizeMath(value: string): string {
    return value.replace(/\\\[/g, "$$").replace(/\\\]/g, "$$").replace(/\\\(/g, "$").replace(/\\\)/g, "$");
  }

  function inlineParts(value: string, owner: string): InlinePart[] {
    const parts: InlinePart[] = [];
    const pattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|~~([^~]+)~~|\*([^*\n]+)\*|\$([^$\n]+)\$|(https?:\/\/[^\s<]+)/g;
    let cursor = 0;
    let ordinal = 0;
    for (const match of value.matchAll(pattern)) {
      const index = match.index ?? 0;
      if (index > cursor) {
        parts.push({ id: `${owner}-text-${ordinal}`, kind: "text", text: value.slice(cursor, index) });
        ordinal += 1;
      }
      if (match[1] && match[2]) parts.push({ id: `${owner}-link-${ordinal}`, kind: "link", text: match[1], href: match[2] });
      else if (match[3]) parts.push({ id: `${owner}-code-${ordinal}`, kind: "code", text: match[3] });
      else if (match[4]) parts.push({ id: `${owner}-strong-${ordinal}`, kind: "strong", text: match[4] });
      else if (match[5]) parts.push({ id: `${owner}-del-${ordinal}`, kind: "del", text: match[5] });
      else if (match[6]) parts.push({ id: `${owner}-em-${ordinal}`, kind: "em", text: match[6] });
      else if (match[7]) parts.push({ id: `${owner}-math-${ordinal}`, kind: "math", text: match[7] });
      else if (match[8]) parts.push({ id: `${owner}-url-${ordinal}`, kind: "link", text: match[8], href: match[8] });
      ordinal += 1;
      cursor = index + match[0].length;
    }
    if (cursor < value.length) parts.push({ id: `${owner}-text-${ordinal}`, kind: "text", text: value.slice(cursor) });
    return parts.length ? parts : [{ id: `${owner}-empty`, kind: "text", text: "" }];
  }

  function tableCells(line: string, owner: string): TableCell[] {
    return line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell, index) => ({ id: `${owner}-cell-${index}`, content: inlineParts(cell.trim(), `${owner}-cell-${index}`) }));
  }

  function isTableDivider(line: string): boolean {
    return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
  }

  function parseList(lines: string[], start: number, ordered: boolean): { block: MarkdownBlock; next: number } {
    const items: Array<{ id: string; content: InlinePart[]; checked?: boolean }> = [];
    let index = start;
    const pattern = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*]\s+(.*)$/;
    while (index < lines.length) {
      const match = pattern.exec(lines[index]);
      if (!match) break;
      let body = match[1];
      let checked: boolean | undefined;
      const task = /^\[( |x|X)\]\s+(.*)$/.exec(body);
      if (task) {
        checked = task[1].toLowerCase() === "x";
        body = task[2];
      }
      items.push({ id: `li-${start}-${index}`, content: inlineParts(body, `li-${start}-${index}`), checked });
      index += 1;
    }
    return { block: { id: `list-${start}`, kind: "list", ordered, items }, next: index };
  }

  function parseMarkdown(value: string): MarkdownBlock[] {
    const lines = value.replace(/\r\n|\r/g, "\n").split("\n");
    const parsed: MarkdownBlock[] = [];
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) {
        index += 1;
        continue;
      }
      const fence = /^```([\w-]+)?\s*$/.exec(line);
      if (fence) {
        const start = index;
        const body: string[] = [];
        index += 1;
        while (index < lines.length && !/^```\s*$/.test(lines[index])) {
          body.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        parsed.push({ id: `code-${start}`, kind: "code", language: fence[1], code: body.join("\n") });
        continue;
      }
      if (line.trim() === "$$") {
        const start = index;
        const body: string[] = [];
        index += 1;
        while (index < lines.length && lines[index].trim() !== "$$") {
          body.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        parsed.push({ id: `math-${start}`, kind: "math", body: body.join("\n").trim() });
        continue;
      }
      const heading = /^(#{1,4})\s+(.*)$/.exec(line);
      if (heading) {
        parsed.push({ id: `heading-${index}`, kind: "heading", level: heading[1].length, content: inlineParts(heading[2], `heading-${index}`) });
        index += 1;
        continue;
      }
      if (/^\s*[-*]\s+/.test(line)) {
        const { block, next } = parseList(lines, index, false);
        parsed.push(block);
        index = next;
        continue;
      }
      if (/^\s*\d+\.\s+/.test(line)) {
        const { block, next } = parseList(lines, index, true);
        parsed.push(block);
        index = next;
        continue;
      }
      if (line.trimStart().startsWith(">")) {
        const start = index;
        const body: string[] = [];
        while (index < lines.length && lines[index].trimStart().startsWith(">")) {
          body.push(lines[index].replace(/^\s*>\s?/, ""));
          index += 1;
        }
        parsed.push({ id: `quote-${start}`, kind: "quote", content: inlineParts(body.join(" "), `quote-${start}`) });
        continue;
      }
      if (index + 1 < lines.length && line.includes("|") && isTableDivider(lines[index + 1])) {
        const start = index;
        const headers = tableCells(line, `table-${start}-head`);
        const rows: TableRow[] = [];
        index += 2;
        while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
          rows.push({ id: `table-${start}-row-${index}`, cells: tableCells(lines[index], `table-${start}-row-${index}`) });
          index += 1;
        }
        parsed.push({ id: `table-${start}`, kind: "table", headers, rows });
        continue;
      }
      const start = index;
      const body = [line.trim()];
      index += 1;
      while (index < lines.length && lines[index].trim() && !/^```/.test(lines[index]) && !/^(#{1,4})\s+/.test(lines[index])) {
        if (/^\s*([-*]|\d+\.)\s+/.test(lines[index]) || lines[index].trimStart().startsWith(">")) break;
        body.push(lines[index].trim());
        index += 1;
      }
      parsed.push({ id: `p-${start}`, kind: "paragraph", content: inlineParts(body.join(" "), `p-${start}`) });
    }
    return parsed;
  }
</script>

{#snippet inline(content: InlinePart[])}
  {#each content as part (part.id)}
    {#if part.kind === "text"}
      {part.text}
    {:else if part.kind === "strong"}
      <strong>{part.text}</strong>
    {:else if part.kind === "em"}
      <em>{part.text}</em>
    {:else if part.kind === "code"}
      <code>{part.text}</code>
    {:else if part.kind === "del"}
      <del>{part.text}</del>
    {:else if part.kind === "math"}
      <span class="math math--inline">{part.text}</span>
    {:else if part.kind === "link"}
      <a href={part.href} target="_blank" rel="noreferrer">{part.text}</a>
    {/if}
  {/each}
{/snippet}

<div class="md">
  {#each blocks as block (block.id)}
    {#if block.kind === "heading"}
      {#if block.level === 1}
        <h1>{@render inline(block.content)}</h1>
      {:else if block.level === 2}
        <h2>{@render inline(block.content)}</h2>
      {:else}
        <h3>{@render inline(block.content)}</h3>
      {/if}
    {:else if block.kind === "paragraph"}
      <p>{@render inline(block.content)}</p>
    {:else if block.kind === "code"}
      <CodeBlock code={block.code} language={block.language} />
    {:else if block.kind === "list"}
      {#if block.ordered}
        <ol>
          {#each block.items as item (item.id)}
            <li>{@render inline(item.content)}</li>
          {/each}
        </ol>
      {:else}
        <ul>
          {#each block.items as item (item.id)}
            <li>
              {#if item.checked !== undefined}
                <input type="checkbox" checked={item.checked} disabled />
              {/if}
              {@render inline(item.content)}
            </li>
          {/each}
        </ul>
      {/if}
    {:else if block.kind === "quote"}
      <blockquote>{@render inline(block.content)}</blockquote>
    {:else if block.kind === "table"}
      <table>
        <thead>
          <tr>
            {#each block.headers as header (header.id)}
              <th>{@render inline(header.content)}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each block.rows as row (row.id)}
            <tr>
              {#each row.cells as cell (cell.id)}
                <td>{@render inline(cell.content)}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    {:else if block.kind === "math"}
      <pre class="math math--block">{block.body}</pre>
    {/if}
  {/each}
</div>
