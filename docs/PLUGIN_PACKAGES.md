# VoltUI Plugin Packages

VoltUI plugin packages bundle skills, hooks, and MCP servers behind one
installable unit.

## CLI Mode

Use `voltui plugin` when installing or managing plugin packages from a
terminal. Plugin packages are installed globally under the VoltUI home
directory.

### Install From CLI

`install` accepts one source:

- A GitHub repository, such as `git:github.com/obra/superpowers` or
  `https://github.com/obra/superpowers`.
- A GitHub branch or subdirectory URL, such as
  `https://github.com/owner/repo/tree/main/path/to/plugin`.
- A local directory that contains `voltui-plugin.json` or
  `.codex-plugin/plugin.json`.

Preview the install plan without writing files:

```bash
voltui plugin install git:github.com/obra/superpowers --dry-run
```

Install a plugin after reviewing the plan:

```bash
voltui plugin install git:github.com/obra/superpowers --yes
```

Install with an explicit name or replace an installed plugin with the same name:

```bash
voltui plugin install git:github.com/obra/superpowers --name superpowers --replace --yes
```

Use a local directory in developer mode:

```bash
voltui plugin install /path/to/plugin --link --replace --yes
```

CLI install flags:

- `--dry-run` plans and validates the install without writing files.
- `--yes` is required for any install that writes files.
- `--replace` allows the source to replace an installed plugin with the same
  name.
- `--name <name>` or `--name=<name>` overrides the name from the plugin
  manifest for this install.
- `--link` links a local plugin directory instead of copying it into VoltUI's
  plugin storage. Moving or deleting that directory breaks the linked plugin.

Running `voltui plugin install <source>` without `--dry-run` or `--yes`
refuses to write files and prints a reminder to rerun with one of those flags.
Install and remove commands print the structured JSON response from the same
install-source backend used by the desktop UI.

Installed plugin state is stored in:

```text
~/.voltui/plugin-packages.json
~/.voltui/plugins/<name>/
```

### Manage From CLI

List installed plugins:

```bash
voltui plugin list
```

Show one plugin's metadata, root, source, and exported capability counts:

```bash
voltui plugin show superpowers
```

`show` also prints the concrete capability inventory when available:

- **skills** include suggested `/<skill>` invocations and descriptions.
- **hooks** list lifecycle events, matchers, and commands or context files.
- **mcpServers** list server names, transports, and launch targets.

Check that the manifest and skill roots are readable:

```bash
voltui plugin doctor superpowers
```

Enable or disable a plugin without uninstalling it:

```bash
voltui plugin disable superpowers
voltui plugin enable superpowers
```

Remove a plugin:

```bash
voltui plugin remove superpowers --yes
```

`remove` also accepts `uninstall` as an alias. It requires `--yes` because it
writes state and removes copied plugin content. For linked local plugins, the
external source directory is left in place.

### Use Installed Plugins From CLI

Installed plugins do not open a separate chat surface. When a plugin is enabled,
VoltUI loads its capabilities into normal interactive sessions:

- Run `/plugins` inside an interactive session to list installed plugin
  packages. Run `/plugins show <name>` to inspect a plugin's exported skills,
  hooks, MCP servers, and usage hints without leaving the chat.
- **Skills** appear in `/skills`. Invoke a skill with `/<skill> [args]`, or ask
  naturally and let the agent choose a matching skill by description.
- **Hooks** run automatically at their configured lifecycle events, such as
  `SessionStart`, `UserPromptSubmit`, `PreToolUse`, or `PostToolUse`.
- **MCP servers** join the normal MCP/tool flow. Ask for the task you want done;
  VoltUI can call the plugin's tools when they are relevant.

After installing, enabling, disabling, or updating a plugin from a separate
terminal while a session is already running, start a new `voltui` session or
reopen `/skills` to verify the current session sees the expected skills.

## Desktop Settings

Open **Settings -> Plugins** to install and manage plugin packages without using
the CLI.

### Install Plugins

The installer has two modes:

- **Local folder**: click **Choose plugin folder** and select a plugin directory
  on disk. The selected path is shown next to the button.
- **Git repository**: enter a Git source such as
  `git:github.com/obra/superpowers`. **Install name (optional)** can override
  the plugin manifest name for this install or overwrite.

Use the action buttons after choosing the source and options:

- **Preview** validates the source and shows the planned install actions without
  writing files.
- **Install plugin** installs the selected source using the current options.
- **Refresh plugins** reloads the installed-plugin list from disk and config.

Installer options:

- **Overwrite same-name plugin** allows the current source to replace an
  installed plugin with the same name. Leave it off when duplicate-name installs
  should fail instead of replacing existing content.
- **Developer mode: link source folder** appears for **Local folder** installs.
  It links the selected directory instead of copying it into VoltUI's plugin
  storage. Use it while developing or debugging a plugin. Moving or deleting the
  selected directory will break the linked plugin.

Preview is the safest first step for a new Git source or local plugin directory.

### Manage Installed Plugins

The installed-plugin list shows each plugin package and its exported skills,
hooks, and MCP servers. Use **Refresh plugins** after editing plugin files or
changing config outside the app.

Expand a plugin row to manage it:

- Enable or disable the plugin.
- Read **How to use** for the plugin's exported skills, hooks, and MCP servers.
- **Update** pulls or refreshes an installed plugin when an update source is
  available.
- **Doctor** checks the plugin manifest and reports warnings or diagnostics.
- **Remove plugin** uninstalls the package after confirmation.

### Use Installed Plugins From Desktop

The desktop settings page uses the same runtime model as the CLI:

- Expand an installed plugin to see its **How to use** section.
- In any desktop session, type `/plugins` to list installed plugins, or
  `/plugins show <name>` to see the same usage details from the chat surface.
- Skills are shown with suggested direct commands such as `/plan`; they are also
  discoverable from `/skills` in a session.
- Hooks and MCP servers are listed for transparency. They do not need a manual
  "run" button: enabled hooks trigger automatically, and MCP tools are available
  through ordinary tool use.
- If a currently open session does not reflect a plugin change, refresh the
  plugin list and open a new session.

## Native Manifest

VoltUI plugins can declare `voltui-plugin.json` at the plugin root:

```json
{
  "name": "example",
  "version": "1.0.0",
  "description": "Example plugin",
  "skills": "skills",
  "hooks": {
    "SessionStart": [
      {
        "command": "hooks/session-start",
        "description": "Load startup context"
      }
    ]
  },
  "mcpServers": {
    "helper": {
      "command": "bin/helper"
    }
  }
}
```

Relative paths are resolved inside the plugin root. VoltUI does not run
third-party install scripts during plugin installation.

## Codex & Claude Compatibility

VoltUI also reads Codex plugin manifests at `.codex-plugin/plugin.json` and
Claude plugin manifests at `.claude-plugin/plugin.json`. Claude plugin
capabilities VoltUI does not map yet (`agents/`,
`hooks/hooks.json`, `.mcp.json`) surface as install warnings instead of being
silently dropped. GitHub-hosted multi-plugin marketplaces with a
`.claude-plugin/marketplace.json` can be installed from the repository root
when their plugin entries use relative string sources such as
`./plugins/example` or `plugins/example`; preview shows one action per plugin
before anything is written. Set the optional install name to a marketplace
plugin name to select only that entry. External/object, npm, `strict: false`,
and other advanced marketplace source protocols are not implemented yet:
those entries are skipped with a warning during a full-marketplace install,
and reported as an error when one of them is selected by name. For packages
such as Superpowers and Claude-style skill packs, VoltUI maps:

- `skills` to VoltUI skill roots. A Claude manifest that declares no
  `skills` field falls back to the conventional `skills/` (or `.claude/skills/`)
  directory, matching Claude's own auto-discovery. Plugin skills are displayed
  and invoked canonically as `/<plugin>:<skill>`. An unambiguous `/<skill>` is
  still accepted as a hidden compatibility alias; project and user skills keep
  their short names, while same-name skills from multiple plugins remain
  independently addressable only by their qualified names. This user-facing
  namespace does not change the bare skill identifiers in the model skill index
  or the `run_skill` tool.
- `commands/` (and `.claude/commands/`) to VoltUI custom slash commands: each
  `<name>.md` prompt template is displayed and invoked canonically as
  `/<plugin>:<name>`, with frontmatter `description` / `argument-hint` and
  `$ARGUMENTS` / `$1..$N` substitution honored. An unambiguous `/<name>` remains
  accepted as a hidden compatibility alias, but it is omitted from completion,
  help, desktop menus, ACP command discovery, and the model-visible command
  list. User- and project-authored commands own their short names, and no short
  alias is created when multiple plugins export the same command name. An
  explicit custom command can also occupy the qualified name; desktop plugin
  details report that conflict. Native `voltui-plugin.json` manifests can
  declare the same thing explicitly with a `"commands"` path list.
- `hooks/session-start-codex` to the VoltUI `SessionStart` hook when present.
- A plugin-root `CLAUDE.md` file to a built-in `SessionStart` context hook. The
  file is read directly by VoltUI, without spawning a shell command.
- `.claude/settings.json` command hooks to VoltUI hook events when the event
  names match. Claude's `matcher` field maps to VoltUI `match`; hook commands
  run as shell commands with the plugin root as `cwd`; Claude `timeout` values
  are interpreted as seconds.

Unsupported Claude hook item types are skipped with a warning. VoltUI does not
run third-party install scripts.


Plugin hooks receive these environment variables:

- `VOLTUI_PLUGIN_ROOT`
- `VOLTUI_PLUGIN_NAME`
- `VOLTUI_PLUGIN_VERSION`
- `VOLTUI_HOME`
- `VOLTUI_WORKSPACE_ROOT`

## Desktop Backend Methods

Desktop exposes plugin package operations through Wails methods:

- `Plugins`
- `PlanPluginInstall`
- `InstallPlugin`
- `RemovePlugin`
- `SetPluginEnabled`
- `UpdatePlugin`
- `PluginDoctor`
