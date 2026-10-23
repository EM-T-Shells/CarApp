// Pin the timezone for the whole test run.
//
// Anything that formats a date for display goes through toLocaleString, which
// renders in the machine's local zone. Without a pin, "ready by ~4:00 PM" is
// 4:00 PM only on a UTC box and 12:00 PM on this one, so tests either assert
// the developer's own zone or fall back to regex matchers loose enough to miss
// real offset bugs.
//
// Set here rather than in the `test` script so a bare `npx jest` or an IDE
// runner gets it too. globalSetup runs in the main Jest process before workers
// are forked, and they inherit the environment.
module.exports = () => {
  process.env.TZ = 'UTC';
};
