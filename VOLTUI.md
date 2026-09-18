# VoltUI Product Contract

VoltUI is the branded Electron shell around the official DeepSeek Harness web profile.

The shell owns window lifecycle, navigation allowlisting, workspace selection input, profile patch selection and package identity. DSH owns the agent loop, sessions, tools, MCP, permissions, credentials and persistence. Product features must map to one of those owners; a new parallel state store or engine needs an explicit architecture decision.

The supported developer workflow is Node 26 + pnpm 12. The supported desktop verification target is Windows x64. The repository does not synchronize from a former upstream or publish a legacy native CLI channel.
