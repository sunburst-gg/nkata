import { createMockSource } from "@/data/mock";
import { AccountMenu } from "./AccountMenu";

const db = createMockSource().snapshot();
const noop = () => undefined;

export function AccountMenuStates() {
  return (
    <div className="flex gap-12">
      <AccountMenu user={db.people[0]!} theme="dark" viewer={false} onProfile={noop} onToggleTheme={noop} onSignOut={noop} />
      <AccountMenu user={db.people[8]!} theme="light" viewer onProfile={noop} onToggleTheme={noop} onSignOut={noop} />
    </div>
  );
}
