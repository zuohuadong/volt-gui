export interface WorkspacePathPolicy {
    readonly root: string;
    resolveExisting(input: string, kind?: 'file' | 'directory'): Promise<string>;
    resolveWritableFile(input: string): Promise<string>;
    assertContained(realPath: string): void;
}
export declare function isPathContained(root: string, candidate: string): boolean;
export declare function createWorkspacePathPolicy(root: string): Promise<WorkspacePathPolicy>;
export declare function writeWorkspaceFile(filePath: string, content: string): Promise<void>;
//# sourceMappingURL=workspace_path.d.ts.map