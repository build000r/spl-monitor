import fs from "fs";
import path from "path";
import util from "util";
// Function to append log messages to the log file
function logToFile(message: string, logFilePath: string): void {
  try {
    // Append the message to the log file
    fs.appendFileSync(logFilePath, message + "\n", "utf8");
  } catch (err) {
    console.error("Error writing to log file:", err);
  }
}

// Custom logging function
function customLog(logFilePath: string, ...args: any[]): void {
  // Ensure the log directory exists
  try {
    const logDir: string = path.dirname(logFilePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Convert log arguments to a string
    const message: string = util.format(...args);
    // Log to console
    console.log(message);
    // Log to file
    logToFile(message, logFilePath);
  } catch (error) {
    console.error("Error writing to log file:", error);
  }
}

// Example usage:
const appLogFilePath: string = path.join(__dirname, "logs", "app.log");
const errorLogFilePath: string = path.join(__dirname, "logs", "error.log");
const finishedLogFilePath: string = path.join(__dirname, "logs", "finish.log");

export { customLog, appLogFilePath, errorLogFilePath, finishedLogFilePath };
