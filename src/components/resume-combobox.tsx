import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, FileText } from "lucide-react";
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

export type ResumeOption = {
  id: string;
  name: string;
  is_default?: boolean;
};

type ResumeComboboxProps = {
  resumes: ResumeOption[];
  value: string[];
  onToggle: (id: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function ResumeCombobox({
  resumes,
  value,
  onToggle,
  placeholder = "Attach from Resume Library…",
  searchPlaceholder = "Search resumes…",
  emptyText = "No resumes found.",
  disabled = false,
  className,
  open: openProp,
  onOpenChange,
}: ResumeComboboxProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  const selected = useMemo(
    () => resumes.filter((r) => value.includes(r.id)),
    [resumes, value],
  );

  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? `${selected[0].name}${selected[0].is_default ? " · Default" : ""}`
        : `${selected.length} resumes selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || resumes.length === 0}
          className={cn(
            "w-full justify-between font-normal h-10 px-3.5",
            selected.length === 0 && "text-muted-foreground",
            className,
          )}
        >
          <span className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 shrink-0 opacity-60" />
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
              {resumes.map((r) => {
                const on = value.includes(r.id);
                const display = `${r.name}${r.is_default ? " · Default" : ""}`;
                return (
                  <CommandItem
                    key={r.id}
                    value={`${r.name} ${r.id}`}
                    onSelect={() => onToggle(r.id)}
                  >
                    <Check className={cn("h-4 w-4", on ? "opacity-100" : "opacity-0")} />
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
