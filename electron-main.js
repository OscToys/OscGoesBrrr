import { app, dialog } from "electron";

let fatalExitStarted = false;

function toErrorMessage(error) {
  if (error && typeof error === "object") {
    if (typeof error.stack === "string" && error.stack.length > 0) return error.stack;
    if (typeof error.message === "string" && error.message.length > 0) return error.message;
  }
  return String(error ?? "Unknown error");
}

function fatalExit(title, error) {
  if (fatalExitStarted) {
    process.exit(1);
    return;
  }
  fatalExitStarted = true;

  try {
    dialog.showErrorBox(title, toErrorMessage(error));
  } catch {
    // Keep going; process still needs to exit.
  }

  try {
    app.quit();
  } catch {}
  try {
    app.exit(1);
  } catch {}
  process.exit(1);
}

process.on("uncaughtException", (error) => {
  fatalExit("Fatal Error", error);
});

process.on("unhandledRejection", (error) => {
  fatalExit("Unhandled Rejection", error);
});

try {
  await import("./app/main.bundle.js");
} catch (error) {
  fatalExit("App threw an error during load", error);
}
