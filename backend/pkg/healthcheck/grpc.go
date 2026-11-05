package healthcheck

import (
	"context"

	"connectrpc.com/connect/v2"
	"connectrpc.com/grpchealth/v2"
)

// ReadyFunc reports whether the process can currently serve application traffic.
type ReadyFunc func(context.Context) bool

type checker struct {
	ready    ReadyFunc
	services map[string]struct{}
}

// Register exposes deep readiness through the standard gRPC health protocol on
// the connect server. Must be called before connecthttp.Mount. An empty service
// name represents the whole process; named services must be listed.
func Register(server *connect.Server, ready ReadyFunc, services ...string) {
	if ready == nil {
		panic("healthcheck: nil readiness function")
	}
	known := make(map[string]struct{}, len(services))
	for _, service := range services {
		if service != "" {
			known[service] = struct{}{}
		}
	}
	grpchealth.Register(server, &checker{ready: ready, services: known})
}

func (c *checker) Check(ctx context.Context, request *grpchealth.CheckRequest) (*grpchealth.CheckResponse, error) {
	service := ""
	if request != nil {
		service = request.Service
	}
	if service != "" {
		if _, ok := c.services[service]; !ok {
			return nil, connect.Errorf(connect.CodeNotFound, "unknown service %q", service)
		}
	}
	status := grpchealth.StatusNotServing
	if c.ready(ctx) {
		status = grpchealth.StatusServing
	}
	return &grpchealth.CheckResponse{Status: status}, nil
}
