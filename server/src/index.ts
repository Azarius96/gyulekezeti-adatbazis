import "dotenv/config";
import { buildApp } from "./app.js";
import { scheduleWeeklyBackups } from "./modules/backup.js";

const port = Number(process.env.PORT ?? 4000);

buildApp().then((app) => {
  app.listen({ port, host: "0.0.0.0" }).then(() => {
    console.log(`Szerver fut: http://localhost:${port}`);
    scheduleWeeklyBackups();
  });
});
