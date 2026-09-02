package outbox

import "testing"

func TestValidTable(t *testing.T) {
	for _, table := range []string{"products.outbox", "schema_1.table_2"} {
		if err := ValidTable(table); err != nil {
			t.Errorf("ValidTable(%q) = %v", table, err)
		}
	}
	for _, table := range []string{"", "products.outbox;drop table users", "products-outbox", "products..outbox"} {
		if err := ValidTable(table); err == nil {
			t.Errorf("ValidTable(%q) accepted unsafe identifier", table)
		}
	}
}
