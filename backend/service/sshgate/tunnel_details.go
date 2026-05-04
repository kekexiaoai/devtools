package sshgate

import (
	"fmt"
	"sort"

	"devtools/backend/internal/sshtunnel"
)

const defaultTunnelEventFeedLimit = 50
const maxTunnelEventFeedLimit = 200

// TunnelDetail combines saved configuration, runtime health, and tunnel logs.
type TunnelDetail struct {
	Config  sshtunnel.SavedTunnelConfig   `json:"config"`
	Runtime sshtunnel.TunnelRuntimeDetail `json:"runtime"`
}

// TunnelEventFeedItem is one entry in the cross-tunnel event feed.
type TunnelEventFeedItem struct {
	ConfigID   string `json:"configId"`
	TunnelName string `json:"tunnelName"`
	Sequence   int64  `json:"sequence"`
	Timestamp  string `json:"timestamp"`
	Level      string `json:"level"`
	Message    string `json:"message"`
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

// GetTunnelEventFeed returns recent tunnel log entries across all saved tunnels.
func (s *Service) GetTunnelEventFeed(limit int) []TunnelEventFeedItem {
	if limit <= 0 {
		limit = defaultTunnelEventFeedLimit
	}
	if limit > maxTunnelEventFeedLimit {
		limit = maxTunnelEventFeedLimit
	}

	s.configMu.RLock()
	configs := make([]sshtunnel.SavedTunnelConfig, len(s.tunnelsConfig.Tunnels))
	copy(configs, s.tunnelsConfig.Tunnels)
	s.configMu.RUnlock()

	events := make([]TunnelEventFeedItem, 0)
	for _, config := range configs {
		for _, entry := range s.tunnelManager.GetTunnelLogs(config.ID) {
			events = append(events, TunnelEventFeedItem{
				ConfigID:   config.ID,
				TunnelName: config.Name,
				Sequence:   entry.Sequence,
				Timestamp:  entry.Timestamp,
				Level:      entry.Level,
				Message:    entry.Message,
			})
		}
	}

	sort.SliceStable(events, func(i, j int) bool {
		return events[i].Sequence > events[j].Sequence
	})

	if len(events) > limit {
		return events[:limit]
	}
	return events
}
