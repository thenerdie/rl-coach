import { writeFile } from "fs/promises";
import * as path from "path";
import { Replay } from "./parser";

const REPLAY_PATH = path.join("test", "replays", "test.replay");

async function main(): Promise<void> {
  const replay = await Replay.load(REPLAY_PATH);

  console.log("Total frames:", replay.getFrameStates().length);
  console.log("Player names:", replay.getPlayerNames());
  console.log("Match type:", replay.getMatchType());
  console.log("Map:", replay.getMapName());
  console.log("Team players:", replay.getAllTeamPlayers());

  // Show positions of cars and balls at frame 100 (if exists)
  const FRAME = 1407;

  const frame100 = replay.getFrameState(FRAME);
  if (frame100) {
    console.log(`\nFrame 1407 (time: ${frame100.time}):`);
    console.log(`Cars: ${replay.getCarsAtFrame(FRAME).length}`);
    console.log(`Balls: ${replay.getBallsAtFrame(FRAME).length}`);
    console.log(
      `Boost pickups: ${replay.getBoostPickupsAtFrame(FRAME).length}`
    );

    // Show first car position
    const cars = replay.getCarsAtFrame(FRAME);
    if (cars.length > 0) {
      const car = cars[0];
      console.log(`First car position: ${JSON.stringify(car?.position)}`);
    }

    // Show ball position
    const balls = replay.getBallsAtFrame(FRAME);
    if (balls.length > 0) {
      const ball = balls[0];
      console.log(`Ball position: ${JSON.stringify(ball?.position)}`);
    }
  }

  // await writeFile("output.json", JSON.stringify(replay, null, 2));
}

// Run only if executed directly (not imported)
if (require.main === module) {
  void main();
}
