// v8 step 21: the template sets each check's level; a lead accepts a failing check on one part with
// a reason; Publish holds only on a failing block level check nobody accepted; a lead can publish
// past one with a reason the version keeps. docs/tasks/v8-21-studio-rules.md.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasInfra, startHarness, type Harness } from "./helpers.js";

const ENV = "env@sunburst.gg";
const AD = "director@sunburst.gg";
const PRODUCER = "producer@sunburst.gg";

type Template = { name: string; parts: { checks: string[]; params?: Record<string, unknown>; severity?: Record<string, string> }[] };
const PIVOT_OFF = { check_id: "pivot_at_base", severity: "note", passed: false, auto_fixed: false, message: "origin is not at the base of SM_Door" };
const BIG_TEXTURE = { check_id: "texture_size", severity: "warn", passed: false, auto_fixed: false, message: "1 texture over 4096" };

describe.skipIf(!hasInfra)("v8 step 21: studio rules", () => {
  let h: Harness;
  beforeAll(async () => { h = await startHarness(); });
  afterAll(async () => h?.close());

  const asset = async (name: string): Promise<string> => {
    const res = await h.app.inject({ method: "POST", url: "/assets", payload: { project_id: h.seeded.project_id, template_name: "Object", name, parts: ["model"], owners: { model: h.seeded.users[ENV]! }, files: { model: `Props/${name}/${name}.blend` } }, ...h.as(ENV) });
    expect(res.statusCode).toBe(201);
    return res.json().parts[0].id as string;
  };
  const save = async (part: string, results: unknown[]): Promise<string> => {
    const v = (await h.app.inject({ method: "POST", url: `/parts/${part}/versions`, payload: {}, ...h.as(ENV) })).json().version.id as string;
    await h.app.inject({ method: "POST", url: `/parts/${part}/versions/${v}/checks`, payload: { results }, ...h.as(ENV) });
    return v;
  };
  const publish = (part: string, version_id: string, who = ENV, extra: Record<string, unknown> = {}) =>
    h.app.inject({ method: "POST", url: `/parts/${part}/publish`, payload: { version_id, note: "a pass", ...extra }, ...h.as(who) });
  const objectTemplate = async (): Promise<Template> =>
    ((await h.app.inject({ method: "GET", url: `/projects/${h.seeded.project_id}/templates`, ...h.as(ENV) })).json().templates as { name: string; schema: Template }[]).find((t) => t.name === "Object")!.schema;

  it("a new Object asset carries the pivot at the base as a note, and a failing note never holds Publish", async () => {
    const part = await asset("Crate");
    const got = (await h.app.inject({ method: "GET", url: `/parts/${part}`, ...h.as(ENV) })).json();
    const pivot = (got.part ?? got).checks.find((c: { id: string }) => c.id === "pivot_at_base");
    expect(pivot).toEqual({ id: "pivot_at_base", severity: "note", params: { convention: "base" } });
    const v = await save(part, [PIVOT_OFF, BIG_TEXTURE]);
    expect((await publish(part, v)).json()).toMatchObject({ published: true, blocked_by: [] });
  });

  it("a lead raises the pivot to block; a door on its hinge is held until a lead accepts it with a reason", async () => {
    const tpl = await objectTemplate();
    tpl.parts[0]!.severity = { ...tpl.parts[0]!.severity, pivot_at_base: "block" };
    expect((await h.app.inject({ method: "PUT", url: `/projects/${h.seeded.project_id}/templates/Object`, payload: { file_path: ".nkata/templates/Object.json", schema: tpl }, ...h.as(ENV) })).statusCode).toBe(403);
    expect((await h.app.inject({ method: "PUT", url: `/projects/${h.seeded.project_id}/templates/Object`, payload: { file_path: ".nkata/templates/Object.json", schema: tpl }, ...h.as(AD) })).statusCode).toBe(200);

    const door = await asset("Door");
    const barrel = await asset("Barrel");
    // The editor said note; the template says block, and the template wins.
    const dv = await save(door, [PIVOT_OFF]);
    const held = (await publish(door, dv)).json();
    expect(held).toMatchObject({ published: false, blocked_by: [{ check_id: "pivot_at_base", severity: "block" }] });

    const reason = "Hinge pivot, on purpose.";
    expect((await h.app.inject({ method: "POST", url: `/parts/${door}/exceptions`, payload: { check_id: "pivot_at_base", reason }, ...h.as(ENV) })).statusCode).toBe(403);
    const ok = await h.app.inject({ method: "POST", url: `/parts/${door}/exceptions`, payload: { check_id: "pivot_at_base", reason }, ...h.as(AD) });
    expect(ok.statusCode).toBe(200);
    // Safe to retry: the same accept twice is one row.
    const again = await h.app.inject({ method: "POST", url: `/parts/${door}/exceptions`, payload: { check_id: "pivot_at_base", reason }, ...h.as(AD) });
    expect(again.json().exceptions).toHaveLength(1);
    const got = (await h.app.inject({ method: "GET", url: `/parts/${door}`, ...h.as(ENV) })).json();
    expect((got.part ?? got).exceptions).toEqual([{ check_id: "pivot_at_base", reason, by: expect.objectContaining({ id: h.seeded.users[AD] }), at: expect.any(String) }]);

    // The app sends no results; the recorded ones count all the same.
    expect((await h.app.inject({ method: "POST", url: `/parts/${door}/publish`, payload: { version_id: dv, note: "door" }, ...h.as(ENV) })).json()).toMatchObject({ published: true });
    const bv = await save(barrel, [{ ...PIVOT_OFF, message: "origin is not at the base of SM_Barrel" }]);
    expect((await h.app.inject({ method: "POST", url: `/parts/${barrel}/publish`, payload: { version_id: bv, note: "barrel" }, ...h.as(ENV) })).json()).toMatchObject({ published: false });

    // Taken back, the door is held again on its next save.
    expect((await h.app.inject({ method: "DELETE", url: `/parts/${door}/exceptions/pivot_at_base`, ...h.as(PRODUCER) })).json().exceptions).toEqual([]);
    const dv2 = await save(door, [PIVOT_OFF]);
    expect((await publish(door, dv2)).json()).toMatchObject({ published: false });
  });

  it("only a lead publishes past a blocking check, and the version keeps the reason and who", async () => {
    const part = await asset("Gate");
    const v = await save(part, [PIVOT_OFF]);
    expect((await publish(part, v, ENV, { override_reason: "Needed for the demo." })).statusCode).toBe(403);
    expect((await publish(part, v, AD, { override_reason: "Needed for the demo." })).json()).toMatchObject({ published: true });
    const versions = (await h.app.inject({ method: "GET", url: `/parts/${part}/versions`, ...h.as(ENV) })).json().versions as { id: string; override_reason: string | null; override_by: string | null }[];
    expect(versions.find((x) => x.id === v)).toMatchObject({ override_reason: "Needed for the demo.", override_by: h.seeded.users[AD] });
  });
});
