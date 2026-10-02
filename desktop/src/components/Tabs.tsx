// shadcn Tabs (Radix), restyled: underline 2 px, 150 ms, 14 px, gap 28.
import * as RadixTabs from "@radix-ui/react-tabs";
import { cn } from "@/lib/cn";

export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
  disabled?: boolean;
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  "aria-label"?: string;
}

export function Tabs<T extends string>({ items, value, onChange, className, ...rest }: TabsProps<T>) {
  return (
    <RadixTabs.Root value={value} onValueChange={(v) => onChange(v as T)} className={className}>
      <RadixTabs.List aria-label={rest["aria-label"]} className="flex gap-7 border-b border-hairline text-14">
        {items.map((it) => (
          <RadixTabs.Trigger
            key={it.value}
            value={it.value}
            disabled={it.disabled}
            className={cn(
              "-mb-px border-b-2 border-transparent py-2 text-secondary transition-colors duration-150 cursor-pointer",
              "data-[state=active]:border-heading data-[state=active]:font-medium data-[state=active]:text-heading",
              "hover:text-heading disabled:cursor-default disabled:text-disabled disabled:hover:text-disabled",
            )}
          >
            {it.label}
            {it.count !== undefined ? <span className="role-mono ml-1.5 text-muted">{it.count}</span> : null}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
    </RadixTabs.Root>
  );
}
