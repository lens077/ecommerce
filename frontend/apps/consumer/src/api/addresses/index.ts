// 地址API服务 — 调用后端 AddressService（Connect-Go）
import { createClient } from "@connectrpc/connect";
import { AddressService } from "@/gen/api";
import { createAppTransport } from "@ecommerce/api";
import { userStore } from "@/store/users";
import type { Address, AddressFormData, UpdateAddressParams } from "./types";

const transport = createAppTransport();

const client = createClient(AddressService, transport);

/** 构造 AddressDetail */
function buildDetail(data: AddressFormData) {
  return {
    province: data.province,
    city: data.city,
    district: data.district,
    detail: data.detail,
  };
}

/** 获取地址列表 */
export const getAddresses = async (signal?: AbortSignal): Promise<Address[]> => {
  const response = await client.listAddresses({}, { signal });
  return response.addresses;
};

/** 创建新地址 */
export const createAddress = async (data: AddressFormData): Promise<string> => {
  const response = await client.createAddress({
    recipientName: data.recipientName,
    recipientPhone: data.recipientPhone,
    userId: userStore.account.id,
    detail: buildDetail(data),
    isDefault: data.isDefault,
  });
  return response.addressId;
};

/** 更新地址 */
export const updateAddress = async (params: UpdateAddressParams): Promise<void> => {
  await client.updateAddress({
    addressId: params.addressId,
    recipientName: params.recipientName,
    recipientPhone: params.recipientPhone,
    detail: buildDetail(params),
  });
};

/** 删除地址 */
export const deleteAddress = async (addressId: string): Promise<void> => {
  await client.deleteAddress({ addressId });
};

/** 设置默认地址 */
export const setDefaultAddress = async (addressId: string): Promise<void> => {
  await client.setDefaultAddress({ addressId });
};
