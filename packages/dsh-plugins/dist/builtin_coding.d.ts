import type { ToolHandler } from '@dsh/core';
import type { DshPlugin, PluginInitContext } from './types.js';
export declare class BuiltinCodingPlugin implements DshPlugin {
    name: string;
    description: string;
    private workingDir;
    private workspacePolicy;
    init(context: PluginInitContext): Promise<void>;
    getTools(): ToolHandler[];
    private createReadFileTool;
    private createWriteFileTool;
    private createEditFileTool;
    private createListDirTool;
    private createGrepTool;
    private createGlobTool;
    private createBashTool;
    private createPwshTool;
}
//# sourceMappingURL=builtin_coding.d.ts.map