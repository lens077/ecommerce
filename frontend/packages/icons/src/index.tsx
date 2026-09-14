import { MorphIcon, type MorphIconProps } from "morphicons/react";
// 具名 import + 静态映射表:原来的 `import * as icons` + `icons[name]` 动态取值让 tree-shaking
// 完全失效,整套 lucide(2700+ 条 path、453KB)被打进首屏 chunk。2026-09-15 实测省 ~110KB gzip。
// 新增图标:三处一起改——下面的 import、lucideIcons 映射、末尾的具名导出。漏列会直接编译错误。
import {
  ArrowLeft as ArrowLeftNode,
  ArrowUpRight as ArrowUpRightNode,
  Bell as BellNode,
  Camera as CameraNode,
  Check as CheckNode,
  CheckCircle as CheckCircleNode,
  ChevronRight as ChevronRightNode,
  BarChart3 as BarChart3Node,
  DollarSign as DollarSignNode,
  Download as DownloadNode,
  Edit as EditNode,
  Edit2 as Edit2Node,
  Eye as EyeNode,
  FileText as FileTextNode,
  Filter as FilterNode,
  Home as HomeNode,
  Image as ImageNode,
  LayoutDashboard as LayoutDashboardNode,
  LogOut as LogOutNode,
  MapPin as MapPinNode,
  MessageSquare as MessageSquareNode,
  Minus as MinusNode,
  Package as PackageNode,
  Plus as PlusNode,
  Save as SaveNode,
  Search as SearchNode,
  Settings as SettingsNode,
  ShoppingBag as ShoppingBagNode,
  ShoppingCart as ShoppingCartNode,
  Store as StoreNode,
  Trash2 as Trash2Node,
  TrendingDown as TrendingDownNode,
  TrendingUp as TrendingUpNode,
  Truck as TruckNode,
  Users as UsersNode,
  X as XNode,
  XCircle as XCircleNode,
  CircleUserRound as CircleUserRoundNode,
  EllipsisVertical as EllipsisVerticalNode,
  Languages as LanguagesNode,
  Zap as ZapNode,
  Tag as TagNode,
  Badge as BadgeNode,
  Mail as MailNode,
  Sparkles as SparklesNode,
  Send as SendNode,
  Square as SquareNode,
  Activity as ActivityNode,
} from "lucide";
import type { ReactElement } from "react";

type IconProps = Omit<MorphIconProps, "icon"> & { size?: number | string; sx?: unknown };

const lucideIcons = {
  ArrowLeft: ArrowLeftNode,
  ArrowUpRight: ArrowUpRightNode,
  Bell: BellNode,
  Camera: CameraNode,
  Check: CheckNode,
  CheckCircle: CheckCircleNode,
  ChevronRight: ChevronRightNode,
  BarChart3: BarChart3Node,
  DollarSign: DollarSignNode,
  Download: DownloadNode,
  Edit: EditNode,
  Edit2: Edit2Node,
  Eye: EyeNode,
  FileText: FileTextNode,
  Filter: FilterNode,
  Home: HomeNode,
  Image: ImageNode,
  LayoutDashboard: LayoutDashboardNode,
  LogOut: LogOutNode,
  MapPin: MapPinNode,
  MessageSquare: MessageSquareNode,
  Minus: MinusNode,
  Package: PackageNode,
  Plus: PlusNode,
  Save: SaveNode,
  Search: SearchNode,
  Settings: SettingsNode,
  ShoppingBag: ShoppingBagNode,
  ShoppingCart: ShoppingCartNode,
  Store: StoreNode,
  Trash2: Trash2Node,
  TrendingDown: TrendingDownNode,
  TrendingUp: TrendingUpNode,
  Truck: TruckNode,
  Users: UsersNode,
  X: XNode,
  XCircle: XCircleNode,
  CircleUserRound: CircleUserRoundNode,
  EllipsisVertical: EllipsisVerticalNode,
  Languages: LanguagesNode,
  Zap: ZapNode,
  Tag: TagNode,
  Badge: BadgeNode,
  Mail: MailNode,
  Sparkles: SparklesNode,
  Send: SendNode,
  Square: SquareNode,
  Activity: ActivityNode,
} as const;

type IconName = keyof typeof lucideIcons;

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
      icon={lucideIcons[name] as unknown as Parameters<typeof MorphIcon>[0]["icon"]}
      reducedMotion="user"
      style={style}
      {...svgProps}
    />
  );
}

export const iconsByName = Object.fromEntries(
  (Object.keys(lucideIcons) as IconName[]).map((name) => [
    name,
    (props: IconProps) => icon(name, props),
  ]),
) as Record<IconName, (props: IconProps) => ReactElement>;

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
  Sparkles,
  Send,
  Square,
  Activity,
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
