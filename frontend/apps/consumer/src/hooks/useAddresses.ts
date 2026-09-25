import { createConnectQueryKey, useMutation, useQuery } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { AddressService, type ListAddressesResponse } from "@/gen/api";
import type { AddressFormData, UpdateAddressParams } from "@/api/addresses/types";

/** 表单里的省市区 + 详址拼成 proto 的 AddressDetail */
function buildDetail(data: AddressFormData) {
  return {
    province: data.province,
    city: data.city,
    district: data.district,
    detail: data.detail,
  };
}

const selectAddresses = (response: ListAddressesResponse) => response.addresses;

export const useAddresses = () => {
  const queryClient = useQueryClient();

  // 不带 input / transport ⇒ 部分匹配，命中该 RPC 的所有查询
  const listKey = createConnectQueryKey({
    schema: AddressService.method.listAddresses,
    cardinality: "finite",
  });

  const invalidateList = () => {
    // 刷新失败由列表查询展示；已成功的写入不能因此被当作失败重试。
    void queryClient.invalidateQueries({ queryKey: listKey }).catch(() => undefined);
  };

  // 获取地址列表。select 只取 addresses，调用方拿到的仍然是 Address[]
  const {
    data: addresses,
    isLoading,
    error,
    refetch,
  } = useQuery(AddressService.method.listAddresses, {}, { select: selectAddresses });

  const createAddressMutation = useMutation(AddressService.method.createAddress, {
    onSuccess: invalidateList,
  });

  const updateAddressMutation = useMutation(AddressService.method.updateAddress, {
    onSuccess: invalidateList,
  });

  const deleteAddressMutation = useMutation(AddressService.method.deleteAddress, {
    onSuccess: invalidateList,
  });

  const setDefaultAddressMutation = useMutation(AddressService.method.setDefaultAddress, {
    onSuccess: invalidateList,
  });

  return {
    addresses,
    isLoading,
    error,
    refetch,
    // 对外仍然收表单结构，proto 消息的拼装收在这里，页面不用认识 AddressDetail
    createAddress: (data: AddressFormData) =>
      createAddressMutation.mutateAsync({
        recipientName: data.recipientName,
        recipientPhone: data.recipientPhone,
        detail: buildDetail(data),
        isDefault: data.isDefault,
      }),
    updateAddress: (params: UpdateAddressParams) =>
      updateAddressMutation.mutateAsync({
        addressId: params.addressId,
        recipientName: params.recipientName,
        recipientPhone: params.recipientPhone,
        detail: buildDetail(params),
      }),
    deleteAddress: (addressId: string) => deleteAddressMutation.mutateAsync({ addressId }),
    setDefaultAddress: (addressId: string) => setDefaultAddressMutation.mutateAsync({ addressId }),
    isCreating: createAddressMutation.isPending,
    isUpdating: updateAddressMutation.isPending,
    isDeleting: deleteAddressMutation.isPending,
    isSettingDefault: setDefaultAddressMutation.isPending,
  };
};
