import { Sun, Moon, Monitor } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTheme, type Theme } from "./theme-provider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <ToggleGroup
      type="single"
      value={theme}
      onValueChange={(v) => v && setTheme(v as Theme)}
      variant="outline"
      size="sm"
    >
      <ToggleGroupItem value="light" aria-label="浅色">
        <Sun className="size-4 mr-1" /> 浅色
      </ToggleGroupItem>
      <ToggleGroupItem value="dark" aria-label="深色">
        <Moon className="size-4 mr-1" /> 深色
      </ToggleGroupItem>
      <ToggleGroupItem value="system" aria-label="跟随系统">
        <Monitor className="size-4 mr-1" /> 系统
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
