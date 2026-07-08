//go:build darwin

package main

/*
#include <stdint.h>
#include <dispatch/dispatch.h>

extern void voltuiDesktopMainHeartbeat(void);

static dispatch_source_t voltui_main_heartbeat_timer;

static void voltui_main_heartbeat_handler(void *ctx) {
	voltuiDesktopMainHeartbeat();
}

static void voltui_start_main_heartbeat(uint64_t interval_ms) {
	if (voltui_main_heartbeat_timer != NULL) {
		return;
	}
	voltui_main_heartbeat_timer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, dispatch_get_main_queue());
	dispatch_set_context(voltui_main_heartbeat_timer, NULL);
	dispatch_source_set_event_handler_f(voltui_main_heartbeat_timer, voltui_main_heartbeat_handler);
	dispatch_source_set_timer(voltui_main_heartbeat_timer, dispatch_time(DISPATCH_TIME_NOW, 0), interval_ms * NSEC_PER_MSEC, 100 * NSEC_PER_MSEC);
	dispatch_resume(voltui_main_heartbeat_timer);
}

static void voltui_stop_main_heartbeat(void) {
	if (voltui_main_heartbeat_timer == NULL) {
		return;
	}
	dispatch_source_cancel(voltui_main_heartbeat_timer);
	voltui_main_heartbeat_timer = NULL;
}
*/
import "C"

import "time"

func mainThreadWatchdogSupported() bool {
	return true
}

func startNativeMainThreadHeartbeat(intervalMS uint64) {
	C.voltui_start_main_heartbeat(C.uint64_t(intervalMS))
}

func stopNativeMainThreadHeartbeat() {
	C.voltui_stop_main_heartbeat()
}

//export voltuiDesktopMainHeartbeat
func voltuiDesktopMainHeartbeat() {
	recordMainThreadHeartbeat(time.Now())
}
