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
      (position) => {
        const { latitude, longitude } = position.coords;
        // 模拟通过 GPS 坐标获取地址信息；实际项目中这里应调用地图服务。
        window.setTimeout(() => {
          resolve({
            province: "广东省",
            city: "深圳市",
            district: "南山区",
            address: "科技园",
            latitude,
            longitude,
          });
        }, 500);
      },
      () => {
        resolve(null);
      },
    );
  });
};

// 通过IP获取位置信息
export const getLocationByIP = (): Promise<LocationInfo> => {
  return new Promise((resolve) => {
    // 模拟通过 IP 获取地址信息；实际项目中这里应调用地图服务。
    window.setTimeout(() => {
      resolve({
        province: "广东省",
        city: "深圳市",
        district: "南山区",
        address: "科技园",
        latitude: 22.5431,
        longitude: 114.0579,
      });
    }, 500);
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
  return getLocationByIP();
};
