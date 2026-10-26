export interface FileChange {
  filePath: string;
  operation: "created" | "modified" | "deleted";
  oldContent?: string;
  newContent?: string;
  binary?: boolean;
}

export interface WorkspaceGuardOptions {
  ignoreDirs?: string[];
  ignore?: (relPath: string, isDirectory: boolean) => boolean;
  maxMemoryFileSize?: number;
  maxTotalBytes?: number;
  maxDepth?: number;
}

export type CapturedEntry = {
  absPath: string;
  content: any;
  tempPath?: string;
  hash: string;
  size: number;
  mode: number;
  binary: boolean;
};
