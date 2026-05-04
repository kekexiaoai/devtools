package sshgate

import (
	"path/filepath"
	"testing"

	"devtools/backend/internal/sshtunnel"
)

func newProfileTestService(t *testing.T) *Service {
	t.Helper()

	service := NewService(nil)
	service.tunnelsConfigPath = filepath.Join(t.TempDir(), "tunnels.json")
	service.tunnelsConfig = &TunnelsConfig{
		Tunnels: []sshtunnel.SavedTunnelConfig{
			{ID: "tunnel-1", Name: "Database"},
			{ID: "tunnel-2", Name: "Redis"},
		},
	}
	service.profilesConfigPath = filepath.Join(t.TempDir(), "profiles.json")
	service.profilesConfig = &TunnelProfilesConfig{Profiles: []TunnelProfile{}}
	return service
}

func TestSaveTunnelProfilePersistsOnlyExistingTunnelIDs(t *testing.T) {
	service := newProfileTestService(t)

	profile, err := service.SaveTunnelProfile(TunnelProfile{
		Name:      "Backend",
		TunnelIDs: []string{"tunnel-1", "missing", "tunnel-2"},
	})
	if err != nil {
		t.Fatalf("SaveTunnelProfile returned error: %v", err)
	}

	if profile.ID == "" {
		t.Fatal("SaveTunnelProfile should assign an ID")
	}
	if len(profile.TunnelIDs) != 2 {
		t.Fatalf("expected missing tunnel IDs to be removed, got %v", profile.TunnelIDs)
	}
	if profile.TunnelIDs[0] != "tunnel-1" || profile.TunnelIDs[1] != "tunnel-2" {
		t.Fatalf("unexpected tunnel IDs: %v", profile.TunnelIDs)
	}
	if profile.CreatedAt == "" || profile.UpdatedAt == "" {
		t.Fatalf("expected timestamps to be set: %#v", profile)
	}

	loaded, err := service.GetTunnelProfiles()
	if err != nil {
		t.Fatalf("GetTunnelProfiles returned error: %v", err)
	}
	if len(loaded) != 1 || loaded[0].Name != "Backend" {
		t.Fatalf("expected persisted profile, got %#v", loaded)
	}
}

func TestDeleteTunnelConfigRemovesTunnelFromProfiles(t *testing.T) {
	service := newProfileTestService(t)
	service.profilesConfig.Profiles = []TunnelProfile{
		{ID: "profile-1", Name: "Backend", TunnelIDs: []string{"tunnel-1", "tunnel-2"}},
	}

	if err := service.DeleteTunnelConfig("tunnel-1"); err != nil {
		t.Fatalf("DeleteTunnelConfig returned error: %v", err)
	}

	profiles, err := service.GetTunnelProfiles()
	if err != nil {
		t.Fatalf("GetTunnelProfiles returned error: %v", err)
	}
	if len(profiles) != 1 {
		t.Fatalf("expected one profile, got %d", len(profiles))
	}
	if len(profiles[0].TunnelIDs) != 1 || profiles[0].TunnelIDs[0] != "tunnel-2" {
		t.Fatalf("expected deleted tunnel ID to be removed, got %v", profiles[0].TunnelIDs)
	}
}

func TestStopTunnelProfileReportsMissingAndNotRunningTunnels(t *testing.T) {
	service := newProfileTestService(t)
	service.profilesConfig.Profiles = []TunnelProfile{
		{ID: "profile-1", Name: "Backend", TunnelIDs: []string{"tunnel-1", "missing"}},
	}

	results, err := service.StopTunnelProfile("profile-1")
	if err != nil {
		t.Fatalf("StopTunnelProfile returned error: %v", err)
	}

	if len(results) != 2 {
		t.Fatalf("expected two stop results, got %d", len(results))
	}
	if results[0].Status != "not_running" || !results[0].NotRunning {
		t.Fatalf("expected first tunnel to be not_running, got %#v", results[0])
	}
	if results[1].Status != "missing" || !results[1].Missing {
		t.Fatalf("expected second tunnel to be missing, got %#v", results[1])
	}
}
