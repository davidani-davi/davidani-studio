"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STUDIO_PAGES, STUDIO_TOOLS, type StudioTab } from "@/lib/studio-navigation";

/**
 * The current tool's name as a menu of every studio page and tool. Used by
 * the compact header, where the two nav rows would cost the stage ~70px.
 * Every destination is still a real link inside the menu.
 */
export default function ToolMenu({ active }: { active: StudioTab }) {
  const all = [...STUDIO_PAGES, ...STUDIO_TOOLS];
  const current = all.find((item) => item.id === active)?.label ?? "Studio";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="tool-menu-trigger" aria-label={`${current}, switch tool`}>
        <span>{current}</span>
        <ChevronDown className="size-3.5 opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="kobra min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Studios</DropdownMenuLabel>
          {STUDIO_PAGES.map((item) => (
            <DropdownMenuItem
              key={item.id}
              render={<Link href={item.href} aria-current={item.id === active ? "page" : undefined} />}
              highlighted={item.id === active}
            >
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Tools</DropdownMenuLabel>
          {STUDIO_TOOLS.map((item) => (
            <DropdownMenuItem
              key={item.id}
              render={<Link href={item.href} aria-current={item.id === active ? "page" : undefined} />}
              highlighted={item.id === active}
            >
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
