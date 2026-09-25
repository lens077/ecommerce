import type { AddressFormData } from "@/api/addresses/types";

export const EMPTY_ADDRESS_FORM: Readonly<AddressFormData> = Object.freeze({
  recipientName: "",
  recipientPhone: "",
  province: "",
  city: "",
  district: "",
  detail: "",
  isDefault: false,
});

/** 返回翻译 key；区划未解析或加载失败时，不能假定区县可省略。 */
export function validateAddressForm(
  data: AddressFormData,
  { districtRequired }: { districtRequired: boolean | null },
): string | null {
  if (districtRequired === null) return "addresses.form.regionsUnresolved";
  const required = [data.recipientName, data.recipientPhone, data.province, data.city, data.detail];
  if (districtRequired) required.push(data.district);
  if (required.some((value) => !value.trim())) return "addresses.form.required";
  // proto string.max_len 按 Unicode code point 计数，不是 JS 的 UTF-16 length。
  const fields: [string, number][] = [
    [data.recipientName, 255],
    [data.recipientPhone, 50],
    [data.province, 64],
    [data.city, 64],
    [data.district, 64],
    [data.detail, 500],
  ];
  if (fields.some(([value, max]) => Array.from(value).length > max))
    return "addresses.form.tooLong";
  return null;
}
