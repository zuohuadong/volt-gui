export const DSH_NATIVE_UI_KIND = "dsh/native-ui";
export const DSH_NATIVE_UI_VERSION = 1;
export type NativeUiTone = "default" | "muted" | "success" | "warning" | "danger";

export type NativeUiNode =
  | { readonly type: "text"; readonly text: string; readonly tone?: NativeUiTone }
  | { readonly type: "metric"; readonly label: string; readonly value: string; readonly detail?: string }
  | { readonly type: "list"; readonly label?: string; readonly items: readonly string[] }
  | { readonly type: "group"; readonly title?: string; readonly children: readonly NativeUiNode[] };

export type DshNativeUiView = {
  readonly kind: typeof DSH_NATIVE_UI_KIND;
  readonly version: typeof DSH_NATIVE_UI_VERSION;
  readonly title?: string;
  readonly description?: string;
  readonly nodes: readonly NativeUiNode[];
};

type RecordValue = Record<string, unknown>;

export function parseDshNativeUiView(value: unknown): DshNativeUiView | undefined {
  const record = asRecord(value);
  if (record?.kind !== DSH_NATIVE_UI_KIND || record.version !== DSH_NATIVE_UI_VERSION) return undefined;
  const nodes = parseNodes(record.nodes, true);
  if (!nodes) return undefined;
  return {
    kind: DSH_NATIVE_UI_KIND,
    version: DSH_NATIVE_UI_VERSION,
    title: boundedText(record.title, 160),
    description: boundedText(record.description, 600),
    nodes,
  };
}

function parseNodes(value: unknown, allowGroups: boolean): readonly NativeUiNode[] | undefined {
  if (!Array.isArray(value) || value.length > 100) return undefined;
  const nodes: NativeUiNode[] = [];
  for (const item of value) {
    const node = parseNode(item, allowGroups);
    if (!node) return undefined;
    nodes.push(node);
  }
  return nodes;
}

function parseNode(value: unknown, allowGroups: boolean): NativeUiNode | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const type = record.type;
  if (type === "text") {
    const text = boundedText(record.text, 2_000);
    return text ? { type, text, tone: parseTone(record.tone) } : undefined;
  }
  if (type === "metric") {
    const label = boundedText(record.label, 160);
    const metricValue = boundedText(record.value, 160);
    if (!label || !metricValue) return undefined;
    return { type, label, value: metricValue, detail: boundedText(record.detail, 300) };
  }
  if (type === "list") {
    const items = Array.isArray(record.items)
      ? record.items.flatMap((item) => {
        const text = boundedText(item, 300);
        return text ? [text] : [];
      })
      : [];
    if (items.length > 100) return undefined;
    return { type, label: boundedText(record.label, 160), items };
  }
  if (type === "group") {
    if (!allowGroups) return undefined;
    const children = parseNodes(record.children, false);
    return children ? { type, title: boundedText(record.title, 160), children } : undefined;
  }
  return undefined;
}

function parseTone(value: unknown): NativeUiTone | undefined {
  return value === "muted" || value === "success" || value === "warning" || value === "danger" ? value : undefined;
}

function boundedText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text && text.length <= maxLength ? text : undefined;
}

function asRecord(value: unknown): RecordValue | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : undefined;
}
