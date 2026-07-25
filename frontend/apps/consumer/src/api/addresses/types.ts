// 地址类型定义
// 与后端 address.v1 proto 对齐
import type { GetAddressResponse } from "@/gen/api";

/** 地址（对应后端 GetAddressResponse） */
export type Address = GetAddressResponse;

/** 地址表单数据（用于创建/更新） */
export interface AddressFormData {
  recipientName: string;
  recipientPhone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  isDefault: boolean;
}

/** 更新地址参数（addressId + 表单数据） */
export interface UpdateAddressParams extends AddressFormData {
  addressId: string;
}
