// Step 8 on the mock: the code flow, members and the last producer, rename, delete and restore,
// budgets per project and per asset, invites by role.
import { describe, expect, it } from "vitest";
import { DEFAULT_BUDGETS } from "@/data/types";
import { MOCK_CODE, MockDataSource, RISING_SUN, RISING_SUN_BUDGETS } from "@/data/mock";
import { invitableRoles } from "@/auth/permissions";

describe("sign in with a code", () => {
  it("wrong five times uses the code up; the right code signs a known person in", async () => {
    const m = new MockDataSource({ stage: "studio", role: "artist" });
    const sent = await m.requestCode("ada@sunburst.studio");
    expect(sent.code).toBe(MOCK_CODE);
    for (let i = 0; i < 4; i++) await expect(m.redeemCode("ada@sunburst.studio", "000000")).rejects.toThrow("wrong");
    await expect(m.redeemCode("ada@sunburst.studio", "000000")).rejects.toThrow("used up");
    await expect(m.redeemCode("ada@sunburst.studio", MOCK_CODE)).rejects.toThrow("used up");
    await m.requestCode("ada@sunburst.studio");
    const me = await m.redeemCode("ada@sunburst.studio", MOCK_CODE);
    expect(me.first).toBe("Ada");
    const fresh = await m.redeemCode("new@studio.com", MOCK_CODE);
    expect(fresh.name).toBe("");
    const named = await m.setMe("Bisi Ade");
    expect(named).toMatchObject({ first: "Bisi", initial: "B" });
  });
});

describe("members", () => {
  it("the last producer cannot leave or step down", async () => {
    const m = new MockDataSource({ stage: "studio", role: "lead" });
    const members = await m.listStudioMembers();
    const producers = members.filter((x) => x.person.role === "producer");
    expect(producers).toHaveLength(1);
    await expect(m.setMemberRole(producers[0]!.person.id, "artist")).rejects.toThrow("at least one producer");
    await expect(m.removeMember(producers[0]!.person.id)).rejects.toThrow("at least one producer");
    const ada = members.find((x) => x.person.first === "Ada")!;
    await m.setMemberRole(ada.person.id, "producer");
    await m.setMemberRole(producers[0]!.person.id, "artist");
    expect((await m.listStudioMembers()).find((x) => x.person.id === producers[0]!.person.id)?.person.role).toBe("artist");
    await expect(m.removeMember(ada.person.id)).rejects.toThrow("at least one producer");
    await m.removeMember(producers[0]!.person.id);
    expect((await m.listStudioMembers()).some((x) => x.person.id === producers[0]!.person.id)).toBe(false);
  });

  it("invites show as Invited at once; an art director hands out artist and viewer only", async () => {
    const m = new MockDataSource({ stage: "studio", role: "lead" });
    const before = (await m.listMembers(RISING_SUN.id)).length;
    const events: string[] = [];
    m.subscribe((e) => events.push(e.type));
    for (const e of ["one@studio.com", "two@studio.com", "three@studio.com"]) await m.invite(RISING_SUN.id, e, "artist");
    const after = await m.listMembers(RISING_SUN.id);
    expect(after).toHaveLength(before + 3);
    expect(after.slice(-3).every((x) => x.journey === "invited")).toBe(true);
    expect(events).toEqual(["memberChanged", "memberChanged", "memberChanged"]);
    expect(invitableRoles("artDirector")).toEqual(["artist", "viewer"]);
    expect(invitableRoles("producer")).toHaveLength(4);
    expect(invitableRoles("artist")).toEqual([]);
  });
});

describe("projects", () => {
  it("rename, recolor, delete and restore", async () => {
    const m = new MockDataSource({ stage: "studio", role: "lead" });
    await m.renameProject(RISING_SUN.id, "Rising Moon");
    await m.setProjectColor(RISING_SUN.id, "var(--p-teal)");
    expect(await m.getProject(RISING_SUN.id)).toMatchObject({ name: "Rising Moon", color: "var(--p-teal)" });
    await m.deleteProject(RISING_SUN.id);
    expect(await m.getProject(RISING_SUN.id)).toBeNull();
    expect(await m.listDeletedProjects()).toMatchObject([{ id: RISING_SUN.id, name: "Rising Moon" }]);
    await m.restoreProject(RISING_SUN.id);
    expect((await m.getProject(RISING_SUN.id))?.name).toBe("Rising Moon");
    expect(await m.listDeletedProjects()).toEqual([]);
  });

  it("a new project gets its own id even with a taken name", async () => {
    const m = new MockDataSource({ stage: "studio", role: "lead" });
    const made = await m.createProject("Rising Sun", "var(--p-plum)");
    expect(made.id).not.toBe(RISING_SUN.id);
    expect((await m.listProjects()).map((p) => p.id)).toContain(made.id);
  });
});

describe("budgets", () => {
  it("seeds the defaults; a lower prop budget puts assets over and the count comes back", async () => {
    const m = new MockDataSource({ stage: "studio", role: "lead" });
    expect(await m.getBudgets(RISING_SUN.id)).toEqual(RISING_SUN_BUDGETS);
    const made = await m.createProject("Harmattan", "var(--p-teal)");
    expect(await m.getBudgets(made.id)).toEqual(DEFAULT_BUDGETS);
    const overBefore = (await m.listAssets(RISING_SUN.id)).filter((a) => a.versions[0]?.checks.some((c) => c.key === "tris" && !c.pass)).length;
    expect(overBefore).toBe(1);
    const over = await m.setBudgets(RISING_SUN.id, { ...DEFAULT_BUDGETS, prop: 20_000 });
    expect(over).toBeGreaterThan(overBefore);
    const back = await m.setBudgets(RISING_SUN.id, RISING_SUN_BUDGETS);
    expect(back).toBe(overBefore);
  });

  it("an asset override wins over the project number and clears", async () => {
    const m = new MockDataSource({ stage: "studio", role: "lead" });
    const radio = (await m.listAssets(RISING_SUN.id))[0]!;
    const tris = radio.versions[0]!.facts!.tris;
    await m.setAssetBudget(radio.id, tris - 1);
    const over = (await m.getAsset(radio.id))!;
    expect(over.budget).toBe(tris - 1);
    expect(over.versions[0]!.checks.find((c) => c.key === "tris")?.pass).toBe(false);
    await m.setAssetBudget(radio.id, null);
    const back = (await m.getAsset(radio.id))!;
    expect(back.budget).toBeUndefined();
    expect(back.versions[0]!.checks.find((c) => c.key === "tris")?.pass).toBe(true);
  });
});
