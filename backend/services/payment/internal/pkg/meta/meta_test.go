package meta

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/suite"
)

type MetaTestSuite struct {
	suite.Suite
}

func (suite *MetaTestSuite) TestAppInfoStruct() {
	appInfo := AppInfo{
		ID:          "test-id",
		Name:        "test-service",
		Host:        "localhost",
		Environment: "dev",
	}

	assert.Equal(suite.T(), "test-id", appInfo.ID)
	assert.Equal(suite.T(), "test-service", appInfo.Name)
	assert.Equal(suite.T(), "localhost", appInfo.Host)
	assert.Equal(suite.T(), "dev", appInfo.Environment)
}

func (suite *MetaTestSuite) TestGetOutboundIP() {
	ip, err := GetOutboundIP()
	if err == nil {
		assert.NotEmpty(suite.T(), ip)
		assert.NotContains(suite.T(), ip, ":")
	}
}

func (suite *MetaTestSuite) TestGetOutboundIP_PanicRecovery() {
	assert.NotPanics(suite.T(), func() {
		_, _ = GetOutboundIP()
	})
}

func TestMetaTestSuite(t *testing.T) {
	suite.Run(t, new(MetaTestSuite))
}

func TestAppInfoZeroValue(t *testing.T) {
	var appInfo AppInfo
	assert.Empty(t, appInfo.ID)
	assert.Empty(t, appInfo.Name)
	assert.Empty(t, appInfo.Host)
	assert.Empty(t, appInfo.Environment)
}

func TestAppInfoInitialization(t *testing.T) {
	testCases := []struct {
		name        string
		input       AppInfo
		expectedID  string
		expectedName string
	}{
		{
			name: "Full info",
			input: AppInfo{
				ID:          "service-1",
				Name:        "user-service",
				Host:        "192.168.1.1",
				Environment: "production",
			},
			expectedID:   "service-1",
			expectedName: "user-service",
		},
		{
			name: "Partial info",
			input: AppInfo{
				ID:   "service-2",
				Name: "payment-service",
			},
			expectedID:   "service-2",
			expectedName: "payment-service",
		},
		{
			name:        "Empty info",
			input:       AppInfo{},
			expectedID:  "",
			expectedName: "",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.expectedID, tc.input.ID)
			assert.Equal(t, tc.expectedName, tc.input.Name)
		})
	}
}
