// Typed subset of the rrrocket JSON output we care about right now.
// Extend incrementally as more fields are needed.

// --- Properties Section ---
export interface GoalEvent {
  frame: number;
  PlayerName: string;
  PlayerTeam: number; // 0 or 1
}

export interface HighlightEvent {
  frame: number;
  CarName: string;
  BallName: string;
  GoalActorName: string; // "None" or GoalVolume name
}

export interface OnlinePlatformValue {
  kind: "OnlinePlatform";
  value: string; // e.g. "OnlinePlatform_Steam", "OnlinePlatform_Epic"
}

export interface UniqueNetIdStruct<
  TName extends string = string,
  F = Record<string, unknown>
> {
  name: TName; // e.g. "UniqueNetId", "SceNpId", etc.
  fields: F;
}

// Specific nested shape for PlayerID we have observed.
export interface PlayerIDFields {
  Uid: string; // numeric ID or "0"
  NpId: UniqueNetIdStruct<
    "SceNpId",
    {
      Handle: UniqueNetIdStruct<"SceNpOnlineId", { Data: string }>;
      Opt: string;
      Reserved: string;
    }
  >;
  EpicAccountId: string; // may be empty string
  Platform: OnlinePlatformValue;
  [key: string]: unknown; // forward compatibility
}

export interface PlayerStat {
  PlayerID: UniqueNetIdStruct<"UniqueNetId", PlayerIDFields>;
  Name: string;
  Platform: OnlinePlatformValue;
  OnlineID: string; // stringified id
  Team: number; // 0 or 1
  Score: number;
  Goals: number;
  Assists: number;
  Saves: number;
  Shots: number;
  bBot: boolean;
  [key: string]: unknown; // allow extra stats
}

export interface ReplayPropertiesSubset {
  TeamSize: number;
  UnfairTeamSize: number;
  bForfeit: boolean;
  PrimaryPlayerTeam: number;
  Team1Score: number;
  TotalSecondsPlayed: number;
  MatchStartEpoch: string;
  WinningTeam: number;
  Goals: GoalEvent[];
  HighLights: HighlightEvent[];
  PlayerStats: PlayerStat[];
  ReplayVersion: number;
  ReplayLastSaveVersion: number;
  GameVersion: number;
  BuildID: number;
  Changelist: number;
  BuildVersion: string;
  ReserveMegabytes: number;
  RecordFPS: number;
  KeyframeDelay: number;
  MaxChannels: number;
  MaxReplaySizeMB: number;
  Id: string;
  MatchGUID: string;
  MapName: string;
  Date: string; // "YYYY-MM-DD HH-mm-ss"
  NumFrames: number;
  MatchType: string; // e.g. "Online"
  PlayerName: string;
  [key: string]: unknown; // tolerate additional properties
}

// --- Network Frames subset ---
export interface Vector3Nullable {
  x: number | null;
  y: number | null;
  z: number | null;
}

export interface RotatorNullable {
  yaw: number | null;
  pitch: number | null;
  roll: number | null;
}

export interface Trajectory {
  location: Vector3Nullable | null;
  rotation: RotatorNullable | null;
}

export interface NewActor {
  actor_id: number;
  name_id: number;
  object_id: number;
  initial_trajectory: Trajectory;
  [key: string]: unknown; // extra future keys
}

// Attribute value variants observed so far. Extend as needed.
export interface ActiveActorAttribute {
  ActiveActor: { active: boolean; actor: number };
}
export interface ReplicatedBoostAttribute {
  ReplicatedBoost: {
    grant_count: number;
    boost_amount: number;
    unused1: number;
    unused2: number;
  };
}
export interface RigidBodyAttribute {
  RigidBody: {
    sleeping: boolean;
    location: { x: number; y: number; z: number } | null;
    rotation: { x: number; y: number; z: number; w: number } | null;
    linear_velocity: unknown;
    angular_velocity: unknown;
  };
}
export interface IntAttribute {
  Int: number;
}
export interface Int64Attribute {
  Int64: string;
}
export interface BooleanAttribute {
  Boolean: boolean;
}
export interface ByteAttribute {
  Byte: number;
}
export interface StringAttribute {
  String: string;
}
export interface CamSettingsAttribute {
  CamSettings: {
    fov: number;
    height: number;
    angle: number;
    distance: number;
    stiffness: number;
    swivel: number;
    transition: number;
  };
}

export type ActorAttribute =
  | ActiveActorAttribute
  | ReplicatedBoostAttribute
  | RigidBodyAttribute
  | IntAttribute
  | Int64Attribute
  | BooleanAttribute
  | ByteAttribute
  | StringAttribute
  | CamSettingsAttribute
  | Record<string, unknown>; // fallback for untyped attributes

export interface UpdatedActor {
  actor_id: number;
  stream_id: number;
  object_id: number;
  attribute: ActorAttribute;
  [key: string]: unknown;
}

export type DeletedActorId = number; // simple list of actor ids

export interface NetworkFrame {
  time: number;
  delta: number;
  new_actors?: NewActor[];
  updated_actors?: UpdatedActor[];
  deleted_actors?: DeletedActorId[];
  // other arrays like updated_actors / deleted_actors could be added here later
  [key: string]: unknown;
}

export interface NetworkFrames {
  frames: NetworkFrame[];
  [key: string]: unknown;
}

// --- Root Replay Data subset ---
export interface ReplayData {
  header_size?: number;
  header_crc?: number;
  major_version?: number;
  minor_version?: number;
  net_version?: number;
  game_type?: string;
  properties?: ReplayPropertiesSubset;
  content_size?: number;
  content_crc?: number;
  network_frames?: NetworkFrames;
  [key: string]: unknown;
}
