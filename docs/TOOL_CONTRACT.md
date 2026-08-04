# Tool Contract

This document records the provider-visible default boot tool surfaces for VoltUI.

| Tool | Read-only | Description |
| --- | --- | --- |
| `bash` | false | Execute a shell command and return stdout and stderr. |
| `bash_output` | true | Read new output and status from a background shell job. |
| `browser_control` | false | Run browser automation actions through the Chrome DevTools Protocol. |
| `browser_navigate` | true | Open a page in a constrained Chromium session and return visible text. |
| `calculate` | true | Evaluate arithmetic deterministically, with explicit financial rounding support. |
| `code_index` | true | Query the lightweight built-in source symbol index. |
| `complete_step` | true | Record one approved plan step as complete with evidence. |
| `delete_range` | false | Delete a file range selected by exact text anchors. |
| `delete_symbol` | false | Delete a named Go symbol using the Go syntax tree. |
| `desktop_keyboard` | false | Send keyboard input to the desktop session. |
| `desktop_mouse` | false | Move, click, drag, or scroll the desktop mouse. |
| `desktop_screenshot` | false | Save a desktop screenshot to a workspace-confined PNG file. |
| `edit_file` | false | Replace one unique exact string in a file. |
| `glob` | true | Find files matching a glob pattern. |
| `grep` | true | Search file content with a regular expression. |
| `kill_shell` | false | Terminate a background shell job. |
| `knowledge_search` | true | Search the local knowledge base for citable document metadata and snippets. |
| `ls` | true | List directory entries, optionally recursively. |
| `move_file` | false | Move or rename a file. |
| `multi_edit` | false | Apply multiple edits to one file atomically. |
| `notebook_edit` | false | Edit one Jupyter notebook cell. |
| `read_file` | true | Read text with line numbers and pagination. |
| `todo_write` | true | Replace the current structured task list. |
| `wait` | true | Wait for a background job and return its final output. |
| `web_fetch` | true | Fetch HTTP or HTTPS text content. |
| `write_file` | false | Write file content and create parent directories when needed. |

## Default Full Boot Surface

`ask`, `bash`, `bash_output`, `browser_control`, `browser_navigate`, `calculate`, `code_index`, `complete_step`, `delete_range`, `delete_symbol`, `desktop_keyboard`, `desktop_mouse`, `desktop_screenshot`, `edit_file`, `explore`, `fleet`, `forget`, `glob`, `grep`, `history`, `install_skill`, `install_source`, `kill_shell`, `knowledge_search`, `list_sessions`, `ls`, `lsp_definition`, `lsp_diagnostics`, `lsp_hover`, `lsp_references`, `memory`, `move_file`, `multi_edit`, `notebook_edit`, `parallel_tasks`, `read_file`, `read_only_skill`, `read_only_task`, `read_session`, `read_skill`, `remember`, `research`, `review`, `run_skill`, `security_review`, `slash_command`, `task`, `todo_write`, `wait`, `web_fetch`, `write_file`.

## Token Economy Boot Surface

`ask`, `bash`, `bash_output`, `calculate`, `connect_tool_source`, `edit_file`, `kill_shell`, `read_file`, `wait`, `write_file`.

`knowledge_search` reads the first-party local SQLite/FTS5/sqlite-vec knowledge base. It returns citable document metadata and snippets for internal review guidance; an empty or uninitialized knowledge base is reported explicitly and must not be treated as policy evidence.

`calculate` is enabled by default in both profiles unless the user supplies an explicit `[tools].enabled` allowlist that excludes it. When available, any answer that depends on a computed numeric result must use it; financial calculations additionally require explicit decimal scale and rounding rules.

`browser_control` and the `desktop_*` tools control host applications and are writer-classified even when an individual action only observes state. `browser_navigate` remains read-only but is still subject to browser/network confinement and platform availability.
