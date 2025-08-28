import * as path from "path";
import { spawn } from "child_process";

interface NetworkFrames {
  frames: unknown[]; // Could be refined if structure known
}

interface ReplayData {
  network_frames?: NetworkFrames;
  [key: string]: unknown; // Fallback for other properties
}

export class ReplayParseError extends Error {
  constructor(message: string, public readonly rawPreview?: string) {
    super(message);
    this.name = "ReplayParseError";
  }
}

export default function parseReplay(
  replayRelativePath: string = path.join("test", "replays", "test.replay")
): Promise<ReplayData> {
  return new Promise<ReplayData>((resolve, reject) => {
    const exePath = path.join(__dirname, "vendor", "rrrocket.exe");
    const args = [replayRelativePath, "-p", "-n"]; // -p prints JSON, -n omits network cache (?) keep flags

    // Try without shell first; Windows should execute .exe directly. Fallback to shell if it fails to spawn.
    const child = spawn(exePath, args, { shell: false });

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
