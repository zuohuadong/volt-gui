import { fileURLToPath } from "node:url";
import * as office from "@deepseek-ai/dsh-tool-office";
import * as filesystem from "@deepseek-ai/dsh-skill-filesystem";

export const name = "anyong-office";
export const inject = ["skills"];

export async function apply(ctx) {
  // rc.3 的 web-app 已挂载 Office 技能；这里只补官方工具和本地工作流。
  await ctx.plugin(office);
  await ctx.plugin(filesystem, {
    providerName: "anyong-office-workflows",
    includeDefaultRoots: false,
    bundledSkillDir: fileURLToPath(new URL("../skills/", import.meta.url)),
    watch: false,
  });
}
