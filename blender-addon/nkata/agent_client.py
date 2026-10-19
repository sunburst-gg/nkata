"""HTTP client for the agent local API on localhost:7420. Standard library only, so the
extension ships with no wheels. Types: shared agent.schema.json."""

from __future__ import annotations

import json
import threading
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from typing import Any

from . import nkata_shared as shared
from .log import log
from .mapping import agent_url


class AgentError(Exception):
    """The agent answered with an error body, or did not answer."""

    def __init__(self, code: str, message: str, status: int = 0) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message
        self.status = status


class AgentClient:
    def __init__(self, token: str, base: str | None = None, timeout: float = 10.0) -> None:
        self.token = token
        self.base = (base or agent_url()).rstrip("/")
        self.timeout = timeout

    def _call(self, method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method)
        req.add_header("Authorization", f"Bearer {self.token}")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                return json.loads(res.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            text = e.read().decode("utf-8", "replace")
            try:
                parsed = json.loads(text)
            except ValueError:
                raise AgentError("http", f"{e.code}: {text[:200]}", e.code) from e
            # A held lock answers 409 with the holder, not an error. The caller reads granted.
            if e.code == 409 and isinstance(parsed, dict) and "granted" in parsed:
                return parsed
            try:
                err = shared.validate_ErrorBody(parsed)
            except shared.ValidationError:
                raise AgentError("http", f"{e.code}: {text[:200]}", e.code) from e
            raise AgentError(err.error.code, err.error.message, e.code) from e
        except urllib.error.URLError as e:
            raise AgentError("offline", f"agent not reachable at {self.base}: {e.reason}") from e

    def me(self) -> Any:
        return shared.validate_MeResponse(self._call("GET", "/me"))

    def parts(self, rel_file: str | None = None) -> list[dict[str, Any]]:
        """The project's parts, or only those that map to one file."""
        query = "?" + urllib.parse.urlencode({"file": rel_file}) if rel_file is not None else ""
        res = shared.validate_PartsResponse(self._call("GET", "/parts" + query))
        return [p.to_dict() for p in res.parts]

    def open_part(self, part_id: str) -> Any:
        return shared.validate_PartOpenResponse(self._call("POST", f"/parts/{part_id}/open"))

    def close_part(self, part_id: str) -> Any:
        return shared.validate_PartCloseResponse(self._call("POST", f"/parts/{part_id}/close"))

    def saved(self, part_id: str, changed: bool, spool_path: str | None, manifest: dict[str, Any] | None, source_file: str, opened_at: str | None = None) -> Any:
        body = shared.validate_PartSavedRequest({"v": 1, "changed": changed, "spool_path": spool_path, "manifest": manifest, "source_file": source_file, "opened_at": opened_at}).to_dict()
        return shared.validate_PartSavedResponse(self._call("POST", f"/parts/{part_id}/saved", body))

    def publish(self, part_id: str, check_results: list[dict[str, Any]], ready: bool, note: str, note_engineering: str = "") -> Any:
        body = {"v": 1, "check_results": check_results, "ready": ready, "note": note}
        if note_engineering:
            body["note_engineering"] = note_engineering
        body = shared.validate_PublishRequest(body).to_dict()
        return shared.validate_PublishResponse(self._call("POST", f"/parts/{part_id}/publish", body))

    def record_checks(self, part_id: str, results: list[dict[str, Any]]) -> Any:
        body = shared.validate_ChecksRequest({"v": 1, "results": results}).to_dict()
        return shared.validate_ChecksResponse(self._call("POST", f"/parts/{part_id}/checks", body))

    def comments(self, part_id: str) -> Any:
        return shared.validate_CommentsResponse(self._call("GET", f"/parts/{part_id}/comments"))

    def create_comment(self, part_id: str, point: tuple[float, ...], normal: tuple[float, ...], body_text: str) -> Any:
        body = shared.validate_CommentCreateRequest({"v": 1, "point": list(point), "normal": list(normal), "body": body_text}).to_dict()
        return shared.validate_CommentCreateResponse(self._call("POST", f"/parts/{part_id}/comments", body)).comment

    def settle_comment(self, part_id: str, comment_id: str, done: bool) -> Any:
        """Mark a pin done, or reopen it (v8 step 14). The reply is the comment as it now stands."""
        verb = "resolve" if done else "reopen"
        return shared.validate_CommentCreateResponse(self._call("POST", f"/parts/{part_id}/comments/{comment_id}/{verb}", {})).comment

    def review(self, part_id: str, score: int, decision: str, note: str) -> Any:
        body = shared.validate_ReviewRequest({"v": 1, "score": score, "decision": decision, "note": note}).to_dict()
        return shared.validate_ReviewResponse(self._call("POST", f"/parts/{part_id}/review", body))

    def presence(self, part_id: str | None, file: str | None = None) -> Any:
        """The heartbeat: where this person is, and which .blend is open (v8)."""
        body: dict[str, Any] = {"v": 1, "part_id": part_id}
        if file:
            body["file"] = file
        body = shared.validate_PresenceRequest(body).to_dict()
        return shared.validate_PresenceResponse(self._call("POST", "/presence", body))

    def create_asset(self, name: str, file: str, kind: str, group: str | None) -> dict[str, Any]:
        """v8: a saved .blend that maps to no asset becomes one, with one part this person owns."""
        body = shared.validate_AssetCreateRequest({"v": 1, "name": name, "file": file, "kind": kind, "group": group}).to_dict()
        return shared.validate_AssetCreateResponse(self._call("POST", "/assets", body)).part.to_dict()

    def mirror_state(self, part_id: str) -> Any:
        return shared.validate_MirrorStateResponse(self._call("GET", f"/parts/{part_id}/mirror")).mirror

    def retry_mirror(self, part_id: str) -> Any:
        return shared.validate_MirrorRetryResponse(self._call("POST", f"/parts/{part_id}/mirror/retry"))

    def mirror_on_save(self, part_id: str, on_save: bool) -> Any:
        """Off: saves still version, the newest mirror waits until it is on again."""
        body = shared.validate_MirrorOnSaveRequest({"v": 1, "on_save": on_save}).to_dict()
        return shared.validate_MirrorStateResponse(self._call("POST", f"/parts/{part_id}/mirror/on-save", body)).mirror

    def export_fbx(self, part_id: str, path: str) -> Any:
        """The FBX exported on Publish, stored on the version for the engineer."""
        body = shared.validate_ExportRequest({"v": 1, "path": path}).to_dict()
        return shared.validate_ExportResponse(self._call("POST", f"/parts/{part_id}/export", body))

    def render(self, part_id: str, path: str) -> Any:
        """Blender's render of the current version, when UE5 gave no capture on Mark Ready."""
        body = shared.validate_RenderRequest({"v": 1, "path": path}).to_dict()
        return shared.validate_RenderResponse(self._call("POST", f"/parts/{part_id}/render", body))


def parse_sse(stream: Any, on_event: Callable[[dict[str, Any]], None]) -> None:
    """Reads text/event-stream frames from a line iterator and calls on_event with each data JSON."""
    data_lines: list[str] = []
    for raw in stream:
        line = raw.decode("utf-8", "replace") if isinstance(raw, bytes) else raw
        line = line.rstrip("\r\n")
        if line == "":
            if data_lines:
                try:
                    on_event(json.loads("\n".join(data_lines)))
                except ValueError as e:
                    log("sse.bad_frame", error=str(e))
                data_lines = []
            continue
        if line.startswith("data:"):
            data_lines.append(line[5:].strip())


class EventListener(threading.Thread):
    """Background thread on GET /events. Reconnects every 2 s while the agent is away."""

    def __init__(self, client: AgentClient, on_event: Callable[[dict[str, Any]], None]) -> None:
        super().__init__(name="nkata-events", daemon=True)
        self.client = client
        self.on_event = on_event
        self._stop = threading.Event()

    def stop(self) -> None:
        self._stop.set()

    def run(self) -> None:
        while not self._stop.is_set():
            req = urllib.request.Request(self.client.base + "/events")
            req.add_header("Authorization", f"Bearer {self.client.token}")
            try:
                with urllib.request.urlopen(req, timeout=60) as res:
                    parse_sse(res, self.on_event)
            except (urllib.error.URLError, TimeoutError, OSError) as e:
                log("sse.disconnected", error=str(e))
            self._stop.wait(2.0)
