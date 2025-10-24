package models

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestGetUserByName(t *testing.T) {
	arg := "admin"

	result, err := testQueries.GetUserByName(context.Background(), arg)
	assert.NoError(t, err)
	assert.NotNil(t, result)
	t.Log(result)
}

func TestInsertTestUser(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	result, err := testQueries.InsertTestUser(ctx)
	assert.NoError(t, err)
	assert.NotNil(t, result)
	assert.NotEmpty(t, result)
	t.Log(result)
}
