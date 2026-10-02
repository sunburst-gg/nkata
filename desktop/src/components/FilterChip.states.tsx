import { FilterChip } from "./FilterChip";

export function FilterChipStates() {
  return (
    <div className="flex gap-2">
      <FilterChip label="Person" />
      <FilterChip label="Ada" active />
      <FilterChip label="Ready" count={4} />
      <FilterChip label="Hover" />
    </div>
  );
}
