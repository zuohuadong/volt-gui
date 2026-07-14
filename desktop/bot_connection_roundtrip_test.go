package main

import (
	"reflect"
	"testing"

	"voltui/internal/config"
)

func TestBotSettingsViewRoundTripPreservesConnectionSecurityAndRemoteIdentity(t *testing.T) {
	want := config.BotConnectionConfig{
		ID:               "feishu-primary",
		Provider:         "feishu",
		Domain:           "lark",
		Label:            "Primary",
		Enabled:          true,
		Status:           "connected",
		Model:            "provider/model",
		ToolApprovalMode: "yolo",
		WorkspaceRoot:    "/workspace",
		Access: config.BotAccessConfig{
			Enabled:                true,
			AllowAll:               false,
			PairingEnabled:         true,
			Users:                  []string{"user-1"},
			Groups:                 []string{"group-1"},
			Approvers:              []string{"approver-1"},
			Admins:                 []string{"admin-1"},
			WorkspaceRoots:         []string{"/workspace"},
			ProjectIDs:             []string{"project-1"},
			AgentProfileIDs:        []string{"reviewer"},
			PermissionCeiling:      "ask",
			RequireHighRiskConfirm: true,
		},
		SessionMappings: []config.BotConnectionSessionMapping{{
			RemoteID:               "remote-1",
			SessionID:              "session-1",
			SessionSource:          "manual",
			ChatType:               "group",
			UserID:                 "user-1",
			ThreadID:               "thread-1",
			ProjectID:              "project-1",
			AgentProfileID:         "reviewer",
			PermissionCeiling:      "read",
			RequireHighRiskConfirm: true,
			Scope:                  "project",
			WorkspaceRoot:          "/workspace",
			UpdatedAt:              "2026-07-13T00:00:00Z",
		}},
	}

	settings := botSettingsView(config.BotConfig{Connections: []config.BotConnectionConfig{want}})
	connections := botConnectionConfigs(settings.Connections)
	if len(connections) != 1 {
		t.Fatalf("connections = %+v, want one settings round-trip connection", connections)
	}
	got := connections[0]

	if got.ToolApprovalMode != want.ToolApprovalMode {
		t.Fatalf("tool approval mode = %q, want %q", got.ToolApprovalMode, want.ToolApprovalMode)
	}
	if !reflect.DeepEqual(got.Access, want.Access) {
		t.Fatalf("access = %+v, want %+v", got.Access, want.Access)
	}
	if len(got.SessionMappings) != 1 {
		t.Fatalf("session mappings = %+v, want one mapping", got.SessionMappings)
	}
	mapping := got.SessionMappings[0]
	if mapping.SessionSource != "manual" || mapping.ChatType != "group" || mapping.UserID != "user-1" || mapping.ThreadID != "thread-1" || mapping.ProjectID != "project-1" || mapping.AgentProfileID != "reviewer" || mapping.PermissionCeiling != "read" || !mapping.RequireHighRiskConfirm {
		t.Fatalf("remote identity fields were not preserved: %+v", mapping)
	}
}

func TestBotSettingsViewRoundTripPreservesEmptyConnectionApprovalModeAsInheritance(t *testing.T) {
	want := config.BotConnectionConfig{
		ID:               "feishu-inherit",
		Provider:         "feishu",
		Domain:           "feishu",
		Enabled:          true,
		ToolApprovalMode: "",
	}

	settings := botSettingsView(config.BotConfig{ToolApprovalMode: "auto", Connections: []config.BotConnectionConfig{want}})
	if len(settings.Connections) != 1 || settings.Connections[0].ToolApprovalMode != "" {
		t.Fatalf("settings connection mode = %+v, want empty override to inherit global mode", settings.Connections)
	}
	connections := botConnectionConfigs(settings.Connections)
	if len(connections) != 1 || connections[0].ToolApprovalMode != "" {
		t.Fatalf("round-trip connection mode = %+v, want empty override preserved", connections)
	}
}
