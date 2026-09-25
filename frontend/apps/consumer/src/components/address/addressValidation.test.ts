import { describe, expect, it } from "vite-plus/test";
import { EMPTY_ADDRESS_FORM, validateAddressForm } from "./addressValidation";

const form = {
  ...EMPTY_ADDRESS_FORM,
  recipientName: "张三",
  recipientPhone: "+852 1234 5678",
  province: "海南省",
  city: "琼海市",
  detail: "海边路 1 号",
};

describe("validateAddressForm", () => {
  it("allows an empty district only after resolving a city without districts", () => {
    expect(validateAddressForm(form, { districtRequired: false })).toBeNull();
    expect(validateAddressForm(form, { districtRequired: true })).toBe("addresses.form.required");
    expect(validateAddressForm(form, { districtRequired: null })).toBe(
      "addresses.form.regionsUnresolved",
    );
  });
  it("enforces proto length limits by Unicode code points rather than UTF-16 units", () => {
    expect(
      validateAddressForm({ ...form, detail: "𠮷".repeat(500) }, { districtRequired: false }),
    ).toBeNull();
    expect(
      validateAddressForm({ ...form, detail: "𠮷".repeat(501) }, { districtRequired: false }),
    ).toBe("addresses.form.tooLong");
  });
  it("rejects blank required fields without imposing a country-specific phone format", () => {
    expect(validateAddressForm({ ...form, recipientName: "  " }, { districtRequired: false })).toBe(
      "addresses.form.required",
    );
    expect(
      validateAddressForm(
        { ...form, recipientPhone: "(020) 1234 ext 5" },
        { districtRequired: false },
      ),
    ).toBeNull();
  });
});
