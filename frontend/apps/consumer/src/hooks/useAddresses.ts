import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAddresses, createAddress, updateAddress, deleteAddress, setDefaultAddress } from "@/api";

export const useAddresses = () => {
    const queryClient = useQueryClient();

    // 获取地址列表
    const {
        data: addresses,
        isLoading,
        error,
        refetch,
    } = useQuery({
        queryKey: ["addresses"],
        queryFn: getAddresses,
    });

    // 创建地址
    const createAddressMutation = useMutation({
        mutationFn: createAddress,
        onSuccess: () => {
            // 重新获取地址列表
            queryClient.invalidateQueries({queryKey: ["addresses"]});
        },
    });

    // 更新地址
    const updateAddressMutation = useMutation({
        mutationFn: updateAddress,
        onSuccess: () => {
            // 重新获取地址列表
            queryClient.invalidateQueries({queryKey: ["addresses"]});
        },
    });

    // 删除地址
    const deleteAddressMutation = useMutation({
        mutationFn: deleteAddress,
        onSuccess: () => {
            // 重新获取地址列表
            queryClient.invalidateQueries({queryKey: ["addresses"]});
        },
    });

    // 设置默认地址
    const setDefaultAddressMutation = useMutation({
        mutationFn: setDefaultAddress,
        onSuccess: () => {
            // 重新获取地址列表
            queryClient.invalidateQueries({queryKey: ["addresses"]});
        },
    });

    return {
        addresses,
        isLoading,
        error,
        refetch,
        createAddress: createAddressMutation.mutate,
        updateAddress: updateAddressMutation.mutate,
        deleteAddress: deleteAddressMutation.mutate,
        setDefaultAddress: setDefaultAddressMutation.mutate,
        isCreating: createAddressMutation.isPending,
        isUpdating: updateAddressMutation.isPending,
        isDeleting: deleteAddressMutation.isPending,
        isSettingDefault: setDefaultAddressMutation.isPending,
    };
};
