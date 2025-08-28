import parseReplay, { ReplayParseError } from "./parser";

async function main(): Promise<void> {
  try {
    const parsedOutput = await parseReplay();
    const firstFrame = parsedOutput.network_frames?.frames?.[0];
    console.log(JSON.stringify(firstFrame, null, 2));
  } catch (error) {
    if (error instanceof ReplayParseError) {
      console.error(`${error.name}: ${error.message}`);
      if (error.rawPreview) console.error("Raw preview:\n" + error.rawPreview);
    } else if (error instanceof Error) {
      console.error("Error in main:", error.message);
    } else {
      console.error("Unknown error", error);
    }
    process.exitCode = 1;
  }
}

// Run only if executed directly (not imported)
if (require.main === module) {
  void main();
}
