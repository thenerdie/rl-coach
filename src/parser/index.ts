import * as path from "path";
import * as fs from "fs";
import { spawn } from "child_process";
import { ReplayData } from "./types";

export class ReplayParseError extends Error {
  constructor(message: string, public readonly rawPreview?: string) {
    super(message);
    this.name = "ReplayParseError";
  }
}

export default function parseReplay(
  replayPathInput: string = path.join("test", "replays", "test.replay")
): Promise<ReplayData> {
  return new Promise<ReplayData>((resolve, reject) => {
    // Assume compiled file lives in dist/src/parser or run via ts-node from src/parser.
    // Project root two levels up from this file (../..)
    const projectRoot = path.resolve(__dirname, "..", "..");

    const exePath = path.join(projectRoot, "vendor", "rrrocket.exe");
    const replayPath = path.isAbsolute(replayPathInput)
      ? replayPathInput
      : path.join(projectRoot, replayPathInput);

    if (!fs.existsSync(exePath)) {
      reject(new Error(`Replay parser executable not found at ${exePath}`));
      return;
    }
    if (!fs.existsSync(replayPath)) {
      reject(new Error(`Replay file not found at ${replayPath}`));
      return;
    }

    const args = [replayPath, "-p", "-n"]; // -p prints JSON, -n additional flag retained

    // Try without shell first; Windows should execute .exe directly. Fallback to shell if ENOENT.
    const child = spawn(exePath, args, { shell: false, cwd: projectRoot });

    let stdoutBuffer = "";
    let stderrBuffer = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdoutBuffer += chunk;
    });

    child.stderr.on("data", (chunk: string) => {
      stderrBuffer += chunk;
    });

    child.on("error", (err: Error) => {
      // Retry with shell:true once if ENOENT or spawn issue (Windows path resolution edge case)
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        const retry = spawn(exePath, args, { shell: true });
        retry.stdout.setEncoding("utf8");
        retry.stderr.setEncoding("utf8");
        retry.stdout.on("data", (c: string) => (stdoutBuffer += c));
        retry.stderr.on("data", (c: string) => (stderrBuffer += c));
        retry.on("close", (code: number) => finalize(code));
        retry.on("error", (e: Error) => reject(e));
      } else {
        reject(err);
      }
    });

    child.on("close", (code: number | null) => finalize(code));

    function finalize(code: number | null) {
      if (stderrBuffer) {
        // rrrocket might write non-fatal logs to stderr; log but continue
        console.error("Process stderr:", stderrBuffer.trim().slice(0, 2000));
      }
      if (code !== 0) {
        reject(new Error(`rrrocket exited with code ${code}`));
        return;
      }
      const trimmed = stdoutBuffer.trim();
      try {
        const parsedOutput: ReplayData = JSON.parse(trimmed);
        resolve(parsedOutput);
      } catch (e) {
        reject(
          new ReplayParseError(
            "Failed to parse stdout as JSON",
            trimmed.slice(0, 500)
          )
        );
      }
    }
  });
}
