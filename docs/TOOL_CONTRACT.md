# Tool Contract

This document records the provider-visible default boot tool surfaces for VoltUI.

## Default Full Boot Surface

`ask`, `bash`, `bash_output`, `calculate`, `code_index`, `complete_step`, `delete_range`, `delete_symbol`, `edit_file`, `explore`, `forget`, `glob`, `grep`, `history`, `install_skill`, `install_source`, `kill_shell`, `knowledge_search`, `list_sessions`, `ls`, `lsp_definition`, `lsp_diagnostics`, `lsp_hover`, `lsp_references`, `memory`, `move_file`, `multi_edit`, `notebook_edit`, `parallel_tasks`, `read_file`, `read_only_skill`, `read_only_task`, `read_session`, `read_skill`, `remember`, `research`, `review`, `run_skill`, `security_review`, `slash_command`, `task`, `todo_write`, `wait`, `web_fetch`, `write_file`.

## Token Economy Boot Surface

`ask`, `bash`, `bash_output`, `calculate`, `code_index`, `complete_step`, `connect_tool_source`, `edit_file`, `forget`, `glob`, `grep`, `history`, `kill_shell`, `knowledge_search`, `list_sessions`, `ls`, `memory`, `move_file`, `multi_edit`, `read_file`, `read_session`, `remember`, `slash_command`, `todo_write`, `wait`, `write_file`.

`knowledge_search` reads the first-party local SQLite/FTS5/sqlite-vec knowledge base. It returns citable document metadata and snippets for internal review guidance; an empty or uninitialized knowledge base is reported explicitly and must not be treated as policy evidence.

`calculate` is enabled by default in both profiles unless the user supplies an explicit `[tools].enabled` allowlist that excludes it. When available, any answer that depends on a computed numeric result must use it; financial calculations additionally require explicit decimal scale and rounding rules.
