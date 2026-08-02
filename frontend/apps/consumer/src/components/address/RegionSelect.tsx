// 省/市/区三级级联选择。
//
// 数据来自后端 RegionService（addresses.regions 表，GB/T 2260 全量行政区划），
// 不是写死的几个选项。两条约束值得单独说明：
//
//   1. 选项文案跟界面语言走（英文界面显示 Guangdong Province），
//      但 onChange 吐出去、最终落库的**永远是中文规范名**。
//      快递面单要中文，界面语言不该影响存储内容。
//   2. 省直辖县级行政区（海南琼海市、湖北仙桃市等 49 个）下面没有区县，
//      此时区县这一级是空的，通过 onDistrictRequiredChange 告诉表单别强制必填。
import { useCallback, useEffect, useState } from "react";
import { Box, FormControl, InputLabel, MenuItem, Select } from "@mui/material";
import { useTranslation } from "@ecommerce/i18n";
import { useRegions } from "@/hooks/useRegions";
import type { Region } from "@/gen/api";

export interface RegionValue {
  province: string;
  city: string;
  district: string;
}

interface RegionSelectProps {
  value: RegionValue;
  onChange: (value: RegionValue) => void;
  /** 当前城市下是否还有区县可选。为 false 时表单不应把区县当必填 */
  onDistrictRequiredChange?: (required: boolean) => void;
}

/**
 * 编辑已有地址时后端只回中文名，没有 id；按 name 反查一次把 id 补上，
 * 下一级列表才拉得动。用户自己点选时 id 已经有了，这里直接跳过。
 */
function useBackfillId(
  options: Region[] | undefined,
  name: string,
  id: number | undefined,
  setId: (id: number) => void,
) {
  useEffect(() => {
    if (id !== undefined || !name || !options) return;
    const hit = options.find((r) => r.name === name);
    if (hit) setId(hit.id);
  }, [options, name, id, setId]);
}

export function RegionSelect({ value, onChange, onDistrictRequiredChange }: RegionSelectProps) {
  const { t, i18n } = useTranslation();
  const isEN = i18n.language.startsWith("en");

  const [provinceId, setProvinceId] = useState<number>();
  const [cityId, setCityId] = useState<number>();

  const provinces = useRegions(0);
  const cities = useRegions(provinceId);
  const districts = useRegions(cityId);

  useBackfillId(provinces.data, value.province, provinceId, setProvinceId);
  useBackfillId(cities.data, value.city, cityId, setCityId);

  useEffect(() => {
    onDistrictRequiredChange?.(districts.data !== undefined && districts.data.length > 0);
  }, [districts.data, onDistrictRequiredChange]);

  // 英文名个别缺失（数据里 name_en 允许为空）时退回中文，不留空白选项
  const label = useCallback(
    (r: Region) => (isEN && r.nameEn ? r.nameEn : r.name),
    [isEN],
  );

  const handleProvince = (name: string) => {
    setProvinceId(provinces.data?.find((r) => r.name === name)?.id);
    setCityId(undefined);
    onChange({ province: name, city: "", district: "" });
  };

  const handleCity = (name: string) => {
    setCityId(cities.data?.find((r) => r.name === name)?.id);
    onChange({ ...value, city: name, district: "" });
  };

  return (
    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2 }}>
      <RegionLevel
        id="province"
        label={t("addresses.form.province")}
        placeholder={t("addresses.form.selectProvince")}
        value={value.province}
        options={provinces.data}
        loading={provinces.isLoading}
        renderLabel={label}
        onChange={handleProvince}
      />
      <RegionLevel
        id="city"
        label={t("addresses.form.city")}
        placeholder={t("addresses.form.selectCity")}
        value={value.city}
        options={cities.data}
        loading={cities.isLoading}
        disabled={provinceId === undefined}
        renderLabel={label}
        onChange={handleCity}
      />
      <RegionLevel
        id="district"
        label={t("addresses.form.district")}
        // 城市下没有区县时（省直辖县级行政区）给一句明确的说明，
        // 否则用户面对一个点不开的下拉框只会以为是坏了
        placeholder={
          districts.data?.length === 0
            ? t("addresses.form.noDistrict")
            : t("addresses.form.selectDistrict")
        }
        value={value.district}
        options={districts.data}
        loading={districts.isLoading}
        disabled={cityId === undefined || districts.data?.length === 0}
        renderLabel={label}
        onChange={(name) => onChange({ ...value, district: name })}
      />
    </Box>
  );
}

interface RegionLevelProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  options: Region[] | undefined;
  loading: boolean;
  disabled?: boolean;
  renderLabel: (r: Region) => string;
  onChange: (name: string) => void;
}

function RegionLevel({
  id,
  label,
  placeholder,
  value,
  options,
  loading,
  disabled,
  renderLabel,
  onChange,
}: RegionLevelProps) {
  const { t } = useTranslation();
  // 已存的名字不在当前列表里（历史脏数据、或上级还没加载出来）时补一个选项。
  // 不补的话 MUI 会因为 value 不在 options 里而丢掉显示，用户看到的是空白，
  // 会以为地址没存上。
  const orphan = value && !options?.some((r) => r.name === value);

  return (
    <FormControl fullWidth disabled={disabled || loading}>
      <InputLabel id={`${id}-label`}>{label}</InputLabel>
      <Select
        labelId={`${id}-label`}
        value={value}
        label={label}
        onChange={(e) => onChange(e.target.value)}
      >
        <MenuItem value="" disabled>
          <em>{loading ? t("addresses.form.regionLoading") : placeholder}</em>
        </MenuItem>
        {orphan && <MenuItem value={value}>{value}</MenuItem>}
        {options?.map((r) => (
          <MenuItem key={r.id} value={r.name}>
            {renderLabel(r)}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
