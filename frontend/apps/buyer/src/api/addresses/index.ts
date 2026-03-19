// 地址API服务
import type { Address } from "./types"
// 模拟API调用
const mockDelay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 获取地址列表
export const getAddresses = async (): Promise<Address[]> => {
    await mockDelay(500);
    // 模拟数据
    return [
        {
            id: "1",
            name: "张三",
            phone: "13800138000",
            province: "广东省",
            city: "深圳市",
            district: "南山区",
            address: "科技园南区8栋",
            isDefault: true,
        },
        {
            id: "2",
            name: "李四",
            phone: "13900139000",
            province: "北京市",
            city: "北京市",
            district: "朝阳区",
            address: "望京SOHO T1",
            isDefault: false,
        },
    ];
};

// 创建新地址
export const createAddress = async (address: Omit<Address, "id">): Promise<Address> => {
    await mockDelay(500);
    return {
        ...address,
        id: Date.now().toString(),
    };
};

// 更新地址
export const updateAddress = async (address: Address): Promise<Address> => {
    await mockDelay(500);
    return address;
};

// 删除地址
export const deleteAddress = async (_id: string): Promise<boolean> => {
    await mockDelay(500);
    return true;
};

// 设置默认地址
export const setDefaultAddress = async (_id: string): Promise<boolean> => {
    await mockDelay(500);
    return true;
};
