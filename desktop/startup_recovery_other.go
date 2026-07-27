//go:build !darwin

package main

import "voltui/internal/repair"

func preparePackagedStartupRecovery(_ *repair.StartupTracker, recommended, explicitSafeMode bool) (bool, bool) {
	return explicitSafeMode || recommended, true
}
