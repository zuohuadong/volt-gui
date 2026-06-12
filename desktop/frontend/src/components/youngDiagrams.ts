// Translate `\yng` (ytableau package) and `\young` (youngtab package)
// macros into a KaTeX-compatible `\begin{array}...\end{array}` form
// with `\boxed` cells. KaTeX 0.17 does not include either macro package,
// so without this pass the macros fail with `Undefined control sequence`
// and the chat surfaces the raw LaTeX source as a red error block.
//
// `\yng(2,1)`             — empty (2,1) Young diagram
// `\yng(2,1,3)`           — empty Young diagram with three rows
// `\yng(2,1){a&b\\c\\d&e}` — same shape, cells filled by row/col
//                            (rows separated by `\\`, cells by `&`)
// `\young(2 1)`           — youngtab syntax (whitespace separator)
//
// Cells are `\hphantom{x}` by default so the diagram has the same
// width as a filled one — the rows look like proper Young diagrams
// rather than ragged edges.

const YNG_PATTERN = /\\yng\(([\d,]+)\)(?:\{((?:[^{}]|\{[^{}]*\})*)\})?/g;
const YOUNG_PATTERN = /\\young\(([\d\s]+)\)(?:\{((?:[^{}]|\{[^{}]*\})*)\})?/g;

function expandShape(
  rows: number[],
  content: string | undefined,
): string {
  const maxN = rows.length === 0 ? 0 : Math.max(...rows);
  // 2D array of cell content. Each cell is `\hphantom{x}` by default
  // so the column width is uniform and rows are left-aligned.
  const cells: string[][] = Array.from({ length: rows.length }, () =>
    Array(maxN).fill("\\hphantom{x}"),
  );

  if (content) {
    // Parse content: rows separated by `\\`, cells separated by `&`.
    // The content may contain nested `{...}` (e.g. `\frac{a}{b}`), so
    // we split on `\\` and `&` at brace-depth 0 only.
    const splitAtTopLevel = (s: string, sep: string): string[] => {
      const out: string[] = [];
      let depth = 0;
      let buf = "";
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
        if (depth === 0 && s.startsWith(sep, i)) {
          out.push(buf);
          buf = "";
          i += sep.length - 1;
          continue;
        }
        buf += ch;
      }
      out.push(buf);
      return out;
    };
    const contentRows = splitAtTopLevel(content, "\\\\");
    for (let i = 0; i < contentRows.length && i < rows.length; i++) {
      const cs = splitAtTopLevel(contentRows[i], "&");
      for (let j = 0; j < cs.length && j < rows[i]; j++) {
        const c = cs[j].trim();
        cells[i][j] = c === "" ? "\\hphantom{x}" : c;
      }
    }
  }

  // Each row is left-aligned by `\begin{array}{c}…\end{array}` plus the
  // joined cells, with rows separated by `\\`. Empty / missing trailing
  // cells in shorter rows are already absent because we slice.
  const arrRows = cells.map((row, ri) =>
    row.slice(0, rows[ri]).join(" \\, "),
  );
  return "\\begin{array}{c}" + arrRows.join(" \\\\ ") + "\\end{array}";
}

export function expandYoungDiagrams(src: string): string {
  return src
    .replace(YNG_PATTERN, (_m, shape, content) =>
      expandShape(
        shape
          .split(",")
          .map((s: string) => parseInt(s.trim(), 10))
          .filter((n: number) => Number.isFinite(n)),
        content,
      ),
    )
    .replace(YOUNG_PATTERN, (_m, shape, content) =>
      expandShape(
        shape
          .trim()
          .split(/\s+/)
          .map((s: string) => parseInt(s, 10))
          .filter((n: number) => Number.isFinite(n)),
        content,
      ),
    );
}