// 级联选项随界面语言显示，onChange 始终返回中文规范名。
import { useEffect, useId } from "react";
import {
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import { useTranslation } from "@ecommerce/i18n";
import { toAppError } from "@ecommerce/api";
import { useRegions } from "@/hooks/useRegions";
import { lantern, sp } from "@/styles/tokens";
import type { Region } from "@/gen/api";
import { addressActionSx, addressAlertSx } from "./addressStyles";

export interface RegionValue {
  province: string;
  city: string;
  district: string;
}
interface RegionSelectProps {
  value: RegionValue;
  onChange: (value: RegionValue) => void;
  /** null 表示当前省市尚未解析或区划加载失败，必须阻止提交。 */
  onDistrictRequiredChange?: (required: boolean | null) => void;
  disabled?: boolean;
}

export function RegionSelect({
  value,
  onChange,
  onDistrictRequiredChange,
  disabled,
}: RegionSelectProps) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const provinces = useRegions(0);
  // 从当前受控值推导 id，避免切城市或换编辑对象后保留旧查询。
  const provinceId = provinces.isSuccess
    ? provinces.data.find((r) => r.name === value.province)?.id
    : undefined;
  const cities = useRegions(provinceId);
  const cityId =
    provinceId !== undefined && cities.isSuccess
      ? cities.data.find((r) => r.name === value.city)?.id
      : undefined;
  const districts = useRegions(cityId);
  const required = cityId !== undefined && districts.isSuccess ? districts.data.length > 0 : null;
  useEffect(() => {
    onDistrictRequiredChange?.(required);
  }, [value.province, value.city, required, onDistrictRequiredChange]);

  const label = (r: Region) => (i18n.language.startsWith("en") && r.nameEn ? r.nameEn : r.name);
  const failed = [provinces, cities, districts].filter((query) => query.isError);
  const change = (region: RegionValue) => {
    onDistrictRequiredChange?.(null);
    onChange(region);
  };
  return (
    <Box sx={{ display: "grid", gap: sp[4] }}>
      {failed.length > 0 && (
        <Alert
          severity="error"
          sx={addressAlertSx}
          action={
            <Button
              disabled={disabled}
              sx={addressActionSx}
              onClick={() => {
                failed.forEach((query) => {
                  void query.refetch();
                });
              }}
            >
              {t("addresses.retry")}
            </Button>
          }
        >
          {t("addresses.form.regionsUnresolved")} {toAppError(failed[0].error).message}
        </Alert>
      )}
      <RegionLevel
        id={`${id}-province`}
        label={t("addresses.form.province")}
        value={value.province}
        options={provinces.data}
        loading={provinces.isLoading}
        disabled={disabled}
        renderLabel={label}
        onChange={(province) => change({ province, city: "", district: "" })}
      />
      <RegionLevel
        id={`${id}-city`}
        label={t("addresses.form.city")}
        value={value.city}
        options={cities.data}
        loading={cities.isLoading}
        disabled={disabled || provinceId === undefined}
        renderLabel={label}
        onChange={(city) => change({ ...value, city, district: "" })}
      />
      <RegionLevel
        id={`${id}-district`}
        label={t("addresses.form.district")}
        value={value.district}
        options={districts.data}
        loading={districts.isLoading}
        disabled={disabled || required !== true}
        renderLabel={label}
        onChange={(district) => onChange({ ...value, district })}
      />
      {required === false && (
        <Typography component="p" variant="body2" sx={{ color: lantern.inkSoft }}>
          {t("addresses.form.noDistrict")}
        </Typography>
      )}
    </Box>
  );
}

interface RegionLevelProps {
  id: string;
  label: string;
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
  value,
  options,
  loading,
  disabled,
  renderLabel,
  onChange,
}: RegionLevelProps) {
  const { t } = useTranslation();
  // 未加载/历史名称仍显示，但未解析的省市不会被当作可提交状态。
  const orphan = value && !options?.some((r) => r.name === value);
  return (
    <FormControl fullWidth disabled={disabled || loading}>
      <InputLabel id={`${id}-label`}>{label}</InputLabel>
      <Select
        labelId={`${id}-label`}
        value={value}
        label={label}
        onChange={(e) => onChange(e.target.value)}
        MenuProps={{ slotProps: { paper: { sx: { bgcolor: lantern.paper, color: lantern.ink } } } }}
      >
        <MenuItem value="" disabled>
          {loading ? t("addresses.form.regionLoading") : label}
        </MenuItem>
        {orphan && (
          <MenuItem value={value} disabled>
            {value}
          </MenuItem>
        )}
        {options?.map((region) => (
          <MenuItem key={region.id} value={region.name}>
            {renderLabel(region)}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
