import * as path from "path";
import * as fs from "fs";
import { spawn } from "child_process";
import {
  ReplayData,
  ActorMeta,
  ActorKind,
  UpdatedActor,
  UpdatedActorWithFrame,
  NetworkFrame,
  FrameState,
  ActorState,
} from "./types";

export class ReplayParseError extends Error {
  constructor(message: string, public readonly rawPreview?: string) {
    super(message);
    this.name = "ReplayParseError";
  }
}

export class Replay {
  private constructor(
    public readonly replay: ReplayData,
    private readonly frameStates: FrameState[]
  ) {}

  // ---------- Static factory ----------
  static async load(replayPathInput: string): Promise<Replay> {
    const json = await Replay.invokeBinary(replayPathInput);
    const parser = new Replay(json, []);
    parser.buildFrameStates();
    return parser;
  }

  // Invoke external rrrocket binary and parse JSON
  private static invokeBinary(replayPathInput: string): Promise<ReplayData> {
    return new Promise<ReplayData>((resolve, reject) => {
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

      const args = [replayPath, "-n"];
      const child = spawn(exePath, args, { shell: false, cwd: projectRoot });
      let stdoutBuffer = "";
      let stderrBuffer = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (c: string) => (stdoutBuffer += c));
      child.stderr.on("data", (c: string) => (stderrBuffer += c));
      child.on("error", (err: Error) => {
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
      const finalize = (code: number | null) => {
        if (stderrBuffer) {
          console.error("Process stderr:", stderrBuffer.trim().slice(0, 2000));
        }
        if (code !== 0) {
          reject(new Error(`rrrocket exited with code ${code}`));
          return;
        }
        try {
          const parsed: ReplayData = JSON.parse(stdoutBuffer.trim());
          resolve(parsed);
        } catch (e) {
          reject(
            new ReplayParseError(
              "Failed to parse stdout as JSON",
              stdoutBuffer.slice(0, 500)
            )
          );
        }
      };
    });
  }

  // ---------- Frame state building ----------
  private buildFrameStates(): void {
    if (!this.replay.network_frames?.frames) return;

    const frames = this.replay.network_frames.frames;
    const objectNames = (this.replay as any).objects as string[] | undefined;
    const nameStrings = (this.replay as any).names as string[] | undefined;

    // Start with empty state
    let currentState: Map<number, ActorState> = new Map();

    for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
      const frame = frames[frameIndex];
      if (!frame) continue;

      // Copy previous state
      const newState = new Map(currentState);

      // Apply new actors
      for (const newActor of frame.new_actors || []) {
        const objectName = objectNames?.[newActor.object_id] || "";
        const instanceName = nameStrings?.[newActor.name_id] || "";
        const kind = this.classify(objectName, instanceName);

        const actorState: ActorState = {
          actorId: newActor.actor_id,
          objectId: newActor.object_id,
          nameId: newActor.name_id,
          objectName,
          instanceName,
          kind,
          attributes: new Map(),
          position: null,
          rotation: null,
          eulerRotation: newActor.initial_trajectory?.rotation || null,
        };

        // Set initial attributes if any
        if (newActor.initial_trajectory?.location) {
          actorState.position = newActor.initial_trajectory.location;
          actorState.attributes.set("InitialTrajectory", {
            location: newActor.initial_trajectory.location,
            rotation: newActor.initial_trajectory.rotation,
          });
        }

        newState.set(newActor.actor_id, actorState);
      }

      // Apply updates
      for (const update of frame.updated_actors || []) {
        const actorState = newState.get(update.actor_id);
        if (actorState) {
          // Update attributes
          const attrKeys = Object.keys(update.attribute);
          if (attrKeys.length > 0) {
            const attrKey = attrKeys[0] as string;
            const attrValue = (update.attribute as any)[attrKey];
            if (attrValue !== undefined) {
              actorState.attributes.set(attrKey, attrValue);

              // Update position/rotation if RigidBody
              if (attrKey === "RigidBody") {
                const rigidBody = attrValue;
                actorState.position = rigidBody.location;
                actorState.rotation = rigidBody.rotation;
                actorState.linearVelocity = rigidBody.linear_velocity;
                actorState.angularVelocity = rigidBody.angular_velocity;
              }
            }
          }
        }
      }

      // Apply deletions
      for (const deletedId of frame.deleted_actors || []) {
        newState.delete(deletedId);
      }

      // Store the frame state
      const frameState: FrameState = {
        frameIndex,
        time: frame.time,
        delta: frame.delta,
        actors: new Map(newState), // copy
      };

      this.frameStates.push(frameState);

      // Update current state for next frame
      currentState = newState;
    }
  }

  private classify(objectName: string, instanceName: string): ActorKind {
    if (instanceName.includes("Ball_TA")) return "Ball";
    if (instanceName.includes("VehiclePickup_Boost_TA")) return "BoostPickup";
    if (objectName.includes(".PRI_TA") || instanceName.startsWith("PRI_TA_"))
      return "PlayerPRI";
    if (instanceName.includes("GoalVolume_TA")) return "GoalVolume";
    if (instanceName.includes("CameraSettingsActor_TA")) return "Camera";
    if (instanceName.includes("CarComponent_")) return "CarComponent";
    if (
      instanceName.includes("Car_TA") &&
      !instanceName.includes("CarComponent_")
    )
      return "Car";
    return "Other";
  }

  // ---------- Public helpers ----------
  getReplay(): ReplayData {
    return this.replay;
  }
  iterateFrames(): NetworkFrame[] {
    return this.replay.network_frames?.frames || [];
  }
  getFrame(index: number): NetworkFrame | undefined {
    return this.replay.network_frames?.frames?.[index];
  }
  getFrameStates(): FrameState[] {
    return this.frameStates;
  }
  getFrameState(frameIndex: number): FrameState | undefined {
    return this.frameStates[frameIndex];
  }
  getActorsAtFrame(frameIndex: number): Map<number, ActorState> | undefined {
    return this.frameStates[frameIndex]?.actors;
  }
  getCarsAtFrame(frameIndex: number): ActorState[] {
    const actors = this.getActorsAtFrame(frameIndex);
    if (!actors) return [];
    return Array.from(actors.values()).filter((a) => a.kind === "Car");
  }
  getBallsAtFrame(frameIndex: number): ActorState[] {
    const actors = this.getActorsAtFrame(frameIndex);
    if (!actors) return [];
    return Array.from(actors.values()).filter((a) => a.kind === "Ball");
  }
  getBoostPickupsAtFrame(frameIndex: number): ActorState[] {
    const actors = this.getActorsAtFrame(frameIndex);
    if (!actors) return [];
    return Array.from(actors.values()).filter((a) => a.kind === "BoostPickup");
  }

  // ---------- Player position helpers ----------
  getPlayerPRIsAtFrame(frameIndex: number): ActorState[] {
    const actors = this.getActorsAtFrame(frameIndex);
    if (!actors) return [];
    return Array.from(actors.values()).filter((a) => a.kind === "PlayerPRI");
  }

  getPlayerPositionsAtFrame(
    frameIndex: number
  ): Array<{ name: string; position: any; actor: ActorState }> {
    const priActors = this.getPlayerPRIsAtFrame(frameIndex);
    const playerStats = this.getPlayerStats();

    return priActors
      .map((actor) => {
        // Try to match PRI to player by name or other heuristics
        // For now, return all PRIs with their positions
        return {
          name: actor.instanceName, // This might contain player name info
          position: actor.position,
          actor,
        };
      })
      .filter((p) => p.position); // Only include actors with positions
  }

  // ---------- Player helpers ----------
  getPlayerStats() {
    return this.replay.properties?.PlayerStats || [];
  }

  getPlayerNames(): string[] {
    return this.getPlayerStats().map((p) => p.Name);
  }

  getPlayerByName(name: string) {
    return this.getPlayerStats().find((p) => p.Name === name);
  }

  getPlayersByTeam(team: number) {
    return this.getPlayerStats().filter((p) => p.Team === team);
  }

  getTeamPlayers(team: number): string[] {
    return this.getPlayersByTeam(team).map((p) => p.Name);
  }

  getPlayerScore(name: string): number | undefined {
    const player = this.getPlayerByName(name);
    return player?.Score;
  }

  getPlayerGoals(name: string): number | undefined {
    const player = this.getPlayerByName(name);
    return player?.Goals;
  }

  getPlayerAssists(name: string): number | undefined {
    const player = this.getPlayerByName(name);
    return player?.Assists;
  }

  getPlayerSaves(name: string): number | undefined {
    const player = this.getPlayerByName(name);
    return player?.Saves;
  }

  isBot(name: string): boolean | undefined {
    const player = this.getPlayerByName(name);
    return player?.bBot;
  }

  getPlayerPlatform(name: string) {
    const player = this.getPlayerByName(name);
    return player?.Platform;
  }

  getPlayerOnlineId(name: string): string | undefined {
    const player = this.getPlayerByName(name);
    return player?.OnlineID;
  }

  getPlayerShots(name: string): number | undefined {
    const player = this.getPlayerByName(name);
    return player?.Shots;
  }

  // ---------- Team helpers ----------
  getTeamSize(): number | undefined {
    return this.replay.properties?.TeamSize;
  }

  getAllTeamPlayers(): { team0: string[]; team1: string[] } {
    return {
      team0: this.getTeamPlayers(0),
      team1: this.getTeamPlayers(1),
    };
  }

  // ---------- Match info helpers ----------
  getMatchType(): string | undefined {
    return this.replay.properties?.MatchType;
  }

  getMapName(): string | undefined {
    return this.replay.properties?.MapName;
  }

  getTeamScores(): { team0: number; team1: number } | undefined {
    if (!this.replay.properties) return undefined;
    return {
      team0: this.replay.properties.Team1Score || 0, // Note: might be swapped
      team1: this.replay.properties.Team1Score || 0,
    };
  }

  getWinningTeam(): number | undefined {
    return this.replay.properties?.WinningTeam;
  }

  getTotalSecondsPlayed(): number | undefined {
    return this.replay.properties?.TotalSecondsPlayed;
  }
}

// Backwards-compatible simple function
export default async function parseReplay(
  replayPathInput: string
): Promise<ReplayData> {
  const parser = await Replay.load(replayPathInput);
  return parser.getReplay();
}
