import {
  LayoutDashboard,
  FolderKanban,
  Wand2,
  Sofa,
  Images,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "My Projects", href: "/projects", icon: FolderKanban },
  { label: "Design Studio", href: "/studio", icon: Wand2 },
  { label: "Furniture Library", href: "/library", icon: Sofa },
  { label: "Render Gallery", href: "/gallery", icon: Images },
  { label: "Settings", href: "/settings", icon: Settings },
];
