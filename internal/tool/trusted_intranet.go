package tool

import "context"

// TrustedIntranetRequest is one exact private-network destination resolved by
// web_fetch. Host, IP, and Port together form the approval scope.
type TrustedIntranetRequest struct {
	URL  string
	Host string
	IP   string
	Port int
}

// TrustedIntranetApprover asks for a fresh user decision when web_fetch resolves
// a target to RFC1918 or IPv6 ULA space. Headless runs fail closed when no
// approver is present.
type TrustedIntranetApprover interface {
	ApproveTrustedIntranet(ctx context.Context, req TrustedIntranetRequest) (allow bool, reason string, err error)
	TrustedIntranetSessionAllowed(ctx context.Context, req TrustedIntranetRequest) bool
}

type trustedIntranetApproverContextKey struct{}

func WithTrustedIntranetApprover(ctx context.Context, approver TrustedIntranetApprover) context.Context {
	if approver == nil {
		return ctx
	}
	return context.WithValue(ctx, trustedIntranetApproverContextKey{}, approver)
}

func TrustedIntranetApproverFrom(ctx context.Context) (TrustedIntranetApprover, bool) {
	if ctx == nil {
		return nil, false
	}
	approver, ok := ctx.Value(trustedIntranetApproverContextKey{}).(TrustedIntranetApprover)
	return approver, ok && approver != nil
}
