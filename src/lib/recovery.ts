import { ErrorCode } from './error-codes.js';

const RECOVERY_HINTS: Record<ErrorCode, string> = {
  [ErrorCode.SESSION_NOT_FOUND]:     "Run `handoff init` to start a new session.",
  [ErrorCode.SESSION_CORRUPT]:       "Delete .handoff/session.json and run `handoff init`.",
  [ErrorCode.SESSION_EXPIRED]:       "Run `handoff init --force` to start a fresh session.",
  [ErrorCode.FILE_NOT_FOUND]:        "Check that the file path is correct and the file exists.",
  [ErrorCode.FILE_READ_ERROR]:       "Check file permissions.",
  [ErrorCode.FILE_WRITE_ERROR]:      "Check directory permissions and available disk space.",
  [ErrorCode.PATH_TRAVERSAL]:        "File paths must be within the working directory.",
  [ErrorCode.FILE_TOO_LARGE]:        "File exceeds the size limit. Exclude it via config.",
  [ErrorCode.CONFIG_INVALID]:        "Check .handoff/config.json syntax.",
  [ErrorCode.CONFIG_MISSING_FIELD]:  "Add the missing field to your config file.",
  [ErrorCode.TMUX_NOT_AVAILABLE]:    "Install tmux: `brew install tmux` (macOS) or `apt install tmux` (Linux/WSL).",
  [ErrorCode.TMUX_SESSION_NOT_FOUND]:"Run `handoff start` to create a workspace.",
  [ErrorCode.TMUX_PANE_NOT_FOUND]:   "Run `handoff bridge list` to see available panes.",
  [ErrorCode.TMUX_COMMAND_FAILED]:   "Check tmux status with `handoff bridge doctor`.",
  [ErrorCode.COMPRESSION_FAILED]:    "Try again with a larger --token-budget or without --compress.",
  [ErrorCode.VALIDATION_FAILED]:     "Run `handoff validate` to see specific errors.",
  [ErrorCode.INVALID_FORMAT]:        "Valid formats: markdown, json, claude, agents.",
  [ErrorCode.INVALID_STATUS]:        "Valid statuses: accepted, proposed, superseded, deprecated.",
  [ErrorCode.AGENT_NOT_FOUND]:       "Known agents: claude, codex, gemini, aider, cursor, copilot.",
  [ErrorCode.AGENT_STATE_CORRUPT]:   "Delete .handoff/agent-state.json and re-export.",
  [ErrorCode.PATH_OUTSIDE_WORKSPACE]:"File path must be within the project working directory.",
  [ErrorCode.INVALID_AGENT_NAME]:    "Agent names must be alphanumeric with dashes/underscores (1-64 chars).",
  [ErrorCode.SECRETS_DETECTED]:      "Remove or redact secrets before including in handoff output.",
  [ErrorCode.CONTENT_TOO_LARGE]:     "Content exceeds maximum allowed size.",
};

export function getRecoveryHint(code: ErrorCode): string {
  return RECOVERY_HINTS[code] ?? 'Check the error message for details.';
}
