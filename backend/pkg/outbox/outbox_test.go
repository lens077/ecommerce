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

func TestSubjectFor(t *testing.T) {
	relay := Relay{SubjectPrefix: "events", TypePrefix: "ecommerce."}
	if got, want := relay.subjectFor("ecommerce.product.spu.upserted"), "events.product.spu.upserted"; got != want {
		t.Fatalf("subjectFor() = %q, want %q", got, want)
	}
	if got, want := relay.subjectFor("thirdparty.product.updated"), "events.thirdparty.product.updated"; got != want {
		t.Fatalf("subjectFor() without type prefix = %q, want %q", got, want)
	}
}

func TestHashLockIDIsStableAndPositive(t *testing.T) {
	first := hashLockID("products.outbox")
	second := hashLockID("products.outbox")
	if first != second || first <= 0 {
		t.Fatalf("hashLockID() values = %d, %d; want equal positive values", first, second)
	}
	if other := hashLockID("orders.outbox"); other == first {
		t.Fatalf("hashLockID() collision for test inputs: %d", first)
	}
}
