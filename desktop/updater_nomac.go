//go:build !darwin

package main

import "errors"

func applyMac(_ string) error {
	return errors.New("macOS automatic update is not supported on this platform")
}
