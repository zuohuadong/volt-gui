---
name: security-review
description: Review applications, APIs, configurations, dependencies, and workflows for security risks. Use for threat modeling, auth, secrets, injection, SSRF, file upload, supply chain, and permission design.
---

# Security Review

## Purpose

Identify realistic security risks and recommend fixes that fit the system.

## Workflow

1. Identify assets, trust boundaries, actors, and exposed interfaces.
2. Review authentication, authorization, input handling, file handling, and outbound network access.
3. Check secrets, logs, dependency risks, and deployment configuration.
4. Separate exploitable findings from theoretical concerns.
5. Provide severity, evidence, impact, and remediation.

## Output

Return:

- Findings ordered by severity.
- Affected component.
- Attack scenario.
- Recommended fix.
- Verification method.

## Boundaries

Do not provide exploit code for unauthorized systems. Keep testing within approved scope.
