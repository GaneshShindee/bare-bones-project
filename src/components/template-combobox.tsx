import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type TemplateOption = {
  id: string;
  name: string;
  is_default?: boolean;
};

type TemplateComboboxProps = {
  templates: TemplateOption[];
  value: string;
  onValueChange: (id: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  allowClear?: boolean;
  clearLabel?: string;
  disabled?: boolean;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function TemplateCombobox({
  templates,
  value,
  onValueChange,
  placeholder = "Choose a template…",
  searchPlaceholder = "Search templates…",
  emptyText = "No templates found.",
  allowClear = false,
  clearLabel = "No template",
  disabled = false,
  className,
  open: openProp,
  onOpenChange,
}: TemplateComboboxProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  const selected = useMemo(
    () => templates.find((t) => t.id === value),
    [templates, value],
  );

  const label = selected
    ? `${selected.name}${selected.is_default ? " · Default" : ""}`
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal h-10 px-3.5",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="flex items-center gap-2 min-w-0">
            <LayoutTemplate className="h-4 w-4 shrink-0 opacity-60" />
            <span className="truncate">{label}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {allowClear && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onValueChange("");
                    setOpen(false);
                  }}
                >
                  <Check className={cn("h-4 w-4", value ? "opacity-0" : "opacity-100")} />
                  <span className="text-muted-foreground">{clearLabel}</span>
                </CommandItem>
              )}
              {templates.map((t) => {
                const display = `${t.name}${t.is_default ? " · Default" : ""}`;
                return (
                  <CommandItem
                    key={t.id}
                    value={`${t.name} ${t.id}`}
                    onSelect={() => {
                      onValueChange(t.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("h-4 w-4", value === t.id ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{display}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
