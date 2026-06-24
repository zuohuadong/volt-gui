# Enterprise Mounts Design

Enterprise mounts are a proposed desktop capability for mapping company file shares from the Workbench without binding the platform to one identity provider, NAS vendor, or business policy service.

## Scope

- Provide a generic mount manager for the desktop app.
- Support Windows SMB as the first concrete mount target.
- Keep identity-provider-specific policy clients outside the platform layer.
- Expose mount status to the Workbench and tray without requiring chat interaction.

## Non-Goals

- Do not make Volt GUI an SMB authentication provider.
- Do not translate OAuth/OIDC access tokens into SMB passwords.
- Do not store NAS administrator credentials for end-user file access.
- Do not add vendor-specific policy defaults such as QNAP or Supauth rules to the platform layer.
- Do not expose SMB shares directly over the public internet.

## Platform Boundary

The platform owns local desktop mechanics:

- mount lifecycle: discover, mount, verify, unmount, reconnect
- local state: mounted, pending, offline, failed, requires credentials
- Windows integration: SMB mapping, drive letters, Credential Manager, network reachability
- UI surface: enterprise resources page, tray status, retry actions, error details
- audit hooks: local events that product integrations can forward to their own service

Product forks own business policy:

- identity provider and OIDC client configuration
- user and group to share-policy mapping
- NAS inventory, default shares, and drive-letter choices
- organization-specific audit fields and retention
- rollout rules for VPN, office network, or device enrollment

## Proposed Interfaces

The platform should treat mount policies as plain data returned by a product-specific provider.

```json
{
  "id": "engineering-qnap",
  "kind": "smb",
  "displayName": "Engineering Share",
  "remotePath": "\\\\nas.internal\\engineering",
  "localPath": "Z:",
  "autoMount": true,
  "readOnlyHint": false,
  "requiresVpn": true
}
```

The provider adapter resolves identity and authorization. The mount manager only evaluates local preconditions and executes the platform operation.

## Windows SMB Behavior

The Windows implementation should prefer native OS behavior:

- use Kerberos or NTLM credentials already available to Windows when possible
- call PowerShell `New-SmbMapping` or equivalent Windows APIs for mapping
- use Windows Credential Manager only for user-approved stored credentials
- avoid mounting with a shared administrator account
- keep reconnect behavior idempotent across network changes and app restarts

The first implementation can live behind Windows build tags and return unsupported status on macOS and Linux until additional providers exist.

## Workbench UX

The Workbench should expose mounts as an operational surface, not as a chat command:

- list configured enterprise resources
- show mount status, remote path, drive letter, and last error
- provide mount, unmount, retry, and open-in-file-explorer actions
- show when VPN or office network reachability is missing
- report non-secret diagnostics for support

The AI assistant may help explain failures, but the mount manager should continue running without an active chat session.

## Security Model

Mount policy is not an authorization boundary by itself. The NAS or file server must still enforce read/write access with SMB permissions.

Required safeguards:

- never persist OIDC access tokens in logs
- never persist SMB passwords outside OS-protected credential storage
- never use product policy as the only protection for a reachable SMB path
- keep administrator accounts for break-glass NAS administration, not routine employee mounts
- log mount events without secrets or raw tokens

## Rollout Plan

1. Add a platform mount manager with a no-op provider and Windows SMB adapter.
2. Add Workbench and tray status surfaces for mount state.
3. Let product forks register policy providers.
4. Add product-specific Supauth and NAS integrations in downstream forks.
5. Expand provider kinds only after SMB behavior is stable.

## Acceptance Criteria

- A product fork can supply mount policies without patching core lifecycle code.
- Windows users can mount and unmount SMB shares through the desktop app.
- Unsupported platforms degrade cleanly with a visible unsupported reason.
- The platform does not contain Supauth, QNAP, or company-specific policy assumptions.
- SMB access remains enforced by the file server or NAS.
