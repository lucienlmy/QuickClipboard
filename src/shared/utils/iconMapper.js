import {
  IconFolder,
  IconStar,
  IconHeart,
  IconBookmark,
  IconTag,
  IconArchive,
  IconBriefcase,
  IconBook,
  IconNotebook,
  IconClipboard,
  IconCalendar,
  IconBox,
  IconPackage,
  IconGift,
  IconShoppingCart,
  IconHome,
  IconDeviceDesktop,
  IconCode,
  IconPalette,
  IconMusic,
  IconPhoto,
  IconVideo,
  IconFile,
  IconBulb,
  IconList
} from '@tabler/icons-react'

// 图标名称到 React 组件的映射
const ICON_MAP = {
  'ti ti-folder': IconFolder,
  'ti ti-star': IconStar,
  'ti ti-heart': IconHeart,
  'ti ti-bookmark': IconBookmark,
  'ti ti-tag': IconTag,
  'ti ti-archive': IconArchive,
  'ti ti-briefcase': IconBriefcase,
  'ti ti-book': IconBook,
  'ti ti-notebook': IconNotebook,
  'ti ti-clipboard': IconClipboard,
  'ti ti-calendar': IconCalendar,
  'ti ti-box': IconBox,
  'ti ti-package': IconPackage,
  'ti ti-gift': IconGift,
  'ti ti-shopping-cart': IconShoppingCart,
  'ti ti-home': IconHome,
  'ti ti-device-desktop': IconDeviceDesktop,
  'ti ti-code': IconCode,
  'ti ti-palette': IconPalette,
  'ti ti-music': IconMusic,
  'ti ti-photo': IconPhoto,
  'ti ti-video': IconVideo,
  'ti ti-file': IconFile,
  'ti ti-bulb': IconBulb,
  'ti ti-list': IconList
}

// 根据图标名称获取 React 组件
export function getIconComponent(iconName) {
  return ICON_MAP[iconName] || IconFolder
}

// 可用的图标列表（用于选择器）
export const AVAILABLE_ICONS = Object.keys(ICON_MAP)

