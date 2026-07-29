package control

import (
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"voltui/internal/skill"
	"voltui/internal/tool"
)

func TestCapabilityRouteAutoEnablesBuiltinSkillOnlyOnce(t *testing.T) {
	store := skill.New(skill.Options{HomeDir: t.TempDir()})
	reg := tool.NewRegistry()
	calls := 0
	ctrl := New(Options{
		Registry:   reg,
		Skills:     store.List(),
		SkillStore: store,
		AutoEnableBuiltinSkills: func() bool {
			calls++
			reg.Add(skill.NewRunSkillTool(store, nil))
			return true
		},
	})

	for range 2 {
		routed := ctrl.withCapabilityRoute("请审查这段代码有没有问题", "请审查这段代码有没有问题")
		if !strings.Contains(routed, "skill:review prefer") || strings.Contains(routed, "source:skills") {
			t.Fatalf("route should target the ready built-in review skill:\n%s", routed)
		}
	}
	if calls != 1 {
		t.Fatalf("auto-enable calls = %d, want 1", calls)
	}
}

func TestCapabilityRouteAutoEnablesFullSurfaceAfterPlanMode(t *testing.T) {
	store := skill.New(skill.Options{HomeDir: t.TempDir()})
	reg := tool.NewRegistry()
	reg.Add(skill.NewReadOnlySkillTool(store, nil))
	var calls atomic.Int32
	ctrl := New(Options{
		Registry:   reg,
		Skills:     store.List(),
		SkillStore: store,
		AutoEnableBuiltinSkills: func() bool {
			calls.Add(1)
			reg.Add(skill.NewRunSkillTool(store, nil))
			return true
		},
	})

	ctrl.SetPlanMode(true)
	planRoute := ctrl.withCapabilityRoute("请审查这段代码有没有问题", "请审查这段代码有没有问题")
	if !strings.Contains(planRoute, "skill:review prefer") || strings.Contains(planRoute, "source:skills") {
		t.Fatalf("plan-mode route should use the read-only skill surface:\n%s", planRoute)
	}

	ctrl.SetPlanMode(false)
	normalRoute := ctrl.withCapabilityRoute("请运行测试并修复失败", "请运行测试并修复失败")
	if !strings.Contains(normalRoute, "skill:test prefer") || strings.Contains(normalRoute, "source:skills") {
		t.Fatalf("normal-mode route should enable the full skill surface:\n%s", normalRoute)
	}
	if got := calls.Load(); got != 1 {
		t.Fatalf("full-surface auto-enable calls = %d, want 1", got)
	}
}

func TestCapabilityRouteConcurrentAutoEnableRecomputesAfterIdempotentCallback(t *testing.T) {
	store := skill.New(skill.Options{HomeDir: t.TempDir()})
	reg := tool.NewRegistry()
	var mu sync.Mutex
	added := false
	var calls atomic.Int32
	secondArrived := make(chan struct{})
	ctrl := New(Options{
		Registry:   reg,
		Skills:     store.List(),
		SkillStore: store,
		AutoEnableBuiltinSkills: func() bool {
			call := calls.Add(1)
			if call == 1 {
				<-secondArrived
			} else if call == 2 {
				close(secondArrived)
			}
			mu.Lock()
			defer mu.Unlock()
			if added {
				return false
			}
			reg.Add(skill.NewRunSkillTool(store, nil))
			added = true
			return true
		},
	})

	const workers = 2
	results := make(chan string, workers)
	var wg sync.WaitGroup
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results <- ctrl.withCapabilityRoute("请审查这段代码有没有问题", "请审查这段代码有没有问题")
		}()
	}
	wg.Wait()
	close(results)
	for routed := range results {
		if !strings.Contains(routed, "skill:review prefer") || strings.Contains(routed, "source:skills") || strings.Contains(routed, "connect_tool_source") {
			t.Fatalf("concurrent route should reflect the registered skill surface:\n%s", routed)
		}
	}
	if got := calls.Load(); got != workers {
		t.Fatalf("auto-enable callback calls = %d, want %d", got, workers)
	}
}
