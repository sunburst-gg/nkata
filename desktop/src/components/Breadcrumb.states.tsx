import { Breadcrumb } from "./Breadcrumb";

export function BreadcrumbStates() {
  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb items={[{ label: "Sunburst", onClick: () => undefined }, { label: "Rising Sun", current: true }]} />
      <Breadcrumb items={[{ label: "Sunburst", onClick: () => undefined }, { label: "Rising Sun", onClick: () => undefined }, { label: "Ojukwu", onClick: () => undefined }, { label: "face", current: true }]} />
      <Breadcrumb items={[{ label: "Sunburst", onClick: () => undefined }, { label: "New project", current: true }]} />
    </div>
  );
}
