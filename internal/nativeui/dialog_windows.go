//go:build windows

package nativeui

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

const messageBoxIconError = 0x00000010

var messageBoxW = windows.NewLazySystemDLL("user32.dll").NewProc("MessageBoxW")

func ShowError(title, message string) {
	titleUTF16, titleErr := windows.UTF16PtrFromString(title)
	messageUTF16, messageErr := windows.UTF16PtrFromString(message)
	if titleErr != nil || messageErr != nil {
		return
	}
	messageBoxW.Call(
		0,
		uintptr(unsafe.Pointer(messageUTF16)),
		uintptr(unsafe.Pointer(titleUTF16)),
		messageBoxIconError,
	)
}
