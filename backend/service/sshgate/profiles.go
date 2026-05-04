package sshgate

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// TunnelProfilesConfig is the root object for persisted tunnel profiles.
type TunnelProfilesConfig struct {
	Profiles []TunnelProfile `json:"profiles"`
}

// TunnelProfile groups saved tunnel IDs for one-click startup.
type TunnelProfile struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	TunnelIDs []string `json:"tunnelIds"`
	CreatedAt string   `json:"createdAt"`
	UpdatedAt string   `json:"updatedAt"`
}

// TunnelProfileStartResult records the startup outcome for one saved tunnel.
type TunnelProfileStartResult struct {
	TunnelID       string `json:"tunnelId"`
	TunnelName     string `json:"tunnelName"`
	RuntimeID      string `json:"runtimeId,omitempty"`
	Status         string `json:"status"`
	Error          string `json:"error,omitempty"`
	AlreadyRunning bool   `json:"alreadyRunning"`
	Missing        bool   `json:"missing"`
}

func (s *Service) profilesPath() (string, error) {
	if s.profilesConfigPath != "" {
		return s.profilesConfigPath, nil
	}

	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("failed to get user config directory: %w", err)
	}
	appConfigDir := filepath.Join(configDir, "DevTools")
	if err := os.MkdirAll(appConfigDir, 0o755); err != nil {
		return "", fmt.Errorf("failed to create app config directory: %w", err)
	}
	s.profilesConfigPath = filepath.Join(appConfigDir, "profiles.json")
	return s.profilesConfigPath, nil
}

func (s *Service) loadProfilesConfig() error {
	s.profileMu.Lock()
	defer s.profileMu.Unlock()

	path, err := s.profilesPath()
	if err != nil {
		return err
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			s.profilesConfig = &TunnelProfilesConfig{Profiles: []TunnelProfile{}}
			return nil
		}
		return fmt.Errorf("failed to read profiles config file: %w", err)
	}

	var config TunnelProfilesConfig
	if err := json.Unmarshal(data, &config); err != nil {
		backupPath := fmt.Sprintf("%s.invalid.%d", path, time.Now().Unix())
		if renameErr := os.Rename(path, backupPath); renameErr != nil {
			log.Printf("Warning: failed to back up invalid profiles config: %v", renameErr)
		}
		s.profilesConfig = &TunnelProfilesConfig{Profiles: []TunnelProfile{}}
		return nil
	}
	if config.Profiles == nil {
		config.Profiles = []TunnelProfile{}
	}
	s.profilesConfig = &config
	return nil
}

func (s *Service) saveProfilesConfigLocked() error {
	path, err := s.profilesPath()
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(s.profilesConfig, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal profiles config: %w", err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("failed to write profiles config file: %w", err)
	}

	if s.ctx != nil {
		runtime.EventsEmit(s.ctx, "tunnel_profiles_changed")
	}
	return nil
}

// GetTunnelProfiles returns all saved tunnel profiles.
func (s *Service) GetTunnelProfiles() ([]TunnelProfile, error) {
	s.profileMu.RLock()
	defer s.profileMu.RUnlock()

	profiles := make([]TunnelProfile, len(s.profilesConfig.Profiles))
	copy(profiles, s.profilesConfig.Profiles)
	return profiles, nil
}

// SaveTunnelProfile creates or updates a tunnel profile.
func (s *Service) SaveTunnelProfile(profile TunnelProfile) (*TunnelProfile, error) {
	s.profileMu.Lock()
	defer s.profileMu.Unlock()

	profile.Name = strings.TrimSpace(profile.Name)
	if profile.Name == "" {
		return nil, fmt.Errorf("profile name is required")
	}

	now := time.Now().UTC().Format(time.RFC3339)
	existingIndex := -1
	for i := range s.profilesConfig.Profiles {
		if s.profilesConfig.Profiles[i].ID == profile.ID {
			existingIndex = i
			break
		}
	}

	if profile.ID == "" {
		profile.ID = uuid.NewString()
		profile.CreatedAt = now
	} else if existingIndex >= 0 {
		profile.CreatedAt = s.profilesConfig.Profiles[existingIndex].CreatedAt
	}
	if profile.CreatedAt == "" {
		profile.CreatedAt = now
	}
	profile.UpdatedAt = now
	profile.TunnelIDs = s.filterExistingTunnelIDs(profile.TunnelIDs)

	if existingIndex >= 0 {
		s.profilesConfig.Profiles[existingIndex] = profile
	} else {
		s.profilesConfig.Profiles = append([]TunnelProfile{profile}, s.profilesConfig.Profiles...)
	}

	if err := s.saveProfilesConfigLocked(); err != nil {
		return nil, err
	}
	saved := profile
	return &saved, nil
}

// DeleteTunnelProfile deletes a tunnel profile by ID.
func (s *Service) DeleteTunnelProfile(id string) error {
	s.profileMu.Lock()
	defer s.profileMu.Unlock()

	for i, profile := range s.profilesConfig.Profiles {
		if profile.ID == id {
			s.profilesConfig.Profiles = append(s.profilesConfig.Profiles[:i], s.profilesConfig.Profiles[i+1:]...)
			return s.saveProfilesConfigLocked()
		}
	}
	return fmt.Errorf("tunnel profile with ID %s not found", id)
}

// StartTunnelProfile starts all saved tunnels referenced by the profile.
func (s *Service) StartTunnelProfile(profileID string, password string) ([]TunnelProfileStartResult, error) {
	profile, err := s.findTunnelProfile(profileID)
	if err != nil {
		return nil, err
	}

	results := make([]TunnelProfileStartResult, 0, len(profile.TunnelIDs))
	for _, tunnelID := range profile.TunnelIDs {
		tunnelName, exists := s.savedTunnelName(tunnelID)
		result := TunnelProfileStartResult{
			TunnelID:   tunnelID,
			TunnelName: tunnelName,
		}
		if !exists {
			result.Status = "missing"
			result.Missing = true
			results = append(results, result)
			continue
		}
		if activeID, ok := s.activeRuntimeIDForConfig(tunnelID); ok {
			result.Status = "running"
			result.RuntimeID = activeID
			result.AlreadyRunning = true
			results = append(results, result)
			continue
		}

		runtimeID, startErr := s.StartTunnelFromConfig(tunnelID, password)
		if startErr != nil {
			result.Status = "failed"
			result.Error = startErr.Error()
		} else {
			result.Status = "started"
			result.RuntimeID = runtimeID
		}
		results = append(results, result)
	}
	return results, nil
}

func (s *Service) findTunnelProfile(profileID string) (TunnelProfile, error) {
	s.profileMu.RLock()
	defer s.profileMu.RUnlock()

	for _, profile := range s.profilesConfig.Profiles {
		if profile.ID == profileID {
			return profile, nil
		}
	}
	return TunnelProfile{}, fmt.Errorf("tunnel profile with ID %s not found", profileID)
}

func (s *Service) filterExistingTunnelIDs(ids []string) []string {
	existing := s.existingTunnelIDSet()
	filtered := make([]string, 0, len(ids))
	seen := make(map[string]bool, len(ids))
	for _, id := range ids {
		if existing[id] && !seen[id] {
			filtered = append(filtered, id)
			seen[id] = true
		}
	}
	return filtered
}

func (s *Service) existingTunnelIDSet() map[string]bool {
	s.configMu.RLock()
	defer s.configMu.RUnlock()

	existing := make(map[string]bool, len(s.tunnelsConfig.Tunnels))
	for _, tunnel := range s.tunnelsConfig.Tunnels {
		existing[tunnel.ID] = true
	}
	return existing
}

func (s *Service) savedTunnelName(id string) (string, bool) {
	s.configMu.RLock()
	defer s.configMu.RUnlock()

	for _, tunnel := range s.tunnelsConfig.Tunnels {
		if tunnel.ID == id {
			return tunnel.Name, true
		}
	}
	return "", false
}

func (s *Service) activeRuntimeIDForConfig(configID string) (string, bool) {
	for _, tunnel := range s.GetActiveTunnels() {
		if tunnel.ConfigID == configID && tunnel.Status == "active" {
			return tunnel.ID, true
		}
	}
	return "", false
}

func (s *Service) removeTunnelFromProfiles(tunnelID string) error {
	s.profileMu.Lock()
	defer s.profileMu.Unlock()

	changed := false
	for profileIndex := range s.profilesConfig.Profiles {
		tunnelIDs := s.profilesConfig.Profiles[profileIndex].TunnelIDs
		filtered := tunnelIDs[:0]
		for _, id := range tunnelIDs {
			if id == tunnelID {
				changed = true
				continue
			}
			filtered = append(filtered, id)
		}
		s.profilesConfig.Profiles[profileIndex].TunnelIDs = filtered
		if changed {
			s.profilesConfig.Profiles[profileIndex].UpdatedAt = time.Now().UTC().Format(time.RFC3339)
		}
	}
	if !changed {
		return nil
	}
	return s.saveProfilesConfigLocked()
}
