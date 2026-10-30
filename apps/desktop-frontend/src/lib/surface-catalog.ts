import { Type } from "typebox";
import { Value } from "typebox/value";
import {
  defaultSurfaceCatalog,
  defineSurfaceCatalog,
  type SurfaceRenderCatalog,
  type SurfaceWidgetRendererProps,
} from "@svadmin/surface/svelte";
import type { JsonObject } from "@svadmin/surface";
import PieChartWidget from "$components/surface/PieChartWidget.svelte";
import CalculatorWidget from "$components/surface/CalculatorWidget.svelte";
import FormWidget from "$components/surface/FormWidget.svelte";

/** Volt 目录版本；模型生成的 spec 必须精确匹配。 */
export const VOLT_SURFACE_CATALOG_VERSION = "volt/v1";

/** 编号字段名与内置组件保持同一约束。 */
const fieldSchema = Type.String({ minLength: 1, maxLength: 64, pattern: "^[A-Za-z][A-Za-z0-9_-]*$" });

/** 本地物料沿用上游组件属性契约（含 onSelectRecord / onSubmitValues）。 */
export type VoltSurfaceWidgetProps = SurfaceWidgetRendererProps;

const pieChartPropsSchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 80 }),
  labelField: fieldSchema,
  valueField: fieldSchema,
  showLegend: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });

const calculatorPropsSchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 80 }),
  description: Type.Optional(Type.String({ minLength: 1, maxLength: 160 })),
  initialValue: Type.Optional(Type.Number()),
  submitLabel: Type.Optional(Type.String({ minLength: 1, maxLength: 40 })),
}, { additionalProperties: false });

const formFieldSchemas = [
  Type.Object({
    kind: Type.Literal("text"),
    name: fieldSchema,
    label: Type.String({ minLength: 1, maxLength: 60 }),
    required: Type.Optional(Type.Boolean()),
    placeholder: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
    maxLength: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
  }, { additionalProperties: false }),
  Type.Object({
    kind: Type.Literal("textarea"),
    name: fieldSchema,
    label: Type.String({ minLength: 1, maxLength: 60 }),
    required: Type.Optional(Type.Boolean()),
    placeholder: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
    rows: Type.Optional(Type.Integer({ minimum: 2, maximum: 10 })),
  }, { additionalProperties: false }),
  Type.Object({
    kind: Type.Literal("number"),
    name: fieldSchema,
    label: Type.String({ minLength: 1, maxLength: 60 }),
    required: Type.Optional(Type.Boolean()),
    min: Type.Optional(Type.Number()),
    max: Type.Optional(Type.Number()),
    step: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
  }, { additionalProperties: false }),
  Type.Object({
    kind: Type.Literal("select"),
    name: fieldSchema,
    label: Type.String({ minLength: 1, maxLength: 60 }),
    required: Type.Optional(Type.Boolean()),
    options: Type.Array(Type.Object({
      value: Type.String({ minLength: 1, maxLength: 80 }),
      label: Type.String({ minLength: 1, maxLength: 80 }),
    }, { additionalProperties: false }), { minItems: 1, maxItems: 20 }),
  }, { additionalProperties: false }),
  Type.Object({
    kind: Type.Literal("checkbox"),
    name: fieldSchema,
    label: Type.String({ minLength: 1, maxLength: 60 }),
    required: Type.Optional(Type.Boolean()),
  }, { additionalProperties: false }),
  Type.Object({
    kind: Type.Literal("date"),
    name: fieldSchema,
    label: Type.String({ minLength: 1, maxLength: 60 }),
    required: Type.Optional(Type.Boolean()),
  }, { additionalProperties: false }),
] as const;

const formPropsSchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 80 }),
  description: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  submitLabel: Type.Optional(Type.String({ minLength: 1, maxLength: 40 })),
  fields: Type.Array(Type.Union([...formFieldSchemas]), { minItems: 1, maxItems: 12 }),
}, { additionalProperties: false });

/**
 * Volt 的可生成物料：四个只读内置组件，加饼图、计算器和表单。
 * 目录只描述契约；组件本身不执行 mutation、脚本、URL 或事件处理器。
 */
export const VOLT_SURFACE_CATALOG: SurfaceRenderCatalog = defineSurfaceCatalog({
  version: VOLT_SURFACE_CATALOG_VERSION,
  widgets: [
    ...defaultSurfaceCatalog.widgets,
    {
      type: "pie-chart",
      dataKind: "items",
      description: "Show part-to-whole proportions with a readable label field and a numeric value field. Bind to /items; aggregated data must come from an authorized resource.",
      propsSchema: pieChartPropsSchema,
      getReferencedFields: (props: JsonObject) => {
        const decoded = Value.Decode(pieChartPropsSchema, props);
        return [decoded.labelField, decoded.valueField];
      },
      examples: [{ title: "订单渠道占比", labelField: "channel", valueField: "orders" }],
      component: PieChartWidget,
    },
    {
      type: "calculator",
      dataKind: "none",
      description: "Render a local calculator that computes without data sources or side effects. The result can be sent back to the conversation when the host enables value submission.",
      propsSchema: calculatorPropsSchema,
      examples: [{ title: "计算器" }],
      component: CalculatorWidget,
    },
    {
      type: "form",
      dataKind: "none",
      description: "Collect short structured input with labeled text, textarea, number, select, checkbox and date fields. Values stay local until the host submits them back to the conversation.",
      propsSchema: formPropsSchema,
      examples: [{
        title: "请假申请",
        fields: [
          { kind: "text", name: "applicant", label: "申请人", required: true },
          { kind: "date", name: "start", label: "开始日期", required: true },
        ],
      }],
      component: FormWidget,
    },
  ],
});