VERSION := $(shell git describe --tags --always 2>/dev/null || echo dev)
LDFLAGS := -s -w -X main.version=$(VERSION)
GOEXE := $(shell go env GOEXE)

.PHONY: build vet fmt test desktop-check desktop-test desktop-build desktop-dist hooks cross clean

build:
	CGO_ENABLED=0 go build -ldflags "$(LDFLAGS)" -o bin/voltui$(GOEXE) ./cmd/voltui
	CGO_ENABLED=0 go build -ldflags "$(LDFLAGS)" -o bin/voltui-plugin-example$(GOEXE) ./cmd/voltui-plugin-example

vet:
	go vet ./...

fmt:
	gofmt -w .

test:
	go test ./...

desktop-test:
	pnpm --filter voltui-desktop-workbench run test:unit
	pnpm --filter "@dsh/*" --filter "@xgic/*" run test

desktop-check:
	pnpm --filter voltui-desktop-workbench run check
	pnpm --filter voltui-desktop-workbench run check:runtime-mocks
	pnpm --filter voltui-desktop-workbench run check:electron-boundary

desktop-build:
	pnpm run build:desktop

desktop-dist:
	pnpm run dist:desktop

hooks:
	@git config core.hooksPath .githooks
	@echo "installed: core.hooksPath -> .githooks (pre-push runs go vet)"

cross:
	@mkdir -p dist
	@for p in darwin/amd64 darwin/arm64 linux/amd64 linux/arm64 windows/amd64 windows/arm64; do \
		os=$${p%/*}; arch=$${p#*/}; ext=; [ $$os = windows ] && ext=.exe; \
		echo "build $$os/$$arch"; \
		CGO_ENABLED=0 GOOS=$$os GOARCH=$$arch go build -ldflags "$(LDFLAGS)" -o dist/voltui-$$os-$$arch$$ext ./cmd/voltui; \
	done

clean:
	rm -rf bin dist
