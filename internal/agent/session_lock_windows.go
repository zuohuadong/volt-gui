//go:build windows

package agent

import (
	"errors"
	"os"
	"unsafe"

	"golang.org/x/sys/windows"
)

func lockSessionFile(path string) (func(), error) {
	f, err := os.OpenFile(path+".lock", os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	handle := windows.Handle(f.Fd())
	var overlapped windows.Overlapped
	if err := windows.LockFileEx(handle, windows.LOCKFILE_EXCLUSIVE_LOCK, 0, 1, 0, &overlapped); err != nil {
		_ = f.Close()
		return nil, err
	}
	return func() {
		_ = windows.UnlockFileEx(handle, 0, 1, 0, &overlapped)
		_ = f.Close()
	}, nil
}

// sessionLockFile is a non-blocking exclusive lock on a lock file itself,
// used by cleanup paths that may need to delete the file they locked.
type sessionLockFile struct {
	f          *os.File
	overlapped windows.Overlapped
}

// tryTakeSessionLockFile opens lockPath and takes its exclusive LockFileEx
// region without blocking. A live holder surfaces as errSessionFileLockHeld.
func tryTakeSessionLockFile(lockPath string) (*sessionLockFile, error) {
	f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	l := &sessionLockFile{f: f}
	flags := uint32(windows.LOCKFILE_EXCLUSIVE_LOCK | windows.LOCKFILE_FAIL_IMMEDIATELY)
	if err := windows.LockFileEx(windows.Handle(f.Fd()), flags, 0, 1, 0, &l.overlapped); err != nil {
		_ = f.Close()
		if errors.Is(err, windows.ERROR_LOCK_VIOLATION) {
			return nil, errSessionFileLockHeld
		}
		return nil, err
	}
	return l, nil
}

func (l *sessionLockFile) Unlock() {
	handle := windows.Handle(l.f.Fd())
	_ = windows.UnlockFileEx(handle, 0, 1, 0, &l.overlapped)
	_ = l.f.Close()
}

// RemoveAndUnlock deletes the lock file atomically with the release. Windows
// refuses a path-based delete of a file this process still holds open — the
// deleter's implicit open collides with our handle's granted access — so the
// removal is expressed on the held handle instead: mark the delete
// disposition, then unlock and close. The name dies with the handle, leaving
// no window where another process could adopt a lock file that is already
// doomed.
func (l *sessionLockFile) RemoveAndUnlock() error {
	handle := windows.Handle(l.f.Fd())
	// FILE_DISPOSITION_INFO with its BOOLEAN widened to a full word.
	info := struct{ DeleteFile uint32 }{DeleteFile: 1}
	dispErr := windows.SetFileInformationByHandle(handle, windows.FileDispositionInfo,
		(*byte)(unsafe.Pointer(&info)), uint32(unsafe.Sizeof(info)))
	l.Unlock()
	if dispErr != nil {
		// Delete disposition unsupported (exotic filesystem): fall back to a
		// path-based remove after the release. A short adoption window beats
		// leaving the sidecar behind forever.
		if err := os.Remove(l.f.Name()); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}

func tryLockSessionLeaseFile(path string) (func(), error) {
	f, err := os.OpenFile(path+".lease.lock", os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	handle := windows.Handle(f.Fd())
	var overlapped windows.Overlapped
	flags := uint32(windows.LOCKFILE_EXCLUSIVE_LOCK | windows.LOCKFILE_FAIL_IMMEDIATELY)
	if err := windows.LockFileEx(handle, flags, 0, 1, 0, &overlapped); err != nil {
		_ = f.Close()
		if errors.Is(err, windows.ERROR_LOCK_VIOLATION) {
			return nil, ErrSessionLeaseHeld
		}
		return nil, err
	}
	return func() {
		_ = windows.UnlockFileEx(handle, 0, 1, 0, &overlapped)
		_ = f.Close()
	}, nil
}
