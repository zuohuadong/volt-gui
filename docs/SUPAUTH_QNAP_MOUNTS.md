# Supauth and QNAP Mount Integration

This document defines the Anyong product integration for employee file-share access through Supauth and QNAP. Generic desktop mount lifecycle should remain in upstream Volt GUI; this document only covers the downstream policy and product behavior.

## Product Goal

Employees use Supauth as the daily identity entry point. Administrators may use either Supauth-backed workflows or QNAP local administrator accounts for NAS operations. Anyong connects these systems by applying Supauth policy to Windows SMB mount automation while QNAP continues to enforce file permissions.

## Architecture

```text
Employee Windows session
  -> Anyong desktop OIDC login
  -> Supauth mount policy API
  -> Anyong mount manager
  -> Windows SMB mapping
  -> QNAP shared folders

QNAP administrators
  -> QNAP local admin account or Supauth admin console
```

Supauth decides which shares Anyong should show and attempt to mount. QNAP decides whether the SMB account can actually read or write the target folder.

## Account Model

- Employees authenticate to Anyong with Supauth OIDC.
- Employee SMB permissions should come from QNAP local users, LDAP, AD, or Samba AD.
- QNAP local administrator accounts remain available for break-glass NAS administration.
- Supauth administrator access is used for mount policy, device, and audit operations.
- Supauth tokens must not be converted into SMB passwords.

## Recommended Deployment

The preferred production deployment is:

1. Connect QNAP to LDAP, AD, or Samba AD for employee SMB identities.
2. Configure Supauth to understand the same user and group model.
3. Add a Supauth mount policy API for Anyong.
4. Use Anyong to fetch policies and drive Windows SMB mappings.
5. Keep QNAP local admin accounts for NAS-only administration.

Small-team deployments may start with saved Windows credentials, but that should be treated as an MVP mode rather than the long-term enterprise model.

## Supauth Policy API

Anyong should request mount policies for the current user after OIDC login.

```http
GET /api/me/mount-policies
Authorization: Bearer <access_token>
```

Example response:

```json
{
  "policies": [
    {
      "id": "qnap-engineering",
      "kind": "smb",
      "displayName": "工程共享",
      "remotePath": "\\\\qnap.internal\\engineering",
      "localPath": "Z:",
      "autoMount": true,
      "requiresVpn": true,
      "allowedGroups": ["engineering"]
    }
  ]
}
```

The API should return only policies the user is allowed to see. QNAP SMB permissions remain the final enforcement layer.

## Anyong Desktop Behavior

Anyong should add an enterprise resources surface that:

- starts from the existing Supauth/OIDC login session
- fetches mount policies after login and on refresh
- checks VPN or office network reachability before mounting
- mounts Windows SMB shares through the upstream mount manager
- shows per-share status, last error, and retry actions
- reports audit events to Supauth without secrets

The mount feature should continue to work from the tray/background without an active chat session.

## Audit Events

Anyong should emit product-level events to Supauth:

- policy fetched
- mount attempted
- mount succeeded
- mount failed with sanitized error category
- unmount requested
- credential required
- network unavailable

Events must not include access tokens, refresh tokens, SMB passwords, or QNAP administrator credentials.

## Security Requirements

- Do not expose QNAP SMB port `445` directly to the public internet.
- Require VPN, Tailscale, WireGuard, or office LAN reachability for remote SMB access.
- Do not mount employee shares with a shared NAS administrator account.
- Do not rely on Supauth UI policy alone to protect a reachable SMB path.
- Store optional SMB credentials only in Windows-protected credential storage.
- Keep QNAP local admin accounts separate from routine employee file access.

## Rollout Plan

1. Land upstream Volt GUI mount manager and Windows SMB adapter.
2. Add Anyong Supauth mount policy client.
3. Add QNAP SMB profile defaults and Chinese UI labels.
4. Enable MVP mode for manually supplied Windows credentials.
5. Move production deployments to LDAP, AD, or Samba AD backed SMB identities.
6. Add Supauth audit dashboards after mount status events are stable.

## Acceptance Criteria

- Employees can sign in through Supauth and see only their assigned QNAP shares.
- Anyong can automatically mount assigned Windows SMB shares when the network is reachable.
- QNAP still enforces read and write access at the SMB layer.
- Administrators can keep using QNAP local accounts for NAS administration.
- Supauth receives sanitized mount status and audit events.
