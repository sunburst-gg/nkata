// One or more valid values, and at least one invalid value, for every $def in shared/schemas/.
// The round-trip test fails if a $def has no fixture.

export type Fixture = { valid: unknown[]; invalid: unknown[] };
export type Fixtures = Record<string, Record<string, Fixture>>;

const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const id2 = "01BX5ZZKBKACTAV9WEVGEMMVRZ";
const at = "2026-10-01T12:00:00.000Z";
const user = { id, name: "Ada", avatar_url: null };
const user2 = { id: id2, name: "Grace", avatar_url: "https://example.com/g.png" };
const lock = { holder: user, granted_at: at, heartbeat_at: at, expires_at: at, stale: false };
const checkResult = { check_id: "unit_scale", severity: "block", passed: true, auto_fixed: false, message: "" };
const comment = {
  id, part_id: id, version_id: id2, author: user, point: [0, 1, 2], normal: [0, 0, 1],
  body: "Shorter here", kind: "pin", resolved_at: null, created_at: at,
};
const head = { v: 1, project_id: id, actor_id: id2, at };
const presenceEntry = { user, part_id: null, since: at, last_seen: at };
const templatePart = { name: "face", mapping: "blend_collection", gate: [], checks: ["unit_scale"], params: { triangle_budget: 60000 } };
const template = {
  v: 1, name: "Character", kind: "character", parts: [templatePart, { name: "rig", mapping: "blend_collection", gate: ["face"], checks: [] }],
  reference_slots: ["concept_sheet"], export: { ue_path: "/Game/Characters/{asset}/{part}", name: "SK_{asset}_{part}" },
  blend_layout: "one_file_per_part",
};
const manifestObject = { name: "Face", triangles: 12000, materials: ["M_Skin"], bounds_min: [-1, -1, 0], bounds_max: [1, 1, 2], hash: "abc", origin: [0, 0, 0], scale: [1, 1, 1], uv_sets: ["UVMap"] };
const manifest = { v: 1, kind: "character", objects: [manifestObject], bone_count: 42, armature: "Armature", mirror_target: "/Game/Characters/Ojukwu/face", textures: [{ name: "T_Face_D", width: 2048, height: 2048 }], unit_scale: 1 };
const mapping = { kind: "blend_collection", file: "face.blend", collection: "face" };
const mirrorState = { part_id: id, status: "synced", version_id: id2, at, mirror_ms: 4200, message: "", failures: 0, halted: false, on_save: true };
const rights = { statement: "Sunburst Interactive owns this asset outright.", confirmed_by: id, confirmed_at: at };
const checkSpec = { id: "triangle_budget", severity: "block", params: { max: 60000 } };
const partSummary = { id, asset_id: id2, asset_name: "Ojukwu", export_name: "SK_Ojukwu_face", name: "face", state: "draft", owner: user, lock, gate: { after: [] }, mapping, kind: "character", checks: [checkSpec], reference_files: ["Ojukwu/ref/concept.png"], waiting_on: [] };

const events = {
  PresenceChanged: { ...head, kind: "presence.changed", online: [presenceEntry] },
  LockGranted: { ...head, kind: "lock.granted", part_id: id, lock },
  LockReleased: { ...head, kind: "lock.released", part_id: id, reason: "closed" },
  LockRequested: { ...head, kind: "lock.requested", part_id: id, requester: user2, holder_id: id },
  VersionCreated: { ...head, kind: "version.created", part_id: id, version_id: id2, published: false },
  MirrorResult: { ...head, kind: "mirror.result", part_id: id, version_id: id2, status: "synced", mirror_ms: 4200, message: "" },
  PartStateChanged: { ...head, kind: "part.state", part_id: id, from: "draft", to: "ready" },
  CommentCreated: { ...head, kind: "comment.created", comment },
  CommentResolved: { ...head, kind: "comment.resolved", comment: { ...comment, resolved_at: at } },
  ReviewDecided: { ...head, kind: "review.decided", part_id: id, version_id: id2, review_id: id, decision: "approve", score: 4, note: "Good" },
  GateOpened: { ...head, kind: "gate.opened", part_id: id, opened_by: [id2] },
  StudioTraining: { ...head, project_id: null, kind: "studio.training", training: "on" },
};

const budgets = { prop: 20000, vehicle: 80000, character: 60000, environment: 2000000, max_texture: 4096 };
const manifestCheck = { key: "textures", pass: true, sentence: "Textures named right.", fix: "" };
const me = { v: 1, user, project: { id, name: "Rising Sun", folder_name: "rising-sun" }, package_version: "0.1.0", online: true, spool_dir: "/home/ada/rising-sun/.nkata-agent/spool", mode: "sync", mirror_paused: false, unreal: false };

export const fixtures: Fixtures = {
  common: {
    Ulid: { valid: [id], invalid: ["not-a-ulid", 12] },
    Timestamp: { valid: [at, "2026-10-01T12:00:00+09:00"], invalid: ["yesterday"] },
    PartState: { valid: ["locked", "draft", "ready", "approved"], invalid: ["Draft"] },
    Role: { valid: ["artist", "art_director", "producer", "viewer"], invalid: ["admin", "guest", "engineer", "writer"] },
    MirrorStatus: { valid: ["synced", "failed"], invalid: ["done"] },
    CheckSeverity: { valid: ["block", "warn"], invalid: ["error"] },
    ReviewDecision: { valid: ["approve", "send_back"], invalid: ["reject"] },
    Training: { valid: ["on", "off"], invalid: ["yes", true] },
    CommentKind: { valid: ["pin", "take_a_look"], invalid: ["note"] },
    AssetKind: { valid: ["object", "environment"], invalid: ["prop", "Object"] },
    Budgets: { valid: [budgets, { ...budgets, max_texture: null }], invalid: [{ ...budgets, prop: -1 }, { prop: 1, vehicle: 1, character: 1 }] },
    AssetRights: { valid: [rights], invalid: [{ ...rights, statement: "" }, { statement: "x" }] },
    Vec3: { valid: [[0, 1, 2.5]], invalid: [[0, 1], ["a", "b", "c"]] },
    UserRef: { valid: [user, user2], invalid: [{ id, name: "" , avatar_url: null }, { id, name: "x" }] },
    Gate: { valid: [{ after: [] }, { after: ["face", "cloth"] }], invalid: [{}, { after: [""] }] },
    PartMapping: {
      valid: [mapping, { kind: "ue_actor", level: "L_Main", actor: "BP_Door" }, { kind: "ue_area", level: "L_EnuguMarket", area: "square" }, { kind: "ue_asset", path: "/Game/X" }, { kind: "file", path: "concept.png" }],
      invalid: [{ kind: "blend_collection", path: "x" }, { kind: "ue_area", level: "L" }, { kind: "other" }],
    },
    LockInfo: { valid: [lock], invalid: [{ ...lock, stale: "no" }] },
    CheckResult: { valid: [checkResult], invalid: [{ ...checkResult, severity: "fatal" }] },
    CommentPin: { valid: [comment, { ...comment, resolved_at: at }, { ...comment, kind: "take_a_look" }], invalid: [{ ...comment, point: [1] }, { ...comment, linear_issue: "SUN-12" }, { ...comment, kind: "note" }] },
    ErrorBody: { valid: [{ v: 1, error: { code: "not_found", message: "No part" } }], invalid: [{ v: 1, error: { code: "" , message: "x" } }] },
  },
  template: {
    TemplateKind: { valid: ["character", "prop", "level_area"], invalid: ["script", "sound"] },
    TemplateMappingKind: { valid: ["file", "ue_asset", "ue_area"], invalid: ["blend"] },
    TemplatePart: { valid: [templatePart, { name: "concept", mapping: "file", checks: [] }, { name: "layout", mapping: "ue_area", gate: ["blockout"], checks: [] }], invalid: [{ name: "Face", mapping: "file", checks: [] }] },
    TemplateExport: { valid: [template.export], invalid: [{ ue_path: "/Game" }] },
    BlendLayout: { valid: ["one_file_per_part"], invalid: ["one_file"] },
    Template: { valid: [template], invalid: [{ ...template, v: 2 }, { ...template, parts: [] }, { ...template, kind: "script" }] },
  },
  check: {
    CheckTarget: { valid: ["blender", "ue5", "file"], invalid: ["maya"] },
    CheckContract: {
      valid: [{ v: 1, id: "unit_scale", title: "Unit scale", severity: "block", auto_fix: true, params: { type: "object" }, applies_to: ["blender"] }],
      invalid: [{ v: 1, id: "Unit", title: "x", severity: "block", auto_fix: true, params: {}, applies_to: [] }],
    },
  },
  events: {
    ServerEventKind: { valid: ["lock.granted", "gate.opened"], invalid: ["lock.request"] },
    PresenceEntry: { valid: [presenceEntry, { ...presenceEntry, part_id: id }], invalid: [{ ...presenceEntry, part_id: "x" }] },
    ...Object.fromEntries(Object.entries(events).map(([name, value]) => [name, { valid: [value], invalid: [{ ...value, kind: "nope" }] }])),
    ServerEvent: { valid: Object.values(events), invalid: [{ ...head, kind: "presence.heartbeat", part_id: null }] },
    PresenceHeartbeat: { valid: [{ v: 1, kind: "presence.heartbeat", part_id: null }], invalid: [{ v: 1, kind: "presence.heartbeat" }] },
    LockRequest: { valid: [{ v: 1, kind: "lock.request", part_id: id }], invalid: [{ v: 1, kind: "lock.request", part_id: null }] },
    LockRelease: { valid: [{ v: 1, kind: "lock.release", part_id: id }], invalid: [{ v: 1, kind: "lock.release" }] },
    ClientMessage: {
      valid: [{ v: 1, kind: "presence.heartbeat", part_id: id }, { v: 1, kind: "lock.request", part_id: id }, { v: 1, kind: "lock.release", part_id: id }],
      invalid: [events.LockGranted],
    },
  },
  agent: {
    ProjectRef: { valid: [{ id, name: "Rising Sun", folder_name: "rising-sun" }], invalid: [{ id, name: "Rising Sun" }] },
    MeResponse: { valid: [me, { ...me, budgets }], invalid: [{ v: 1, user }, { ...me, budgets: { prop: 1 } }] },
    AgentMode: { valid: ["sync", "stream"], invalid: ["viewer"] },
    CheckSpec: { valid: [checkSpec, { id: "unit_scale", severity: "warn", params: {} }], invalid: [{ id: "Unit", severity: "block", params: {} }] },
    PartSummary: { valid: [partSummary, { ...partSummary, owner: null, lock: null }], invalid: [{ ...partSummary, state: "open" }] },
    PartsResponse: { valid: [{ v: 1, parts: [partSummary] }], invalid: [{ v: 1 }] },
    PartOpenResponse: { valid: [{ v: 1, granted: true, lock }, { v: 1, granted: false, lock }], invalid: [{ v: 1, granted: true }] },
    PartCloseResponse: { valid: [{ v: 1, released: true }], invalid: [{ v: 1, released: 1 }] },
    ManifestObject: { valid: [manifestObject], invalid: [{ ...manifestObject, triangles: -1 }] },
    ManifestTexture: { valid: [{ name: "T_Face_D", width: 2048, height: 2048 }], invalid: [{ name: "", width: 1, height: 1 }, { name: "T", width: -1, height: 1 }] },
    ManifestCheck: { valid: [manifestCheck, { ...manifestCheck, key: "tris", pass: false, sentence: "40,100 triangles, over the 20,000 budget.", fix: "Decimate or remove hidden faces." }], invalid: [{ ...manifestCheck, key: "bones" }, { key: "uv", pass: true }] },
    ObjectManifest: { valid: [manifest, { ...manifest, armature: "Armature" }, { ...manifest, asset_kind: "environment", checks: [manifestCheck] }], invalid: [{ ...manifest, objects: {} }, { ...manifest, asset_kind: "prop" }] },
    AssetCreateRequest: { valid: [{ v: 1, name: "Kettle", file: "Objects/Kettle/Kettle.blend", kind: "object", group: "Objects" }, { v: 1, name: "Market", file: "Market.blend", kind: "environment", group: null }], invalid: [{ v: 1, name: "", file: "x.blend", kind: "object", group: null }, { v: 1, name: "Kettle", file: "k.blend", kind: "prop", group: null }] },
    AssetCreateResponse: { valid: [{ v: 1, part: partSummary }], invalid: [{ v: 1 }] },
    PartSavedRequest: {
      valid: [{ v: 1, changed: true, spool_path: "/spool/x.glb", manifest, source_file: "face.blend" }, { v: 1, changed: false, spool_path: null, manifest: null, source_file: "face.blend", opened_at: at }],
      invalid: [{ v: 1, changed: true }],
    },
    PartSavedResponse: { valid: [{ v: 1, version_id: id, mirror: "pending" }], invalid: [{ v: 1, version_id: id, mirror: "ok" }] },
    PublishRequest: { valid: [{ v: 1, check_results: [checkResult], ready: true, note: "Stall base done, roof rough" }, { v: 1, check_results: [], ready: false, note: "Roof reworked", note_engineering: "Pivot at the base, 2 UV sets." }], invalid: [{ v: 1, ready: true }, { v: 1, check_results: [], ready: true }, { v: 1, check_results: [], ready: true, note: "" }] },
    PublishResponse: { valid: [{ v: 1, published: false, version_id: id, state: "draft", blocked_by: [checkResult], render_needed: false }], invalid: [{ v: 1, published: true }] },
    ChecksRequest: { valid: [{ v: 1, results: [] }], invalid: [{ v: 1, results: [{}] }] },
    ChecksResponse: { valid: [{ v: 1, version_id: id, recorded: 3 }], invalid: [{ v: 1, version_id: id, recorded: -1 }] },
    CommentsResponse: { valid: [{ v: 1, comments: [comment] }], invalid: [{ v: 1, comments: comment }] },
    CommentCreateRequest: { valid: [{ v: 1, point: [0, 0, 0], normal: [0, 0, 1], body: "Hi" }, { v: 1, point: [0, 0, 0], normal: [0, 0, 1], body: "Look at the hands", kind: "take_a_look" }], invalid: [{ v: 1, point: [0, 0, 0], normal: [0, 0, 1], body: "" }] },
    CommentCreateResponse: { valid: [{ v: 1, comment }], invalid: [{ v: 1 }] },
    ReviewRequest: { valid: [{ v: 1, score: 5, decision: "approve", note: "" }], invalid: [{ v: 1, score: 6, decision: "approve", note: "" }] },
    ReviewResponse: { valid: [{ v: 1, review_id: id, state: "approved" }], invalid: [{ v: 1, state: "approved" }] },
    PresenceRequest: { valid: [{ v: 1, part_id: null }, { v: 1, part_id: id }, { v: 1, part_id: id, file: "Objects/Kettle/Kettle.blend" }], invalid: [{ v: 1 }, { v: 1, part_id: id, file: 3 }] },
    PresenceResponse: { valid: [{ v: 1, online: [presenceEntry] }], invalid: [{ v: 1, online: null }] },
    AgentEvent: { valid: [events.LockGranted, events.MirrorResult, events.CommentCreated], invalid: [events.GateOpened] },
    MirrorRetryResponse: { valid: [{ v: 1, part_id: id, queued: true }], invalid: [{ v: 1, part_id: id }] },
    MirrorState: { valid: [mirrorState, { ...mirrorState, status: "pending", version_id: null, at: null, mirror_ms: null }], invalid: [{ ...mirrorState, failures: -1 }] },
    MirrorStateResponse: { valid: [{ v: 1, mirror: mirrorState }], invalid: [{ v: 1 }] },
    MirrorOnSaveRequest: { valid: [{ v: 1, on_save: false }], invalid: [{ v: 1 }] },
    MirrorPauseRequest: { valid: [{ v: 1, paused: true }], invalid: [{ v: 1, paused: "yes" }] },
    MirrorPauseResponse: { valid: [{ v: 1, paused: true }], invalid: [{ v: 1 }] },
    RenderRequest: { valid: [{ v: 1, path: "/spool/x.png" }], invalid: [{ v: 1, path: "" }] },
    RenderResponse: { valid: [{ v: 1, version_id: id, stored: true }], invalid: [{ v: 1, stored: true }] },
    ExportRequest: { valid: [{ v: 1, path: "/spool/x.fbx" }], invalid: [{ v: 1, path: "" }] },
    ExportResponse: { valid: [{ v: 1, version_id: id, stored: true }], invalid: [{ v: 1, stored: true }] },
  },
};
