package sshgate

import (
	"fmt"

	"devtools/backend/internal/sshtunnel"
)

// TunnelDetail combines saved configuration, runtime health, and tunnel logs.
type TunnelDetail struct {
	Config  sshtunnel.SavedTunnelConfig   `json:"config"`
	Runtime sshtunnel.TunnelRuntimeDetail `json:"runtime"`
}

// GetTunnelDetail returns the detail view model for one saved tunnel.
func (s *Service) GetTunnelDetail(configID string) (*TunnelDetail, error) {
	s.configMu.RLock()
	var config *sshtunnel.SavedTunnelConfig
	for i := range s.tunnelsConfig.Tunnels {
		if s.tunnelsConfig.Tunnels[i].ID == configID {
			copied := s.tunnelsConfig.Tunnels[i]
			if copied.ManualHost != nil {
				manualHost := *copied.ManualHost
				copied.ManualHost = &manualHost
			}
			config = &copied
			break
		}
	}
	s.configMu.RUnlock()

	if config == nil {
		return nil, fmt.Errorf("tunnel configuration with ID %s not found", configID)
	}

	return &TunnelDetail{
		Config:  *config,
		Runtime: s.tunnelManager.GetTunnelRuntimeDetail(configID),
	}, nil
}
