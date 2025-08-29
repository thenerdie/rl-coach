import { writeFile } from "fs/promises";
import parseReplay, { ReplayParseError } from "./parser";

async function main(): Promise<void> {
  const parsedOutput = await parseReplay();

  console.log(parsedOutput.properties?.BuildID);

  await writeFile("output.json", JSON.stringify(parsedOutput, null, 2));
}

// Run only if executed directly (not imported)
if (require.main === module) {
  void main();
}
