import { MorphIcon, type MorphIconProps } from "morphicons/react";
import * as icons from "lucide";

type IconProps = Omit<MorphIconProps, "icon"> & { size?: number | string; sx?: unknown };
type IconName = keyof typeof icons;

function icon(name: IconName, props: IconProps) {
  const { sx, ...svgProps } = props;
  const style =
    sx && typeof sx === "object"
      ? Object.fromEntries(
          Object.entries(sx as object).map(([k, v]) => [
            k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
            v,
          ]),
        )
      : undefined;
  return (
    <MorphIcon
      icon={icons[name] as unknown as Parameters<typeof MorphIcon>[0]["icon"]}
      reducedMotion="user"
      style={style}
      {...svgProps}
    />
  );
}

const names = [
  "ArrowLeft",
  "ArrowUpRight",
  "Bell",
  "Camera",
  "Check",
  "CheckCircle",
  "ChevronRight",
  "BarChart3",
  "DollarSign",
  "Download",
  "Edit",
  "Edit2",
  "Eye",
  "FileText",
  "Filter",
  "Home",
  "Image",
  "LayoutDashboard",
  "LogOut",
  "MapPin",
  "MessageSquare",
  "Minus",
  "Package",
  "Plus",
  "Save",
  "Search",
  "Settings",
  "ShoppingBag",
  "ShoppingCart",
  "Store",
  "Trash2",
  "TrendingDown",
  "TrendingUp",
  "Truck",
  "Users",
  "X",
  "XCircle",
  "CircleUserRound",
  "EllipsisVertical",
  "Languages",
  "Zap",
  "Tag",
  "Badge",
  "Mail",
] as const;

export const iconsByName = Object.fromEntries(
  names.map((name) => [name, (props: IconProps) => icon(name, props)]),
) as Record<(typeof names)[number], (props: IconProps) => React.ReactElement>;

export const {
  ArrowLeft,
  ArrowUpRight,
  Bell,
  Camera,
  Check,
  CheckCircle,
  ChevronRight,
  DollarSign,
  Download,
  Edit,
  Edit2,
  Eye,
  FileText,
  Filter,
  Home,
  Image,
  LayoutDashboard,
  LogOut,
  MapPin,
  MessageSquare,
  Minus,
  Package,
  Plus,
  Save,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Store,
  Trash2,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  X,
  XCircle,
  BarChart3,
} = iconsByName;

export const AccountCircle = iconsByName.CircleUserRound;
export const MoreVertIcon = iconsByName.EllipsisVertical;
export const SearchIcon = iconsByName.Search;
export const ShoppingCartIcon = iconsByName.ShoppingCart;
export const FlashOnIcon = iconsByName.Zap;
export const LanguageIcon = iconsByName.Languages;
export const Add = iconsByName.Plus;
export const Close = iconsByName.X;
export const Delete = iconsByName.Trash2;
export const LocationOn = iconsByName.MapPin;
export const Person = iconsByName.CircleUserRound;
export const Email = iconsByName.MessageSquare;
export const Badge = iconsByName.Tag;
export const Tag = iconsByName.Tag;
