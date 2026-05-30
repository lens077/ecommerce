// 位置服务

// 位置信息类型
export interface LocationInfo {
  province: string;
  city: string;
  district: string;
  address: string;
  latitude: number;
  longitude: number;
}

// 检查是否支持地理位置API
export const isGeolocationSupported = (): boolean => {
  return "geolocation" in navigator;
};

// 请求位置权限
export const requestLocationPermission = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (!isGeolocationSupported()) {
      resolve(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        resolve(true);
      },
      () => {
        resolve(false);
      },
    );
  });
};

// 获取GPS位置信息
export const getLocationByGPS = (): Promise<LocationInfo | null> => {
  return new Promise((resolve) => {
    if (!isGeolocationSupported()) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        // 模拟通过GPS坐标获取地址信息
        // 实际项目中，这里应该调用高德地图API
        try {
          // 模拟API调用延迟
          await new Promise((resolve) => setTimeout(resolve, 500));
          resolve({
            province: "广东省",
            city: "深圳市",
            district: "南山区",
            address: "科技园",
            latitude,
            longitude,
          });
        } catch (error) {
          resolve(null);
        }
      },
      () => {
        resolve(null);
      },
    );
  });
};

// 通过IP获取位置信息
export const getLocationByIP = (): Promise<LocationInfo | null> => {
  return new Promise(async (resolve) => {
    try {
      // 模拟API调用延迟
      await new Promise((resolve) => setTimeout(resolve, 500));
      // 模拟通过IP获取地址信息
      // 实际项目中，这里应该调用高德地图IP定位API
      resolve({
        province: "广东省",
        city: "深圳市",
        district: "南山区",
        address: "科技园",
        latitude: 22.5431,
        longitude: 114.0579,
      });
    } catch (error) {
      resolve(null);
    }
  });
};

// 获取位置信息（GPS优先，IP回退）
export const getLocationInfo = async (): Promise<LocationInfo | null> => {
  // 尝试通过GPS获取
  const gpsLocation = await getLocationByGPS();
  if (gpsLocation) {
    return gpsLocation;
  }

  // GPS失败，回退到IP获取
  return await getLocationByIP();
};
